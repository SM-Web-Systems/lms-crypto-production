#!/usr/bin/env python3
"""Bounded monitor evidence checks. Never makes network calls.

The five-xx command reads LMS edge access lines (nginx `lms_edge` JSON format) and
reports client IP, method, path without query string, and status for each 5xx so an
alert can name who was affected and when.
"""
import argparse
import datetime as dt
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time

MESSAGES = {
    'Partial refund recorded; manual reconciliation required',
    'Refund event missing both refund_reference and provider event ID; recorded with reconciliation marker',
}


def reconciliation_count(text):
    if len(text) > 2_000_000:
        raise ValueError('log evidence too large')
    count = 0
    for line in text.splitlines():
        try:
            row = json.loads(line)
        except (ValueError, RecursionError):
            continue  # Existing non-JSON startup messages are not financial evidence.
        if isinstance(row, dict) and row.get('module') == 'paystack-webhook' and isinstance(row.get('msg'), str) and row['msg'] in MESSAGES:
            count += 1
    return count


MAX_EVENTS = 25
MAX_IPS = 10


def _clean_path(value):
    path = value.split('?', 1)[0] if isinstance(value, str) else ''
    path = ''.join(ch for ch in path if 32 < ord(ch) < 127)[:120]
    return path or '-'


def edge_five_xx(text):
    """Summarise LMS edge 5xx lines. Query strings are dropped (they can carry tokens)."""
    if len(text) > 8_000_000:
        raise ValueError('edge log evidence too large')
    count, lines, events, ips = 0, 0, [], []
    for line in text.splitlines():
        start = line.find('{')
        if start < 0:
            continue
        try:
            row = json.loads(line[start:])
        except (ValueError, RecursionError):
            continue
        if not isinstance(row, dict) or row.get('site') != 'lms':
            continue
        lines += 1
        status = row.get('status')
        if isinstance(status, str) and status.isdigit():
            status = int(status)
        if not isinstance(status, int) or isinstance(status, bool) or not 500 <= status <= 599:
            continue
        count += 1
        try:
            ip = str(ipaddress.ip_address(str(row.get('ip', '')).strip()))
        except ValueError:
            ip = 'unknown'
        if ip != 'unknown' and ip not in ips and len(ips) < MAX_IPS:
            ips.append(ip)
        if len(events) < MAX_EVENTS:
            when = row.get('time')
            events.append({
                'time': when[:25] if isinstance(when, str) else '-',
                'ip': ip,
                'method': row.get('method') if row.get('method') in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'} else '-',
                'path': _clean_path(row.get('uri')),
                'status': status,
                'upstream': str(row.get('upstream_status', '-'))[:20],
            })
    return {'count': count, 'lms_lines': lines, 'events': events, 'ips': ips}


def format_five_xx(report, users):
    """Human-readable lines for the alert email: one per 5xx, plus who each IP belongs to."""
    lines = []
    for event in report.get('events', []):
        lines.append('  {time} {status} {method} {path} ip={ip} upstream={upstream}'.format(**event))
    more = report.get('count', 0) - len(report.get('events', []))
    if more > 0:
        lines.append('  ... and {} more'.format(more))
    if report.get('ips'):
        lines.append('Affected users (by client IP, from LMS sessions/login history):')
        for ip in report['ips']:
            matches = users.get(ip) if isinstance(users, dict) else None
            if matches is None:
                lines.append('  {}: lookup unavailable'.format(ip))
            elif not matches:
                lines.append('  {}: no LMS account seen from this IP'.format(ip))
            else:
                for m in matches[:3]:
                    if not isinstance(m, dict):
                        continue
                    lines.append('  {}: {} ({}) user_id={} last seen {} via {}'.format(
                        ip, str(m.get('name', '?'))[:80], str(m.get('role', '?'))[:20],
                        str(m.get('user_id', '?'))[:64], str(m.get('seen', '?'))[:25], str(m.get('source', '?'))[:10]))
    return '\n'.join(lines)


def backup_ok(path, now, max_age):
    try:
        path = Path(path)
        if path.is_symlink() or path.stat().st_size > 4096:
            return False
        data = json.loads(path.read_text(encoding='utf8'))
        if not isinstance(data, dict) or data.get('status') != 'ok':
            return False
        value = dt.datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))
        if value.tzinfo is None:
            return False
        age = now - value.timestamp()
        return 0 <= age < max_age and bool(re.fullmatch(r'[a-fA-F0-9]{64}', data.get('sha256', '')))
    except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
        return False


def reserve_alert(path, now, cooldown):
    """Reserve before sending, so failed submissions and parallel cron runs are bounded."""
    path = Path(path)
    lock = path.with_suffix(path.suffix + '.lock')
    if path.is_symlink() or not path.parent.is_dir():
        raise ValueError('invalid alert state')
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except OSError as error:
        raise ValueError('alert state locked or inaccessible') from error
    try:
        os.close(fd)
        if path.exists():
            if path.stat().st_size > 4096:
                raise ValueError('invalid alert state')
            try:
                data = json.loads(path.read_text(encoding='utf8'))
                last = data['last_attempt']
                if type(last) is not int or last < 0 or last > now:
                    raise ValueError('invalid alert timestamp')
            except (OSError, ValueError, TypeError, KeyError) as error:
                raise ValueError('invalid alert state') from error
            if now - last < cooldown:
                return False
        name = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent, prefix='.alert-', delete=False) as output:
                name = Path(output.name)
                os.chmod(name, 0o600)
                json.dump({'last_attempt': int(now)}, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, path)
        finally:
            if name is not None:
                name.unlink(missing_ok=True)
        return True
    finally:
        lock.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('reconciliation')
    commands.add_parser('five-xx')
    fmt = commands.add_parser('five-xx-format')
    fmt.add_argument('--report', required=True)
    fmt.add_argument('--users', default='')
    backup = commands.add_parser('backup')
    backup.add_argument('--path', required=True)
    backup.add_argument('--max-age', type=int, default=97200)
    alert = commands.add_parser('mail-gate')
    alert.add_argument('--state', required=True)
    alert.add_argument('--cooldown', type=int, default=900)
    args = parser.parse_args()
    try:
        if args.command == 'reconciliation':
            print(reconciliation_count(sys.stdin.read(2_000_001)))
        elif args.command == 'five-xx':
            print(json.dumps(edge_five_xx(sys.stdin.read(8_000_001)), separators=(',', ':')))
        elif args.command == 'five-xx-format':
            report = json.loads(args.report)
            try:
                users = json.loads(args.users) if args.users else None
            except ValueError:
                users = None
            print(format_five_xx(report, users if isinstance(users, dict) else None))
        elif args.command == 'backup':
            if not 300 <= args.max_age <= 604800 or not backup_ok(args.path, time.time(), args.max_age):
                return 1
        else:
            if not 300 <= args.cooldown <= 86400:
                return 2
            if not reserve_alert(args.state, int(time.time()), args.cooldown):
                return 3
    except (ValueError, OSError, RecursionError):
        # Do not echo paths, original log lines, payloads, or attestation values.
        print('Monitor evidence unavailable or invalid', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
