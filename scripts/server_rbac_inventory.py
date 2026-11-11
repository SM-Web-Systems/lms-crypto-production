"""Inspect staging, inventory a snapshot, or prepare one on a pinned revision.

The Wallet callback modes read a parameter-free response from the API or shared TLS proxy.
No SSH configuration, daemon, firewall, account, checkout or live DB changes.
Inventory starts one bounded, network-disabled container; it never starts the API.
Capture creates private backup/recovery files and retained image tags only.
"""
from datetime import datetime, timezone
import hashlib
from ipaddress import IPv4Interface
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
CONTAINER_ID = re.compile(r'[a-f0-9]{64}\Z')
CONTAINER_FORMAT = '{"containerId":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}'
IMAGE_FORMAT = '{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},"workdir":{{json .Config.WorkingDir}}}'
OWNER_SCRIPT = "const f=require('node:fs'),s=f.statSync('/tmp/lms-snapshot.sqlite3'),r=f.statSync('/tmp/lms-private-report');console.log(JSON.stringify({sourceUid:s.uid,reportUid:r.uid,reportGid:r.gid}));"
WALLET_CALLBACK_SCRIPT = """
const { get } = require('node:http');
const request = get('http://127.0.0.1:3001/api/v1/auth/amma-callback', { agent: false, timeout: 5000 }, response => {
  const values = response.headersDistinct;
  const referrer = values['referrer-policy'] ?? [];
  const cache = values['cache-control'] ?? [];
  console.log(JSON.stringify({
    httpStatus: response.statusCode,
    noReferrer: referrer.length === 1 && referrer[0].toLowerCase() === 'no-referrer',
    strictOriginWhenCrossOrigin: referrer.length === 1 && referrer[0].toLowerCase() === 'strict-origin-when-cross-origin',
    noStore: cache.length === 1 && cache[0].toLowerCase() === 'no-store',
  }));
  response.destroy();
});
request.on('timeout', () => request.destroy(new Error('callback probe timed out')));
request.on('error', () => { process.exitCode = 1; });
"""
WALLET_PROXY_SCRIPT = """
const { get } = require('node:https');
const site = 'lms.smwebsystems.com';
const request = get({
  hostname: process.argv[1],
  port: 443,
  servername: site,
  headers: { Host: site },
  path: '/api/v1/auth/amma-callback',
  rejectUnauthorized: true,
  agent: false,
  timeout: 5000,
}, response => {
  const values = response.headersDistinct;
  const referrer = values['referrer-policy'] ?? [];
  const cache = values['cache-control'] ?? [];
  const location = values.location ?? [];
  console.log(JSON.stringify({
    httpStatus: response.statusCode,
    missingParamsRedirect: response.statusCode === 302 && location.length === 1 &&
      location[0] === 'https://lms.smwebsystems.com/login?sso_error=missing_params',
    noReferrer: referrer.length === 1 && referrer[0].toLowerCase() === 'no-referrer',
    strictOriginWhenCrossOrigin: referrer.length === 1 && referrer[0].toLowerCase() === 'strict-origin-when-cross-origin',
    noStore: cache.length === 1 && cache[0].toLowerCase() === 'no-store',
  }));
  response.destroy();
});
request.on('timeout', () => request.destroy(new Error('callback probe timed out')));
request.on('error', () => { process.exitCode = 1; });
"""
PREPARED_REVISION = 'f5a64e8ac92aca6b33ae54bda70617d475893e3e'
TRUSTED_RELEASE_FILES = {
    'scripts/release_preflight.py': '4531d402a48f53fe1886304ab82c4e91dc2ff53379bde74b151a77c49e8f1737',
    'scripts/release_recovery.py': 'f648136975a10168c2d04a02d0f391cb3e7b85d6e5e74aeb94d7de833adde29b',
    'scripts/deploy.sh': '3a44747f1dd3684c0d218d6c58de08467307051aaa435394331a0384d5c9b76d',
    'scripts/rollback.sh': '3de3868ce0e5c00b5aaadb253ac8d1d90d2663958c66d7c4c88dbedb04d29595',
}


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def command(arguments, timeout=45):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0 and arguments[:2] == ['docker', 'run'] and arguments[-2:] == ['-e', OWNER_SCRIPT]:
        raise Refused('INVENTORY_OWNER_METADATA_PROBE_FAILED')
    if result.returncode != 0 and arguments[:2] == ['docker', 'run'] \
            and '--snapshot' in arguments and any(arg.endswith('/.lms-inventory.mjs') for arg in arguments):
        # Classify this checksum-verified tool's fixed failures; never echo raw
        # Docker/Node output, host paths or SQLite messages.
        stderr = result.stderr[:1024 * 1024]
        fixed = {
            'RBAC inventory refused: Unsupported snapshot schema:': 'INVENTORY_SCHEMA_UNSUPPORTED',
            'RBAC inventory refused: Snapshot integrity check failed.': 'INVENTORY_INTEGRITY_REFUSED',
            'RBAC inventory refused: Snapshot is still in WAL mode.': 'INVENTORY_SNAPSHOT_NOT_FINALIZED',
            'RBAC inventory refused: Snapshot changed during inspection;': 'INVENTORY_SNAPSHOT_CHANGED',
            "Cannot find package 'better-sqlite3'": 'INVENTORY_RUNTIME_DEPENDENCY_UNAVAILABLE',
            'RBAC inventory refused:': 'INVENTORY_TOOL_REFUSED',
        }
        for marker, code in fixed.items():
            if marker in stderr:
                raise Refused(code)
        if result.returncode == 137:
            raise Refused('INVENTORY_MEMORY_LIMIT')
        if result.returncode == 125:
            raise Refused('INVENTORY_CONTAINER_START_REFUSED')
        raise Refused('INVENTORY_CONTAINER_COMMAND_FAILED')
    if result.returncode != 0 and len(arguments) >= 4 and arguments[0] == 'env' \
            and arguments[-3] == 'python3' and Path(arguments[-2]).name == 'release_recovery.py' \
            and arguments[-1] == 'prepare' and len(result.stderr) < 1024 * 1024:
        # This reviewed helper emits fixed gate codes. Never forward its raw
        # stderr, command arguments, paths or a traceback to workflow logs.
        for line in reversed(result.stderr.splitlines()):
            try:
                refusal = json.loads(line)
            except ValueError:
                continue
            if isinstance(refusal, dict) and refusal.get('status') == 'REFUSED' \
                    and re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', str(refusal.get('code', ''))):
                raise Refused('PREPARATION_' + refusal['code'])
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


