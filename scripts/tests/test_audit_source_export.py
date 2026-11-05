import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('audit_export', ROOT / 'scripts/export-audit-source.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class AuditSourceExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lms audit export ')
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.run_git('init')
        self.run_git('config', 'core.autocrlf', 'true')
        (self.root / 'hooks').mkdir()
        self.run_git('config', 'core.hooksPath', str(self.root / 'hooks'))
        (self.repo / '.gitattributes').write_bytes(b'*.sql text eol=crlf\nhidden.txt export-ignore\n')
        (self.repo / 'fixture.sql').write_bytes(b'SELECT 1;\r\nSELECT 2;\r\n')
        (self.repo / 'hidden.txt').write_bytes(b'tracked evidence\n')
        (self.repo / 'binary.bin').write_bytes(bytes(range(256)))
        self.run_git('add', '.')
        self.commit()
        self.sha = self.run_git('rev-parse', 'HEAD').decode().strip()
        self.output = self.root / 'new export'

    def tearDown(self):
        self.temp.cleanup()

    def run_git(self, *args, input=None):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], input=input, stderr=subprocess.DEVNULL)

    def commit(self):
        self.run_git('-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture',
                     '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')

    def test_raw_blobs_ignore_checkout_eol_and_export_attributes(self):
        manifest = exporter.export_source(self.repo, self.sha, self.output)
        self.assertNotIn(b'\r\n', (self.output / 'fixture.sql').read_bytes())
        for entry in manifest['files']:
            data = self.run_git('cat-file', 'blob', entry['gitBlob'])
            self.assertEqual((self.output / entry['path']).read_bytes(), data)
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
        self.assertTrue((self.output / 'hidden.txt').is_file())
        self.assertEqual(json.loads((self.output / exporter.MANIFEST).read_text()), manifest)

    def test_dirty_and_untracked_worktree_data_is_never_exported(self):
        (self.repo / 'fixture.sql').write_bytes(b'UNCOMMITTED\r\n')
        (self.repo / 'private.txt').write_bytes(b'not tracked')
        before = self.run_git('status', '--porcelain')
        exporter.export_source(self.repo, self.sha, self.output)
        self.assertNotIn(b'UNCOMMITTED', (self.output / 'fixture.sql').read_bytes())
        self.assertFalse((self.output / 'private.txt').exists())
        self.assertEqual(self.run_git('status', '--porcelain'), before)

    def test_existing_destination_is_not_modified(self):
        self.output.mkdir()
        marker = self.output / 'keep'
        marker.write_bytes(b'keep')
        with self.assertRaises(ValueError):
            exporter.export_source(self.repo, self.sha, self.output)
        self.assertEqual(marker.read_bytes(), b'keep')

    def test_mutable_or_unknown_refs_are_refused_before_output(self):
        for ref in ['HEAD', self.sha[:8], 'f' * 40]:
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                exporter.export_source(self.repo, ref, self.output)
            self.assertFalse(self.output.exists())

    def test_symlink_object_refused_without_creating_output(self):
        oid = self.run_git('hash-object', '-w', '--stdin', input=b'outside').decode().strip()
        self.run_git('update-index', '--add', '--cacheinfo', f'120000,{oid},link')
        self.commit()
        sha = self.run_git('rev-parse', 'HEAD').decode().strip()
        with self.assertRaisesRegex(ValueError, 'Symlinks'):
            exporter.export_source(self.repo, sha, self.output)
        self.assertFalse(self.output.exists())

    def test_unsafe_or_reserved_paths_refused(self):
        for name in ['', '.', '../escape', '/absolute', 'a/../b', 'C:/drive', 'a\\b', '.git/config',
                     '.GIT/config', 'CON.txt', 'folder./file', 'folder /file', exporter.MANIFEST, 'a\nname']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                exporter.safe_path(name)

    def test_missing_output_parent_is_not_created(self):
        with self.assertRaises(ValueError):
            exporter.export_source(self.repo, self.sha, self.root / 'missing' / 'export')
        self.assertFalse((self.root / 'missing').exists())

    def add_case_alias(self, oid):
        self.run_git('-c', 'core.ignoreCase=false', 'update-index', '--add', '--cacheinfo', f'100644,{oid},FIXTURE.sql')
        self.commit()
        return self.run_git('rev-parse', 'HEAD').decode().strip()

    def test_identical_case_aliases_preserve_both_logical_paths(self):
        oid = self.run_git('rev-parse', 'HEAD:fixture.sql').decode().strip()
        sha = self.add_case_alias(oid)
        manifest = exporter.export_source(self.repo, sha, self.output)
        self.assertEqual((self.output / 'fixture.sql').read_bytes(), (self.output / 'FIXTURE.sql').read_bytes())
        aliases = [e for e in manifest['files'] if e.get('caseAliasOf')]
        self.assertEqual(len(aliases), 1)
        self.assertEqual(aliases[0]['gitBlob'], oid)

    def test_different_case_aliases_refused_before_output(self):
        oid = self.run_git('hash-object', '-w', '--stdin', input=b'SELECT 99;\n').decode().strip()
        sha = self.add_case_alias(oid)
        with self.assertRaisesRegex(ValueError, 'different bytes or modes'):
            exporter.export_source(self.repo, sha, self.output)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
