#!/usr/bin/env python3
"""Create/verify an offline immutable monitor bundle; never installs or edits cron."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

FILES = ('lms-health-monitor.sh', 'lms-deadman-check.sh', 'monitor_evidence.py',
         'verify-stability.py', 'build-stability-evidence.py')


def digest(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('invalid bundle member')
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(source, *arguments):
    result = subprocess.run(['git', '--no-optional-locks', '-C', str(source), *arguments],
                            capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise ValueError('source Git validation failed')
    return result.stdout.strip()


def verify(bundle, sha, manifest_sha):
    if bundle.is_symlink() or not bundle.is_dir():
        raise ValueError('invalid bundle directory')
    manifest_file = bundle/'manifest.json'
    if manifest_file.is_symlink() or manifest_file.stat().st_size > 8192:
        raise ValueError('invalid bundle manifest')
    if not re.fullmatch('[a-f0-9]{64}', manifest_sha) or digest(manifest_file) != manifest_sha:
        raise ValueError('externally pinned manifest digest mismatch')
    manifest = json.loads(manifest_file.read_text(encoding='utf8'))
    if manifest.get('version') != 1 or manifest.get('source_sha') != sha:
        raise ValueError('bundle identity mismatch')
    if set(manifest.get('files', {})) != set(FILES) or set(p.name for p in bundle.iterdir()) != set(FILES) | {'manifest.json'}:
        raise ValueError('unexpected bundle members')
    for name in FILES:
        if digest(bundle/name) != manifest['files'][name]:
            raise ValueError('bundle digest mismatch')
    return manifest


def build(source, sha, output):
    if output.resolve().is_relative_to(source.resolve()):
        raise ValueError('bundle must be outside the mutable source checkout')
    if output.exists() or output.is_symlink() or not output.parent.is_dir():
        raise ValueError('bundle output must be a new directory under an existing parent')
    if git(source, 'rev-parse', 'HEAD') != sha:
        raise ValueError('source SHA mismatch')
    names = ['scripts/'+name for name in FILES]
    if set(git(source, 'ls-files', '--', *names).splitlines()) != set(names):
        raise ValueError('all bundle sources must be tracked')
    if git(source, 'status', '--porcelain', '--untracked-files=all', '--', *names):
        raise ValueError('bundle sources must be clean and committed')
    # Never stage cron, environment files or operational state into the bundle.
    lock = output.with_name(output.name+'.lock')
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    staging = None
    try:
        os.close(fd)
        if output.exists() or output.is_symlink():
            raise ValueError('bundle destination already exists')
        staging = Path(tempfile.mkdtemp(prefix='.monitor-bundle-', dir=output.parent))
        os.chmod(staging, 0o700)
        hashes = {}
        for name in FILES:
            original = source/'scripts'/name
            digest(original)  # Refuse symlinks/non-files before copying.
            destination = staging/name
            committed = subprocess.run(['git', '--no-optional-locks', '-C', str(source),
                                        'show', sha+':scripts/'+name], capture_output=True, timeout=15)
            if committed.returncode:
                raise ValueError('committed bundle source unavailable')
            # Read the immutable Git object, not a worktree file that can change
            # between cleanliness checks and copying.
            destination.write_bytes(committed.stdout)
            os.chmod(destination, 0o600)
            hashes[name] = digest(destination)
        # Re-check the source revision and worktree before publishing evidence.
        if git(source, 'rev-parse', 'HEAD') != sha or git(source, 'status', '--porcelain', '--', *names):
            raise ValueError('source changed during bundle creation')
        manifest = staging/'manifest.json'
        with manifest.open('x', encoding='utf8') as stream:
            os.chmod(manifest, 0o600)
            json.dump({'version':1, 'source_sha':sha, 'files':hashes}, stream, sort_keys=True, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        manifest_sha = digest(manifest)
        verify(staging, sha, manifest_sha)
        os.rename(staging, output)
        staging = None
        return manifest_sha
    finally:
        if staging is not None:
            shutil.rmtree(staging)
        lock.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path)
    parser.add_argument('--manifest-sha')
    args = parser.parse_args()
    try:
        if not re.fullmatch('[a-f0-9]{40}', args.sha):
            raise ValueError('full source SHA required')
        if args.verify is not None:
            if args.source is not None or args.output is not None:
                raise ValueError('verify cannot create a bundle')
            if args.manifest_sha is None:
                raise ValueError('independently recorded manifest digest required')
            verify(args.verify, args.sha, args.manifest_sha)
            manifest_sha = args.manifest_sha
        else:
            if args.source is None or args.output is None or args.manifest_sha is not None:
                raise ValueError('source and new output required')
            manifest_sha = build(args.source.resolve(), args.sha, args.output.absolute())
    except (ValueError, OSError, TypeError, AttributeError, KeyError, subprocess.SubprocessError):
        print('Monitoring bundle verification failed; preserve source and existing bundles', file=sys.stderr)
        return 1
    print(json.dumps({'status':'VERIFIED_OFFLINE', 'source_sha':args.sha,
                      'manifest_sha256':manifest_sha, 'cron_changed':False}, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
