#!/usr/bin/env python3
"""Verify a private Stalwart capture before isolated extraction, without restoring it."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tarfile
import tomllib


class VerificationError(Exception):
    pass


def require(value, code):
    if not value:
        raise VerificationError(code)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def private_file(value):
    path = Path(value)
    require(path.is_absolute() and path.is_file() and not path.is_symlink()
            and path.resolve() == path, 'CAPTURE_PATH_NOT_CANONICAL_REGULAR_FILE')
    info = path.stat()
    if os.name == 'posix':
        require(info.st_uid in {0, os.getuid()}
                and not stat.S_IMODE(info.st_mode) & 0o077
                and not stat.S_IMODE(path.parent.stat().st_mode) & 0o077,
                'CAPTURE_PERMISSIONS_NOT_PRIVATE')
    return path


def verify(archive_path, receipt_path, receipt_sha256, image):
    require(re.fullmatch(r'[a-f0-9]{64}', receipt_sha256), 'INVALID_INDEPENDENT_RECEIPT_DIGEST')
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', image), 'INVALID_EXPECTED_IMAGE')
    archive_path = private_file(archive_path)
    receipt_path = private_file(receipt_path)
    require(archive_path != receipt_path and archive_path.parent == receipt_path.parent,
            'CAPTURE_PAIR_NOT_SEPARATE_PRIVATE_FILES')
    require(receipt_path.stat().st_size <= 128 * 1024, 'CAPTURE_RECEIPT_TOO_LARGE')
    require(digest(receipt_path) == receipt_sha256, 'CAPTURE_RECEIPT_DIGEST_MISMATCH')
    receipt = json.loads(receipt_path.read_text())
    require(receipt.get('status') == 'CONSISTENT_CAPTURE_COMPLETE'
            and receipt.get('mail_resumed') is True, 'CAPTURE_NOT_COMPLETE_AND_RESUMED')
    require(receipt.get('image') == image, 'CAPTURE_IMAGE_MISMATCH')
    stamps = [datetime.fromisoformat(receipt[name]) for name in
              ['clean_shutdown_verified_at', 'copy_finished_at', 'mail_resumed_at']]
    require(all(stamp.tzinfo is not None for stamp in stamps)
            and stamps[0] <= stamps[1] <= stamps[2], 'CAPTURE_TIMING_INVALID')
    expected = receipt.get('archive_sha256')
    require(isinstance(expected, str) and re.fullmatch(r'[a-f0-9]{64}', expected),
            'CAPTURE_ARCHIVE_DIGEST_INVALID')
    require(type(receipt.get('archive_bytes')) is int
            and receipt['archive_bytes'] == archive_path.stat().st_size,
            'CAPTURE_ARCHIVE_SIZE_MISMATCH')
    require(digest(archive_path) == expected, 'CAPTURE_ARCHIVE_DIGEST_MISMATCH')
    original = archive_path.stat()
    with tarfile.open(archive_path, 'r:') as archive:
        members = {}
        for member in archive:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts
                    and '\\' not in member.name and (member.isdir() or member.isfile()),
                    'CAPTURE_UNSAFE_ARCHIVE_ENTRY')
            name = path.as_posix()
            require(name not in members, 'CAPTURE_DUPLICATE_ARCHIVE_ENTRY')
            members[name] = member
        config = members.get('etc/config.toml')
        require(config is not None and config.isfile() and config.size <= 1024 * 1024,
                'CAPTURE_CONFIG_MISSING_OR_INVALID')
        stream = archive.extractfile(config)
        require(stream is not None, 'CAPTURE_CONFIG_MISSING_OR_INVALID')
        configuration = tomllib.loads(stream.read().decode())
        storage = configuration.get('storage', {})
        require(all(storage.get(name) == 'rocksdb' for name in ['data', 'blob', 'lookup', 'fts']),
                'CAPTURE_STORE_CONTRACT_MISMATCH')
        store = configuration.get('store', {}).get('rocksdb', {})
        require(store.get('type') == 'rocksdb' and store.get('path') == '/opt/stalwart/data',
                'CAPTURE_STORE_CONTRACT_MISMATCH')
        current = members.get('data/CURRENT')
        require(current is not None and current.isfile() and current.size <= 128,
                'CAPTURE_ROCKSDB_CURRENT_INVALID')
        stream = archive.extractfile(current)
        require(stream is not None, 'CAPTURE_ROCKSDB_CURRENT_INVALID')
        selected = stream.read().decode().strip()
        require(re.fullmatch(r'MANIFEST-[0-9]+', selected), 'CAPTURE_ROCKSDB_CURRENT_INVALID')
        manifest = members.get('data/' + selected)
        require(manifest is not None and manifest.isfile() and manifest.size > 0,
                'CAPTURE_ROCKSDB_MANIFEST_MISSING')
        regular_files = sum(member.isfile() for member in members.values())
        directories = sum(member.isdir() for member in members.values())
        sst_files = sum(name.startswith('data/') and name.endswith('.sst') for name in members)
    after = archive_path.stat()
    require((original.st_dev, original.st_ino, original.st_size, original.st_mtime_ns)
            == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            and digest(archive_path) == expected
            and digest(receipt_path) == receipt_sha256, 'CAPTURE_CHANGED_DURING_VERIFICATION')
    return {'status': 'MAIL_CAPTURE_VERIFIED_FOR_ISOLATED_EXTRACTION',
            'archive_sha256': expected, 'receipt_sha256': receipt_sha256,
            'image': image, 'files': regular_files, 'directories': directories,
            'sst_files': sst_files, 'rocksdb_current_manifest_bound': True,
            'archive_unchanged': True, 'posix_metadata_verified': os.name == 'posix',
            'extracted': False, 'runtime_restored': False, 'mailbox_read': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--expected-receipt-sha256', required=True)
    parser.add_argument('--expected-image', required=True)
    args = parser.parse_args()
    try:
        require(os.name == 'posix', 'POSIX_PERMISSION_VERIFICATION_REQUIRED')
        print(json.dumps(verify(args.archive, args.receipt, args.expected_receipt_sha256,
                                args.expected_image), sort_keys=True))
        return 0
    except (VerificationError, OSError, ValueError, KeyError, TypeError,
            tarfile.TarError, UnicodeError) as error:
        code = str(error) if isinstance(error, VerificationError) else 'MAIL_CAPTURE_INVALID'
        print(json.dumps({'status': 'REFUSED', 'code': code}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
