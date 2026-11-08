"""The forced-command gate for CI deploy keys accepts only fixed `ci <action>` calls."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / 'ops/ci-gate/ci-gate'
SHA = '0123456789abcdef' * 2 + '01234567'


@unittest.skipIf(os.name == 'nt', 'POSIX only')
class CiGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ci-gate ')
        self.addCleanup(self.temp.cleanup)
        lib = Path(self.temp.name)
        for name in ('lms-deploy', 'lms-inventory', 'blog-deploy', 'blog-legacy'):
            (lib / f'{name}.sh').write_text(f'echo RAN {name} "$@" DIR=${{DEPLOY_DIR:-}}\n')
        self.gate = lib / 'gate.py'
        self.gate.write_text(GATE.read_text().replace('LIB = "/usr/local/lib/ci-gate"', f'LIB = {str(lib)!r}'))

    def run_gate(self, app, command):
        return subprocess.run([sys.executable, '-I', str(self.gate), app], capture_output=True, text=True,
                              env={'SSH_ORIGINAL_COMMAND': command, 'PATH': os.environ['PATH']}, timeout=20)

    def assertRuns(self, app, command, expected):
        result = self.run_gate(app, command)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(expected, result.stdout)

    def assertRefused(self, app, command):
        result = self.run_gate(app, command)
        self.assertEqual(result.returncode, 126, result.stdout + result.stderr)
        self.assertNotIn('RAN', result.stdout)

    def test_allowed_calls(self):
        self.assertRuns('lms', f"export DEPLOY_DIR='/srv/lms'\nci deploy {SHA} false", f'RAN lms-deploy {SHA} false DIR=/srv/lms')
        self.assertRuns('lms', "export LMS_INVENTORY_TOOL_SHA256='" + 'ab' * 32 + "'\nci inventory probe", 'RAN lms-inventory probe')
        self.assertRuns('lms', 'ci inventory inventory ' + 'c' * 32, 'RAN lms-inventory inventory')
        self.assertRuns('blog', 'ci deploy', 'RAN blog-deploy')
        self.assertRuns('blog', 'ci legacy restore-preview', 'RAN blog-legacy restore-preview')

    def test_refused_calls(self):
        for app, command in [
            ('lms', 'bash -i'),
            ('lms', f'ci deploy {SHA} maybe'),
            ('lms', f'ci deploy {SHA} true; id'),
            ('lms', f"export DEPLOY_DIR='/x'; id\nci deploy {SHA} true"),
            ('lms', f"export PATH='/tmp'\nci deploy {SHA} true"),
            ('lms', f"export DEPLOY_DIR='$(id)'\nci deploy {SHA} true"),
            ('lms', 'ci inventory inventory'),
            ('lms', 'ci deploy'),
            ('blog', 'ci legacy `id`'),
            ('blog', 'ci deploy\nci deploy'),
            ('blog', f'ci deploy {SHA} true'),
            ('nope', 'ci deploy'),
            ('lms', ''),
        ]:
            with self.subTest(app=app, command=command):
                self.assertRefused(app, command)


if __name__ == '__main__':
    unittest.main()
