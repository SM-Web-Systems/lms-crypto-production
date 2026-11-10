import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import verify_stalwart_capture as verifier

IMAGE = 'sha256:' + 'a' * 64
CONFIG = b'''[storage]
data = "rocksdb"
blob = "rocksdb"
lookup = "rocksdb"
fts = "rocksdb"
[store.rocksdb]
type = "rocksdb"
path = "/opt/stalwart/data"
'''


class CaptureVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lms-mail-verify-')
        self.root = Path(self.temp.name).resolve()
        self.archive = self.root / 'capture.tar'
        self.receipt = self.root / 'capture.json'
        self.entries = [('etc/config.toml', CONFIG), ('data/CURRENT', b'MANIFEST-000001\n'),
                        ('data/MANIFEST-000001', b'synthetic manifest'), ('data/000002.sst', b'synthetic store')]
        self.write_capture()

    def tearDown(self):
        self.temp.cleanup()

    def write_capture(self, special=None):
        with tarfile.open(self.archive, 'w') as archive:
            for name, data in self.entries:
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            if special:
                archive.addfile(special)
        self.archive.chmod(0o600)
        self.data = {'status': 'CONSISTENT_CAPTURE_COMPLETE', 'mail_resumed': True,
                     'image': IMAGE, 'archive_sha256': verifier.digest(self.archive),
                     'archive_bytes': self.archive.stat().st_size,
                     'clean_shutdown_verified_at': '2026-11-10T05:00:00+00:00',
                     'copy_finished_at': '2026-11-10T05:00:01+00:00',
                     'mail_resumed_at': '2026-11-10T05:00:02+00:00'}
        self.write_receipt()

    def write_receipt(self):
        self.receipt.write_text(json.dumps(self.data))
        self.receipt.chmod(0o600)
        self.expected = verifier.digest(self.receipt)

    def verify(self):
        return verifier.verify(self.archive, self.receipt, self.expected, IMAGE)

    def test_valid_pair_is_read_only_and_does_not_claim_runtime_recovery(self):
        before = self.archive.read_bytes(), self.receipt.read_bytes()
        result = self.verify()
        self.assertEqual(result['files'], 4)
        self.assertTrue(result['rocksdb_current_manifest_bound'])
        for field in ['extracted', 'runtime_restored', 'mailbox_read']:
            self.assertFalse(result[field])
        self.assertEqual(before, (self.archive.read_bytes(), self.receipt.read_bytes()))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['capture.json', 'capture.tar'])

    def test_independent_receipt_digest_rejects_substitution(self):
        self.receipt.write_text(self.receipt.read_text() + ' ')
        with self.assertRaisesRegex(verifier.VerificationError, 'RECEIPT_DIGEST_MISMATCH'):
            self.verify()

    def test_archive_tamper_is_refused_before_parsing(self):
        data = bytearray(self.archive.read_bytes()); data[600] ^= 1
        self.archive.write_bytes(data)
        with self.assertRaisesRegex(verifier.VerificationError, 'ARCHIVE_DIGEST_MISMATCH'):
            self.verify()

    def test_partial_capture_and_failed_resume_are_refused(self):
        for change in [{'status': 'INCOMPLETE'}, {'mail_resumed': False}]:
            with self.subTest(change=change):
                self.write_capture(); self.data.update(change); self.write_receipt()
                with self.assertRaisesRegex(verifier.VerificationError, 'NOT_COMPLETE_AND_RESUMED'):
                    self.verify()

    def test_wrong_image_and_timing_are_refused(self):
        self.data['image'] = 'sha256:' + 'b' * 64; self.write_receipt()
        with self.assertRaisesRegex(verifier.VerificationError, 'IMAGE_MISMATCH'):
            self.verify()
        self.write_capture(); self.data['mail_resumed_at'] = '2026-11-10T04:59:00+00:00'; self.write_receipt()
        with self.assertRaisesRegex(verifier.VerificationError, 'TIMING_INVALID'):
            self.verify()

    def test_path_traversal_absolute_and_windows_paths_are_refused(self):
        for name in ['../outside', '/outside', 'safe/../../outside', r'..\outside']:
            with self.subTest(name=name):
                self.entries.append((name, b'fixture')); self.write_capture()
                with self.assertRaisesRegex(verifier.VerificationError, 'UNSAFE_ARCHIVE_ENTRY'):
                    self.verify()
                self.entries.pop()

    def test_links_and_devices_are_refused(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            with self.subTest(kind=kind):
                member = tarfile.TarInfo('unsafe'); member.type = kind; member.linkname = '/outside'
                self.write_capture(member)
                with self.assertRaisesRegex(verifier.VerificationError, 'UNSAFE_ARCHIVE_ENTRY'):
                    self.verify()

    def test_duplicate_normalized_names_are_refused(self):
        self.entries.append(('./data/CURRENT', b'MANIFEST-000001\n')); self.write_capture()
        with self.assertRaisesRegex(verifier.VerificationError, 'DUPLICATE_ARCHIVE_ENTRY'):
            self.verify()

    def test_config_or_current_manifest_binding_is_required(self):
        for removed in ['etc/config.toml', 'data/CURRENT', 'data/MANIFEST-000001']:
            with self.subTest(removed=removed):
                original = self.entries
                self.entries = [entry for entry in original if entry[0] != removed]
                self.write_capture()
                with self.assertRaises(verifier.VerificationError):
                    self.verify()
                self.entries = original

    def test_remote_or_different_store_contract_is_refused(self):
        self.entries[0] = ('etc/config.toml', CONFIG.replace(b'type = "rocksdb"', b'type = "postgresql"'))
        self.write_capture()
        with self.assertRaisesRegex(verifier.VerificationError, 'STORE_CONTRACT_MISMATCH'):
            self.verify()

    @unittest.skipUnless(os.name == 'posix', 'POSIX permission check')
    def test_nonprivate_archive_is_refused(self):
        self.archive.chmod(0o644)
        with self.assertRaisesRegex(verifier.VerificationError, 'PERMISSIONS_NOT_PRIVATE'):
            self.verify()


if __name__ == '__main__':
    unittest.main()
