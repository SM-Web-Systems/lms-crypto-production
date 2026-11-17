import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('monitor_evidence', ROOT/'scripts'/'monitor_evidence.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='auth13-evidence-')
        self.path = Path(self.temp.name)/'state.json'

    def tearDown(self):
        self.temp.cleanup()

    def test_reconciliation_only_counts_known_structured_messages(self):
        valid={'module':'paystack-webhook','msg':'Partial refund recorded; manual reconciliation required','email':'PRIVATE'}
        unrelated={'msg':'Partial refund recorded; manual reconciliation required','module':'other'}
        spoof={'module':'request','payload':valid}
        self.assertEqual(module.reconciliation_count('\n'.join(map(json.dumps,[valid,unrelated,spoof]))),1)
        self.assertEqual(module.reconciliation_count('unstructured output'),0)
        self.assertEqual(module.reconciliation_count(json.dumps({'module':'paystack-webhook','msg':{'email':'PRIVATE'}})),0)

    def test_cooldown_is_reserved_even_before_mail_submission(self):
        self.assertTrue(module.reserve_alert(self.path,1000,900))
        self.assertFalse(module.reserve_alert(self.path,1100,900))
        self.assertTrue(module.reserve_alert(self.path,1900,900))
        self.assertEqual(json.loads(self.path.read_text()),{'last_attempt':1900})

    def test_corrupt_future_or_locked_state_cannot_send(self):
        for state in ['[]','{"last_attempt":true}','{"last_attempt":9000}','bad']:
            self.path.write_text(state)
            with self.subTest(state=state),self.assertRaises(ValueError):
                module.reserve_alert(self.path,1000,900)
        self.path.unlink()
        self.path.with_suffix('.json.lock').write_text('held')
        with self.assertRaises(ValueError):module.reserve_alert(self.path,1000,900)

    def test_backup_attestation_requires_recent_success_and_digest(self):
        self.path.write_text(json.dumps({'status':'ok','timestamp':'2026-01-01T00:00:00Z','sha256':'b'*64}))
        self.assertTrue(module.backup_ok(self.path,1767225601,97200))
        self.assertFalse(module.backup_ok(self.path,1767225600+97200,97200))
        self.assertFalse(module.backup_ok(self.path,1767225599,97200))
        self.path.write_text(json.dumps({'status':'failed','timestamp':'2026-01-01T00:00:00Z','sha256':'b'*64}))
        self.assertFalse(module.backup_ok(self.path,1767225601,97200))


if __name__=='__main__':unittest.main()


class EdgeFiveXxTests(unittest.TestCase):
    def line(self, **fields):
        row = {'site': 'lms', 'time': '2026-11-17T18:51:57+00:00', 'ip': '165.73.39.31', 'method': 'GET',
               'uri': '/api/v1/messages/unread-count?token=SECRET', 'status': 502, 'upstream_status': '502'}
        row.update(fields)
        return json.dumps(row)

    def test_counts_only_lms_5xx_and_drops_query_strings(self):
        text = '\n'.join([
            self.line(),
            self.line(status=503, ip='41.135.86.248', uri='/api/v1/auth/me'),
            self.line(status=200),
            self.line(site='blog', status=500),
            '1.2.3.4 - - [17/Nov/2026:18:51:57 +0000] "GET / HTTP/1.1" 502 1 "-" "-"',
            'not json {',
        ])
        report = module.edge_five_xx(text)
        self.assertEqual(report['count'], 2)
        self.assertEqual(report['lms_lines'], 4 - 1)
        self.assertEqual(report['ips'], ['165.73.39.31', '41.135.86.248'])
        self.assertEqual(report['events'][0]['path'], '/api/v1/messages/unread-count')
        self.assertNotIn('SECRET', json.dumps(report))

    def test_docker_timestamp_prefix_and_bad_ip_are_handled(self):
        report = module.edge_five_xx('2026-11-17T18:51:57.1Z ' + self.line(ip='not-an-ip'))
        self.assertEqual(report['count'], 1)
        self.assertEqual(report['ips'], [])
        self.assertEqual(report['events'][0]['ip'], 'unknown')

    def test_events_and_ips_are_capped(self):
        text = '\n'.join(self.line(ip='10.0.0.%d' % i) for i in range(40))
        report = module.edge_five_xx(text)
        self.assertEqual(report['count'], 40)
        self.assertEqual(len(report['events']), module.MAX_EVENTS)
        self.assertEqual(len(report['ips']), module.MAX_IPS)
        self.assertIn('... and 15 more', module.format_five_xx(report, {}))

    def test_format_names_users_and_marks_unknown_ips(self):
        report = module.edge_five_xx('\n'.join([self.line(), self.line(ip='41.135.86.248')]))
        users = {'165.73.39.31': [{'user_id': 'u1', 'name': 'Admin One', 'role': 'admin', 'seen': '2026-11-17 18:52:00', 'source': 'session'}],
                 '41.135.86.248': []}
        text = module.format_five_xx(report, users)
        self.assertIn('502 GET /api/v1/messages/unread-count ip=165.73.39.31', text)
        self.assertIn('165.73.39.31: Admin One (admin) user_id=u1', text)
        self.assertIn('41.135.86.248: no LMS account seen from this IP', text)
        self.assertIn('lookup unavailable', module.format_five_xx(report, None))
