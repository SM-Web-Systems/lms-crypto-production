#!/usr/bin/env python3
"""Read-only verification of a separately retrieved LMS release backup."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_preflight as pre
from release_recovery import HASH


def private_file(value):
    path = pre._path(value, 'RETRIEVED_PATH_REQUIRED')
    pre.require(path.is_file() and not path.is_symlink(), 'RETRIEVED_FILE_REQUIRED')
    if os.name != 'nt':
        pre.require(stat.S_IMODE(path.stat().st_mode) & 0o077 == 0, 'RETRIEVED_FILE_NOT_PRIVATE')
    return path


def verify(database, evidence, expected_evidence_sha):
    pre.require(HASH.fullmatch(expected_evidence_sha), 'INDEPENDENT_EVIDENCE_HASH_REQUIRED')
    copy = private_file(database)
    receipt_path = private_file(evidence)
    with receipt_path.open('rb') as handle:
        receipt_bytes = handle.read(1024 * 1024 + 1)
    pre.require(len(receipt_bytes) <= 1024 * 1024, 'RETRIEVED_EVIDENCE_TOO_LARGE')
    pre.require(hashlib.sha256(receipt_bytes).hexdigest() == expected_evidence_sha, 'RETRIEVED_EVIDENCE_HASH_MISMATCH')
    receipt = json.loads(receipt_bytes)
    pre.require(receipt['version'] == 1 and pre.SHA.fullmatch(receipt['approved_sha']), 'RETRIEVED_EVIDENCE_INVALID')
    backup = receipt['backup']
    for recorded in (backup['file'], receipt['database']['host_path']):
        original = Path(recorded)
        pre.require(not original.is_file() or not copy.samefile(original), 'SEPARATE_RETRIEVED_COPY_REQUIRED')

    sidecars = [Path(str(copy) + suffix) for suffix in ('-wal', '-shm', '-journal')]
    pre.require(not any(path.exists() or path.is_symlink() for path in sidecars), 'RETRIEVED_SNAPSHOT_SIDECARS')
    with copy.open('rb') as handle:
        header = handle.read(100)
    pre.require(header[:16] == b'SQLite format 3\x00' and header[18:20] == b'\x01\x01',
                'RETRIEVED_SNAPSHOT_NOT_FINALIZED')
    pre.require(copy.stat().st_size == backup['size_bytes'] and pre.file_sha256(copy) == backup['sha256'],
                'RETRIEVED_BACKUP_HASH_MISMATCH')

    # A finalized, separately retrieved backup contains no WAL. Immutable mode
    # guarantees verification cannot create sidecars or alter the artifact.
    with closing(sqlite3.connect(copy.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        deadline = time.monotonic() + 60
        db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        actual = pre.database_metadata(db)
    pre.require(all(value == backup.get(key) for key, value in actual.items()), 'RETRIEVED_BACKUP_CONTRACT_MISMATCH')
    pre.require(pre.file_sha256(copy) == backup['sha256']
                and not any(path.exists() or path.is_symlink() for path in sidecars), 'RETRIEVED_BACKUP_CHANGED')
    return {'status': 'RETRIEVED_BACKUP_VERIFIED', 'backup_sha256': backup['sha256'],
            'evidence_sha256': expected_evidence_sha}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, help='absolute path to the retrieved finalized SQLite copy')
    parser.add_argument('--evidence', required=True, help='absolute path to the retrieved release backup JSON')
    parser.add_argument('--expected-evidence-sha256', required=True, help='digest obtained from the independent record')
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.database, args.evidence, args.expected_evidence_sha256), sort_keys=True))
        return 0
    except pre.ReleaseError as error:
        code = str(error)
    except (OSError, ValueError, TypeError, KeyError, AttributeError, sqlite3.Error):
        code = 'RETRIEVED_BACKUP_INVALID'
    print(json.dumps({'status': 'REFUSED', 'code': code}), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
