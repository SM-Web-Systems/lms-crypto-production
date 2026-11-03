#!/usr/bin/env python3
"""Offline evidence verifier. Never collects data, accesses the server, or sends mail.

Exit codes: 0 PASS for supplied evidence, 1 FAIL, 2 PENDING (incomplete evidence).
Historical/owner-supplied evidence is not an independent production attestation.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sys


def timestamp(value):
    if not isinstance(value, str): raise ValueError('missing or invalid timestamp')
    result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None: raise ValueError('timestamps must include UTC offset')
    return result.astimezone(dt.timezone.utc)


def verify(data, expected_sha, started_at, now):
    failures, pending = [], []
    start = timestamp(started_at)
    if not re.fullmatch(r'[a-fA-F0-9]{40}', expected_sha): raise ValueError('expected SHA must be a full commit SHA')
    if start > now: failures.append('observation starts in the future')
    if (now-start).total_seconds() < 86400: pending.append('24-hour window is incomplete')

    def coverage(rows, label, max_gap):
        if not isinstance(rows, list): raise ValueError(f'{label} must be an array')
        within = []
        for row in rows:
            time = timestamp(row.get('timestamp'))
            if time > now + dt.timedelta(seconds=60): failures.append(f'{label} contains future evidence')
            if start <= time <= now: within.append((time,row))
        within.sort(key=lambda pair: pair[0])
        if not within:
            pending.append(f'{label} missing in observation window'); return []
        times = [time for time,_ in within]
        if len(set(times)) != len(times): failures.append(f'{label} contains duplicate timestamps')
        gaps = [(times[0]-start).total_seconds(), (now-times[-1]).total_seconds()]
        gaps += [(b-a).total_seconds() for a,b in zip(times,times[1:])]
        if max(gaps) > max_gap: pending.append(f'{label} has missing intervals or stale coverage')
        return [row for _,row in within]

    for row in coverage(data.get('samples', []), 'monitor samples', 420):
        if row.get('sha') != expected_sha: failures.append('unexpected deployed SHA')
        for key,value in dict(api_health='ok',db_status='ok',frontend_http=200,
            api_docker_health='healthy',web_docker_health='healthy',api_read_only=True,collection_ok=True).items():
            if key not in row: pending.append(f'missing monitor field: {key}')
            elif row[key] != value or type(row[key]) is not type(value): failures.append(f'failed monitor field: {key}')
        for key in ['api_restarts','web_restarts','five_xx_count']:
            if type(row.get(key)) is not int or row[key] != 0: failures.append(f'failed or unreadable counter: {key}')
        if type(row.get('disk_pct')) is not int or not 0 <= row['disk_pct'] < 75: failures.append('disk threshold failed or unreadable')
        if type(row.get('api_uid')) is not int or row['api_uid'] <= 0: failures.append('API non-root evidence failed or unreadable')

    for row in coverage(data.get('deadman', []), 'dead-man checks', 1200):
        if row.get('status') != 'ok': failures.append('dead-man check failed or unreadable')

    heartbeat = data.get('heartbeat_at')
    if heartbeat is None: pending.append('heartbeat evidence missing')
    else:
        age = (now-timestamp(heartbeat)).total_seconds()
        if age < 0 or age >= 600: failures.append('heartbeat stale or in the future')

    def recent(item, label, max_age):
        if not isinstance(item, dict) or not item:
            pending.append(f'{label} evidence missing'); return False
        time = timestamp(item.get('timestamp'))
        if time > now: failures.append(f'{label} evidence is in the future')
        elif time < start or (now-time).total_seconds() > max_age: pending.append(f'{label} evidence is stale or outside the window')
        return True

    backup = data.get('backup')
    if recent(backup,'backup/restore',86400):
        if backup.get('integrity') != 'ok' or backup.get('foreign_keys_ok') is not True: failures.append('backup integrity failed or unverified')
        if backup.get('restore_verified') is not True: pending.append('restore not verified')
        if not re.fullmatch('[a-fA-F0-9]{64}',str(backup.get('sha256',''))): pending.append('backup digest missing/invalid')
    mail = data.get('mail_probe')
    if recent(mail,'mail probe',86400):
        if mail.get('submitted') is not True: failures.append('mail submission failed or unverified')
        if mail.get('receipt_confirmed') is not True: pending.append('mail receipt is unconfirmed; submission alone is insufficient')
    rollback = data.get('rollback', {})
    if not isinstance(rollback, dict) or not all(isinstance(rollback.get(k),str) and rollback[k].strip() for k in ['api_image','web_image']): pending.append('rollback image evidence missing')
    verdict = 'FAIL' if failures else 'PENDING' if pending else 'PASS'
    return {'verdict':verdict, 'reasons':sorted(set(failures+pending)), 'expectedSha':expected_sha,
        'windowStart':start.isoformat(), 'verifiedAt':now.isoformat(),
        'scope':'Supplied offline evidence only; no deployment or AUTH-12 closure performed.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--expected-sha', required=True)
    parser.add_argument('--started-at', required=True)
    args = parser.parse_args()
    try:
        data = json.loads(Path(args.evidence).read_text(encoding='utf8'))
        if not isinstance(data,dict): raise ValueError('evidence must be an object')
        result = verify(data,args.expected_sha,args.started_at,dt.datetime.now(dt.timezone.utc))
    except (ValueError, OSError, TypeError, KeyError, AttributeError, OverflowError) as error:
        result = {'verdict':'FAIL','reasons':[f'Invalid or unreadable evidence: {error}']}
    print(json.dumps(result,indent=2))
    return {'PASS':0,'FAIL':1,'PENDING':2}[result['verdict']]


if __name__ == '__main__': sys.exit(main())
