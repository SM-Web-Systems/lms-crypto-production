from contextlib import closing
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import release_preflight as pre


class RetrievedBackupTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='lms-backup-retrieval-')
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        live = root / 'volume'
        live.mkdir()
        self.source = live / 'student_ms.db'
        with closing(sqlite3.connect(self.source)) as db:
            with db:
                for table in pre.REQUIRED_TABLES:
                    db.execute(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY, value TEXT)')
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA wal_autocheckpoint=0')
            with db:
                db.execute("INSERT INTO payments (value) VALUES ('PRIVATE committed WAL row')")
            self.assertTrue(Path(str(self.source) + '-wal').exists())
            metadata = pre.database_metadata(db)
            self.assertEqual(metadata['table_counts']['payments'], 1)
            target = {'database': {'host_path': str(self.source)}, 'checkout': str(root / 'checkout'),
                      'approved_sha': 'a' * 40, 'source_database': metadata}
            backup = pre.backup_database(target, root / 'backups')
        self.original = Path(backup['file'])
        self.expected = pre.file_sha256(backup['evidence_file'])
        retrieved = root / 'retrieval'
        retrieved.mkdir(mode=0o700)
        self.copy = Path(shutil.copy2(self.original, retrieved / 'retrieved.sqlite3'))
        self.receipt = Path(shutil.copy2(backup['evidence_file'], retrieved / 'retrieved.json'))

    def verify(self, database=None, expected=None):
        return subprocess.run([
            sys.executable, '-I', '-S', str(SCRIPTS / 'verify_retrieved_backup.py'),
            '--database', str(database or self.copy), '--evidence', str(self.receipt),
            '--expected-evidence-sha256', expected or self.expected,
        ], capture_output=True, text=True, timeout=30, check=False)

    def refuses(self, code, **kwargs):
        result = self.verify(**kwargs)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(result.stdout, '')
        self.assertEqual(json.loads(result.stderr), {'status': 'REFUSED', 'code': code})
        self.assertNotIn(str(self.copy.parent), result.stderr)

    def test_verifies_a_retrieved_wal_safe_backup_without_writing_or_reporting_rows(self):
        before = self.copy.read_bytes()
        files = sorted(self.copy.parent.iterdir())
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {
            'status': 'RETRIEVED_BACKUP_VERIFIED',
            'backup_sha256': pre.file_sha256(self.copy),
            'evidence_sha256': self.expected,
        })
        self.assertNotIn('PRIVATE', result.stdout)
        self.assertEqual(self.copy.read_bytes(), before)
        self.assertEqual(sorted(self.copy.parent.iterdir()), files)

    def test_requires_an_independent_receipt_hash_and_a_distinct_copy(self):
        self.refuses('RETRIEVED_EVIDENCE_HASH_MISMATCH', expected='0' * 64)
        self.refuses('SEPARATE_RETRIEVED_COPY_REQUIRED', database=self.original)

    def test_refuses_tampered_copy_and_sidecars(self):
        sidecar = Path(str(self.copy) + '-wal')
        sidecar.write_bytes(b'PRIVATE sidecar')
        self.refuses('RETRIEVED_SNAPSHOT_SIDECARS')
        self.assertEqual(sidecar.read_bytes(), b'PRIVATE sidecar')
        sidecar.unlink()
        original = self.copy.read_bytes()
        self.copy.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
        self.refuses('RETRIEVED_BACKUP_HASH_MISMATCH')

    def test_refuses_a_bare_wal_mode_main_file(self):
        self.copy.write_bytes(self.source.read_bytes())
        self.assertEqual(self.copy.read_bytes()[18:20], b'\x02\x02')
        self.refuses('RETRIEVED_SNAPSHOT_NOT_FINALIZED')

    def test_recomputes_schema_and_protected_data_evidence(self):
        payload = json.loads(self.receipt.read_bytes())
        payload['backup']['protected_content_sha256'] = '0' * 64
        self.receipt.write_text(json.dumps(payload), encoding='utf-8')
        self.refuses('RETRIEVED_BACKUP_CONTRACT_MISMATCH', expected=pre.file_sha256(self.receipt))
