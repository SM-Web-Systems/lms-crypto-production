"""Synthetic recovery tests. Every Docker/HTTP interface is fake."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import unittest
from contextlib import closing
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import release_preflight as pre

spec = importlib.util.spec_from_file_location('preflight_fixture', Path(__file__).with_name('test_release_preflight.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

OLD_SHA = 'b' * 40
API_IMAGE = 'sha256:' + '1' * 64
WEB_IMAGE = 'sha256:' + '2' * 64
NEW_API = 'sha256:' + '3' * 64
NEW_WEB = 'sha256:' + '4' * 64


class FakeRunner:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.images = {API_IMAGE: OLD_SHA, WEB_IMAGE: OLD_SHA}
        self.tags = {}
        self.fail_tag = None
        self.wrong_tag = False
        self.fail_up = False
        self.wrong_up_image = False
        self.on_stop = None
        self.on_up = None
        self.on_build = None
        self.on_tag = None
        self.build_wrong_sha = False
        self.fail_stop = False

    def text(self, tool, args, cwd, env=None, timeout=45):
        self.calls.append([tool, *args])
        if tool == 'git':
            if args[-2:] == ['rev-parse', '--show-toplevel']: return self.data['root']
            if args[-2:] == ['rev-parse', 'HEAD']: return self.data['sha']
            if args[-3:] == ['remote', 'get-url', 'origin']: return self.data['remote']
            if 'status' in args: return self.data['dirty']
            if 'hash-object' in args or 'rev-parse' in args: return 'f' * 40
        if tool == 'docker':
            if args[:2] == ['container', 'stop']:
                if self.fail_stop: raise pre.ReleaseError('STOP_FAILED')
                for container in self.data['containers'].values():
                    if container['Id'] in args: container['State']['Running'] = False
                if self.on_stop:
                    callback = self.on_stop; self.on_stop = None; callback()
                return ''
            if args[:2] == ['image', 'tag']:
                if self.fail_tag and self.fail_tag in args[-1]: raise pre.ReleaseError('TAG_FAILED')
                self.tags[args[-1]] = WEB_IMAGE if self.wrong_tag else args[-2]
                if self.on_tag:
                    callback = self.on_tag; self.on_tag = None; callback()
                return ''
            if args[:1] == ['compose']:
                if 'build' in args:
                    assert env and env['BUILD_SHA'] == self.data['sha']
                    for service, image_id in (('api', NEW_API), ('web', NEW_WEB)):
                        self.images[image_id] = 'e' * 40 if self.build_wrong_sha else self.data['sha']
                        self.tags['fixture-' + service + ':latest'] = image_id
                    if self.on_build: self.on_build()
                    return ''
                if 'ps' in args: return self.data['containers']['fixture-' + args[-1]]['Id']
                if 'stop' in args:
                    for container in self.data['containers'].values(): container['State']['Running'] = False
                    if self.on_stop:
                        callback = self.on_stop; self.on_stop = None; callback()
                    return ''
                if 'up' in args:
                    if self.fail_up: raise pre.ReleaseError('UP_FAILED')
                    overlay_path = args[args.index('--file', args.index('--file') + 1) + 1]
                    overlay = json.loads(Path(overlay_path).read_text())
                    for service in ('api', 'web'):
                        container = self.data['containers']['fixture-' + service]
                        expected = overlay['services'][service]['image']
                        container['Image'] = WEB_IMAGE if self.wrong_up_image else self.tags.get(expected, expected)
                        container['State']['Running'] = True
                        container['State']['Health'] = {'Status': 'healthy'}
                        container['Config']['Labels']['com.docker.compose.project.config_files'] = str(Path(self.data['root']) / 'docker-compose.yml') + ',' + overlay_path
                    if self.on_up: self.on_up()
                    return ''
        raise AssertionError(('unexpected fake command', tool, args))

    def json(self, tool, args, cwd):
        self.calls.append([tool, *args])
        if args[:1] == ['compose'] and 'config' in args: return self.data['compose']
        if args[:1] == ['inspect']:
            value = args[-1]
            return [next(container for name, container in self.data['containers'].items() if value in (name, container['Id']))]
        if args[:2] == ['volume', 'inspect']: return self.data['volume']
        if args[:2] == ['image', 'inspect']:
            value = args[-1]; image_id = self.tags.get(value, value)
            if image_id not in self.images: raise pre.ReleaseError('IMAGE_MISSING')
            return [{'Id': image_id, 'Config': {'Labels': {'org.opencontainers.image.revision': self.images[image_id]}}}]
        raise AssertionError(('unexpected fake JSON command', tool, args))


class RecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import release_recovery
        cls.rec = release_recovery

    def setUp(self):
        self.mod = pre
        fixture.ReleasePreflightTests.setUp(self)
        self.containers['fixture-api']['Image'] = API_IMAGE
        self.containers['fixture-web']['Image'] = WEB_IMAGE
        self.runner = FakeRunner(self.fixture)
        self.config['base_url'] = 'http://127.0.0.1:39999'
        self.target = pre.validate_target(self.config, self.runner)
        self.backup = pre.backup_database(self.target, self.config['backup_root'])
        self.state = Path(self.config['backup_root']) / 'release-state'
        self.policy = {'version': 1, 'review_reference': 'synthetic-independent-review',
                       'source_sha': OLD_SHA, 'target_sha': self.config['approved_sha'],
                       'schema_sha256': self.backup['schema_sha256'],
                       'financial_state_sha256': self.backup['financial_state_sha256'],
                       'foreign_key_violation_count': self.backup['foreign_key_violation_count'],
                       'foreign_key_violations_sha256': self.backup['foreign_key_violations_sha256'],
                       'compose_sha256': self.target['compose_sha256'],
                       'images': {'api': API_IMAGE, 'web': WEB_IMAGE},
                       'database': self.target['database'], 'project': 'fixture',
                       'repository': pre.REPOSITORY}

    def capture(self):
        return self.rec.preserve_recovery(self.target, self.backup, self.state, self.runner, self.policy)

    def recover(self, manifest=None, health=None):
        if manifest is None and not (self.state / 'current-recovery.json').exists(): self.capture()
        return self.rec.rollback(self.config, self.state, self.policy, self.runner,
                                 http=health or self.http, timeout=0)

    def http(self, url):
        if url.endswith('/api/v1/health'):
            return 200, json.dumps({'status': 'ok', 'buildSha': OLD_SHA, 'checks': {'db': {'status': 'ok'}}}).encode()
        if url.endswith('/api/v1/courses'): return 401, b'{}'
        return 200, b'<!doctype html><html>synthetic frontend</html>'

    def assert_no_up(self):
        self.assertFalse(any('up' in call for call in self.runner.calls))

    def test_preserved_unique_tags_and_manifest_pointer(self):
        first = self.capture(); second = self.capture()
        self.assertNotEqual(first['manifest_id'], second['manifest_id'])
        for service in ('api', 'web'):
            asset = first['images'][service]
            self.assertEqual(self.runner.tags[asset['tag']], asset['image_id'])
        loaded = self.rec.load_manifest(self.state)
        self.assertEqual(loaded['manifest_id'], second['manifest_id'])
        self.assertNotIn('fixture-private-value', json.dumps(loaded))
        if os.name != 'nt':
            self.assertEqual(Path(second['manifest_file']).stat().st_mode & 0o777, 0o600)

    def test_missing_image_or_invalid_digest_refuses(self):
        del self.runner.images[API_IMAGE]
        with self.assertRaises(pre.ReleaseError): self.capture()
        self.assertFalse((self.state / 'current-recovery.json').exists()); self.assert_no_up()

    def test_wrong_tag_or_preservation_failure_preserves_old_pointer(self):
        first = self.capture(); before = (self.state / 'current-recovery.json').read_bytes()
        for field, value in (('fail_tag', '-web:'), ('wrong_tag', True)):
            with self.subTest(field=field):
                setattr(self.runner, field, value)
                with self.assertRaises(pre.ReleaseError): self.capture()
                setattr(self.runner, field, None if field == 'fail_tag' else False)
                self.assertEqual((self.state / 'current-recovery.json').read_bytes(), before)
        self.assertEqual(self.rec.load_manifest(self.state)['manifest_id'], first['manifest_id'])

    def test_atomic_pointer_failure_preserves_previous_manifest(self):
        self.capture(); before = (self.state / 'current-recovery.json').read_bytes()
        with patch.object(self.rec.os, 'replace', side_effect=OSError('synthetic failure')):
            with self.assertRaises(pre.ReleaseError): self.capture()
        self.assertEqual((self.state / 'current-recovery.json').read_bytes(), before)

    def test_postpublication_sync_error_never_exposes_incomplete_manifest(self):
        first = self.capture()
        original_sync = self.rec.sync_directory
        def uncertain_sync(path):
            if (self.state / 'current-recovery.json').exists():
                active = self.rec.load_manifest(self.state)
                if active['manifest_id'] != first['manifest_id']: raise OSError('simulated fsync failure after publication')
            original_sync(path)
        with patch.object(self.rec, 'sync_directory', side_effect=uncertain_sync):
            with self.assertRaises(pre.ReleaseError): self.capture()
        current = self.rec.load_manifest(self.state)
        self.assertEqual(current['eligibility'], 'EXACT_SCHEMA_AND_FINANCIAL_STATE')

    def test_unlabelled_or_mixed_release_never_publishes_eligible_pointer(self):
        for revision in (None, 'c' * 40):
            with self.subTest(revision=revision):
                self.runner.images[WEB_IMAGE] = revision
                self.target['services']['web']['revision'] = revision
                with self.assertRaises(pre.ReleaseError): self.capture()
                self.assertFalse((self.state / 'current-recovery.json').exists())

    def test_unknown_or_mismatched_policy_refuses(self):
        for field, value in (('source_sha', 'e' * 40), ('target_sha', 'e' * 40), ('schema_sha256', '0' * 64),
                             ('financial_state_sha256', '0' * 64), ('review_reference', ''), ('project', 'other')):
            with self.subTest(field=field):
                original = self.policy[field]; self.policy[field] = value
                with self.assertRaises(pre.ReleaseError): self.capture()
                self.policy[field] = original
        with self.assertRaises(pre.ReleaseError): self.rec.preserve_recovery(self.target, self.backup, self.state, self.runner, None)
        self.assert_no_up()

    def test_reviewed_foreign_key_baseline_must_match_capture(self):
        for key, value in (('foreign_key_violation_count', 1), ('foreign_key_violations_sha256', '0' * 64)):
            with self.subTest(key=key):
                original = self.policy[key]; self.policy[key] = value
                with self.assertRaises(pre.ReleaseError): self.capture()
                self.policy[key] = original
        self.assertFalse((self.state / 'current-recovery.json').exists())

    def test_missing_corrupt_or_tampered_manifest_refuses(self):
        with self.assertRaises(pre.ReleaseError): self.rec.load_manifest(self.state)
        manifest = self.capture()
        path = Path(manifest['manifest_file']); original = path.read_bytes()
        for value in (b'not JSON', original.replace(b'"version":1', b'"version":9')):
            path.write_bytes(value)
            with self.assertRaises(pre.ReleaseError): self.rec.load_manifest(self.state)
        self.assert_no_up()

    def test_backup_checksum_failure_does_not_publish(self):
        Path(self.backup['file']).write_bytes(b'corrupt backup')
        with self.assertRaises(pre.ReleaseError): self.capture()
        self.assertFalse((self.state / 'current-recovery.json').exists())

    def test_wrong_manifest_context_refuses_without_stop(self):
        self.capture(); self.config['project'] = 'other'
        with self.assertRaises(pre.ReleaseError): self.recover()
        self.assert_no_up()

    def test_schema_or_financial_mutation_after_stop_blocks_replacement(self):
        for sql in ('ALTER TABLE payments ADD COLUMN new_contract TEXT',
                    "UPDATE payments SET value='financial-change'",
                    "INSERT INTO webhook_events(value) VALUES ('new-composite-marker')"):
            with self.subTest(sql=sql):
                # Each subcase owns an independent complete synthetic environment.
                if sql != 'ALTER TABLE payments ADD COLUMN new_contract TEXT':
                    self.doCleanups(); self.setUp()
                self.capture(); before = self.db.read_bytes()
                def mutate():
                    with closing(sqlite3.connect(self.db)) as db:
                        with db: db.execute(sql)
                self.runner.on_stop = mutate
                with self.assertRaises(pre.ReleaseError): self.recover()
                self.assert_no_up()
                self.assertFalse(self.containers['fixture-api']['State']['Running'])
                self.assertNotEqual(self.db.read_bytes(), before)

    def test_success_checks_actual_images_sha_readiness_and_frontend(self):
        before = self.db.read_bytes(); result = self.recover()
        self.assertEqual(result['status'], 'ROLLBACK_VERIFIED')
        self.assertEqual(result['recovered_sha'], OLD_SHA)
        self.assertEqual(self.db.read_bytes(), before)
        up = next(call for call in self.runner.calls if 'up' in call)
        self.assertIn('--no-build', up); self.assertIn('--pull', up); self.assertIn('never', up)
        self.assertFalse(any('prune' in call or 'build' in call for call in self.runner.calls))

    def test_failed_up_or_actual_wrong_image_propagates_and_stops(self):
        for field in ('fail_up', 'wrong_up_image'):
            with self.subTest(field=field):
                if field != 'fail_up': self.doCleanups(); self.setUp()
                self.capture(); setattr(self.runner, field, True)
                with self.assertRaises(pre.ReleaseError): self.recover()
                self.assertFalse(self.containers['fixture-api']['State']['Running'])

    def test_health_sha_db_or_frontend_failure_stops_recovered_services(self):
        for broken in ('sha', 'db', 'front'):
            with self.subTest(broken=broken):
                if broken != 'sha': self.doCleanups(); self.setUp()
                self.capture()
                def http(url):
                    status, body = self.http(url)
                    if broken == 'front' and url.endswith('/'): return 503, b''
                    if url.endswith('/api/v1/health'):
                        data = json.loads(body)
                        if broken == 'sha': data['buildSha'] = 'c' * 40
                        if broken == 'db': data['checks']['db']['status'] = 'failed'
                        body = json.dumps(data).encode()
                    return status, body
                with self.assertRaises(pre.ReleaseError): self.recover(health=http)
                self.assertFalse(self.containers['fixture-api']['State']['Running'])

    def test_lock_prevents_parallel_state_changes(self):
        with self.rec.release_lock(self.state):
            with self.assertRaises(pre.ReleaseError):
                with self.rec.release_lock(self.state): pass

    def test_clean_stopped_wal_database_never_recreates_sidecars(self):
        writer = sqlite3.connect(self.db)
        writer.execute('PRAGMA journal_mode=WAL')
        writer.execute('INSERT INTO payments(value) VALUES (?)', ('wal-committed',)); writer.commit()
        self.target = pre.validate_target(self.config, self.runner)
        self.backup = pre.backup_database(self.target, self.config['backup_root'])
        self.policy['financial_state_sha256'] = self.backup['financial_state_sha256']
        self.capture()
        writer.close()
        self.assertFalse(Path(str(self.db) + '-wal').exists())
        before = set(self.volume.iterdir())
        metadata = self.rec.stopped_database_metadata(self.db)
        self.assertEqual(metadata['financial_state_sha256'], self.backup['financial_state_sha256'])
        self.assertEqual(set(self.volume.iterdir()), before)

    def test_unknown_runtime_image_or_overlay_is_not_automatically_recovered(self):
        self.capture()
        self.containers['fixture-api']['Image'] = 'sha256:' + '9' * 64
        with self.assertRaises(pre.ReleaseError): self.recover()
        self.assert_no_up()

    def test_runtime_overlay_must_be_exact_recorded_file(self):
        self.capture()
        self.containers['fixture-api']['Config']['Labels']['com.docker.compose.project.config_files'] += ',/unexpected.yml'
        with self.assertRaises(pre.ReleaseError): self.recover()
        self.assert_no_up()

    def test_controlled_stop_rejects_unknown_context_before_any_stop(self):
        self.containers['fixture-api']['Config']['Labels']['com.docker.compose.project'] = 'unrelated'
        with self.assertRaises(pre.ReleaseError): self.rec.controlled_stop(self.target, self.runner)
        self.assertFalse(any('stop' in call for call in self.runner.calls))
        self.assertTrue(self.containers['fixture-api']['State']['Running'])

    def test_shadow_database_mount_blocks_recovery_before_stop(self):
        self.capture()
        self.containers['fixture-api']['Mounts'].append({'Type':'bind', 'Source':'/unrelated', 'Destination':'/app/data/student_ms.db', 'RW':True})
        with self.assertRaises(pre.ReleaseError): self.recover()
        self.assertFalse(any('stop' in call or 'up' in call for call in self.runner.calls))

    def test_controlled_stop_pins_validated_container_ids_and_propagates_failure(self):
        self.rec.controlled_stop(self.target, self.runner)
        command = next(call for call in self.runner.calls if 'stop' in call)
        self.assertEqual(command[1:3], ['container', 'stop'])
        for service in ('api', 'web'): self.assertIn(self.containers['fixture-' + service]['Id'], command)
        self.runner.fail_stop = True
        with self.assertRaises(pre.ReleaseError): self.rec.controlled_stop(self.target, self.runner)

    def test_manual_recovery_revalidates_git_root_and_origin_before_mutation(self):
        self.capture()
        for field, value in (('remote', 'https://example.invalid/unrelated'), ('root', str(self.root))):
            with self.subTest(field=field):
                original = self.fixture[field]; self.fixture[field] = value
                with self.assertRaises(pre.ReleaseError): self.recover()
                self.fixture[field] = original
                self.assertFalse(any('stop' in call or 'up' in call for call in self.runner.calls))

    def test_prepare_never_replaces_containers_or_reports_deployment_success(self):
        result = self.rec.prepare(self.config, self.runner, policy=self.policy)
        self.assertEqual(result['status'], 'RECOVERY_PREPARED_DEPLOYMENT_DISABLED')
        self.assert_no_up()

    def test_execute_requires_exact_explicit_opt_in(self):
        for value in (None, '', '0', 'true', 'yes'):
            with self.subTest(value=value):
                with self.assertRaises(pre.ReleaseError):
                    self.rec.deploy(self.config, self.runner, self.policy, execute=value, http=self.http, timeout=0)
                self.assert_no_up()

    def deployed_http(self, url):
        status, body = self.http(url)
        if url.endswith('/api/v1/health'):
            data = json.loads(body); data['buildSha'] = self.config['approved_sha']; body = json.dumps(data).encode()
        return status, body

    def test_guarded_deploy_verifies_all_sha_stages_and_built_images(self):
        result = self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assertEqual(result['status'], 'DEPLOYMENT_VERIFIED')
        for key in ('requested_sha', 'checked_out_sha', 'built_sha', 'health_sha', 'deployed_sha'):
            self.assertEqual(result[key], self.config['approved_sha'])
        self.assertEqual(self.containers['fixture-api']['Image'], NEW_API)
        self.assertEqual(self.containers['fixture-web']['Image'], NEW_WEB)

    def test_runtime_database_configuration_drift_refuses_before_stop(self):
        self.capture()
        api_config = self.containers['fixture-api']['Config']
        for workdir, environment in (('/other', []), ('/app', ['VITEST=true']),
                                     ('/app', ['DATABASE_PATH=/other/student_ms.db']),
                                     ('/app', ['DATABASE_PATH=/app/data/student_ms.db'] * 2),
                                     ('/app', 'DATABASE_PATH=/app/data/student_ms.db')):
            with self.subTest(workdir=workdir, environment=environment):
                api_config['WorkingDir'] = workdir
                api_config['Env'] = environment
                self.runner.calls.clear()
                with self.assertRaises(pre.ReleaseError): self.recover()
                self.assert_no_up()
                self.assertFalse(any(call[1:3] == ['container', 'stop'] for call in self.runner.calls))

    def test_build_time_runtime_database_drift_refuses_before_stop(self):
        def change_database():
            self.containers['fixture-api']['Config']['Env'] = ['DATABASE_PATH=/other/student_ms.db']
        self.runner.on_build = change_database
        with self.assertRaises(pre.ReleaseError):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assert_no_up()
        self.assertFalse(any(call[1:3] == ['container', 'stop'] for call in self.runner.calls))

    def test_wrong_candidate_database_configuration_fails_and_stops_known_ids(self):
        def wrong_database():
            self.containers['fixture-api']['Config']['Env'] = ['DATABASE_PATH=/other/student_ms.db']
            self.runner.on_up = None
        self.runner.on_up = wrong_database
        with self.assertRaisesRegex(pre.ReleaseError, 'DEPLOYMENT_FAILED_RECOVERY_REFUSED'):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assertEqual(sum('up' in call for call in self.runner.calls), 1)
        self.assertTrue(all(container['State']['Running'] is False for container in self.containers.values()))

    def test_wrong_built_sha_refuses_before_replacement(self):
        self.runner.build_wrong_sha = True
        with self.assertRaises(pre.ReleaseError):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assert_no_up()

    def test_capture_time_checkout_change_refuses_before_build(self):
        def change_checkout(): self.fixture['sha'] = 'e' * 40
        self.runner.on_tag = change_checkout
        with self.assertRaises(pre.ReleaseError):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assertFalse(any('build' in call for call in self.runner.calls)); self.assert_no_up()

    def test_build_time_financial_mutation_or_container_change_refuses_before_up(self):
        def mutate():
            with closing(sqlite3.connect(self.db)) as db:
                with db: db.execute("UPDATE payments SET value='changed-during-build'")
        self.runner.on_build = mutate
        with self.assertRaises(pre.ReleaseError):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assert_no_up()

    def test_deploy_final_stopped_writer_snapshot_blocks_racing_payment(self):
        def racing_payment():
            with closing(sqlite3.connect(self.db)) as db:
                with db: db.execute("UPDATE payments SET value='last-moment-payment'")
        self.runner.on_stop = racing_payment
        with self.assertRaises(pre.ReleaseError):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assert_no_up()
        self.assertFalse(self.containers['fixture-api']['State']['Running'])

    def test_failed_deploy_can_recover_but_never_reports_deploy_success(self):
        def http(url):
            if self.containers['fixture-api']['Image'] == NEW_API: return 503, b''
            return self.http(url)
        with self.assertRaisesRegex(pre.ReleaseError, 'DEPLOYMENT_FAILED_RECOVERY_VERIFIED'):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=http, timeout=0)
        self.assertEqual(self.containers['fixture-api']['Image'], API_IMAGE)

    def test_failed_deploy_with_new_financial_event_refuses_old_replacement(self):
        def mutate_once():
            with closing(sqlite3.connect(self.db)) as db:
                with db: db.execute("INSERT INTO webhook_events(value) VALUES ('new-payment-marker')")
            self.runner.on_up = None
        self.runner.on_up = mutate_once
        with self.assertRaisesRegex(pre.ReleaseError, 'DEPLOYMENT_FAILED_RECOVERY_REFUSED'):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=lambda url: (503, b''), timeout=0)
        self.assertEqual(self.containers['fixture-api']['Image'], NEW_API)
        self.assertFalse(self.containers['fixture-api']['State']['Running'])
        self.assertEqual(sum('up' in call for call in self.runner.calls), 1)

    def test_new_foreign_key_violation_blocks_release_without_repair(self):
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute('CREATE TABLE legacy_child (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))')
                db.execute('INSERT INTO legacy_child VALUES (1, 999)')
        self.target = pre.validate_target(self.config, self.runner)
        self.backup = pre.backup_database(self.target, self.config['backup_root'])
        self.policy['schema_sha256'] = self.backup['schema_sha256']
        self.policy['foreign_key_violation_count'] = self.backup['foreign_key_violation_count']
        self.policy['foreign_key_violations_sha256'] = self.backup['foreign_key_violations_sha256']
        def introduce_orphan():
            with closing(sqlite3.connect(self.db)) as db:
                with db: db.execute('INSERT INTO legacy_child VALUES (2, 998)')
            self.runner.on_up = None
        self.runner.on_up = introduce_orphan
        with self.assertRaisesRegex(pre.ReleaseError, 'DEPLOYMENT_FAILED_RECOVERY_REFUSED'):
            self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM legacy_child').fetchone()[0], 2)
        self.assertFalse(self.containers['fixture-api']['State']['Running'])

    def test_unchanged_preexisting_foreign_key_violation_is_recorded_and_allowed(self):
        with closing(sqlite3.connect(self.db)) as db:
            with db:
                db.execute('CREATE TABLE legacy_child (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))')
                db.execute('INSERT INTO legacy_child VALUES (1, 999)')
        self.target = pre.validate_target(self.config, self.runner)
        self.backup = pre.backup_database(self.target, self.config['backup_root'])
        self.policy['schema_sha256'] = self.backup['schema_sha256']
        self.policy['foreign_key_violation_count'] = self.backup['foreign_key_violation_count']
        self.policy['foreign_key_violations_sha256'] = self.backup['foreign_key_violations_sha256']
        self.assertEqual(self.backup['foreign_key_violation_count'], 1)
        result = self.rec.deploy(self.config, self.runner, self.policy, execute='1', http=self.deployed_http, timeout=0)
        self.assertEqual(result['status'], 'DEPLOYMENT_VERIFIED')


if __name__ == '__main__': unittest.main()
