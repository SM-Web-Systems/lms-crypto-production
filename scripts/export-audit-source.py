#!/usr/bin/env python3
"""Export a pinned commit's regular-file blobs without checkout/archive conversion."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

MANIFEST = 'AUDIT_SOURCE_MANIFEST.json'


def git(repository, *args, input=None):
    result = subprocess.run(['git', '--no-optional-locks', '-C', str(repository), *args],
                            input=input, capture_output=True, timeout=120)
    if result.returncode:
        raise ValueError('Git object read failed')
    return result.stdout


def safe_path(name):
    path = PurePosixPath(name)
    if (not name or name == '.' or path.is_absolute() or str(path) != name or '\\' in name or ':' in name
            or any(ord(c) < 32 for c in name) or any(p.casefold() in ['.', '..', '.git'] for p in path.parts)
            or any(p.endswith(('.', ' ')) or re.fullmatch(r'(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', p, re.I) for p in path.parts)
            or name == MANIFEST):
        raise ValueError('Unsupported export path')
    return path


def export_source(repository, sha, output):
    if not re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{64})', sha):
        raise ValueError('A full immutable commit SHA is required')
    if git(repository, 'rev-parse', '--verify', sha + '^{commit}').decode().strip() != sha:
        raise ValueError('Commit identity mismatch')
    output = Path(output)
    if output.exists() or output.is_symlink() or not output.parent.is_dir():
        raise ValueError('Output must be a new directory under an existing parent')
    entries = []
    names = set()
    for record in git(repository, 'ls-tree', '-rz', sha).split(b'\0'):
        if not record:
            continue
        header, raw_name = record.split(b'\t', 1)
        mode, kind, oid = header.decode('ascii').split()
        name = raw_name.decode('utf-8')
        safe_path(name)
        if kind != 'blob' or mode not in ['100644', '100755']:
            raise ValueError('Symlinks, submodules and non-regular entries cannot be exported')
        if name.casefold() in names:
            raise ValueError('Case-colliding export paths')
        names.add(name.casefold())
        entries.append({'path': name, 'mode': mode, 'gitBlob': oid})
    payload = git(repository, 'cat-file', '--batch',
                  input=('\n'.join(e['gitBlob'] for e in entries) + '\n').encode('ascii')) if entries else b''
    position = 0
    blobs = []
    for entry in entries:
        end = payload.index(b'\n', position)
        oid, kind, raw_size = payload[position:end].decode('ascii').split()
        size = int(raw_size)
        start = end + 1
        if oid != entry['gitBlob'] or kind != 'blob' or len(payload) < start + size + 1:
            raise ValueError('Invalid Git object stream')
        data = payload[start:start + size]
        position = start + size + 1
        if payload[position - 1:position] != b'\n':
            raise ValueError('Invalid Git object delimiter')
        blobs.append(data)
        entry.update({'bytes': size, 'sha256': hashlib.sha256(data).hexdigest()})
    if position != len(payload):
        raise ValueError('Unexpected Git object data')
    # Exclusive creation never overwrites a checkout or a previous export. If a
    # filesystem write fails, the partial directory has no accepted manifest;
    # retain it for diagnosis and retry with a new destination.
    output.mkdir(mode=0o700)
    for entry, data in zip(entries, blobs):
        target = output.joinpath(*safe_path(entry['path']).parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data)
        if entry['mode'] == '100755':
            target.chmod(0o700)
    manifest = {'version': 1, 'sourceSha': sha, 'representation': 'raw-git-blobs', 'files': entries}
    with (output / MANIFEST).open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(manifest, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--sha', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        manifest = export_source(args.repository, args.sha, args.output)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(2, f'Export refused: {error}\n')
    print(json.dumps({'sourceSha': manifest['sourceSha'], 'files': len(manifest['files']),
                      'representation': manifest['representation']}))


if __name__ == '__main__':
    main()