def inventory_container_user(owners):
    require(isinstance(owners, dict) and set(owners) == {'sourceUid', 'reportUid', 'reportGid'}
            and all(type(value) is int and 0 <= value < 2 ** 32 for value in owners.values()), 'PRIVATE_FILE_OWNER_METADATA_REQUIRED')
    require(owners['sourceUid'] == owners['reportUid'], 'PRIVATE_SNAPSHOT_OWNER_MISMATCH')
    # CAP_DAC_OVERRIDE is deliberately absent. Match private 0600/0700 owners
    # as observed inside the namespace, including rootless Docker mappings.
    return str(owners['reportUid']) + ':' + str(owners['reportGid'])


def prepare_snapshot(environment, observed, runner):
    """Only the reviewed execution-disabled preparation on the observed revision.

    Reuses the existing WAL-safe backup/free-space/recovery checks. No checkout
    update, deployment, writer stop, SSH or firewall operation is available here.
    """
    require(all(image['revision'] == PREPARED_REVISION for image in observed.values()), 'PREPARED_REVISION_REQUIRED')
    checkout = Path(environment.get('DEPLOY_DIR', ''))
    require(checkout.is_absolute() and checkout.is_dir() and checkout.resolve() == checkout, 'CHECKOUT_REQUIRED')
    git = lambda args: runner(['git', '--no-optional-locks', '-C', str(checkout), *args]).strip()
    require(git(['rev-parse', 'HEAD']) == PREPARED_REVISION, 'CHECKOUT_REVISION_MISMATCH')
    require(git(['remote', 'get-url', 'origin']) in (
        'https://github.com/SM-Web-Systems/lms-crypto-production',
        'https://github.com/SM-Web-Systems/lms-crypto-production.git',
        'git@github.com:SM-Web-Systems/lms-crypto-production.git',
        'ssh://git@github.com/SM-Web-Systems/lms-crypto-production.git'), 'CHECKOUT_REPOSITORY_MISMATCH')
    require(not git(['status', '--porcelain=v1', '--untracked-files=all']), 'CHECKOUT_DIRTY')
    for relative, expected in TRUSTED_RELEASE_FILES.items():
        file = checkout / relative
        require(file.is_file() and not file.is_symlink() and within(file.resolve(), checkout)
                and digest(file) == expected, 'RELEASE_FILE_HASH_MISMATCH')
    tool = checkout / 'LMS-Server/scripts/rbac-inventory.mjs'
    require(tool.is_file() and not tool.is_symlink() and within(tool.resolve(), checkout)
            and digest(tool) == environment.get('LMS_INVENTORY_TOOL_SHA256'), 'TOOL_HASH_MISMATCH')
    prepared = json.loads(runner(['env', 'DEPLOY_SHA=' + PREPARED_REVISION, 'DEPLOY_EXECUTE=0', 'DEPLOY_DRY_RUN=0',
        'DEPLOY_REPOSITORY=SM-Web-Systems/lms-crypto-production', 'python3',
        str(checkout / 'scripts/release_recovery.py'), 'prepare'], timeout=180))
    require(prepared.get('status') == 'RECOVERY_PREPARED_DEPLOYMENT_DISABLED'
            and prepared.get('requested_sha') == PREPARED_REVISION
            and prepared.get('recovery_eligible') is True
            and re.fullmatch(r'[a-f0-9]{32}', prepared.get('manifest_id', '')), 'VERIFIED_PREPARATION_REQUIRED')
    return prepared['manifest_id']


