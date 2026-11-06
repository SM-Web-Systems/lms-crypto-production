"""Inspect the staging runtime or inventory an existing private recovery snapshot.

No SSH configuration, daemon, firewall, account, checkout or live DB changes.
Inventory starts one bounded, network-disabled container; it never starts the API.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import uuid

NAME = re.compile(r'[a-z0-9][a-z0-9_.-]{0,127}\Z')
SHA = re.compile(r'[a-f0-9]{40}\Z')
IMAGE = re.compile(r'sha256:[a-f0-9]{64}\Z')
SUMMARY_KEYS = {'generatedAt', 'snapshotSha256', 'deployedApplication', 'reportVersion', 'readOnly',
                'productionInventoryVerified', 'purpose', 'schema', 'users', 'rbac', 'interpretation', 'gates'}
CONTAINER_FORMAT = '{"image":{{json .Image}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}'
IMAGE_FORMAT = '{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},"workdir":{{json .Config.WorkingDir}}}'


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def command(arguments, timeout=45):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=timeout, check=False)
    require(result.returncode == 0, 'COMMAND_REFUSED')
    require(len(result.stdout) < 1024 * 1024, 'OUTPUT_TOO_LARGE')
    return result.stdout


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def private_file(file):
    require(file.is_file() and not file.is_symlink(), 'PRIVATE_FILE_REQUIRED')
    if os.name != 'nt':
        require(stat.S_IMODE(file.stat().st_mode) & 0o077 == 0, 'PRIVATE_FILE_PERMISSIONS_REQUIRED')


def within(child, parent):
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def execute(environment, runner=command):
    require(environment.get('DEPLOY_BASE_URL', '').rstrip('/') == 'https://lms.smwebsystems.com', 'STAGING_TARGET_REQUIRED')
    project = environment.get('DEPLOY_PROJECT', '')
    require(NAME.fullmatch(project), 'PROJECT_REQUIRED')
    mode = environment.get('LMS_INVENTORY_MODE', 'probe')
    require(mode in ('probe', 'inventory'), 'INVALID_MODE')
    observed = {}
    for service in ('api', 'web'):
        name = environment.get('DEPLOY_' + service.upper() + '_CONTAINER', '')
        require(NAME.fullmatch(name), 'CONTAINER_REQUIRED')
        container = json.loads(runner(['docker', 'container', 'inspect', '--format', CONTAINER_FORMAT, name]))
        require(container.get('running') is True and container.get('project') == project, 'RUNNING_PROJECT_MISMATCH')
        require(IMAGE.fullmatch(container.get('image', '')), 'IMAGE_REQUIRED')
        image = json.loads(runner(['docker', 'image', 'inspect', '--format', IMAGE_FORMAT, container['image']]))
        require(image.get('id') == container['image'] and SHA.fullmatch(image.get('revision', '')), 'REVISION_REQUIRED')
        observed[service] = image
    result = {'version': 1, 'mode': mode, 'observedImages': {
        service: {key: image[key] for key in ('id', 'revision')} for service, image in observed.items()},
              'mobileInstalledBuildInventory': 'not collected', 'legacyEndpointUsage': 'not collected'}
    if mode == 'probe':
        checkout = Path(environment.get('DEPLOY_DIR', ''))
        result['checkout'] = {'exists': checkout.is_absolute() and checkout.is_dir()}
        if result['checkout']['exists']:
            try:
                revision = runner(['git', '--no-optional-locks', '-C', str(checkout), 'rev-parse', 'HEAD']).strip()
                require(SHA.fullmatch(revision), 'CHECKOUT_REVISION_REQUIRED')
                remote = runner(['git', '--no-optional-locks', '-C', str(checkout), 'remote', 'get-url', 'origin']).strip()
                dirty = runner(['git', '--no-optional-locks', '-C', str(checkout), 'status', '--porcelain=v1', '--untracked-files=all'])
                result['checkout'].update(revision=revision, dirty=bool(dirty.strip()), repositoryMatches=remote in (
                    'https://github.com/SM-Web-Systems/lms-crypto-production',
                    'https://github.com/SM-Web-Systems/lms-crypto-production.git',
                    'git@github.com:SM-Web-Systems/lms-crypto-production.git',
                    'ssh://git@github.com/SM-Web-Systems/lms-crypto-production.git'))
            except Refused:
                result['checkout']['inspection'] = 'unavailable'
        return dict(result, status='SSH_RUNTIME_READ_CONFIRMED')
    require(mode == 'inventory', 'INVALID_MODE')
    identifier = environment.get('LMS_INVENTORY_MANIFEST', '')
    require(re.fullmatch(r'[a-f0-9]{32}', identifier), 'MANIFEST_ID_REQUIRED')
    root = Path(environment.get('DEPLOY_BACKUP_DIR', ''))
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), 'BACKUP_ROOT_REQUIRED')
    require(not any(part in ('.ssh', 'etc', 'proc', 'sys', 'dev', 'bin', 'usr') for part in root.parts), 'BACKUP_LOCATION_REFUSED')
    require(root.resolve() == root, 'CANONICAL_BACKUP_ROOT_REQUIRED')
    if os.name != 'nt':
        require(stat.S_IMODE(root.stat().st_mode) & 0o077 == 0, 'PRIVATE_BACKUP_DIRECTORY_REQUIRED')
    manifest_file = root / 'release-state' / ('recovery-' + identifier + '.json')
    private_file(manifest_file)
    require(within(manifest_file.resolve(), root), 'MANIFEST_PATH_REFUSED')
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    require(manifest.get('version') == 1 and manifest.get('manifest_id') == identifier, 'MANIFEST_ID_MISMATCH')
    require(manifest.get('eligibility') == 'EXACT_SCHEMA_AND_FINANCIAL_STATE', 'UNVERIFIED_MANIFEST')
    target, backup = manifest['target'], manifest['backup']
    require(target['project'] == project and target['repository'] == 'SM-Web-Systems/lms-crypto-production', 'MANIFEST_TARGET_MISMATCH')
    require(all(target['services'][service]['image_id'] == observed[service]['id'] for service in ('api', 'web')), 'RUNTIME_CHANGED_SINCE_SNAPSHOT')
    snapshot = Path(backup['file'])
    private_file(snapshot)
    require(within(snapshot.resolve(), root) and snapshot.resolve() == snapshot, 'SNAPSHOT_PATH_REFUSED')
    require(0 <= datetime.now(timezone.utc).timestamp() - snapshot.stat().st_mtime <= 3600, 'FRESH_SNAPSHOT_REQUIRED')
    require(digest(snapshot) == backup['sha256'], 'SNAPSHOT_HASH_MISMATCH')
    require(not any(Path(str(snapshot) + suffix).exists() for suffix in ('-wal', '-shm', '-journal')), 'STANDALONE_SNAPSHOT_REQUIRED')
    checkout = Path(environment.get('DEPLOY_DIR', ''))
    require(checkout.is_absolute() and checkout.resolve() == checkout, 'CHECKOUT_REQUIRED')
    tool = checkout / 'LMS-Server' / 'scripts' / 'rbac-inventory.mjs'
    require(tool.is_file() and not tool.is_symlink() and within(tool.resolve(), checkout), 'TOOL_REQUIRED')
    require(re.fullmatch(r'[a-f0-9]{64}', environment.get('LMS_INVENTORY_TOOL_SHA256', '')), 'TOOL_HASH_REQUIRED')
    require(digest(tool) == environment['LMS_INVENTORY_TOOL_SHA256'], 'TOOL_HASH_MISMATCH')
    workdir = PurePosixPath(observed['api']['workdir'])
    require(workdir.is_absolute() and str(workdir) != '/' and '..' not in workdir.parts, 'API_WORKDIR_REQUIRED')
    require(all(',' not in str(path) for path in (snapshot, tool, root, workdir)), 'MOUNT_PATH_REFUSED')
    require(shutil.disk_usage(root).free >= 64 * 1024 * 1024, 'REPORT_DISK_SPACE_REQUIRED')
    report = root / ('rbac-inventory-' + uuid.uuid4().hex)
    report.mkdir(mode=0o700)
    name = 'lms-rbac-inventory-' + uuid.uuid4().hex
    mounted_tool = str(workdir / '.lms-inventory.mjs')
    arguments = ['docker', 'run', '--rm', '--name', name, '--network', 'none', '--read-only',
                 '--memory', '256m', '--cpus', '0.5', '--pids-limit', '64', '--cap-drop', 'ALL',
                 '--security-opt', 'no-new-privileges', '--user', '0:0', '--workdir', str(workdir),
                 '--mount', f'type=bind,src={snapshot},dst=/tmp/lms-snapshot.sqlite3,readonly',
                 '--mount', f'type=bind,src={tool},dst={mounted_tool},readonly',
                 '--mount', f'type=bind,src={report},dst=/tmp/lms-private-report',
                 '--entrypoint', 'node', observed['api']['id'], mounted_tool, '--snapshot',
                 '--database', '/tmp/lms-snapshot.sqlite3', '--deployed-sha', observed['api']['revision'],
                 '--details-output', '/tmp/lms-private-report/exceptions.json']
    try:
        summary = json.loads(runner(arguments, timeout=150))
        require(set(summary) <= SUMMARY_KEYS and summary.get('readOnly') is True
                and summary.get('productionInventoryVerified') is False
                and summary.get('gates', {}).get('migrationReady') is False, 'AGGREGATE_SUMMARY_REQUIRED')
        require(summary['deployedApplication']['sha'] == observed['api']['revision'], 'REPORT_REVISION_MISMATCH')
        require(summary['snapshotSha256'] == backup['sha256'], 'REPORT_SNAPSHOT_MISMATCH')
        # The trusted inventory tool excludes account identifiers from summary.
        return dict(result, status='PRIVATE_SNAPSHOT_INVENTORIED', summary=summary,
                    privateReportReference=report.name,
                    snapshotCreatedAt=datetime.fromtimestamp(snapshot.stat().st_mtime, timezone.utc).isoformat())
    finally:
        # Only the unique one-off container created above; never a live service.
        try:
            runner(['docker', 'rm', '--force', name])
        except Refused:
            pass


if __name__ == '__main__':
    try:
        print(json.dumps(execute(os.environ), sort_keys=True))
    except Refused as error:
        print(json.dumps({'status': 'SERVER_INVENTORY_REFUSED', 'code': str(error)}))
        raise SystemExit(2)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        # Never echo Docker output, paths, raw SQL, environment or account data.
        print(json.dumps({'status': 'SERVER_INVENTORY_REFUSED'}))
        raise SystemExit(2)
