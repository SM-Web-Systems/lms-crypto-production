import argparse
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import capture_stalwart_backup as mail


class FakeDocker:
    def __init__(self, source, real_tar=False):
        self.info = {'Id': 'a' * 64, 'Image': 'sha256:' + 'b' * 64,
                     'State': {'Running': True, 'StartedAt': 'fixture-start', 'ExitCode': 0},
                     'Mounts': [{'RW': True, 'Type': 'bind', 'Source': str(source),
                                 'Destination': '/opt/stalwart'}]}
        self.commands = []
        self.fail = None
        self.bad_exit = False
        self.other = None
        self.real_tar = real_tar

    def __call__(self, args, timeout=20):
        self.commands.append(args)
        if args[:2] == ['docker', 'inspect']:
            info = self.other if self.other and args[2] == self.other['Id'] else self.info
            return json.dumps([info]).encode()
        if args[:2] == ['docker', 'ps']:
            return (self.info['Id'] + ('\n' + self.other['Id'] if self.other else '')).encode()
        if args[:2] == ['docker', 'stop']:
            self.info['State']['Running'] = False
            self.info['State']['ExitCode'] = 137 if self.bad_exit else 0
            if self.fail == 'stop':
                raise mail.CaptureError('STOP_TIMEOUT')
            return b''
        if args[:2] == ['docker', 'start']:
            self.info['State']['Running'] = True
            return b''
        if args[0] == 'tar':
            if self.fail == 'copy' and '-cpf' in args:
                raise mail.CaptureError('COPY_TIMEOUT')
            if self.fail == 'verify' and '-tf' in args:
                raise mail.CaptureError('ARCHIVE_INVALID')
            if self.real_tar:
                return mail.run(args, timeout)
            if '-cpf' in args:
                Path(args[args.index('-cpf') + 1]).write_bytes(b'synthetic archive')
            return b''
        raise AssertionError(args)


class MailCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lms-mail-capture-test-')
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'mail'
        self.parent = self.root / 'captures'
        self.source.mkdir()
        self.parent.mkdir(mode=0o700)
        (self.source / 'CURRENT').write_bytes(b'fixture database')
        self.runner = FakeDocker(self.source)
        self.args = argparse.Namespace(expected_container_id='a' * 64,
                  expected_image='sha256:' + 'b' * 64, smtp_port=25,
                  data_root=str(self.source), capture_parent=str(self.parent),
                  lock_file=str(self.root / 'offsite.lock'))

    def tearDown(self):
        self.temp.cleanup()

    def prepared(self):
        # Windows has no POSIX ACL mode check; test the core with the real Linux
        # path/mode preflight covered in the Linux run below.
        if sys.platform == 'win32':
            return {'container_id': self.args.expected_container_id,
                    'image': self.args.expected_image, 'smtp_port': 25,
                    'source': str(self.source), 'capture_parent': str(self.parent),
                    'started_at': 'fixture-start'}
        return mail.plan(self.args, self.runner)

    @unittest.skipIf(sys.platform == 'win32', 'POSIX directory permissions')
    def test_default_plan_only_reads_and_preserves_files(self):
        result = mail.plan(self.args, self.runner)
        self.assertEqual(result['status'], 'MAIL_CAPTURE_PLAN_READY')
        self.assertEqual(result['files'], 1)
        self.assertFalse(list(self.parent.iterdir()))
        self.assertTrue(all(command[:2] in [['docker', 'inspect'], ['docker', 'ps']]
                            for command in self.runner.commands))

    @unittest.skipIf(sys.platform == 'win32', 'POSIX directory permissions')
    def test_another_writable_container_is_refused(self):
        self.runner.other = copy.deepcopy(self.runner.info)
        self.runner.other['Id'] = 'c' * 64
        with self.assertRaisesRegex(mail.CaptureError, 'ANOTHER_CONTAINER'):
            mail.plan(self.args, self.runner)

    @unittest.skipIf(sys.platform == 'win32', 'POSIX directory permissions')
    def test_identity_or_mount_drift_is_refused(self):
        for field, value in [('Image', 'sha256:' + 'c' * 64), ('Id', 'd' * 64)]:
            with self.subTest(field=field):
                runner = FakeDocker(self.source)
                runner.info[field] = value
                with self.assertRaisesRegex(mail.CaptureError, 'IDENTITY_DRIFT'):
                    mail.plan(self.args, runner)
        self.runner.info['Mounts'][0]['Destination'] = '/wrong'
        with self.assertRaisesRegex(mail.CaptureError, 'MOUNT_CONTRACT'):
            mail.plan(self.args, self.runner)

    @unittest.skipIf(sys.platform == 'win32', 'POSIX lock and permission behavior')
    def test_existing_backup_lock_prevents_a_second_capture(self):
        with mail.backup_lock(self.args.lock_file):
            with self.assertRaisesRegex(mail.CaptureError, 'BACKUP_ALREADY_RUNNING'):
                with mail.backup_lock(self.args.lock_file):
                    self.fail('Acquired a lock already held by another descriptor')

    @unittest.skipIf(sys.platform == 'win32', 'POSIX directory permissions')
    def test_public_or_source_overlapping_capture_directory_is_refused(self):
        self.parent.chmod(0o755)
        with self.assertRaisesRegex(mail.CaptureError, 'NOT_PRIVATE'):
            mail.plan(self.args, self.runner)
        self.args.capture_parent = str(self.source)
        with self.assertRaisesRegex(mail.CaptureError, 'OVERLAPS_SOURCE'):
            mail.plan(self.args, self.runner)

    def test_missing_smtp_baseline_does_not_stop_mail(self):
        with self.assertRaisesRegex(mail.CaptureError, 'BASELINE_NOT_READY'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: False)
        self.assertFalse(any(command[:2] == ['docker', 'stop'] for command in self.runner.commands))

    def test_success_resumes_before_archive_validation(self):
        result = mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        commands = self.runner.commands
        start = next(i for i, value in enumerate(commands) if value[:2] == ['docker', 'start'])
        verify = next(i for i, value in enumerate(commands) if value[:2] == ['tar', '-tf'])
        self.assertLess(start, verify)
        self.assertTrue(self.runner.info['State']['Running'])
        self.assertEqual(result['status'], 'CONSISTENT_CAPTURE_COMPLETE')
        self.assertFalse(result['runtime_restore_verified'])
        self.assertFalse(result['offsite_uploaded'])
        self.assertFalse(Path(result['capture_directory']).suffix)
        self.assertEqual((self.source / 'CURRENT').read_bytes(), b'fixture database')

    def test_stop_timeout_still_resumes_and_never_copies(self):
        self.runner.fail = 'stop'
        with self.assertRaisesRegex(mail.CaptureError, 'FAILED_OR_INTERRUPTED'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        self.assertTrue(self.runner.info['State']['Running'])
        self.assertFalse(any(command[0] == 'tar' for command in self.runner.commands))

    def test_unclean_shutdown_still_resumes_and_never_copies(self):
        self.runner.bad_exit = True
        with self.assertRaisesRegex(mail.CaptureError, 'FAILED_OR_INTERRUPTED'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        self.assertTrue(self.runner.info['State']['Running'])
        self.assertFalse(any(command[0] == 'tar' for command in self.runner.commands))

    def test_copy_timeout_resumes_and_retains_private_incomplete_receipt(self):
        self.runner.fail = 'copy'
        with self.assertRaisesRegex(mail.CaptureError, 'FAILED_OR_INTERRUPTED'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        receipt = json.loads(next(self.parent.glob('*.partial/capture.json')).read_text())
        self.assertEqual(receipt['status'], 'INCOMPLETE')
        self.assertTrue(receipt['mail_resumed'])
        self.assertTrue(self.runner.info['State']['Running'])

    def test_archive_failure_occurs_after_mail_resumed(self):
        self.runner.fail = 'verify'
        with self.assertRaisesRegex(mail.CaptureError, 'ARCHIVE_INVALID'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        self.assertTrue(self.runner.info['State']['Running'])
        self.assertTrue(all(path.suffix == '.partial' for path in self.parent.iterdir()))

    def test_interrupt_during_copy_still_resumes_mail(self):
        def interrupted(args, timeout=20):
            if args[0] == 'tar' and '-cpf' in args:
                raise KeyboardInterrupt()
            return self.runner(args, timeout)
        with self.assertRaisesRegex(mail.CaptureError, 'FAILED_OR_INTERRUPTED'):
            mail.capture(self.prepared(), interrupted, ready=lambda port: True)
        self.assertTrue(self.runner.info['State']['Running'])

    def test_resume_failure_is_explicit_and_never_marks_capture_complete(self):
        def fail(*args, **kwargs):
            raise mail.CaptureError('FIXTURE_START_FAILURE')
        with self.assertRaisesRegex(mail.CaptureError, 'RESUME_REQUIRES_OPERATOR'):
            mail.capture(self.prepared(), self.runner, ready=lambda port: True, resume_mail=fail)
        receipt = json.loads(next(self.parent.glob('*.partial/capture.json')).read_text())
        self.assertEqual(receipt['status'], 'MAIL_RESUME_REQUIRES_OPERATOR')
        self.assertFalse(receipt['mail_resumed'])

    @unittest.skipUnless(sys.platform == 'linux' and shutil.which('tar'), 'Linux GNU tar integration')
    def test_real_stopped_writer_archive_preserves_bytes_and_modes(self):
        (self.source / 'CURRENT').chmod(0o640)
        self.runner.real_tar = True
        result = mail.capture(self.prepared(), self.runner, ready=lambda port: True)
        target = self.root / 'restore-fixture'
        target.mkdir()
        subprocess.run(['tar', '-xf', str(Path(result['capture_directory']) / 'stalwart-data.tar'),
                        '-C', str(target)], check=True)
        self.assertEqual((target / 'CURRENT').read_bytes(), b'fixture database')
        self.assertEqual((target / 'CURRENT').stat().st_mode & 0o777, 0o640)


if __name__ == '__main__':
    unittest.main()
