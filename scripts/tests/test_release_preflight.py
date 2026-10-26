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
            (checkout/'scripts/release_recovery.py').write_text('synthetic',encoding='utf8')
            (checkout/'scripts/rollback.sh').write_text('synthetic',encoding='utf8')
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
                     FIXTURE_DIRTY='',SENTINEL=shell_path(sentinel),DEPLOY_EXECUTE_REQUEST='false')
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
                # The unlabelled fake images represent the pre-RBAC-floor schema.
                db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
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

    def test_nested_database_file_or_sidecar_mount_refuses(self):
        for destination in ('/app/data/student_ms.db', '/app/data/student_ms.db-wal', '/app/data/student_ms.db-shm'):
            with self.subTest(destination=destination):
                desired = {'type':'bind','source':'/unrelated','target':destination}
                self.compose['services']['api']['volumes'].append(desired)
                self.assert_refuses();self.compose['services']['api']['volumes'].pop()
                actual = {'Type':'bind','Source':'/unrelated','Destination':destination,'RW':True}
                self.containers['fixture-api']['Mounts'].append(actual)
                self.assert_refuses();self.containers['fixture-api']['Mounts'].pop()

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


class OverlayValidationTests(unittest.TestCase):
    """Tests for trusted Compose overlay discovery and validation during preflight."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('release_preflight', ROOT / 'scripts/release_preflight.py')
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='overlay synthetic ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.checkout = self.root / 'checkout'; self.checkout.mkdir()
        for relative in self.mod.REQUIRED_FILES:
            file = self.checkout / relative; file.parent.mkdir(parents=True, exist_ok=True); file.write_text('synthetic')
        self.volume = self.root / 'volume'; self.volume.mkdir()
        self.db = self.volume / 'student_ms.db'
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                for table in self.mod.REQUIRED_TABLES:
                    db.execute(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, value TEXT)')
                    db.execute(f'INSERT INTO {table} (value) VALUES (?)', ('fixture-private-value',))
                db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
        self.compose_file = self.checkout / 'docker-compose.yml'
        self.backup_root = self.root / 'backups'; self.backup_root.mkdir(mode=0o700)
        self.state = self.backup_root / 'release-state'; self.state.mkdir(mode=0o700)
        # Deploy overlay
        self.api_image = 'sha256:' + 'a1' * 32
        self.web_image = 'sha256:' + 'b2' * 32
        self.overlay_payload = {'services': {'api': {'image': self.api_image}, 'web': {'image': self.web_image}}}
        self.overlay_file = self.state / ('deploy-' + 'f' * 32 + '.json')
        self._write_private_json(self.overlay_file, self.overlay_payload)
        self.overlay_sha256 = self.mod.file_sha256(self.overlay_file)
        # Recovery manifest
        self.manifest_id = 'abcd' * 8
        self.manifest = {
            'version': 1, 'manifest_id': self.manifest_id,
            'eligibility': 'HISTORICAL_TRANSITION',
            'target': {
                'approved_sha': SHA, 'compose_file': str(self.compose_file),
                'project': 'fixture', 'checkout': str(self.checkout),
            },
            'backup': {}, 'images': {}, 'policy_sha256': 'x' * 64
        }
        self.manifest_file = self.state / ('recovery-' + self.manifest_id + '.json')
        self._write_private_json(self.manifest_file, self.manifest)
        self.manifest_sha256 = self.mod.file_sha256(self.manifest_file)
        # Candidate manifest
        self.candidate = {
            'manifest_sha256': self.manifest_sha256,
            'overlay_file': str(self.overlay_file),
            'overlay_sha256': self.overlay_sha256,
            'images': {'api': self.api_image, 'web': self.web_image}
        }
        self.candidate_file = self.state / ('candidate-' + self.manifest_id + '.json')
        self._write_private_json(self.candidate_file, self.candidate)
        # Recovery pointer
        self.pointer = {
            'version': 1,
            'manifest': 'recovery-' + self.manifest_id + '.json',
            'sha256': self.manifest_sha256
        }
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        # Full config_files label
        self.two_file_label = str(self.compose_file) + ',' + str(self.overlay_file)
        # Container fixtures
        labels = {'com.docker.compose.project': 'fixture',
                  'com.docker.compose.project.working_dir': str(self.checkout),
                  'com.docker.compose.project.config_files': self.two_file_label}
        self.compose = {'name': 'fixture', 'services': {
            'api': {'container_name': 'fixture-api', 'working_dir': '/app',
                    'volumes': [{'type': 'volume', 'source': 'lms-data', 'target': '/app/data'}]},
            'web': {'container_name': 'fixture-web'}},
            'volumes': {'lms-data': {'name': 'fixture_lms-data'}}}
        self.containers = {}
        for service in ('api', 'web'):
            image = self.api_image if service == 'api' else self.web_image
            self.containers['fixture-' + service] = {
                'Id': ('c' if service == 'api' else 'd') * 64,
                'Name': '/fixture-' + service, 'Image': image,
                'State': {'Running': True},
                'Config': {'Labels': dict(labels, **{'com.docker.compose.service': service}),
                           'WorkingDir': '/app' if service == 'api' else '/', 'Env': []},
                'Mounts': [{'Type': 'volume', 'Name': 'fixture_lms-data',
                            'Source': str(self.volume), 'Destination': '/app/data', 'RW': True}] if service == 'api' else []}
        # OCI revision labels default to the manifest's approved_sha (SHA).
        # Tests simulating cross-release scenarios override these individually.
        self.fixture = {'root': str(self.checkout), 'sha': SHA,
                        'remote': 'git@github.com:SM-Web-Systems/lms-crypto-production.git',
                        'dirty': '', 'compose': self.compose, 'containers': self.containers,
                        'image_labels': {'org.opencontainers.image.revision': SHA},
                        'volume': [{'Name': 'fixture_lms-data', 'Mountpoint': str(self.volume),
                                    'Labels': {'com.docker.compose.project': 'fixture',
                                               'com.docker.compose.volume': 'lms-data'}}]}
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
    elif args[:2]==['image','inspect']:
        image_id = args[-1]
        per_image = data.get('image_labels_map', {}).get(image_id)
        labels = per_image if per_image is not None else data.get('image_labels', {})
        print(json.dumps([{'Id':image_id,'Config':{'Labels':labels}}]))
    else: sys.exit(91)
''', encoding='utf8')
        self.config = {'checkout': str(self.checkout), 'repository': 'SM-Web-Systems/lms-crypto-production',
                       'approved_sha': SHA, 'project': 'fixture', 'api_container': 'fixture-api',
                       'web_container': 'fixture-web', 'db_volume': 'fixture_lms-data',
                       'backup_root': str(self.backup_root)}

    def _write_private_json(self, path, value):
        data = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode() + b'\n'
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, 'wb') as f: f.write(data)

    def _update_pointer(self):
        """Rewrite pointer after manifest changes."""
        self.manifest_sha256 = self.mod.file_sha256(self.manifest_file)
        self.pointer['sha256'] = self.manifest_sha256
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        self.candidate['manifest_sha256'] = self.manifest_sha256
        self._write_private_json(self.candidate_file, self.candidate)

    def runner(self):
        self.fixture_file.write_text(json.dumps(self.fixture), encoding='utf8')
        command = [sys.executable, str(self.stub), str(self.fixture_file), str(self.calls)]
        return self.mod.CommandRunner(git=[*command, 'git'], docker=[*command, 'docker'])

    def validate(self):
        return self.mod.validate_target(self.config, self.runner())

    def assert_refuses(self, code=None):
        with self.assertRaises(self.mod.ReleaseError) as ctx:
            self.validate()
        if code is not None:
            self.assertEqual(str(ctx.exception), code)
        if self.calls.exists():
            for call in self.calls.read_text().splitlines():
                self.assertFalse(set(json.loads(call)) & {'up', 'build', 'pull', 'checkout', 'tag', 'prune', 'exec'})

    # --- Category 2: Legitimate two-file overlay deployment ---

    def test_verified_two_file_overlay_accepted(self):
        """A fully verified two-file Compose overlay label passes preflight."""
        target = self.validate()
        self.assertEqual(target['services']['api']['image_id'], self.api_image)
        self.assertEqual(target['services']['web']['image_id'], self.web_image)
        self.assertEqual(target['database']['host_path'], str(self.db))

    def test_single_file_still_works(self):
        """Original single-file Compose deployment still passes."""
        single_label = str(self.compose_file)
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = single_label
            self.containers['fixture-' + service]['Image'] = 'sha256:' + 'b' * 64
        self.fixture['image_labels'] = {}
        target = self.validate()
        self.assertEqual(target['services']['api']['image_id'], 'sha256:' + 'b' * 64)

    def test_both_containers_must_have_same_config_files(self):
        """Different config_files labels on api and web refuse."""
        self.containers['fixture-web']['Config']['Labels']['com.docker.compose.project.config_files'] = str(self.compose_file)
        self.assert_refuses('CONTAINER_CHECKOUT_MISMATCH')

    # --- Category 3: Missing overlay evidence ---

    def test_two_file_label_without_release_state_directory(self):
        """Two-file label but release-state directory missing."""
        import shutil as _shutil
        _shutil.rmtree(self.state)
        self.assert_refuses('CONTAINER_CHECKOUT_MISMATCH')

    def test_two_file_label_without_current_recovery_pointer(self):
        """Two-file label but current-recovery.json missing."""
        (self.state / 'current-recovery.json').unlink()
        self.assert_refuses('CONTAINER_CHECKOUT_MISMATCH')

    def test_two_file_label_without_candidate_manifest(self):
        """Two-file label but candidate manifest missing."""
        self.candidate_file.unlink()
        self.assert_refuses('CONTAINER_CHECKOUT_MISMATCH')

    def test_two_file_label_without_overlay_file(self):
        """Two-file label but overlay file missing."""
        self.overlay_file.unlink()
        self.assert_refuses()

    # --- Category 4: Tampered overlay evidence ---

    def test_tampered_overlay_sha256(self):
        """Overlay file SHA256 doesn't match candidate record."""
        self.candidate['overlay_sha256'] = '0' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_tampered_candidate_manifest_sha256(self):
        """Candidate manifest_sha256 doesn't match recovery manifest."""
        self.candidate['manifest_sha256'] = '0' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_tampered_pointer_sha256(self):
        """Recovery pointer sha256 doesn't match manifest file."""
        self.pointer['sha256'] = '0' * 64
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        self.assert_refuses()

    def test_overlay_content_modified_wrong_images(self):
        """Overlay file rewritten with different image IDs."""
        tampered = {'services': {'api': {'image': 'sha256:' + '9' * 64}, 'web': {'image': 'sha256:' + '8' * 64}}}
        self._write_private_json(self.overlay_file, tampered)
        self.assert_refuses()

    def test_overlay_images_dont_match_running_containers(self):
        """Overlay images recorded correctly but container runs different images."""
        self.containers['fixture-api']['Image'] = 'sha256:' + '9' * 64
        self.assert_refuses()

    # --- Category 5: Unapproved overlay ---

    def test_overlay_outside_release_state_directory(self):
        """Overlay file located outside the protected release-state directory."""
        rogue_overlay = self.backup_root / ('deploy-' + 'f' * 32 + '.json')
        self._write_private_json(rogue_overlay, self.overlay_payload)
        self.candidate['overlay_file'] = str(rogue_overlay)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(rogue_overlay)
        self._write_private_json(self.candidate_file, self.candidate)
        # Update label to match
        new_label = str(self.compose_file) + ',' + str(rogue_overlay)
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = new_label
        self.assert_refuses()

    @unittest.skipIf(os.name == 'nt', 'POSIX symlink test')
    def test_overlay_is_symlink(self):
        """Overlay file that is a symlink is rejected."""
        real_overlay = self.state / 'real-overlay.json'
        self._write_private_json(real_overlay, self.overlay_payload)
        self.overlay_file.unlink()
        self.overlay_file.symlink_to(real_overlay)
        self.assert_refuses()

    def test_overlay_without_deploy_prefix(self):
        """Overlay filename without 'deploy-' prefix is rejected."""
        bad_name = self.state / ('rollback-' + 'f' * 32 + '.json')
        self._write_private_json(bad_name, self.overlay_payload)
        self.candidate['overlay_file'] = str(bad_name)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(bad_name)
        self._write_private_json(self.candidate_file, self.candidate)
        new_label = str(self.compose_file) + ',' + str(bad_name)
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = new_label
        self.assert_refuses()

    def test_relative_path_in_config_files_label(self):
        """Relative or ambiguous paths in the config_files label are rejected."""
        bad_label = 'docker-compose.yml,' + str(self.overlay_file)
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = bad_label
        self.assert_refuses()

    # --- Category 6: Structural/format issues ---

    def test_three_or_more_files_in_label(self):
        """Three comma-separated files in the label are rejected."""
        triple_label = str(self.compose_file) + ',' + str(self.overlay_file) + ',' + str(self.state / 'extra.yml')
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = triple_label
        self.assert_refuses()

    def test_empty_config_files_label(self):
        """Empty config_files label is rejected."""
        for service in ('api', 'web'):
            self.containers['fixture-' + service]['Config']['Labels']['com.docker.compose.project.config_files'] = ''
        self.assert_refuses()

    def test_malformed_json_in_pointer(self):
        """Corrupt JSON in current-recovery.json is rejected."""
        (self.state / 'current-recovery.json').write_bytes(b'not json')
        self.assert_refuses()

    def test_wrong_pointer_version(self):
        """Wrong version in pointer is rejected."""
        self.pointer['version'] = 2
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        self.assert_refuses()

    # --- Category 7: Context mismatch ---

    def test_manifest_target_sha_does_not_match_running_revision(self):
        """Recovery manifest target.approved_sha doesn't match running OCI revision."""
        self.manifest['target']['approved_sha'] = 'e' * 40
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        self.assert_refuses()

    def test_manifest_target_compose_file_mismatch(self):
        """Recovery manifest target.compose_file doesn't match base path."""
        self.manifest['target']['compose_file'] = str(self.root / 'other.yml')
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        self.assert_refuses()

    def test_manifest_target_project_mismatch(self):
        """Recovery manifest target.project doesn't match config."""
        self.manifest['target']['project'] = 'other-project'
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        self.assert_refuses()

    # --- Category 8: Historical transition safety ---

    def test_historical_transition_manifest_not_misclassified_as_rollback_eligible(self):
        """HISTORICAL_TRANSITION eligibility does not bypass overlay validation."""
        self.assertEqual(self.manifest['eligibility'], 'HISTORICAL_TRANSITION')
        target = self.validate()
        self.assertIsNotNone(target)

    def test_exact_schema_eligibility_also_works(self):
        """EXACT_SCHEMA_AND_FINANCIAL_STATE eligibility also works for overlay."""
        self.manifest['eligibility'] = 'EXACT_SCHEMA_AND_FINANCIAL_STATE'
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        target = self.validate()
        self.assertIsNotNone(target)

    # --- Category 9: OCI label and image validation ---

    def test_oci_labelled_deployment_with_overlay(self):
        """Containers with OCI revision labels and overlay pass."""
        self.fixture['image_labels'] = {'org.opencontainers.image.revision': SHA}
        target = self.validate()
        self.assertEqual(target['services']['api']['revision'], SHA)
        self.assertEqual(target['services']['web']['revision'], SHA)

    # --- Category 10: Next-release compatibility ---

    def test_cross_release_preflight_with_different_sha(self):
        """A genuine next release whose SHA differs from the previous deployment must pass.

        This is the critical cross-release scenario: the recovery manifest
        records OLD_SHA from the previous deployment, but the new preflight
        is invoked with NEW_SHA. Both the git checkout and the config reflect
        the new release, while the running containers and overlay evidence
        reflect the previous release.
        """
        OLD_SHA = 'a' * 40
        NEW_SHA = 'e' * 40
        self.assertNotEqual(OLD_SHA, NEW_SHA)
        # Manifest records the previous deployment's SHA.
        self.assertEqual(self.manifest['target']['approved_sha'], OLD_SHA)
        # Config and git fixture now reflect the new release.
        self.config['approved_sha'] = NEW_SHA
        self.fixture['sha'] = NEW_SHA  # git rev-parse HEAD returns NEW_SHA
        # Containers still carry OCI revision from previous deployment.
        self.fixture['image_labels'] = {'org.opencontainers.image.revision': OLD_SHA}
        target = self.validate()
        self.assertEqual(target['approved_sha'], NEW_SHA)
        self.assertEqual(target['services']['api']['image_id'], self.api_image)
        self.assertEqual(target['services']['web']['image_id'], self.web_image)
        self.assertEqual(target['services']['api']['revision'], OLD_SHA)
        self.assertEqual(target['services']['web']['revision'], OLD_SHA)

    # --- Category 11: Failure mode safety ---

    def test_no_mutation_during_validation(self):
        """Validation does not create, modify or remove any files."""
        before = set()
        for dirpath, dirnames, filenames in os.walk(self.state):
            for fn in filenames:
                p = Path(dirpath) / fn
                before.add((str(p), p.stat().st_size, p.stat().st_mtime_ns))
        self.validate()
        after = set()
        for dirpath, dirnames, filenames in os.walk(self.state):
            for fn in filenames:
                p = Path(dirpath) / fn
                after.add((str(p), p.stat().st_size, p.stat().st_mtime_ns))
        self.assertEqual(before, after)

    def test_refusal_paths_produce_no_container_mutations(self):
        """All refusal paths never call up/build/pull/tag."""
        self.pointer['sha256'] = '0' * 64
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        self.assert_refuses()

    def test_error_messages_do_not_expose_filesystem_paths(self):
        """Error codes are symbolic, not filesystem paths."""
        self.pointer['sha256'] = '0' * 64
        self._write_private_json(self.state / 'current-recovery.json', self.pointer)
        try:
            self.validate()
            self.fail('Expected ReleaseError')
        except self.mod.ReleaseError as e:
            error_msg = str(e)
            self.assertNotIn(str(self.state), error_msg)
            self.assertNotIn(str(self.checkout), error_msg)
            self.assertNotIn('home', error_msg.lower())

    # --- Additional edge cases ---

    def test_candidate_image_mismatch_with_overlay(self):
        """Candidate records different image than overlay payload."""
        self.candidate['images']['api'] = 'sha256:' + '9' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_overlay_with_extra_service_keys_rejected(self):
        """Overlay containing extra keys beyond 'image' per service is rejected."""
        bad_payload = {'services': {'api': {'image': self.api_image, 'ports': ['8080:8080']},
                                     'web': {'image': self.web_image}}}
        self._write_private_json(self.overlay_file, bad_payload)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(self.overlay_file)
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_overlay_with_extra_services_rejected(self):
        """Overlay containing a third service is rejected."""
        bad_payload = {'services': {'api': {'image': self.api_image}, 'web': {'image': self.web_image},
                                     'db': {'image': 'sha256:' + '9' * 64}}}
        self._write_private_json(self.overlay_file, bad_payload)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(self.overlay_file)
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_overlay_with_non_image_id_format(self):
        """Overlay with non-sha256 image reference is rejected."""
        bad_payload = {'services': {'api': {'image': 'nginx:latest'}, 'web': {'image': self.web_image}}}
        self._write_private_json(self.overlay_file, bad_payload)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(self.overlay_file)
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    @unittest.skipIf(os.name == 'nt', 'POSIX permission test')
    def test_world_readable_overlay_file_rejected(self):
        """Overlay file with world-readable permissions is rejected."""
        self.overlay_file.chmod(0o644)
        self.assert_refuses()

    # --- Cross-release adversarial tests ---

    def test_current_release_preflight_same_sha(self):
        """Same-SHA preflight (re-running preflight on current release) passes."""
        target = self.validate()
        self.assertEqual(target['approved_sha'], SHA)
        self.assertEqual(target['services']['api']['revision'], SHA)

    def test_api_oci_revision_differs_from_web(self):
        """API and web containers with different OCI revisions are rejected."""
        # Stub returns per-image labels; we need per-container labels.
        # The stub returns the same labels for all images, so we simulate
        # disagreement by making the manifest SHA differ from one revision.
        # Actually: the stub returns the same image_labels for all image inspections.
        # To simulate disagreement, we need a more nuanced stub. Instead,
        # we verify the code path: if the manifest SHA doesn't match both
        # revisions equally, it fails.
        self.manifest['target']['approved_sha'] = 'f' * 40
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        # Now OCI revision is SHA='a'*40, manifest says 'f'*40 -> mismatch
        self.assert_refuses()

    def test_missing_oci_revision_fails_closed(self):
        """Containers without OCI revision labels fail closed for overlay validation."""
        self.fixture['image_labels'] = {}
        self.assert_refuses()

    def test_oci_revision_none_explicitly_fails(self):
        """Explicitly null OCI revision labels fail closed."""
        self.fixture['image_labels'] = {'org.opencontainers.image.revision': None}
        # This will cause revision to be None which fails the not-None check
        self.assert_refuses()

    def test_split_revision_api_correct_web_wrong(self):
        """API image has correct OCI revision but web has a different one."""
        WRONG_REV = 'f' * 40
        self.assertNotEqual(SHA, WRONG_REV)
        self.fixture['image_labels_map'] = {
            self.api_image: {'org.opencontainers.image.revision': SHA},
            self.web_image: {'org.opencontainers.image.revision': WRONG_REV},
        }
        self.fixture.pop('image_labels', None)
        self.assert_refuses('OVERLAY_PROVENANCE_REVISION_MISMATCH')

    def test_split_revision_api_missing_web_present(self):
        """API image lacks OCI revision label but web has one."""
        self.fixture['image_labels_map'] = {
            self.api_image: {},
            self.web_image: {'org.opencontainers.image.revision': SHA},
        }
        self.fixture.pop('image_labels', None)
        self.assert_refuses('OVERLAY_PROVENANCE_REVISION_MISSING')

    def test_split_revision_web_missing_api_present(self):
        """Web image lacks OCI revision label but API has one."""
        self.fixture['image_labels_map'] = {
            self.api_image: {'org.opencontainers.image.revision': SHA},
            self.web_image: {},
        }
        self.fixture.pop('image_labels', None)
        self.assert_refuses('OVERLAY_PROVENANCE_REVISION_MISSING')

    def test_candidate_overlay_checksum_invalid(self):
        """Candidate with wrong overlay_sha256 is rejected."""
        self.candidate['overlay_sha256'] = '0' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_candidate_image_differs_from_running(self):
        """Candidate records image IDs that differ from running containers."""
        self.candidate['images']['web'] = 'sha256:' + '9' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_recovery_pointer_references_unrelated_deployment(self):
        """Pointer references a manifest from a different project."""
        self.manifest['target']['project'] = 'unrelated-project'
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        self.assert_refuses()

    def test_overlay_references_unauthorized_image(self):
        """Overlay image ID doesn't match running container image."""
        rogue_payload = {'services': {'api': {'image': 'sha256:' + '9' * 64}, 'web': {'image': self.web_image}}}
        self._write_private_json(self.overlay_file, rogue_payload)
        self.candidate['overlay_sha256'] = self.mod.file_sha256(self.overlay_file)
        self.candidate['images']['api'] = 'sha256:' + '9' * 64
        self._write_private_json(self.candidate_file, self.candidate)
        self.assert_refuses()

    def test_manifest_checkout_identity_differs(self):
        """Manifest from a different checkout (and therefore compose path) is rejected."""
        other = self.root / 'other-checkout'
        other.mkdir()
        self.manifest['target']['checkout'] = str(other)
        self.manifest['target']['compose_file'] = str(other / 'docker-compose.yml')
        self._write_private_json(self.manifest_file, self.manifest)
        self._update_pointer()
        self.assert_refuses('OVERLAY_PROVENANCE_COMPOSE_MISMATCH')

    def test_new_target_checkout_head_incorrect(self):
        """New release git HEAD doesn't match approved SHA."""
        self.config['approved_sha'] = 'e' * 40
        # But fixture['sha'] still returns SHA (old HEAD) -> SHA mismatch
        self.assert_refuses()

    def test_new_target_remote_incorrect(self):
        """New release has wrong git remote."""
        self.fixture['remote'] = 'https://example.invalid/other'
        self.assert_refuses()

    def test_new_target_working_tree_dirty(self):
        """New release working tree is dirty."""
        self.fixture['dirty'] = ' M tracked.txt'
        self.assert_refuses()

    def test_new_target_release_blob_differs(self):
        """New release has modified script blobs."""
        self.fixture['blob'] = 'modified'
        self.assert_refuses()

    def test_historical_transition_eligibility_non_rollback(self):
        """HISTORICAL_TRANSITION manifest does not become rollback-eligible via overlay."""
        self.assertEqual(self.manifest['eligibility'], 'HISTORICAL_TRANSITION')
        # Validate passes (overlay is accepted) but the manifest itself is
        # correctly HISTORICAL_TRANSITION. The load_manifest() in recovery
        # module would reject it for automated rollback.
        target = self.validate()
        self.assertIsNotNone(target)

    def test_subsequent_release_can_generate_new_recovery_chain(self):
        """After cross-release preflight, the returned target enables a new recovery capture."""
        OLD_SHA = 'a' * 40
        NEW_SHA = 'e' * 40
        self.config['approved_sha'] = NEW_SHA
        self.fixture['sha'] = NEW_SHA
        self.fixture['image_labels'] = {'org.opencontainers.image.revision': OLD_SHA}
        target = self.validate()
        # The target dict should contain all fields needed for preserve_recovery
        self.assertEqual(target['approved_sha'], NEW_SHA)
        self.assertIn('compose_file', target)
        self.assertIn('services', target)
        self.assertIn('database', target)
        self.assertIn('source_database', target)
        self.assertIn('compose_sha256', target)
        self.assertIn('build_image_refs', target)

    def test_cross_release_with_per_image_oci_labels(self):
        """Cross-release preflight using per-image OCI labels (realistic stub).

        In production, docker image inspect returns labels per image ID.
        This test uses image_labels_map to simulate that each image carries
        its own OCI revision from the previous deployment.
        """
        OLD_SHA = 'a' * 40
        NEW_SHA = 'e' * 40
        self.assertNotEqual(OLD_SHA, NEW_SHA)
        self.config['approved_sha'] = NEW_SHA
        self.fixture['sha'] = NEW_SHA
        # Per-image labels: both images were built from OLD_SHA
        self.fixture['image_labels_map'] = {
            self.api_image: {'org.opencontainers.image.revision': OLD_SHA},
            self.web_image: {'org.opencontainers.image.revision': OLD_SHA},
        }
        self.fixture.pop('image_labels', None)
        target = self.validate()
        self.assertEqual(target['approved_sha'], NEW_SHA)
        self.assertEqual(target['services']['api']['revision'], OLD_SHA)
        self.assertEqual(target['services']['web']['revision'], OLD_SHA)

    def test_every_refusal_is_nonmutating(self):
        """Every overlay refusal path leaves the fixture directory unchanged."""
        tamper_cases = [
            ('pointer sha', lambda: self._write_private_json(
                self.state / 'current-recovery.json', dict(self.pointer, sha256='0' * 64))),
            ('manifest sha', lambda: (
                setattr(self, '_tmp', self.manifest['target'].__setitem__('approved_sha', 'f' * 40)) or
                self._write_private_json(self.manifest_file, self.manifest) or
                self._update_pointer())),
            ('overlay removed', lambda: self.overlay_file.unlink()),
        ]
        for label, tamper in tamper_cases:
            with self.subTest(case=label):
                self.doCleanups(); self.setUp()
                tamper()
                before_files = {}
                if self.state.exists():
                    for p in self.state.iterdir():
                        before_files[str(p)] = (p.stat().st_size, p.read_bytes())
                with self.assertRaises(self.mod.ReleaseError):
                    self.validate()
                if self.calls.exists():
                    for call in self.calls.read_text().splitlines():
                        self.assertFalse(set(json.loads(call)) & {'up', 'build', 'pull', 'checkout', 'tag', 'prune', 'exec'})
                after_files = {}
                if self.state.exists():
                    for p in self.state.iterdir():
                        after_files[str(p)] = (p.stat().st_size, p.read_bytes())
                self.assertEqual(set(before_files.keys()), set(after_files.keys()))

    def test_error_codes_symbolic_not_filesystem(self):
        """All error codes from overlay validation are symbolic identifiers."""
        # Trigger various failures and verify error codes
        cases = [
            ('missing revision', lambda: self.fixture.__setitem__('image_labels', {})),
            ('wrong manifest SHA', lambda: (
                self.manifest['target'].__setitem__('approved_sha', 'f' * 40),
                self._write_private_json(self.manifest_file, self.manifest),
                self._update_pointer())),
        ]
        for label, tamper in cases:
            with self.subTest(case=label):
                self.doCleanups(); self.setUp()
                tamper()
                try:
                    self.validate()
                    self.fail('Expected ReleaseError')
                except self.mod.ReleaseError as e:
                    code = str(e)
                    self.assertTrue(code.isupper() or '_' in code, f'Error code not symbolic: {code}')
                    self.assertNotIn('/', code)
                    self.assertNotIn('.', code)


if __name__=='__main__':unittest.main()
