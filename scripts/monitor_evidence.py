#!/usr/bin/env python3
"""Bounded, privacy-preserving monitor evidence checks. Never collects network data."""
import argparse
import datetime as dt
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
