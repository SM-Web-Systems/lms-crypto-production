import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[1] / 'server_rbac_inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
API = 'sha256:' + '1' * 64
WEB = 'sha256:' + '2' * 64
SHA = 'a' * 40


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lms-readonly-controller-')
        self.root = Path(self.temp.name).resolve()
        self.backup = self.root / 'backups'
        self.backup.mkdir(mode=0o700)
        self.state = self.backup / 'release-state'
        self.state.mkdir(mode=0o700)
        self.checkout = self.root / 'checkout'
        self.tool = self.checkout / 'LMS-Server/scripts/rbac-inventory.mjs'
        self.tool.parent.mkdir(parents=True)
        self.tool.write_text('// synthetic trusted tool', encoding='utf-8')
        self.snapshot = self.backup / 'snapshot.sqlite3'
        self.snapshot.write_bytes(b'synthetic immutable snapshot')
        self.snapshot.chmod(0o600)
        self.manifest_id = 'b' * 32
        manifest = {'version': 1, 'manifest_id': self.manifest_id, 'eligibility': 'EXACT_SCHEMA_AND_FINANCIAL_STATE',
                    'target': {'project': 'lms', 'repository': 'SM-Web-Systems/lms-crypto-production',
                               'services': {'api': {'image_id': API}, 'web': {'image_id': WEB}}},
                    'backup': {'file': str(self.snapshot), 'sha256': inventory.digest(self.snapshot)}}
        file = self.state / ('recovery-' + self.manifest_id + '.json')
        file.write_text(json.dumps(manifest), encoding='utf-8')
        file.chmod(0o600)
        self.env = {'DEPLOY_BASE_URL': 'https://lms.smwebsystems.com', 'DEPLOY_PROJECT': 'lms',
                    'DEPLOY_API_CONTAINER': 'lms-api', 'DEPLOY_WEB_CONTAINER': 'lms-web',
                    'DEPLOY_DIR': str(self.checkout), 'DEPLOY_BACKUP_DIR': str(self.backup),
                    'LMS_INVENTORY_MODE': 'probe', 'LMS_INVENTORY_MANIFEST': self.manifest_id,
                    'LMS_INVENTORY_TOOL_SHA256': inventory.digest(self.tool)}
        self.calls = []
        self.summary = {'snapshotSha256': inventory.digest(self.snapshot), 'deployedApplication': {'sha': SHA},
                        'readOnly': True, 'productionInventoryVerified': False, 'gates': {'migrationReady': False}}

    def tearDown(self):
        self.temp.cleanup()

    def run_command(self, args, timeout=45):
        self.calls.append(args)
        if args[:3] == ['docker', 'container', 'inspect']:
            return json.dumps({'image': API if args[-1] == 'lms-api' else WEB, 'running': True, 'project': 'lms'})
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps({'id': args[-1], 'revision': SHA, 'workdir': '/app'})
        if args[0] == 'git':
            if args[-1] == 'HEAD':
                return SHA
            if args[-1] == 'origin':
                return 'https://PRIVATE-TOKEN@example.invalid/PRIVATE-REPOSITORY'
            return '?? PRIVATE-UNTRACKED-FILENAME\n'
        if args[:2] == ['docker', 'run']:
            return json.dumps(self.summary)
        if args[:3] == ['docker', 'rm', '--force']:
            return ''
        raise AssertionError('Unexpected command')

    def test_probe_reads_only_metadata_and_does_not_echo_private_paths_or_remote(self):
        before = set(self.root.rglob('*'))
        result = inventory.execute(self.env, self.run_command)
        self.assertEqual(result['status'], 'SSH_RUNTIME_READ_CONFIRMED')
        self.assertEqual(result['checkout'], {'exists': True, 'revision': SHA, 'dirty': True, 'repositoryMatches': False})
        output = json.dumps(result)
        self.assertNotIn('PRIVATE', output)
        self.assertNotIn(str(self.root), output)
        self.assertNotIn('workdir', output)
        self.assertEqual(before, set(self.root.rglob('*')))
        self.assertFalse(any(args[:2] in (['docker', 'run'], ['docker', 'rm']) for args in self.calls))
        self.assertTrue(all('--no-optional-locks' in args for args in self.calls if args[0] == 'git'))

    def test_wrong_target_or_command_injection_is_refused_before_execution(self):
        for key, value in [('DEPLOY_BASE_URL', 'https://other.invalid'), ('DEPLOY_PROJECT', 'lms;reboot'),
                           ('DEPLOY_API_CONTAINER', 'lms-api;systemctl stop ssh'), ('LMS_INVENTORY_MODE', 'deploy')]:
            with self.subTest(key=key):
                self.calls.clear()
                with self.assertRaises(inventory.Refused):
                    inventory.execute(dict(self.env, **{key: value}), self.run_command)
                self.assertEqual(self.calls, [])

    def test_inventory_reads_only_verified_snapshot_with_bounded_isolated_container(self):
        before = self.snapshot.read_bytes()
        result = inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
        self.assertEqual(result['status'], 'PRIVATE_SNAPSHOT_INVENTORIED')
        run = next(args for args in self.calls if args[:2] == ['docker', 'run'])
        self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertEqual(run[run.index('--entrypoint') + 1], 'node')
        self.assertIn('--read-only', run)
        self.assertIn('256m', run)
        self.assertIn('0.5', run)
        self.assertIn(f'type=bind,src={self.snapshot},dst=/tmp/lms-snapshot.sqlite3,readonly', run)
        self.assertNotIn('DATABASE_PATH', ' '.join(run))
        name = run[run.index('--name') + 1]
        self.assertRegex(name, r'^lms-rbac-inventory-[a-f0-9]{32}$')
        self.assertEqual(self.calls[-1], ['docker', 'rm', '--force', name])
        self.assertNotIn(name, ('lms-api', 'lms-web'))
        self.assertEqual(self.snapshot.read_bytes(), before)

    def test_stale_snapshot_refuses_before_creating_a_container(self):
        os.utime(self.snapshot, (time.time() - 4000,) * 2)
        with self.assertRaisesRegex(inventory.Refused, 'FRESH_SNAPSHOT_REQUIRED'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))

    def test_snapshot_or_tool_drift_refuses_before_creating_a_container(self):
        for file in (self.snapshot, self.tool):
            original = file.read_bytes()
            file.write_bytes(b'changed')
            with self.assertRaisesRegex(inventory.Refused, 'HASH_MISMATCH'):
                inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
            file.write_bytes(original)
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))

    def test_private_details_are_not_allowed_in_public_summary(self):
        self.summary['accounts'] = [{'id': 'PRIVATE-ACCOUNT'}]
        with self.assertRaisesRegex(inventory.Refused, 'AGGREGATE_SUMMARY_REQUIRED'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
        self.assertEqual(self.calls[-1][:3], ['docker', 'rm', '--force'])


if __name__ == '__main__':
    unittest.main()