def shared_proxy_address(api_container_id, runner):
    endpoints = json.loads(runner(['docker', 'network', 'inspect', '--format', '{{json .Containers}}', 'web-stack_default']))
    require(isinstance(endpoints, dict) and api_container_id in endpoints, 'API_SHARED_NETWORK_REQUIRED')
    proxies = [entry for container_id, entry in endpoints.items()
               if container_id != api_container_id and CONTAINER_ID.fullmatch(container_id)
               and isinstance(entry, dict) and entry.get('Name') == 'nginx_server']
    require(len(proxies) == 1, 'SHARED_PROXY_ENDPOINT_REQUIRED')
    try:
        return str(IPv4Interface(proxies[0].get('IPv4Address', '')).ip)
    except ValueError:
        raise Refused('SHARED_PROXY_IPV4_REQUIRED') from None


def execute(environment, runner=command):
    require(environment.get('DEPLOY_BASE_URL', '').rstrip('/') == 'https://lms.smwebsystems.com', 'STAGING_TARGET_REQUIRED')
    project = environment.get('DEPLOY_PROJECT', '')
    require(NAME.fullmatch(project), 'PROJECT_REQUIRED')
    mode = environment.get('LMS_INVENTORY_MODE', 'probe')
    wallet_modes = ('wallet-callback', 'wallet-proxy')
    require(mode in ('probe', *wallet_modes, 'inventory', 'capture', 'inventory-capture'), 'INVALID_MODE')
    require(mode not in wallet_modes or not environment.get('LMS_INVENTORY_MANIFEST'), 'UNEXPECTED_MANIFEST_ID')
    observed = {}
    api_container_id = None
    for service in ('api', 'web'):
        name = environment.get('DEPLOY_' + service.upper() + '_CONTAINER', '')
        require(NAME.fullmatch(name), 'CONTAINER_REQUIRED')
        container = json.loads(runner(['docker', 'container', 'inspect', '--format', CONTAINER_FORMAT, name]))
        require(container.get('running') is True and container.get('project') == project, 'RUNNING_PROJECT_MISMATCH')
        require(IMAGE.fullmatch(container.get('image', '')), 'IMAGE_REQUIRED')
        image = json.loads(runner(['docker', 'image', 'inspect', '--format', IMAGE_FORMAT, container['image']]))
        require(image.get('id') == container['image'] and SHA.fullmatch(image.get('revision', '')), 'REVISION_REQUIRED')
        observed[service] = image
        if service == 'api':
            api_container_id = container.get('containerId')
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
    if mode in wallet_modes:
        require(observed['api']['revision'] == PREPARED_REVISION, 'PREPARED_REVISION_REQUIRED')
        require(isinstance(api_container_id, str) and CONTAINER_ID.fullmatch(api_container_id), 'API_CONTAINER_ID_REQUIRED')
        arguments = ['docker', 'exec', '--workdir', '/', '--env', 'NODE_OPTIONS=', api_container_id, 'node', '-e']
        flags = ('noReferrer', 'strictOriginWhenCrossOrigin', 'noStore')
        status = 'WALLET_CALLBACK_ORIGIN_OBSERVED'
        if mode == 'wallet-proxy':
            arguments.extend([WALLET_PROXY_SCRIPT, shared_proxy_address(api_container_id, runner)])
            flags += ('missingParamsRedirect',)
            status = 'WALLET_CALLBACK_PROXY_OBSERVED'
        else:
            arguments.append(WALLET_CALLBACK_SCRIPT)
        probe = json.loads(runner(arguments, timeout=12))
        require(isinstance(probe, dict) and set(probe) == {'httpStatus', *flags}
                and type(probe['httpStatus']) is int and 100 <= probe['httpStatus'] <= 599
                and all(type(probe[flag]) is bool for flag in flags), 'WALLET_CALLBACK_PROBE_INVALID')
        if mode == 'wallet-proxy' and not probe['missingParamsRedirect']:
            status = 'WALLET_CALLBACK_PROXY_ROUTE_UNCONFIRMED'
        return dict(result, status=status, callback=probe)
    root = Path(environment.get('DEPLOY_BACKUP_DIR', ''))
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), 'BACKUP_ROOT_REQUIRED')
    require(not any(part in ('.ssh', 'etc', 'proc', 'sys', 'dev', 'bin', 'usr') for part in root.parts), 'BACKUP_LOCATION_REFUSED')
    require(root.resolve() == root, 'CANONICAL_BACKUP_ROOT_REQUIRED')
    if os.name != 'nt':
        require(stat.S_IMODE(root.stat().st_mode) & 0o077 == 0, 'PRIVATE_BACKUP_DIRECTORY_REQUIRED')
    identifier = (prepare_snapshot(environment, observed, runner) if mode == 'capture'
                  else environment.get('LMS_INVENTORY_MANIFEST', ''))
    inventory_capture = mode == 'inventory-capture'
    if inventory_capture and not identifier:
        # Recovery preparation preserves a completed capture before independent
        # recovery-policy approval. Reading it is inventory only, never recovery
        # approval or pointer publication. Do not create another backup here.
        captures = [file for file in (root / 'release-state').glob('capture-*.json')
                    if re.fullmatch(r'capture-[a-f0-9]{32}\.json', file.name)
                    and file.is_file() and not file.is_symlink()]
        require(captures, 'PRIVATE_CAPTURE_REQUIRED')
        latest = max(captures, key=lambda file: (file.stat().st_mtime_ns, file.name))
        identifier = latest.stem[len('capture-'):]
    require(re.fullmatch(r'[a-f0-9]{32}', identifier), 'MANIFEST_ID_REQUIRED')
    manifest_file = root / 'release-state' / (('capture-' if inventory_capture else 'recovery-') + identifier + '.json')
    private_file(manifest_file)
    require(within(manifest_file.resolve(), root), 'MANIFEST_PATH_REFUSED')
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    require(manifest.get('version') == 1 and manifest.get('manifest_id') == identifier, 'MANIFEST_ID_MISMATCH')
    expected_eligibility = 'UNVERIFIED' if inventory_capture else 'EXACT_SCHEMA_AND_FINANCIAL_STATE'
    require(manifest.get('eligibility') == expected_eligibility, 'MANIFEST_ELIGIBILITY_MISMATCH')
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
    owner_name = name + '-owner'
    mounted_tool = str(workdir / '.lms-inventory.mjs')
    owner_arguments = ['docker', 'run', '--rm', '--name', owner_name, '--network', 'none', '--read-only',
        '--memory', '64m', '--cpus', '0.5', '--pids-limit', '32', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges', '--user', '0:0',
        '--mount', f'type=bind,src={snapshot},dst=/tmp/lms-snapshot.sqlite3,readonly',
        '--mount', f'type=bind,src={report},dst=/tmp/lms-private-report,readonly',
        '--entrypoint', 'node', observed['api']['id'], '-e', OWNER_SCRIPT]
    try:
        container_user = inventory_container_user(json.loads(runner(owner_arguments, timeout=30)))
    finally:
        try:
            runner(['docker', 'rm', '--force', owner_name])
        except Refused:
            pass
    arguments = ['docker', 'run', '--rm', '--name', name, '--network', 'none', '--read-only',
                 '--memory', '256m', '--cpus', '0.5', '--pids-limit', '64', '--cap-drop', 'ALL',
                 '--security-opt', 'no-new-privileges', '--user', container_user, '--workdir', str(workdir),
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
                    recoveryEligibility=manifest['eligibility'], inventoryOnly=True,
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
