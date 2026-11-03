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
