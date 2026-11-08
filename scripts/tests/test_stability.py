"""Offline subprocess fixtures: no network, Docker, mail or production files."""
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'verify-stability.py'
SHA = 'a' * 40


class StabilityTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.start = self.now - dt.timedelta(hours=24)
        self.iso = lambda value: value.isoformat().replace('+00:00', 'Z')
        self.evidence = {
            'samples': [dict(timestamp=self.iso(self.start + dt.timedelta(minutes=5*i)),
                sha=SHA, api_health='ok', db_status='ok', frontend_http=200,
                api_docker_health='healthy', web_docker_health='healthy', api_restarts=0,
                web_restarts=0, five_xx_count=0, disk_pct=20, api_uid=1000,
                api_read_only=True, collection_ok=True) for i in range(289)],
            'deadman': [dict(timestamp=self.iso(self.start + dt.timedelta(minutes=15*i)), status='ok') for i in range(97)],
            'heartbeat_at': self.iso(self.now),
            'backup': dict(timestamp=self.iso(self.now), sha256='b'*64, integrity='ok', foreign_keys_ok=True, restore_verified=True),
            'mail_probe': dict(timestamp=self.iso(self.now), submitted=True, receipt_confirmed=True),
            'rollback': dict(api_image='synthetic-api@sha256:abc', web_image='synthetic-web@sha256:def'),
        }

    def run_evidence(self, data=None, start=None, end=None, pin=True):
        with tempfile.TemporaryDirectory(prefix='auth13-stability-') as directory:
            file = Path(directory)/'evidence.json'
            file.write_text(json.dumps(self.evidence if data is None else data), encoding='utf8')
            args = [sys.executable, str(SCRIPT), '--evidence', str(file),
                    '--expected-sha', SHA, '--started-at', self.iso(start or self.start)]
            if end is not None:
                args.extend(['--ended-at', self.iso(end)])
                if pin:
                    digest = hashlib.sha256(file.read_bytes()).hexdigest() if pin is True else pin
                    args.extend(['--expected-evidence-sha256', digest])
            result = subprocess.run(args, capture_output=True, text=True, timeout=15)
            try: report = json.loads(result.stdout)
            except json.JSONDecodeError: report = {'verdict':'NO_REPORT','reasons':[result.stderr]}
            return result.returncode,report

    def test_complete_window_passes(self):
        code, report = self.run_evidence()
        self.assertEqual((code,report['verdict']),(0,'PASS'), report)

    def test_archived_window_is_checked_at_its_original_end_and_pinned_to_its_bytes(self):
        age = dt.timedelta(days=2)
        self.start -= age
        end = self.now - age
        shifted = lambda value: self.iso(dt.datetime.fromisoformat(value.replace('Z', '+00:00')) - age)
        for row in self.evidence['samples'] + self.evidence['deadman']:
            row['timestamp'] = shifted(row['timestamp'])
        for section in ('backup', 'mail_probe'):
            self.evidence[section]['timestamp'] = shifted(self.evidence[section]['timestamp'])
        self.evidence['heartbeat_at'] = shifted(self.evidence['heartbeat_at'])
        outside = dict(self.evidence['samples'][-1], timestamp=self.iso(end + dt.timedelta(hours=1)), api_health='down')
        self.evidence['samples'].append(outside)

        code, report = self.run_evidence(end=end)
        self.assertEqual((code, report['verdict']), (0, 'PASS'), report)
        self.assertEqual(report['windowEnd'], end.isoformat())
        self.assertRegex(report['evidenceSha256'], r'^[a-f0-9]{64}$')
        self.assertEqual(self.run_evidence()[1]['verdict'], 'FAIL')

        for pin, message in ((False, 'a pinned evidence SHA-256 is required for archived verification'),
                             ('0' * 64, 'evidence SHA-256 mismatch')):
            code, report = self.run_evidence(end=end, pin=pin)
            self.assertEqual((code, report['verdict']), (1, 'FAIL'), report)
            self.assertEqual(report['reasons'], [message])

        self.evidence['mail_probe']['timestamp'] = outside['timestamp']
        code, report = self.run_evidence(end=end)
        self.assertEqual((code, report['verdict']), (2, 'PENDING'), report)
        self.assertIn('mail probe evidence is stale or outside the window', report['reasons'])

    def test_archived_window_refuses_future_or_reversed_end_times(self):
        for end, message in ((self.now + dt.timedelta(hours=1), 'observation ends in the future'),
                             (self.start - dt.timedelta(minutes=1), 'observation ends before it starts')):
            code, report = self.run_evidence(end=end)
            self.assertEqual((code, report['verdict']), (1, 'FAIL'), report)
            self.assertIn(message, report['reasons'])

    def test_under_24_hours_is_pending(self):
        code, report = self.run_evidence(start=self.now-dt.timedelta(hours=23))
        self.assertEqual((code,report['verdict']),(2,'PENDING'),report)

    def test_missing_evidence_never_passes(self):
        for field in self.evidence:
            with self.subTest(field=field):
                data = copy.deepcopy(self.evidence); del data[field]
                code, report = self.run_evidence(data)
                self.assertNotEqual(code,0,report); self.assertNotEqual(report['verdict'],'PASS')

    def test_interval_gap_is_pending(self):
        del self.evidence['samples'][100:103]
        code,report=self.run_evidence(); self.assertEqual((code,report['verdict']),(2,'PENDING'),report)

    def test_stale_last_sample_is_pending(self):
        self.evidence['samples']=self.evidence['samples'][:-4]
        code,report=self.run_evidence(); self.assertEqual((code,report['verdict']),(2,'PENDING'),report)

    def test_deadman_coverage_gap_is_pending(self):
        del self.evidence['deadman'][20:24]
        code,report=self.run_evidence(); self.assertEqual((code,report['verdict']),(2,'PENDING'),report)

    def test_failed_observations_fail(self):
        changes = [('sha','c'*40),('api_health','down'),('db_status','error'),('frontend_http',503),
            ('api_docker_health','unhealthy'),('web_docker_health','unknown'),('api_restarts',1),
            ('web_restarts',1),('api_restarts',-1),('five_xx_count',1),('disk_pct',90),
            ('api_uid',0),('api_read_only',False),('collection_ok',False)]
        for field,value in changes:
            with self.subTest(field=field):
                data=copy.deepcopy(self.evidence);data['samples'][10][field]=value
                code,report=self.run_evidence(data);self.assertEqual((code,report['verdict']),(1,'FAIL'),report)

    def test_missing_sample_field_is_not_success(self):
        del self.evidence['samples'][10]['api_restarts']
        self.assertNotEqual(self.run_evidence()[0],0)

    def test_backup_failure_or_unverified_restore_does_not_pass(self):
        for field,value in [('integrity','corrupt'),('restore_verified',False),('foreign_keys_ok',False),('sha256','')]:
            with self.subTest(field=field):
                data=copy.deepcopy(self.evidence);data['backup'][field]=value
                self.assertNotEqual(self.run_evidence(data)[0],0)

    def test_mail_submission_does_not_prove_receipt(self):
        self.evidence['mail_probe']['receipt_confirmed']=False
        code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(2,'PENDING'),report)

    def test_failed_mail_submission_fails(self):
        self.evidence['mail_probe']['submitted']=False
        code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(1,'FAIL'),report)

    def test_stale_or_future_heartbeat_fails(self):
        for offset in [-3600,3600]:
            with self.subTest(offset=offset):
                self.evidence['heartbeat_at']=self.iso(self.now+dt.timedelta(seconds=offset))
                code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(1,'FAIL'),report)

    def test_future_sample_fails(self):
        self.evidence['samples'][-1]['timestamp']=self.iso(self.now+dt.timedelta(hours=1))
        code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(1,'FAIL'),report)

    def test_duplicate_samples_do_not_fill_a_gap(self):
        self.evidence['samples'][100]=self.evidence['samples'][99].copy()
        self.assertNotEqual(self.run_evidence()[0],0)

    def test_invalid_timestamp_fails_closed(self):
        self.evidence['samples'][0]['timestamp']='not-a-time'
        code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(1,'FAIL'),report)

    def test_old_failures_outside_window_do_not_pollute_result(self):
        old=self.evidence['samples'][0].copy();old.update(timestamp=self.iso(self.start-dt.timedelta(days=1)),api_health='down')
        self.evidence['samples'].insert(0,old)
        code,report=self.run_evidence();self.assertEqual((code,report['verdict']),(0,'PASS'),report)


if __name__ == '__main__': unittest.main()
