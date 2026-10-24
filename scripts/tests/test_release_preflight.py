"""Offline release gates: real subprocess interfaces, synthetic SQLite only."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import textwrap
import unittest
from contextlib import closing
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SHA = 'a' * 40
IMAGE = 'sha256:' + 'b' * 64
BASH = shutil.which('bash') if os.name != 'nt' else r'C:\Program Files\Git\bin\bash.exe'


def shell_path(path):
    value=str(path).replace('\\','/')
    return '/'+value[0].lower()+value[2:] if os.name=='nt' and value[1:2]==':' else value


class EntrypointSafetyTests(unittest.TestCase):
    def test_workflow_requires_approved_sha_without_git_pull(self):
        workflow=(ROOT/'.github/workflows/deploy.yml').read_text()
        self.assertNotIn('git pull',workflow)
        self.assertIn('APPROVED_SHA: ${{ github.sha }}',workflow)
        self.assertNotIn("|| '/home/",workflow)

    def test_shell_delegates_without_prune_or_mutable_checkout(self):
        script=(ROOT/'scripts/deploy.sh').read_text()
        self.assertIn('release_preflight.py',script)
        self.assertNotIn('image prune',script)
        self.assertNotIn('docker compose up',script)

    @unittest.skipUnless(BASH and Path(BASH).exists(), 'Git Bash unavailable')
    def test_stale_workflow_checkout_script_never_executes(self):
        with tempfile.TemporaryDirectory(prefix='workflow synthetic ') as directory:
            root=Path(directory);checkout=root/'checkout';(checkout/'scripts').mkdir(parents=True)
            sentinel=root/'invoked'
            (checkout/'scripts/deploy.sh').write_text('printf invoked > "$SENTINEL"\n',encoding='utf8')
            (checkout/'scripts/release_preflight.py').write_text('synthetic',encoding='utf8')
            fake=root/'bin';fake.mkdir()
            (fake/'git').write_text('''#!/usr/bin/env bash
case "$*" in
  *"rev-parse --show-toplevel") printf '%s' "$FIXTURE_ROOT" ;;
  *"rev-parse HEAD") printf '%s' "$FIXTURE_SHA" ;;
  *"hash-object --no-filters"*) printf '%s' "${FIXTURE_BLOB:-ffffffffffffffffffffffffffffffffffffffff}" ;;
  *"rev-parse "*":scripts/"*) printf ffffffffffffffffffffffffffffffffffffffff ;;
  *"remote get-url origin") printf '%s' "$FIXTURE_REMOTE" ;;
  *"status --porcelain=v1 --untracked-files=all")
    if [[ "${FIXTURE_STATUS_FAIL:-}" == 1 ]]; then printf SECRET >&2; exit 9; fi
    printf '%s' "$FIXTURE_DIRTY" ;;
  *"ls-files --error-unmatch"*) exit 0 ;;
  *) exit 99 ;;
esac
''',encoding='utf8',newline='\n');(fake/'git').chmod(0o700)
            workflow=(ROOT/'.github/workflows/deploy.yml').read_text()
            bootstrap=textwrap.dedent(workflow.split('          script: |\n',1)[1])
            env=dict(os.environ,APPROVED_SHA=SHA,DEPLOY_DIR=shell_path(checkout),
                     DEPLOY_REPOSITORY='SM-Web-Systems/lms-crypto-production',FIXTURE_ROOT=shell_path(checkout),
                     FIXTURE_SHA='e'*40,FIXTURE_REMOTE='git@github.com:SM-Web-Systems/lms-crypto-production.git',
                     FIXTURE_DIRTY='',SENTINEL=shell_path(sentinel))
            command='export PATH="$1:$PATH"; '+bootstrap
            for key,value in [('FIXTURE_SHA','e'*40),('FIXTURE_REMOTE','https://example.invalid/other'),('FIXTURE_DIRTY',' M tracked'),('FIXTURE_BLOB','modified')]:
                with self.subTest(key=key):
                    invalid=dict(env,FIXTURE_SHA=SHA);invalid[key]=value
                    result=subprocess.run([BASH,'-c',command,'--',shell_path(fake)],env=invalid,capture_output=True,text=True,timeout=20)
                    self.assertNotEqual(result.returncode,0);self.assertFalse(sentinel.exists())
            invalid=dict(env,FIXTURE_SHA=SHA,FIXTURE_STATUS_FAIL='1')
            result=subprocess.run([BASH,'-c',command,'--',shell_path(fake)],env=invalid,capture_output=True,text=True,timeout=20)
            self.assertNotEqual(result.returncode,0);self.assertFalse(sentinel.exists());self.assertNotIn('SECRET',result.stderr)
            env['FIXTURE_SHA']=SHA
            result=subprocess.run([BASH,'-c',command,'--',shell_path(fake)],env=env,capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(sentinel.read_text(),'invoked')


class ReleasePreflightTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('release_preflight', ROOT / 'scripts/release_preflight.py')
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='release synthetic ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.checkout = self.root / 'checkout'; self.checkout.mkdir()
        for relative in self.mod.REQUIRED_FILES:
            file=self.checkout/relative;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('synthetic')
        self.volume = self.root / 'volume'; self.volume.mkdir()
        self.db = self.volume / 'student_ms.db'
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                for table in self.mod.REQUIRED_TABLES:
                    db.execute(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, value TEXT)')
                    db.execute(f'INSERT INTO {table} (value) VALUES (?)', ('fixture-private-value',))
        labels = {'com.docker.compose.project': 'fixture',
                  'com.docker.compose.project.working_dir': str(self.checkout),
                  'com.docker.compose.project.config_files': str(self.checkout / 'docker-compose.yml')}
        self.compose = {'name': 'fixture', 'services': {
            'api': {'container_name': 'fixture-api', 'working_dir': '/app',
                    'volumes': [{'type': 'volume', 'source': 'lms-data', 'target': '/app/data'}]},
            'web': {'container_name': 'fixture-web'}},
            'volumes': {'lms-data': {'name': 'fixture_lms-data'}}}
        self.containers = {}
        for service in ('api', 'web'):
            self.containers['fixture-' + service] = {
                'Id': ('c' if service == 'api' else 'd') * 64,
                'Name': '/fixture-' + service, 'Image': IMAGE,
                'State': {'Running': True},
                'Config': {'Labels': dict(labels, **{'com.docker.compose.service': service}),
                           'WorkingDir': '/app' if service == 'api' else '/', 'Env': []},
                'Mounts': [{'Type': 'volume', 'Name': 'fixture_lms-data',
                            'Source': str(self.volume), 'Destination': '/app/data', 'RW': True}] if service == 'api' else []}
        self.fixture = {'root': str(self.checkout), 'sha': SHA, 'remote': 'git@github.com:SM-Web-Systems/lms-crypto-production.git',
                        'dirty': '', 'compose': self.compose, 'containers': self.containers,
                        'volume': [{'Name': 'fixture_lms-data', 'Mountpoint': str(self.volume),
                                    'Labels': {'com.docker.compose.project': 'fixture', 'com.docker.compose.volume': 'lms-data'}}]}
        self.fixture_file = self.root / 'fixture.json'
        self.calls = self.root / 'calls.jsonl'
        self.stub = self.root / 'fake_interfaces.py'
        self.stub.write_text('''import json,sys
from pathlib import Path
data=json.loads(Path(sys.argv[1]).read_text()); calls=Path(sys.argv[2]); tool=sys.argv[3]; args=sys.argv[4:]
with calls.open('a') as f: f.write(json.dumps([tool,*args])+'\\n')
if data.get('fail') == tool: print('SECRET-do-not-print',file=sys.stderr); sys.exit(9)
if tool=='git':
    if args[-2:]==['rev-parse','--show-toplevel']: print(data['root'])
    elif args[-2:]==['rev-parse','HEAD']: print(data['sha'])
    elif args[-3:]==['remote','get-url','origin']: print(data['remote'])
    elif 'status' in args: print(data['dirty'])
    elif 'hash-object' in args: print(data.get('blob','f'*40))
    elif 'rev-parse' in args and ':' in args[-1]: print('f'*40)
    else: sys.exit(90)
elif tool=='docker':
    if args[:1]==['compose'] and 'config' in args: print(json.dumps(data['compose']))
    elif args[:1]==['compose'] and 'ps' in args: print(data['containers']['fixture-'+args[-1]]['Id'])
    elif args[:1]==['inspect']: print(json.dumps([data['containers'][args[-1]]]))
    elif args[:2]==['volume','inspect']: print(json.dumps(data['volume']))
    elif args[:2]==['image','inspect']: print(json.dumps([{'Id':data.get('image_id','sha256:'+'b'*64),'Config':{'Labels':{}}}]))
    else: sys.exit(91)
''', encoding='utf8')
        self.config = {'checkout': str(self.checkout), 'repository': 'SM-Web-Systems/lms-crypto-production',
                       'approved_sha': SHA, 'project': 'fixture', 'api_container': 'fixture-api',
                       'web_container': 'fixture-web', 'db_volume': 'fixture_lms-data',
                       'backup_root': str(self.root / 'backups')}

    def runner(self):
        self.fixture_file.write_text(json.dumps(self.fixture), encoding='utf8')
        command = [sys.executable, str(self.stub), str(self.fixture_file), str(self.calls)]
        return self.mod.CommandRunner(git=[*command, 'git'], docker=[*command, 'docker'])

    def validate(self):
        return self.mod.validate_target(self.config, self.runner())

    def assert_refuses(self):
        with self.assertRaises(self.mod.ReleaseError): self.validate()
        if self.calls.exists():
            for call in self.calls.read_text().splitlines():
                self.assertFalse(set(json.loads(call)) & {'up','build','pull','checkout','tag','prune','exec'})

    def test_valid_identity_and_discovered_source(self):
        target = self.validate()
        self.assertEqual(target['database']['host_path'], str(self.db))
        self.assertEqual(target['services']['api']['image_id'], IMAGE)
        self.assertEqual(target['source_database']['table_counts']['users'], 1)
        self.assertFalse(Path(self.config['backup_root']).exists())

    def test_missing_required_config(self):
        for field in self.config:
            with self.subTest(field=field):
                config = dict(self.config); del config[field]
                with self.assertRaises(self.mod.ReleaseError): self.mod.validate_target(config, self.runner())

    def test_wrong_sha_dirty_remote_and_repository(self):
        for field,value in [('sha','e'*40),('dirty',' M tracked.txt'),('remote','https://example.invalid/SM-Web-Systems/lms-crypto-production.git')]:
            with self.subTest(field=field):
                old=self.fixture[field];self.fixture[field]=value;self.assert_refuses();self.fixture[field]=old
        self.config['repository']='other/repo';self.assert_refuses()

    def test_full_sha_only(self):
        for sha in ('aaaaaaa', 'A'*40, 'a'*40+';echo secret', 'unknown'):
            with self.subTest(sha=sha):
                self.config['approved_sha']=sha;self.assert_refuses()

    def test_non_root_checkout(self):
        self.fixture['root']=str(self.root);self.assert_refuses()

    def test_required_release_files_exist(self):
        for relative in self.mod.REQUIRED_FILES:
            with self.subTest(file=relative):
                file=self.checkout/relative;file.unlink();self.assert_refuses();file.write_text('synthetic')

    def test_wrong_image_identity(self):
        self.fixture['image_id']='sha256:'+'e'*64;self.assert_refuses()

    def test_changed_release_file_blob_refuses(self):
        self.fixture['blob']='modified';self.assert_refuses()

    def test_wrong_compose_project(self):
        self.compose['name']='other';self.assert_refuses()

    def test_container_name_and_compose_service_mismatch(self):
        for field,value in [('Name','/other'),('Image','bad')]:
            with self.subTest(field=field):
                old=self.containers['fixture-api'][field];self.containers['fixture-api'][field]=value;self.assert_refuses();self.containers['fixture-api'][field]=old
        self.containers['fixture-web']['Config']['Labels']['com.docker.compose.service']='api';self.assert_refuses()

    def test_wrong_container_workdir_or_config_file(self):
        labels=self.containers['fixture-api']['Config']['Labels']
        for key,value in [('com.docker.compose.project.working_dir',str(self.root)),('com.docker.compose.project.config_files',str(self.root/'other.yml'))]:
            with self.subTest(key=key):
                old=labels[key];labels[key]=value;self.assert_refuses();labels[key]=old

    def test_stopped_container(self):
        self.containers['fixture-api']['State']['Running']=False;self.assert_refuses()

    def test_wrong_database_path(self):
        self.containers['fixture-api']['Config']['Env']=['DATABASE_PATH=/elsewhere.db'];self.assert_refuses()

    def test_desired_compose_database_and_test_environment(self):
        for environment in ({'DATABASE_PATH':'/elsewhere.db'},{'VITEST':'false'}):
            with self.subTest(environment=environment):
                self.compose['services']['api']['environment']=environment;self.assert_refuses()

    def test_desired_database_mount_readonly(self):
        self.compose['services']['api']['volumes'][0]['read_only']=True;self.assert_refuses()

    def test_wrong_mount_name_type_source_or_readonly(self):
        mount=self.containers['fixture-api']['Mounts'][0]
        for key,value in [('Name','other'),('Type','bind'),('Source',str(self.root)),('RW',False)]:
            with self.subTest(key=key):
                old=mount[key];mount[key]=value;self.assert_refuses();mount[key]=old

    def test_volume_label_mismatch(self):
        self.fixture['volume'][0]['Labels']['com.docker.compose.project']='other';self.assert_refuses()

    def test_missing_empty_corrupt_or_incomplete_db(self):
        original=self.db.read_bytes()
        for data in (None,b'',b'corrupt'):
            with self.subTest(data=data):
                self.db.unlink(missing_ok=True)
                if data is not None:self.db.write_bytes(data)
                self.assert_refuses();self.db.write_bytes(original)
        with closing(sqlite3.connect(self.db)) as db:
            with db:db.execute('DROP TABLE payments')
        self.assert_refuses()

    def test_subprocess_errors_sanitized(self):
        self.fixture['fail']='docker'
        with self.assertRaises(self.mod.ReleaseError) as caught:self.validate()
        self.assertNotIn('SECRET',str(caught.exception))

    def test_backup_unique_restrictive_and_verified(self):
        target=self.validate();before=self.db.read_bytes()
        first=self.mod.backup_database(target,self.config['backup_root'])
        second=self.mod.backup_database(target,self.config['backup_root'])
        self.assertNotEqual(first['file'],second['file'])
        self.assertEqual(self.db.read_bytes(),before)
        self.assertEqual(first['table_counts']['payments'],1)
        self.assertEqual(first['sha256'],self.mod.file_sha256(Path(first['file'])))
        evidence=json.loads(Path(first['evidence_file']).read_text())
        self.assertEqual(evidence['backup']['sha256'],first['sha256'])
        self.assertNotIn('fixture-private-value',Path(first['evidence_file']).read_text())
        if os.name!='nt':self.assertEqual(Path(first['file']).stat().st_mode & 0o777,0o600)

    def test_backup_contains_committed_wal_rows(self):
        db=sqlite3.connect(self.db);self.addCleanup(db.close)
        db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA wal_autocheckpoint=0')
        db.execute('INSERT INTO payments(value) VALUES (?)',('wal-only',));db.commit()
        self.assertTrue(Path(str(self.db)+'-wal').exists())
        backup=self.mod.backup_database(self.validate(),self.config['backup_root'])
        self.assertEqual(backup['table_counts']['payments'],2)

    def test_backup_failure_preserves_existing_evidence(self):
        root=Path(self.config['backup_root']);root.mkdir(mode=0o700);pointer=root/'current.json';pointer.write_text('previous')
        target=self.validate()
        with patch.object(self.mod.shutil,'disk_usage',return_value=SimpleNamespace(free=1)):
            with self.assertRaises(self.mod.ReleaseError):self.mod.backup_database(target,root)
        self.assertEqual(pointer.read_text(),'previous');self.assertEqual(list(root.iterdir()),[pointer])

    def test_backup_uuid_collision_never_deletes_previous_file(self):
        root=Path(self.config['backup_root']);root.mkdir(mode=0o700)
        existing=root/'pre-deploy-collision.sqlite3';existing.write_text('previous evidence')
        with patch.object(self.mod.uuid,'uuid4',return_value=SimpleNamespace(hex='collision')):
            with self.assertRaises(self.mod.ReleaseError):self.mod.backup_database(self.validate(),root)
        self.assertEqual(existing.read_text(),'previous evidence')

    def test_financial_digest_changes_without_emitting_values(self):
        first=self.validate()['source_database']
        with closing(sqlite3.connect(self.db)) as db:
            with db:db.execute('UPDATE payments SET value=?',('private@example.invalid',))
        second=self.validate()['source_database']
        self.assertNotEqual(first['financial_state_sha256'],second['financial_state_sha256'])
        self.assertEqual(first['schema_sha256'],second['schema_sha256'])
        self.assertNotIn('private@example.invalid',json.dumps(second))

    def test_wal_missing_sidecars_refuses_without_creating_state(self):
        with closing(sqlite3.connect(self.db)) as db:db.execute('PRAGMA journal_mode=WAL')
        before=set(self.volume.iterdir())
        self.assert_refuses();self.assertEqual(set(self.volume.iterdir()),before)

    def test_backup_location_in_checkout_or_volume_refuses(self):
        for destination in (self.checkout/'backups',self.volume/'backups'):
            self.config['backup_root']=str(destination);self.assert_refuses();self.assertFalse(destination.exists())

    @unittest.skipIf(os.name=='nt','POSIX permission gate')
    def test_shared_backup_directory_refuses(self):
        root=Path(self.config['backup_root']);root.mkdir(mode=0o755);root.chmod(0o755)
        self.assert_refuses()

    def test_dry_run_no_writes_and_execution_stays_blocked(self):
        runner=self.runner()
        dry=self.mod.prepare_release(self.config,runner,dry_run=True)
        self.assertEqual(dry['status'],'DRY_RUN_VALIDATED');self.assertFalse(Path(self.config['backup_root']).exists())
        with self.assertRaisesRegex(self.mod.ReleaseError,'RECOVERY_GATE_REQUIRED'):
            self.mod.prepare_release(self.config,self.runner(),dry_run=False)
        self.assertFalse((self.checkout/'.deploy-state').exists())
        calls=self.calls.read_text();self.assertNotIn('"up"',calls);self.assertNotIn('"build"',calls)

    def test_missing_env_cli_fails_without_leaking_values(self):
        env={key:value for key,value in os.environ.items() if not key.startswith('DEPLOY_')}
        env['DEPLOY_DIR']='SECRET-do-not-print'
        result=subprocess.run([sys.executable,str(ROOT/'scripts/release_preflight.py')],env=env,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0);self.assertNotIn('SECRET',result.stdout+result.stderr)


if __name__=='__main__':unittest.main()
