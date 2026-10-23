"""Run actual Bash scripts with all external service commands intercepted."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASH = shutil.which('bash') if os.name != 'nt' else r'C:\Program Files\Git\bin\bash.exe'


def shell_path(value):
    text = str(value).replace('\\','/')
    return '/'+text[0].lower()+text[2:] if os.name == 'nt' and text[1:2] == ':' else text


@unittest.skipUnless(BASH and Path(BASH).exists(), 'Bash unavailable')
class MonitorCommandTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='auth13-monitor-')
        self.root = Path(self.directory.name); self.bin = self.root/'bin'; self.bin.mkdir()
        stub = '''#!/usr/bin/env bash
set -eu
case "$(basename "$0")" in
  curl) if [[ "$*" == *http_code* ]]; then printf 200; else printf '{"status":"ok","buildSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checks":{"db":{"status":"ok"}}}'; fi ;;
  docker)
    if [[ "$1" == exec ]]; then printf 1000; exit 0; fi
    if [[ "$*" == *ReadonlyRootfs* ]]; then printf true; exit 0; fi
    if [[ "$1" == logs ]]; then [[ "${MODE:-}" != logs_failure ]] || exit 1; exit 0; fi
    if [[ "$*" == *RestartCount* ]]; then [[ "${MODE:-}" != restart_failure ]] || exit 1; printf 0; else printf healthy; fi ;;
  df) printf 'Filesystem Size Used Avail Use%% Mounted\\nfixture 10G 1G 9G 10%% /\\n' ;;
  msmtp) cat >/dev/null; printf called >> "$MAIL_MARKER"; [[ "${MODE:-}" != mail_failure ]] ;;
  stat) [[ "${MODE:-}" != stat_failure ]] || exit 1; /usr/bin/stat "$@" ;;
  hostname) printf fixture-host ;;
  *) exit 99 ;;
esac
'''
        for name in ['curl','docker','df','msmtp','stat','hostname']:
            file=self.bin/name;file.write_text(stub,encoding='utf8',newline='\n');file.chmod(0o700)
        self.env = dict(os.environ,
            LMS_MONITOR_LOG=shell_path(self.root/'health.log'),LMS_MONITOR_CSV=shell_path(self.root/'health.csv'),
            LMS_HEARTBEAT_FILE=shell_path(self.root/'heartbeat'),LMS_DEADMAN_LOG=shell_path(self.root/'deadman.log'),
            LMS_PYTHON_BIN=shell_path(sys.executable),LMS_ALERT_EMAIL='synthetic@example.invalid',
            LMS_API_URL='http://fixture.invalid/health',LMS_FRONTEND_URL='http://fixture.invalid/',
            MAIL_MARKER=shell_path(self.root/'mail.marker'))

    def tearDown(self): self.directory.cleanup()

    def run_script(self, script, mode='', extra=()):
        env=dict(self.env,MODE=mode)
        return subprocess.run([BASH,'-c','export PATH="$1:$PATH"; exec bash "$2" "${@:3}"','--',shell_path(self.bin),shell_path(ROOT/'scripts'/script),*extra],env=env,capture_output=True,text=True,timeout=20)

    def health(self, mode=''): return self.run_script('lms-health-monitor.sh',mode)
    def deadman(self, mode=''): return self.run_script('lms-deadman-check.sh',mode)
    def beat(self, age=0):
        file=self.root/'heartbeat';file.write_text('synthetic');os.utime(file,(time.time()-age,time.time()-age))

    def test_healthy_run_no_mail(self):
        result=self.health();self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn(',OK', (self.root/'health.csv').read_text());self.assertFalse((self.root/'mail.marker').exists())

    def test_log_read_failure_alerts_and_exits_nonzero(self):
        result=self.health('logs_failure');self.assertEqual(result.returncode,1,result.stderr)
        self.assertIn('Unable to read container logs',(self.root/'health.log').read_text())
        self.assertIn('MAIL_SUBMITTED',(self.root/'health.log').read_text())

    def test_restart_read_failure_alerts(self):
        result=self.health('restart_failure');self.assertEqual(result.returncode,1,result.stderr)
        self.assertIn('RestartCount',(self.root/'health.log').read_text())

    def test_invalid_threshold_stops_before_checks(self):
        self.env['LMS_DISK_THRESHOLD']='invalid'
        self.assertEqual(self.health().returncode,2);self.assertFalse((self.root/'heartbeat').exists())

    def test_fresh_heartbeat_no_mail(self):
        self.beat();result=self.deadman();self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('OK:',(self.root/'deadman.log').read_text());self.assertFalse((self.root/'mail.marker').exists())

    def test_missing_stale_future_and_unreadable_heartbeats_alert(self):
        for age,mode in [(None,''),(3600,''),(-3600,''),(0,'stat_failure')]:
            with self.subTest(age=age,mode=mode):
                if age is None: (self.root/'heartbeat').unlink(missing_ok=True)
                else: self.beat(age)
                result=self.deadman(mode);self.assertEqual(result.returncode,1,result.stderr)
                self.assertIn('ALERT:',(self.root/'deadman.log').read_text())
                self.assertIn('MAIL_SUBMITTED',(self.root/'deadman.log').read_text())

    def test_exports_actual_v2_fixture_files_without_network(self):
        import json
        self.assertEqual(self.health().returncode,0)
        self.assertEqual(self.deadman().returncode,0)
        metadata=self.root/'metadata.json';metadata.write_text('{}',encoding='utf8')
        output=self.root/'evidence.json'
        result=subprocess.run([sys.executable,str(ROOT/'scripts'/'build-stability-evidence.py'),
            '--csv',str(self.root/'health.csv'),'--deadman-log',str(self.root/'deadman.log'),
            '--heartbeat',str(self.root/'heartbeat'),'--attestations',str(metadata),'--output',str(output)],capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(output.read_text());self.assertEqual(data['samples'][0]['api_uid'],1000)
        self.assertIs(data['samples'][0]['api_read_only'],True)
        self.assertEqual(data['deadman'][0]['status'],'ok')
        self.assertNotIn('backup',data)

    def test_offline_wrapper_preserves_pending_and_failure_through_tee(self):
        import json
        file=self.root/'evidence.json';report=self.root/'report.json'
        self.env['LMS_STABILITY_REPORT']=shell_path(report)
        args=['--evidence',shell_path(file),'--expected-sha','a'*40,'--started-at','2026-01-01T00:00:00Z']
        for content,code,verdict in [('{}',2,'PENDING'),('[]',1,'FAIL')]:
            file.write_text(content,encoding='utf8')
            result=self.run_script('auth12-24h-stability-check.sh',extra=args)
            self.assertEqual(result.returncode,code,result.stderr)
            self.assertEqual(json.loads(report.read_text())['verdict'],verdict)
        self.assertFalse((self.root/'mail.marker').exists())

    def test_mail_submission_failure_remains_an_alert(self):
        result=self.deadman('mail_failure');self.assertEqual(result.returncode,1,result.stderr)
        self.assertIn('MAIL_SUBMISSION_FAILED',(self.root/'deadman.log').read_text())
        self.assertNotIn('receipt confirmed',(self.root/'deadman.log').read_text().lower())


if __name__ == '__main__': unittest.main()
