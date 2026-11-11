#!/usr/bin/env python3
"""Prepare or explicitly execute a bounded, stopped-writer Stalwart capture.

Run as root on Linux. The default only inspects readiness. Execution needs an
approved mail maintenance window. This does not configure recurring backups,
restore data, change a container, or upload anything. SIGKILL/host failure cannot
be recovered by a process-local finally block; retain an operator connection.
"""
import argparse
import contextlib
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import time
import uuid


class CaptureError(Exception):
    pass


def require(value, code):
    if not value:
        raise CaptureError(code)


def run(arguments, timeout=20):
    try:
        result = subprocess.run(arguments, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise CaptureError('COMMAND_UNAVAILABLE_OR_TIMED_OUT') from error
    require(result.returncode == 0, 'COMMAND_FAILED')
    return result.stdout


def inspect(container, runner=run):
    items = json.loads(runner(['docker', 'inspect', container]))
    require(isinstance(items, list) and len(items) == 1, 'CONTAINER_NOT_UNIQUE')
    return items[0]


def canonical_directory(value):
    path = Path(value)
    require(path.is_absolute() and path.is_dir() and path.resolve() == path,
            'DIRECTORY_MISSING_OR_SYMLINKED')
    return path


def overlaps(left, right):
    return left == right or left in right.parents or right in left.parents


def plan(args, runner=run):
    require(re.fullmatch(r'[a-f0-9]{64}', args.expected_container_id), 'INVALID_CONTAINER_ID')
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', args.expected_image), 'INVALID_IMAGE_ID')
    require(1 <= args.smtp_port <= 65535, 'INVALID_SMTP_PORT')
    source = canonical_directory(args.data_root)
    require(source != Path(source.anchor), 'MAIL_SOURCE_IS_FILESYSTEM_ROOT')
    parent = canonical_directory(args.capture_parent)
    require(not overlaps(source, parent), 'CAPTURE_OVERLAPS_SOURCE')
    require(stat.S_IMODE(parent.stat().st_mode) & 0o077 == 0, 'CAPTURE_PARENT_NOT_PRIVATE')
    lock = Path(args.lock_file)
    require(lock.is_absolute() and lock.parent.resolve() == lock.parent and lock.parent.is_dir(),
            'INVALID_BACKUP_LOCK')
    require(not lock.is_symlink() and not overlaps(source, lock), 'INVALID_BACKUP_LOCK')
    info = inspect(args.expected_container_id, runner)
    require(info['Id'] == args.expected_container_id and info['Image'] == args.expected_image,
            'CONTAINER_IDENTITY_DRIFT')
    state = info['State']
    require(state.get('Running') and not state.get('Paused') and not state.get('Restarting'),
            'MAIL_NOT_STABLY_RUNNING')
    writable = [mount for mount in info['Mounts'] if mount.get('RW')]
    require(len(writable) == 1 and writable[0]['Type'] == 'bind'
            and writable[0]['Source'] == str(source)
            and writable[0]['Destination'] == '/opt/stalwart', 'MAIL_MOUNT_CONTRACT_MISMATCH')
    ids = runner(['docker', 'ps', '-q', '--no-trunc']).decode().split()
    for other in ids:
        if other == info['Id']:
            continue
        for mount in inspect(other, runner).get('Mounts', []):
            if mount.get('RW') and overlaps(source, Path(mount['Source']).resolve()):
                raise CaptureError('ANOTHER_CONTAINER_CAN_WRITE_MAIL')
    size = 0
    files = 0
    device = source.stat().st_dev
    for directory, directories, names in os.walk(source, followlinks=False):
        for name in directories + names:
            entry = Path(directory) / name
            metadata = entry.lstat()
            require(metadata.st_dev == device and (stat.S_ISDIR(metadata.st_mode)
                    or stat.S_ISREG(metadata.st_mode)), 'UNSUPPORTED_MAIL_ENTRY')
            if stat.S_ISREG(metadata.st_mode):
                size += metadata.st_size
                files += 1
    import shutil
    require(shutil.disk_usage(parent).free >= size * 2 + 100 * 1024 * 1024,
            'INSUFFICIENT_CAPTURE_SPACE')
    return {'status': 'MAIL_CAPTURE_PLAN_READY', 'container_id': info['Id'],
            'image': info['Image'], 'source': str(source), 'capture_parent': str(parent),
            'lock_file': str(lock), 'smtp_port': args.smtp_port,
            'files': files, 'bytes': size, 'started_at': state['StartedAt'],
            'read_only_mount_dependencies': [mount for mount in info['Mounts'] if not mount.get('RW')],
            'mail_pause_command_budgets_seconds': {'stop': 55, 'copy': 120, 'start': 20, 'readiness': 45},
            'runtime_restore_verified': False, 'offsite_uploaded': False}


@contextlib.contextmanager
def backup_lock(path):
    import fcntl
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        metadata = os.fstat(descriptor)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1, 'INVALID_BACKUP_LOCK')
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise CaptureError('BACKUP_ALREADY_RUNNING') from error
        yield
    finally:
        os.close(descriptor)


