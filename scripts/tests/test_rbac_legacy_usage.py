import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'rbac_legacy_usage.py'
START = 1794009600000  # 2026-11-07T00:00:00Z
END = START + 60_000
ARGS = ('--start', '2026-11-07T00:00:00Z', '--end', '2026-11-07T00:01:00Z')


def row(time, path, method='PATCH', status=410):
    return json.dumps({'time': time, 'path': path, 'method': method, 'statusCode': status,
                       'requestId': 'private-id', 'msg': 'private-message'})


class LegacyUsageTest(unittest.TestCase):
    def run_counter(self, lines, args=ARGS):
        return subprocess.run([sys.executable, str(SCRIPT), *args], input='\n'.join(lines),
                              text=True, capture_output=True, check=False)

    def test_exact_utc_window_and_redacted_aggregate(self):
        result = self.run_counter([
            row(START - 1, '/api/v1/users/private-account/role'),
            row(START, '/api/v1/users/:id/role'),
            row(START + 1, '/API/v1/users/private-account/ROLE/', status=403),
            row(START + 2, '/private-account/role', status=410),
            row(START + 3, '/api/v1/users/private-account/roles'),
            row(START + 4, '/api/v1/users/private-account/role', method='GET'),
            row(END, '/api/v1/users/private-account/role'),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(result.stdout)
        self.assertTrue(evidence['logTimestampsSpanWindow'])
        self.assertFalse(evidence['continuousCoverageVerified'])
        self.assertFalse(evidence['installedClientCompatibilityVerified'])
        self.assertEqual(evidence['requestRowsInWindow'], 5)
        self.assertEqual(evidence['legacyRoleRequests'], 2)
        self.assertEqual(evidence['legacyRoleRequestsByStatus'], {'403': 1, '410': 1})
        self.assertEqual(evidence['unscopedLegacyShapeRequests'], 1)
        self.assertNotIn('private-', result.stdout)

    def test_empty_or_incomplete_logs_do_not_imply_coverage(self):
        result = self.run_counter(['{broken-private', row(START + 1, '/health', method='GET', status=200)])
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(result.stdout)
        self.assertFalse(evidence['logTimestampsSpanWindow'])
        self.assertEqual(evidence['legacyRoleRequests'], 0)
        self.assertEqual(evidence['malformedRows'], 1)
        self.assertNotIn('private', result.stdout)

    def test_counts_sanitized_native_build_observations_in_the_review_window(self):
        def observed(platform, build, timestamp=START):
            return json.dumps({'event': 'native_wallet_build_observed', 'time': timestamp,
                               'platform': platform, 'build': build, 'userId': 'private-user'})

        result = self.run_counter([
            row(START, '/api/v1/users/:id/role'),
            observed('android', '42'), observed('android', '42'),
            observed('ios', '12.0.4'), observed('ios', None), observed('unknown', None),
            observed('android', 'private-value'), observed('private-platform', None),
            observed('ios', '12.0.4', END),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(result.stdout)
        self.assertEqual(evidence['legacyRoleRequests'], 1)
        self.assertEqual(evidence['nativeWalletSignInsByReportedBuild'], {
            'android': {'42': 2}, 'ios': {'12.0.4': 1, 'unreported': 1}, 'unknown': {'unreported': 1},
        })
        self.assertEqual(evidence['malformedRows'], 2)
        self.assertFalse(evidence['installedClientCompatibilityVerified'])
        self.assertNotIn('private-', result.stdout)

    def test_rejects_reversed_or_non_utc_bounds(self):
        for args in (('--start', ARGS[3], '--end', ARGS[1]), ('--start', '2026-11-07', '--end', ARGS[3])):
            result = self.run_counter([], args)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, '')
