import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rehearse_stalwart_restore as mail

IMAGE = 'sha256:' + 'b' * 64
PROBE_IMAGE = 'sha256:' + 'd' * 64
LIVE = 'a' * 64
RESTORED = 'c' * 64
CONFIG = b'''[storage]
data="rocksdb"
blob="rocksdb"
lookup="rocksdb"
fts="rocksdb"
[store.rocksdb]
type="rocksdb"
path="/opt/stalwart/data"
'''


class FakeDocker:
    def __init__(self, args):
        self.args = args
        self.commands = []
        self.live = {'Id': LIVE, 'Image': IMAGE, 'RestartCount': 0,
                     'State': {'Running': True, 'StartedAt': 'original'},
                     'Mounts': [{'Source': args.data_root, 'Destination': '/opt/stalwart',
                                 'RW': True, 'Type': 'bind'},
                                {'Source': args.certificate_root, 'Destination': '/etc/letsencrypt',
                                 'RW': False, 'Type': 'volume'}]}
        self.restore = None
        self.fail = None
        self.removed = False

    def __call__(self, args, timeout=20):
        self.commands.append(args)
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps([{'Id': args[3]}]).encode()
        if args[:2] == ['docker', 'inspect']:
            if args[2] == LIVE:
                return json.dumps([self.live]).encode()
            if self.restore and args[2] in [RESTORED, self.restore['Config']['Labels']['lms.isolated-mail-restore']]:
                return json.dumps([self.restore]).encode()
            raise mail.CaptureError('NOT_FOUND')
        if args[0] == 'tar':
            target = Path(args[args.index('--directory') + 1])
            if os.name == 'posix':
                return mail.run(args, timeout)
            # POSIX ownership/ACL extraction is tested with GNU tar on Linux.
            with tarfile.open(args[args.index('--file') + 1]) as archive:
                archive.extractall(target, filter='data')
            return b''
        if args[:2] == ['docker', 'create']:
            label = args[args.index('--label') + 1].split('=', 1)[1]
            folder = Path(self.args.rehearsal_parent) / label
            self.restore = {'Id': RESTORED, 'Image': IMAGE,
                            'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True,
                                           'PortBindings': {}, 'Memory': mail.MEMORY,
                                           'MemorySwap': mail.MEMORY, 'NanoCpus': 500000000,
                                           'PidsLimit': 256, 'CapDrop': ['ALL'],
                                           'SecurityOpt': ['no-new-privileges']},
                            'NetworkSettings': {'Ports': {'25/tcp': None, '443/tcp': None}},
                            'Mounts': [{'Type': 'bind', 'Source': str(folder / 'restored'),
                                        'Destination': '/opt/stalwart', 'RW': True},
                                       {'Type': 'bind', 'Source': self.args.certificate_root,
                                        'Destination': '/etc/letsencrypt', 'RW': False}],
                            'Config': {'Labels': {'lms.isolated-mail-restore': label}}}
            if self.fail == 'create_timeout':
                raise mail.CaptureError('CREATE_TIMED_OUT_AFTER_DAEMON_SUCCESS')
            if self.fail == 'isolation':
                self.restore['HostConfig']['NetworkMode'] = 'bridge'
            return RESTORED.encode()
        if args[:2] == ['docker', 'start']:
            assert args[2] == RESTORED, 'must never start or stop live mail'
            return b''
        if args[:2] == ['docker', 'run']:
            assert args[args.index('--network') + 1] == 'container:' + RESTORED
            if self.fail == 'probe':
                raise mail.CaptureError('SMTP_PROBE_FAILED')
            return b'SMTP_220_READY\n'
        if args[:2] == ['docker', 'logs']:
            return b'private synthetic log'
        if args[:2] == ['docker', 'rm']:
            assert args[-1] == RESTORED, 'must never remove live mail'
            if self.fail == 'cleanup':
                raise mail.CaptureError('CLEANUP_FAILED')
            self.removed = True
            self.restore = None
            return b''
        raise AssertionError(args)


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lms-restore-test-')
        self.root = Path(self.temp.name).resolve()
        for name in ['live', 'certificates', 'backups']:
            (self.root / name).mkdir(mode=0o700)
        self.source = self.root / 'backups' / 'capture'
        self.source.mkdir(mode=0o700)
        self.archive = self.source / 'stalwart-data.tar'
        entries = [('etc/config.toml', CONFIG), ('data/CURRENT', b'MANIFEST-1\n'),
                   ('data/MANIFEST-1', b'synthetic manifest'), ('data/1.sst', b'synthetic data')]
        with tarfile.open(self.archive, 'w') as output:
            for name, data in entries:
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o600
                if os.name == 'posix':
                    entry.uid, entry.gid = os.getuid(), os.getgid()
                output.addfile(entry, io.BytesIO(data))
        self.archive.chmod(0o600)
        receipt = self.source / 'capture.json'
        data = {'status': 'CONSISTENT_CAPTURE_COMPLETE', 'mail_resumed': True, 'image': IMAGE,
                'archive_sha256': mail.digest(self.archive), 'archive_bytes': self.archive.stat().st_size,
                'clean_shutdown_verified_at': '2026-11-10T00:00:00+00:00',
                'copy_finished_at': '2026-11-10T00:00:01+00:00',
                'mail_resumed_at': '2026-11-10T00:00:02+00:00'}
        receipt.write_text(json.dumps(data)); receipt.chmod(0o600)
        self.args = argparse.Namespace(archive=str(self.archive), receipt=str(receipt),
                    expected_receipt_sha256=mail.digest(receipt), expected_container_id=LIVE,
                    expected_image=IMAGE, probe_image=PROBE_IMAGE, data_root=str(self.root / 'live'),
                    certificate_root=str(self.root / 'certificates'), rehearsal_parent=str(self.root / 'backups'))
        self.docker = FakeDocker(self.args)
        self.headroom = patch.object(mail, 'headroom')
        self.headroom.start()
        self.mode = patch.object(mail.stat, 'S_IMODE', side_effect=lambda mode: mode & 0o700)
        if os.name != 'posix':
            self.mode.start()

    def tearDown(self):
        self.headroom.stop()
        if os.name != 'posix':
            self.mode.stop()
        self.temp.cleanup()

    def plan(self):
        return mail.plan(self.args, self.docker)

    def test_plan_reads_only_and_leaves_source_and_live_untouched(self):
        before = self.archive.read_bytes()
        plan = self.plan()
        self.assertEqual(plan['network'], 'none')
        self.assertFalse(plan['liveServiceWillBeStopped'])
        self.assertEqual(before, self.archive.read_bytes())
        self.assertEqual([p.name for p in (self.root / 'backups').iterdir()], ['capture'])
        self.assertTrue(all(c[:2] in [['docker', 'image'], ['docker', 'inspect']] for c in self.docker.commands))

    def test_live_identity_and_writable_certificates_are_refused(self):
        self.docker.live['Image'] = PROBE_IMAGE
        with self.assertRaisesRegex(mail.CaptureError, 'IDENTITY_DRIFT'):
            self.plan()
        self.docker.live['Image'] = IMAGE
        self.docker.live['Mounts'][1]['RW'] = True
        with self.assertRaisesRegex(mail.CaptureError, 'MOUNT_DRIFT'):
            self.plan()

    def test_capture_and_live_directory_overlap_is_refused(self):
        self.args.rehearsal_parent = self.args.data_root
        with self.assertRaisesRegex(mail.CaptureError, 'OVERLAPS_LIVE'):
            self.plan()
        self.args.rehearsal_parent = str(self.source)
        with self.assertRaisesRegex(mail.CaptureError, 'OVERLAPS_IMMUTABLE'):
            self.plan()

    def test_tampered_archive_is_rejected_before_creation(self):
        self.archive.write_bytes(self.archive.read_bytes() + b'tamper')
        with self.assertRaises(mail.VerificationError):
            self.plan()
        self.assertFalse(any(c[:2] == ['docker', 'create'] for c in self.docker.commands))

    def test_success_uses_a_separate_real_extraction_and_only_isolated_resources(self):
        before = self.archive.read_bytes()
        result = mail.execute(self.args, self.plan(), self.docker)
        self.assertEqual(result['status'], 'ISOLATED_MAIL_RUNTIME_READINESS_VERIFIED')
        self.assertTrue(self.docker.removed)
        self.assertEqual(before, self.archive.read_bytes())
        restored = Path(result['privateRoot']) / 'restored'
        self.assertEqual((restored / 'etc/config.toml').read_bytes(), CONFIG)
        self.assertEqual(list((self.root / 'live').iterdir()), [])
        create = next(c for c in self.docker.commands if c[:2] == ['docker', 'create'])
        self.assertIn('--read-only', create)
        self.assertIn('none', create)
        self.assertNotIn('--publish', create)
        self.assertNotIn('-p', create)
        self.assertFalse(result['mailboxRead'])
        self.assertFalse(result['separateHostRestored'])
        if os.name == 'posix':
            self.assertEqual((restored / 'etc/config.toml').stat().st_mode & 0o777, 0o600)

    def test_probe_failure_cleans_up_and_preserves_incomplete_receipt(self):
        prepared = self.plan(); self.docker.fail = 'probe'
        with self.assertRaisesRegex(mail.CaptureError, 'SMTP_PROBE_FAILED'):
            mail.execute(self.args, prepared, self.docker)
        self.assertTrue(self.docker.removed)
        receipt = next((self.root / 'backups').glob('mail-runtime-*/runtime-receipt.json'))
        data = json.loads(receipt.read_text())
        self.assertEqual(data['status'], 'ISOLATED_MAIL_RESTORE_INCOMPLETE')
        self.assertFalse(data['runtimeReadinessVerified'])

    def test_create_timeout_recovers_exact_unique_resource_for_cleanup(self):
        prepared = self.plan(); self.docker.fail = 'create_timeout'
        with self.assertRaisesRegex(mail.CaptureError, 'CREATE_TIMED_OUT'):
            mail.execute(self.args, prepared, self.docker)
        self.assertTrue(self.docker.removed)

    def test_cleanup_failure_cannot_be_recorded_as_complete(self):
        prepared = self.plan(); self.docker.fail = 'cleanup'
        with self.assertRaisesRegex(mail.CaptureError, 'CLEANUP_FAILED'):
            mail.execute(self.args, prepared, self.docker)
        receipt = next((self.root / 'backups').glob('mail-runtime-*/runtime-receipt.json'))
        data = json.loads(receipt.read_text())
        self.assertEqual(data['status'], 'ISOLATED_MAIL_RESTORE_INCOMPLETE')
        self.assertTrue(data['containerCleanupFailed'])

    def test_isolation_drift_never_starts_the_container(self):
        prepared = self.plan(); self.docker.fail = 'isolation'
        with self.assertRaisesRegex(mail.CaptureError, 'ISOLATION_CONTRACT'):
            mail.execute(self.args, prepared, self.docker)
        self.assertTrue(self.docker.removed)
        self.assertFalse(any(c[:2] == ['docker', 'start'] for c in self.docker.commands))

    def test_changed_live_baseline_refuses_before_writes(self):
        prepared = self.plan(); self.docker.live['State']['StartedAt'] = 'another start'
        with self.assertRaisesRegex(mail.CaptureError, 'CHANGED_SINCE_PLAN'):
            mail.execute(self.args, prepared, self.docker)
        self.assertFalse(list((self.root / 'backups').glob('mail-runtime-*')))

    def test_isolated_python_cli_loads_only_adjacent_reviewed_helpers(self):
        result = subprocess.run([sys.executable, '-I', '-S', str(Path(mail.__file__)), '--help'],
                                capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertIn(b'--execute', result.stdout)

    @unittest.skipUnless(shutil.which('node'), 'Node required for actual loopback greeting contract')
    def test_actual_probe_requires_220_and_refuses_early_eof(self):
        for greeting, expected in [(b'220 synthetic SMTP\r\n', 0), (b'500 rejected\r\n', 2), (b'', 2)]:
            with self.subTest(greeting=greeting), socket.socket() as listener:
                listener.bind(('127.0.0.1', 0)); listener.listen(1); listener.settimeout(5)
                port = listener.getsockname()[1]
                def serve():
                    connection, _ = listener.accept()
                    with connection:
                        if greeting:
                            connection.sendall(greeting)
                            if expected == 0:
                                self.assertEqual(connection.recv(64), b'QUIT\r\n')
                thread = threading.Thread(target=serve); thread.start()
                result = subprocess.run(['node', '-e', mail.PROBE.replace('port:25', f'port:{port}')],
                                        capture_output=True, timeout=8)
                thread.join(timeout=6)
                self.assertEqual(result.returncode, expected)
                self.assertEqual(result.stdout.strip(), b'SMTP_220_READY' if expected == 0 else b'')


if __name__ == '__main__':
    unittest.main()