def smtp_ready(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=2) as connection:
            return connection.recv(512).startswith(b'220')
    except OSError:
        return False


def resume(container, image, port, runner=run, ready=smtp_ready):
    # A timed-out start may still succeed at the daemon. Inspect before deciding.
    try:
        runner(['docker', 'start', container], timeout=20)
    except CaptureError:
        pass
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        info = inspect(container, runner)
        require(info['Id'] == container and info['Image'] == image, 'RESUME_IDENTITY_DRIFT')
        if info['State'].get('Running') and ready(port):
            return
        time.sleep(1)
    raise CaptureError('MAIL_RESUME_REQUIRES_OPERATOR')


def capture(approved_plan, runner=run, ready=smtp_ready, resume_mail=resume):
    require(ready(approved_plan['smtp_port']), 'SMTP_BASELINE_NOT_READY')
    container = approved_plan['container_id']
    image = approved_plan['image']
    current = inspect(container, runner)
    require(current['Id'] == container and current['Image'] == image
            and current['State'].get('Running')
            and not current['State'].get('Paused') and not current['State'].get('Restarting')
            and current['State']['StartedAt'] == approved_plan['started_at'], 'PLAN_DRIFT')
    root = Path(approved_plan['capture_parent']) / ('mail-capture-' + uuid.uuid4().hex + '.partial')
    root.mkdir(mode=0o700)
    archive = root / 'stalwart-data.tar'
    receipt = dict(approved_plan, status='INCOMPLETE', mail_resumed=False,
                   capture_started_at=datetime.now(timezone.utc).isoformat())
    (root / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (root / 'capture.json').chmod(0o600)
    failed = None
    attempted_stop = False
    try:
        attempted_stop = True
        runner(['docker', 'stop', '--time', '45', container], timeout=55)
        stopped = inspect(container, runner)
        require(stopped['Id'] == container and stopped['Image'] == image
                and not stopped['State'].get('Running')
                and not stopped['State'].get('OOMKilled')
                and stopped['State'].get('ExitCode') == 0, 'SHUTDOWN_NOT_CLEAN')
        receipt['clean_shutdown_verified_at'] = datetime.now(timezone.utc).isoformat()
        runner(['tar', '--acls', '--xattrs', '--numeric-owner', '--one-file-system',
                '-cpf', str(archive), '-C', approved_plan['source'], '.'], timeout=120)
        receipt['copy_finished_at'] = datetime.now(timezone.utc).isoformat()
    except BaseException as error:
        failed = error
    finally:
        if attempted_stop:
            try:
                resume_mail(container, image, approved_plan['smtp_port'], runner=runner, ready=ready)
                receipt['mail_resumed'] = True
                receipt['mail_resumed_at'] = datetime.now(timezone.utc).isoformat()
            except BaseException:
                receipt['status'] = 'MAIL_RESUME_REQUIRES_OPERATOR'
                (root / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
                raise CaptureError('MAIL_RESUME_REQUIRES_OPERATOR')
        (root / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
    if failed is not None:
        (root / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
        raise CaptureError('MAIL_CAPTURE_FAILED_OR_INTERRUPTED') from failed
    # Do bulk validation after resuming mail, while retaining the off-site lock.
    archive.chmod(0o600)
    runner(['tar', '-tf', str(archive)], timeout=60)
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    receipt.update(status='CONSISTENT_CAPTURE_COMPLETE', archive_sha256=digest.hexdigest(),
                   archive_bytes=archive.stat().st_size)
    (root / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
    complete = root.with_suffix('')
    root.rename(complete)
    return {'status': receipt['status'], 'capture_directory': str(complete),
            'archive_sha256': receipt['archive_sha256'], 'mail_resumed': True,
            'offsite_uploaded': False, 'runtime_restore_verified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-container-id', required=True)
    parser.add_argument('--expected-image', required=True)
    parser.add_argument('--data-root', required=True)
    parser.add_argument('--capture-parent', required=True)
    parser.add_argument('--lock-file', required=True)
    parser.add_argument('--smtp-port', type=int, required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
        prepared = plan(args)
        if not args.execute:
            print(json.dumps(prepared, sort_keys=True))
            return 0
        def interrupt(_number, _frame):
            raise CaptureError('CAPTURE_INTERRUPTED')
        signal.signal(signal.SIGTERM, interrupt)
        with backup_lock(prepared['lock_file']):
            refreshed = plan(args)
            identity_fields = ['container_id', 'image', 'source', 'capture_parent',
                               'lock_file', 'smtp_port', 'started_at', 'read_only_mount_dependencies']
            require(all(refreshed[key] == prepared[key] for key in identity_fields), 'PLAN_DRIFT')
            print(json.dumps(capture(refreshed), sort_keys=True))
        return 0
    except (CaptureError, OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if isinstance(error, CaptureError) else 'MAIL_CAPTURE_INVALID'
        print(json.dumps({'status': 'REFUSED', 'code': code}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
