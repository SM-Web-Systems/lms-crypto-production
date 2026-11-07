"""Offline RBAC image/schema compatibility checks; synthetic SQLite and images."""
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import release_preflight as pre


class RbacImageCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='lms-rbac-image-')
        self.database = Path(self.directory.name) / 'snapshot.db'
        with closing(sqlite3.connect(self.database)) as database:
            database.execute("CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT DEFAULT 'student')")

    def tearDown(self):
        self.directory.cleanup()

    def image(self, label=None):
        return {'Config': {'Labels': {} if label is None else {pre.AUTHORIZATION_SCHEMA_LABEL: label}}}

    def upgraded(self):
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript("""
              CREATE TABLE authorization_migrations(id TEXT PRIMARY KEY);
              INSERT INTO authorization_migrations VALUES('rbac-only-v1');
              CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users
              FOR EACH ROW BEGIN SELECT 1; END;
            """)

    def test_legacy_image_and_legacy_schema_remain_compatible(self):
        pre.validate_image_authorization(self.image(), self.database)

    def test_new_image_requires_explicit_cutover(self):
        with self.assertRaises(pre.ReleaseError):
            pre.validate_image_authorization(self.image('rbac-only-v1'), self.database)

    def test_upgraded_database_refuses_old_or_unknown_images(self):
        self.upgraded()
        for label in (None, 'unknown'):
            with self.assertRaises(pre.ReleaseError):
                pre.validate_image_authorization(self.image(label), self.database)

    def test_matching_image_passes_without_modifying_snapshot(self):
        self.upgraded()
        before = self.database.read_bytes()
        pre.validate_image_authorization(self.image('rbac-only-v1'), self.database)
        self.assertEqual(before, self.database.read_bytes())

    def test_real_canonical_schema_and_image_label_agree(self):
        canonical = Path(self.directory.name) / 'canonical.db'
        with closing(sqlite3.connect(canonical)) as database:
            database.executescript((ROOT/'LMS-Server/database/schema.sql').read_text(encoding='utf8'))
        pre.validate_image_authorization(self.image('rbac-only-v2'), canonical)

    def test_missing_or_changed_fence_refuses_before_replacement(self):
        self.upgraded()
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript('DROP TRIGGER trg_auto_assign_user_role; CREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users BEGIN SELECT 99; END;')
        with self.assertRaises(pre.ReleaseError):
            pre.validate_image_authorization(self.image('rbac-only-v1'), self.database)

    def test_retired_schema_only_accepts_the_new_floor_and_preserves_bytes(self):
        self.upgraded()
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript("DROP TRIGGER trg_auto_assign_user_role; ALTER TABLE users DROP COLUMN role; INSERT INTO authorization_migrations VALUES('rbac-only-v2');")
        before = self.database.read_bytes()
        for label in (None, 'rbac-only-v1', 'unknown'):
            with self.assertRaises(pre.ReleaseError):
                pre.validate_image_authorization(self.image(label), self.database)
        pre.validate_image_authorization(self.image('rbac-only-v2'), self.database)
        self.assertEqual(before, self.database.read_bytes())

    def test_old_image_cannot_be_forced_by_deleting_the_new_marker(self):
        self.upgraded()
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript('DROP TRIGGER trg_auto_assign_user_role; ALTER TABLE users DROP COLUMN role;')
        for label in (None, 'rbac-only-v1', 'rbac-only-v2'):
            with self.assertRaises(pre.ReleaseError):
                pre.validate_image_authorization(self.image(label), self.database)

    def test_unknown_future_schema_and_partial_contraction_refuse(self):
        self.upgraded()
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript("INSERT INTO authorization_migrations VALUES('rbac-only-v2');")
        with self.assertRaises(pre.ReleaseError):
            pre.validate_image_authorization(self.image('rbac-only-v2'), self.database)
        with closing(sqlite3.connect(self.database)) as database:
            database.executescript("DROP TRIGGER trg_auto_assign_user_role; ALTER TABLE users DROP COLUMN role; INSERT INTO authorization_migrations VALUES('future');")
        with self.assertRaises(pre.ReleaseError):
            pre.validate_image_authorization(self.image('rbac-only-v2'), self.database)

if __name__ == '__main__':
    unittest.main()
