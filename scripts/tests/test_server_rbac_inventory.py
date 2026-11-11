import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[1] / 'server_rbac_inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
API = 'sha256:' + '1' * 64
WEB = 'sha256:' + '2' * 64
SHA = 'a' * 40


class InventoryTests(unittest.TestCase):
    def test_private_files_use_their_owner_without_dac_override(self):
        self.assertEqual(inventory.inventory_container_user({'sourceUid': 1234, 'reportUid': 1234, 'reportGid': 5678}), '1234:5678')
        self.assertEqual(inventory.inventory_container_user({'sourceUid': 0, 'reportUid': 0, 'reportGid': 0}), '0:0')

    def test_private_file_owner_mismatch_refuses_instead_of_changing_permissions(self):
        with self.assertRaisesRegex(inventory.Refused, 'PRIVATE_SNAPSHOT_OWNER_MISMATCH'):
            inventory.inventory_container_user({'sourceUid': 4321, 'reportUid': 1234, 'reportGid': 5678})

    def test_private_owner_metadata_rejects_untrusted_values(self):
        for owners in [{}, {'sourceUid': 0, 'reportUid': True, 'reportGid': 0},
                       {'sourceUid': 0, 'reportUid': 0, 'reportGid': -1},
                       {'sourceUid': 0, 'reportUid': 0, 'reportGid': 0, 'PRIVATE': 'value'}]:
            with self.assertRaisesRegex(inventory.Refused, 'PRIVATE_FILE_OWNER_METADATA_REQUIRED'):
                inventory.inventory_container_user(owners)

    def test_inventory_failures_return_fixed_codes_without_private_stderr(self):
        arguments = ['docker', 'run', '/app/.lms-inventory.mjs', '--snapshot']
        for stderr, exit_code, expected in [
            ('RBAC inventory refused: Unsupported snapshot schema: required columns missing from private.', 2, 'INVENTORY_SCHEMA_UNSUPPORTED'),
            ('RBAC inventory refused: Unable to inspect PRIVATE /srv/private', 2, 'INVENTORY_TOOL_REFUSED'),
            ("Cannot find package 'better-sqlite3' imported from /PRIVATE", 1, 'INVENTORY_RUNTIME_DEPENDENCY_UNAVAILABLE'),
            ('PRIVATE', 137, 'INVENTORY_MEMORY_LIMIT'),
            ('PRIVATE', 125, 'INVENTORY_CONTAINER_START_REFUSED'),
            ('PRIVATE', 1, 'INVENTORY_CONTAINER_COMMAND_FAILED'),
        ]:
            with self.subTest(expected=expected):
                result = SimpleNamespace(returncode=exit_code, stdout='', stderr=stderr)
                with patch.object(inventory.subprocess, 'run', return_value=result):
                    with self.assertRaisesRegex(inventory.Refused, '^' + expected + '$'):
                        inventory.command(arguments)

    def test_owner_probe_failure_never_exposes_private_docker_output(self):
        result = SimpleNamespace(returncode=1, stdout='', stderr='PRIVATE host path and credentials')
        with patch.object(inventory.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(inventory.Refused, '^INVENTORY_OWNER_METADATA_PROBE_FAILED$'):
                inventory.command(['docker', 'run', '-e', inventory.OWNER_SCRIPT])

    def test_preparation_reports_only_a_fixed_safe_refusal_code(self):
        arguments = ['env', 'DEPLOY_EXECUTE=0', 'python3', '/reviewed/scripts/release_recovery.py', 'prepare']
        result = SimpleNamespace(returncode=2, stdout='', stderr='private diagnostic\n' + json.dumps(
            {'status': 'REFUSED', 'code': 'BACKUP_DISK_SPACE_INSUFFICIENT'}))
        with patch.object(inventory.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(inventory.Refused, '^PREPARATION_BACKUP_DISK_SPACE_INSUFFICIENT$'):
                inventory.command(arguments)

    def test_preparation_never_forwards_private_or_untrusted_command_errors(self):
        arguments = ['env', 'DEPLOY_EXECUTE=0', 'python3', '/reviewed/scripts/release_recovery.py', 'prepare']
        for stderr, command in [
            ('private traceback /srv/PRIVATE', arguments),
            (json.dumps({'status': 'REFUSED', 'code': '/srv/PRIVATE'}), arguments),
            (json.dumps({'status': 'REFUSED', 'code': 'PRIVATE_TOKEN'}), ['docker', 'inspect', 'private']),
        ]:
            with self.subTest(stderr=stderr):
                result = SimpleNamespace(returncode=2, stdout='', stderr=stderr)
                with patch.object(inventory.subprocess, 'run', return_value=result):
                    with self.assertRaisesRegex(inventory.Refused, '^COMMAND_REFUSED$'):
                        inventory.command(command)

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
        # Leave room for filesystem timestamps to lead the test clock slightly.
        fresh_time = time.time() - 5
        os.utime(self.snapshot, (fresh_time, fresh_time))
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
            return json.dumps({'image': API if args[-1] == 'lms-api' else WEB, 'running': True, 'project': 'lms', 'containerId': 'a' * 64})
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps({'id': args[-1], 'revision': SHA, 'workdir': '/app'})
        if args[0] == 'git':
            if args[-1] == 'HEAD':
                return SHA
            if args[-1] == 'origin':
                return 'https://PRIVATE-TOKEN@example.invalid/PRIVATE-REPOSITORY'
            return '?? PRIVATE-UNTRACKED-FILENAME\n'
        if args[:2] == ['docker', 'run']:
            if '-e' in args:
                return json.dumps({'sourceUid': 1234, 'reportUid': 1234, 'reportGid': 5678})
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

    def test_wallet_probe_uses_only_the_pinned_api_container_and_keeps_files_private(self):
        settings = dict(self.env, LMS_INVENTORY_MODE='wallet-callback', LMS_INVENTORY_MANIFEST='')
        reply = {'httpStatus': 302, 'noReferrer': True, 'strictOriginWhenCrossOrigin': False, 'noStore': True}
        before = set(self.root.rglob('*'))

        def run(args, timeout=45):
            if args[:2] != ['docker', 'exec']:
                return self.run_command(args, timeout)
            self.calls.append(args)
            self.assertEqual(args, ['docker', 'exec', '--workdir', '/', '--env', 'NODE_OPTIONS=',
                                    'a' * 64, 'node', '-e', inventory.WALLET_CALLBACK_SCRIPT])
            self.assertEqual(timeout, 12)
            return json.dumps(reply)

        with patch.object(inventory, 'PREPARED_REVISION', SHA):
            result = inventory.execute(settings, run)
            self.assertEqual(result['status'], 'WALLET_CALLBACK_ORIGIN_OBSERVED')
            self.assertEqual(result['callback'], reply)
            self.assertEqual([args[:2] for args in self.calls], [['docker', 'container'], ['docker', 'image'],
                                                                 ['docker', 'container'], ['docker', 'image'],
                                                                 ['docker', 'exec']])
            self.assertEqual(before, set(self.root.rglob('*')))
            reply['unexpected'] = 'private-location'
            with self.assertRaisesRegex(inventory.Refused, '^WALLET_CALLBACK_PROBE_INVALID$'):
                inventory.execute(settings, run)

    def test_wallet_probe_refuses_unreviewed_revision_or_manifest(self):
        with self.assertRaisesRegex(inventory.Refused, '^UNEXPECTED_MANIFEST_ID$'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='wallet-callback'), self.run_command)
        self.assertEqual(self.calls, [])
        with self.assertRaisesRegex(inventory.Refused, '^PREPARED_REVISION_REQUIRED$'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='wallet-callback', LMS_INVENTORY_MANIFEST=''), self.run_command)
        self.assertFalse(any(args[:2] == ['docker', 'exec'] for args in self.calls))

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
        run = next(args for args in self.calls if args[:2] == ['docker', 'run'] and '--snapshot' in args)
        self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertEqual(run[run.index('--entrypoint') + 1], 'node')
        self.assertIn('--read-only', run)
        self.assertIn('256m', run)
        self.assertIn('0.5', run)
        self.assertEqual(run[run.index('--user') + 1], '1234:5678')
        owner_run = next(args for args in self.calls if args[:2] == ['docker', 'run'] and '-e' in args)
        self.assertEqual(owner_run[-1], inventory.OWNER_SCRIPT)
        self.assertIn('64m', owner_run)
        self.assertTrue(any('dst=/tmp/lms-private-report,readonly' in arg for arg in owner_run))
        self.assertIn('--cap-drop', run)
        self.assertEqual(run[run.index('--cap-drop') + 1], 'ALL')
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
        for file, expected in ((self.snapshot, 'SNAPSHOT_HASH_MISMATCH'), (self.tool, 'TOOL_HASH_MISMATCH')):
            with self.subTest(expected=expected):
                original = file.read_bytes()
                metadata = file.stat()
                try:
                    file.write_bytes(b'changed')
                    os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
                    with self.assertRaisesRegex(inventory.Refused, f'^{expected}$'):
                        inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
                finally:
                    file.write_bytes(original)
                    os.utime(file, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))

    def test_private_details_are_not_allowed_in_public_summary(self):
        self.summary['accounts'] = [{'id': 'PRIVATE-ACCOUNT'}]
        with self.assertRaisesRegex(inventory.Refused, 'AGGREGATE_SUMMARY_REQUIRED'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
        self.assertEqual(self.calls[-1][:3], ['docker', 'rm', '--force'])

    def unverified_capture(self):
        recovery = self.state / ('recovery-' + self.manifest_id + '.json')
        manifest = json.loads(recovery.read_text(encoding='utf-8'))
        manifest['eligibility'] = 'UNVERIFIED'
        file = self.state / ('capture-' + self.manifest_id + '.json')
        file.write_text(json.dumps(manifest), encoding='utf-8')
        file.chmod(0o600)
        return file

    def test_existing_capture_inventory_keeps_recovery_unverified_and_never_prepares_again(self):
        file = self.unverified_capture()
        before = file.read_bytes()
        result = inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory-capture',
                                        LMS_INVENTORY_MANIFEST=''), self.run_command)
        self.assertEqual(result['status'], 'PRIVATE_SNAPSHOT_INVENTORIED')
        self.assertTrue(result['inventoryOnly'])
        self.assertEqual(result['recoveryEligibility'], 'UNVERIFIED')
        self.assertFalse(result['summary']['gates']['migrationReady'])
        self.assertFalse(any(args[0] == 'env' for args in self.calls))
        self.assertEqual(file.read_bytes(), before)
        self.assertFalse((self.state / 'current-recovery.json').exists())

    def test_capture_evidence_cannot_be_used_by_the_recovery_inventory_mode(self):
        file = self.unverified_capture()
        recovery = self.state / ('recovery-' + self.manifest_id + '.json')
        recovery.write_bytes(file.read_bytes())
        with self.assertRaisesRegex(inventory.Refused, 'MANIFEST_ELIGIBILITY_MISMATCH'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory'), self.run_command)
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))

    def test_capture_inventory_refuses_stale_closed_copy_before_any_container(self):
        self.unverified_capture()
        os.utime(self.snapshot, (time.time() - 4000,) * 2)
        with self.assertRaisesRegex(inventory.Refused, 'FRESH_SNAPSHOT_REQUIRED'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='inventory-capture'), self.run_command)
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))

    def capture_fixture(self):
        files = {}
        for relative in inventory.TRUSTED_RELEASE_FILES:
            file = self.checkout / relative
            file.parent.mkdir(exist_ok=True)
            file.write_text('synthetic reviewed ' + relative, encoding='utf-8')
            files[relative] = inventory.digest(file)
        return files

    def capture_command(self, args, timeout=45):
        if args[0] == 'git':
            self.calls.append(args)
            if args[-1] == 'HEAD':
                return SHA
            if args[-1] == 'origin':
                return 'https://github.com/SM-Web-Systems/lms-crypto-production.git'
            return ''
        if args[0] == 'env':
            self.calls.append(args)
            return json.dumps({'status': 'RECOVERY_PREPARED_DEPLOYMENT_DISABLED', 'requested_sha': SHA,
                               'manifest_id': self.manifest_id, 'recovery_eligible': True})
        return self.run_command(args, timeout)

    def test_capture_invokes_only_reviewed_preparation_and_inventories_its_closed_snapshot(self):
        files = self.capture_fixture()
        with patch.object(inventory, 'PREPARED_REVISION', SHA), patch.object(inventory, 'TRUSTED_RELEASE_FILES', files):
            result = inventory.execute(dict(self.env, LMS_INVENTORY_MODE='capture'), self.capture_command)
        self.assertEqual(result['mode'], 'capture')
        self.assertEqual(result['status'], 'PRIVATE_SNAPSHOT_INVENTORIED')
        prepare = next(args for args in self.calls if args[0] == 'env')
        self.assertIn('DEPLOY_EXECUTE=0', prepare)
        self.assertIn('DEPLOY_DRY_RUN=0', prepare)
        self.assertEqual(prepare[-2:], [str(self.checkout / 'scripts/release_recovery.py'), 'prepare'])
        self.assertFalse(any('deploy.sh' in arg or arg in ('stop', 'restart', 'up', 'reboot', 'systemctl')
                             for args in self.calls for arg in args))
        self.assertTrue(self.snapshot.exists())

    def test_capture_refuses_changed_revision_before_preparation(self):
        self.capture_fixture()
        with self.assertRaisesRegex(inventory.Refused, 'PREPARED_REVISION_REQUIRED'):
            inventory.execute(dict(self.env, LMS_INVENTORY_MODE='capture'), self.capture_command)
        self.assertFalse(any(args[0] == 'env' for args in self.calls))

    def test_capture_refuses_dirty_checkout_or_reviewed_script_drift_before_preparation(self):
        files = self.capture_fixture()
        with patch.object(inventory, 'PREPARED_REVISION', SHA), patch.object(inventory, 'TRUSTED_RELEASE_FILES', files):
            def dirty(args, timeout=45):
                if args[0] == 'git' and 'status' in args:
                    return '?? private-file'
                return self.capture_command(args, timeout)
            with self.assertRaisesRegex(inventory.Refused, 'CHECKOUT_DIRTY'):
                inventory.execute(dict(self.env, LMS_INVENTORY_MODE='capture'), dirty)
            (self.checkout / 'scripts/release_recovery.py').write_text('drift', encoding='utf-8')
            with self.assertRaisesRegex(inventory.Refused, 'RELEASE_FILE_HASH_MISMATCH'):
                inventory.execute(dict(self.env, LMS_INVENTORY_MODE='capture'), self.capture_command)
        self.assertFalse(any(args[0] == 'env' for args in self.calls))

    def test_capture_ineligible_preparation_never_starts_inventory_container(self):
        files = self.capture_fixture()
        def ineligible(args, timeout=45):
            if args[0] == 'env':
                return json.dumps({'status': 'RECOVERY_PREPARED_DEPLOYMENT_DISABLED', 'requested_sha': SHA,
                                   'manifest_id': self.manifest_id, 'recovery_eligible': False})
            return self.capture_command(args, timeout)
        with patch.object(inventory, 'PREPARED_REVISION', SHA), patch.object(inventory, 'TRUSTED_RELEASE_FILES', files):
            with self.assertRaisesRegex(inventory.Refused, 'VERIFIED_PREPARATION_REQUIRED'):
                inventory.execute(dict(self.env, LMS_INVENTORY_MODE='capture'), ineligible)
        self.assertFalse(any(args[:2] == ['docker', 'run'] for args in self.calls))


if __name__ == '__main__':
    unittest.main()
