#!/usr/bin/env python3
"""Count legacy role-route requests from a private stream of API JSON logs."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import re
import sys

UTC = timezone.utc
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
LEGACY = re.compile(r'/api/v1/users/[^/]+/role/?', re.I)
UNSCOPED = re.compile(r'/[^/]+/role/?', re.I)


def utc_bound(value):
    if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', value):
        raise argparse.ArgumentTypeError('use YYYY-MM-DDTHH:MM:SSZ')
    try:
        return datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError:
        raise argparse.ArgumentTypeError('invalid UTC timestamp') from None


def summarize(lines, start, end):
    first = last = None
    in_window = unscoped = malformed = 0
    statuses = Counter()
    for line in lines:
        try:
            row = json.loads(line)
        except (ValueError, RecursionError):
            if line.strip():
                malformed += 1
            continue
        if not isinstance(row, dict) or not all(key in row for key in ('method', 'path', 'statusCode', 'time')):
            continue
        method, path, code, milliseconds = (row[key] for key in ('method', 'path', 'statusCode', 'time'))
        if (not isinstance(method, str) or not isinstance(path, str)
                or type(code) is not int or not 100 <= code <= 599
                or type(milliseconds) is not int or not 0 <= milliseconds <= 253402300799999):
            malformed += 1
            continue
        observed = EPOCH + timedelta(milliseconds=milliseconds)
        first = observed if first is None else min(first, observed)
        last = observed if last is None else max(last, observed)
        if not start <= observed < end:
            continue
        in_window += 1
        if method != 'PATCH':
            continue
        if LEGACY.fullmatch(path):
            statuses[str(code)] += 1
        elif UNSCOPED.fullmatch(path):
            unscoped += 1

    return {
        'windowStart': start.isoformat(), 'windowEndExclusive': end.isoformat(),
        'oldestRequestLog': first.isoformat() if first else None,
        'newestRequestLog': last.isoformat() if last else None,
        'logTimestampsSpanWindow': first is not None and first <= start and last >= end,
        'requestRowsInWindow': in_window, 'malformedRows': malformed,
        'legacyRoleRequestsByStatus': dict(sorted(statuses.items())),
        'legacyRoleRequests': sum(statuses.values()),
        'unscopedLegacyShapeRequests': unscoped,
        'continuousCoverageVerified': False,
        'installedClientCompatibilityVerified': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', required=True, type=utc_bound)
    parser.add_argument('--end', required=True, type=utc_bound)
    args = parser.parse_args()
    if args.start >= args.end:
        parser.error('--end must be after --start')
    print(json.dumps(summarize(sys.stdin, args.start, args.end), indent=2))


if __name__ == '__main__':
    main()
