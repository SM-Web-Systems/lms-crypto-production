#!/usr/bin/env python3
"""Pinned release/recovery orchestration. All recovery decisions fail closed.

Policies are separately reviewed exact transition declarations, not generated
approvals. No policy for historical production is shipped. A changed schema or
financial history prevents automatic old-image replacement. SQLite is never
restored, migrated or initialized here; failed recovery leaves services stopped.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys
import time
import uuid
from contextlib import contextmanager
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

# Wrappers use -I -S. Only this reviewed directory may supply sibling helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_preflight as pre

HASH = re.compile(r'[0-9a-f]{64}\Z')
MANIFEST_NAME = re.compile(r'recovery-[0-9a-f]{32}\.json\Z')
REVISION_LABEL = 'org.opencontainers.image.revision'
require = pre.require
ReleaseError = pre.ReleaseError


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode() + b'\n'


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def private_directory(path):
    path = pre._path(str(path))
    require(path.parent.is_dir(), 'STATE_PARENT_MISSING')
    path.mkdir(mode=0o700, exist_ok=True)
    require(path.is_dir() and not path.is_symlink(), 'STATE_DIRECTORY_INVALID')
    if os.name != 'nt':
        require(stat.S_IMODE(path.stat().st_mode) & 0o077 == 0, 'STATE_DIRECTORY_NOT_PRIVATE')
    return path


def sync_directory(path):
    if os.name != 'nt':
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(descriptor)
        finally: os.close(descriptor)


def immutable_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(canonical(value)); output.flush(); os.fsync(output.fileno())
    sync_directory(path.parent)


def read_private_json(path):
    path = pre._path(str(path))
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 1024 * 1024, 'METADATA_FILE_INVALID')
    if os.name != 'nt':
        require(stat.S_IMODE(path.stat().st_mode) & 0o077 == 0, 'METADATA_FILE_NOT_PRIVATE')
    try:
        value = json.loads(path.read_bytes())
    except (OSError, ValueError, UnicodeError):
        raise ReleaseError('METADATA_JSON_INVALID') from None
    require(isinstance(value, dict), 'METADATA_JSON_INVALID')
    return value


@contextmanager
def release_lock(state):
    """One OS-owned lock covers backup, image preservation and replacement."""
    handle = None
    try:
        state = private_directory(state)
        lock = state / 'release.lock'
        require(not lock.is_symlink(), 'LOCK_PATH_INVALID')
        descriptor = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
        handle = os.fdopen(descriptor, 'r+b')
        if os.name == 'nt':
            import msvcrt
            if lock.stat().st_size == 0: handle.write(b'0'); handle.flush()
            handle.seek(0)
            try: msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError: raise ReleaseError('RELEASE_LOCK_BUSY') from None
        else:
            import fcntl
            try: fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError: raise ReleaseError('RELEASE_LOCK_BUSY') from None
        yield
    except ReleaseError:
        raise
    except OSError:
        raise ReleaseError('RELEASE_STATE_IO_FAILED') from None
    finally:
        if handle is not None: handle.close()


def inspect_image(runner, target, reference):
    image = pre._one(runner.json('docker', ['image', 'inspect', reference], target['checkout']), 'RECOVERY_IMAGE_INVALID')
    require(isinstance(image.get('Id'), str) and bool(pre.IMAGE.fullmatch(image['Id'])), 'RECOVERY_IMAGE_ID_INVALID')
    return image


def verify_backup(target, backup):
    path = pre._path(backup.get('file'))
    require(path.is_file() and path.stat().st_size == backup.get('size_bytes') and
            pre.file_sha256(path) == backup.get('sha256'), 'RECOVERY_BACKUP_CHECKSUM_FAILED')
    evidence = read_private_json(backup.get('evidence_file'))
    require(evidence.get('version') == 1 and evidence.get('approved_sha') == target['approved_sha'] and
            evidence.get('database') == target['database'], 'RECOVERY_BACKUP_CONTEXT_MISMATCH')
    recorded = dict(backup); recorded.pop('evidence_file', None)
    require(evidence.get('backup') == recorded, 'RECOVERY_BACKUP_EVIDENCE_MISMATCH')
    with pre.readonly_database(path) as database:
        database.execute('BEGIN'); current = pre.database_metadata(database)
    for key in ('schema_sha256', 'financial_state_sha256', 'user_version', 'table_counts', 'foreign_key_violation_count', 'foreign_key_violations_sha256'):
        require(current[key] == backup.get(key), 'RECOVERY_BACKUP_CONTRACT_MISMATCH')


def verify_policy(target, backup, policy):
    require(isinstance(policy, dict) and policy.get('version') == 1, 'REVIEWED_COMPATIBILITY_POLICY_REQUIRED')
    reference = policy.get('review_reference')
    require(isinstance(reference, str) and 1 <= len(reference) <= 200 and '\n' not in reference and '\r' not in reference,
            'INDEPENDENT_REVIEW_REFERENCE_REQUIRED')
    source = target['services']['api']['revision']
    historical = (source is None and target['services']['web']['revision'] is None
                  and policy.get('historical_transition') is True)
    if not historical:
        require(isinstance(source, str) and bool(pre.SHA.fullmatch(source)) and
                target['services']['web']['revision'] == source, 'HISTORICAL_IMAGE_REVISION_UNKNOWN_OR_MIXED')
    for key, value in {'source_sha': source, 'target_sha': target['approved_sha'],
                       'project': target['project'], 'repository': target['repository'],
                       'database': target['database'], 'compose_sha256': target['compose_sha256'],
                       'schema_sha256': backup['schema_sha256'],
                       'financial_state_sha256': backup['financial_state_sha256'],
                       'foreign_key_violation_count': backup['foreign_key_violation_count'],
                       'foreign_key_violations_sha256': backup['foreign_key_violations_sha256'],
                       'images': {service: target['services'][service]['image_id'] for service in ('api', 'web')}}.items():
        require(policy.get(key) == value, 'COMPATIBILITY_POLICY_MISMATCH')
    for key in ('schema_sha256', 'financial_state_sha256', 'compose_sha256', 'foreign_key_violations_sha256'):
        require(isinstance(policy[key], str) and bool(HASH.fullmatch(policy[key])), 'COMPATIBILITY_HASH_INVALID')


def preserve_recovery(target, backup, state, runner, policy):
    """Caller owns release_lock; keep prior pointer on any incomplete capture.

    Verified tags and immutable evidence remain even if eligibility is unknown.
    Only a fully verified eligible manifest can replace the recovery pointer.
    """
    try:
        state = private_directory(state)
        verify_backup(target, backup)
        identifier = uuid.uuid4().hex
        images = {}
        for service in ('api', 'web'):
            previous = target['services'][service]
            image = inspect_image(runner, target, previous['image_id'])
            require(image['Id'] == previous['image_id'], 'RECOVERY_IMAGE_ID_MISMATCH')
            revision = (image.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL)
            require(revision == previous['revision'], 'RECOVERY_IMAGE_REVISION_CHANGED')
            tag = target['project'] + '-recovery-' + service + ':' + identifier
            runner.text('docker', ['image', 'tag', image['Id'], tag], target['checkout'])
            retained = inspect_image(runner, target, tag)
            require(retained['Id'] == image['Id'], 'RECOVERY_TAG_ID_MISMATCH')
            images[service] = {'image_id': image['Id'], 'tag': tag, 'revision': revision}
        manifest = {'version': 1, 'manifest_id': identifier, 'target': target,
                    'backup': backup, 'images': images, 'policy_sha256': digest(policy),
                    'eligibility': 'UNVERIFIED'}
        # Persist evidence even when no automatic replacement is eligible.
        evidence_file = state / ('capture-' + identifier + '.json')
        immutable_json(evidence_file, manifest)
        verify_policy(target, backup, policy)
        live = pre._source_metadata(Path(target['database']['host_path']))
        verify_database_contract(live, backup)
        manifest['eligibility'] = ('HISTORICAL_TRANSITION' if policy.get('historical_transition') is True
                                   else 'EXACT_SCHEMA_AND_FINANCIAL_STATE')
        filename = 'recovery-' + identifier + '.json'
        path = state / filename
        immutable_json(path, manifest)
        for service in ('api', 'web'):
            require(inspect_image(runner, target, images[service]['tag'])['Id'] == images[service]['image_id'], 'RECOVERY_TAG_ID_MISMATCH')
        pointer = {'version': 1, 'manifest': filename, 'sha256': pre.file_sha256(path)}
        temporary = state / ('pointer-' + uuid.uuid4().hex + '.json')
        immutable_json(temporary, pointer)
        try:
            os.replace(temporary, state / 'current-recovery.json'); sync_directory(state)
        finally:
            temporary.unlink(missing_ok=True)
        return dict(manifest, manifest_file=str(path))
    except ReleaseError:
        raise
    except (OSError, ValueError, TypeError, KeyError, sqlite3.Error):
        raise ReleaseError('RECOVERY_CAPTURE_FAILED') from None


def load_manifest(state):
    try:
        state = pre._path(str(state))
        pointer = read_private_json(state / 'current-recovery.json')
        filename = pointer.get('manifest')
        require(pointer.get('version') == 1 and isinstance(filename, str) and bool(MANIFEST_NAME.fullmatch(filename)), 'RECOVERY_POINTER_INVALID')
        path = state / filename
        require(pre.file_sha256(path) == pointer.get('sha256'), 'RECOVERY_MANIFEST_CHECKSUM_FAILED')
        manifest = read_private_json(path)
        require(manifest.get('version') == 1 and manifest.get('eligibility') == 'EXACT_SCHEMA_AND_FINANCIAL_STATE' and
                filename == 'recovery-' + manifest.get('manifest_id', '') + '.json', 'RECOVERY_MANIFEST_INVALID')
        return dict(manifest, manifest_file=str(path))
    except ReleaseError:
        raise
    except (OSError, ValueError, TypeError, KeyError):
        raise ReleaseError('RECOVERY_MANIFEST_UNAVAILABLE') from None


def verify_database_contract(metadata, baseline):
    require(metadata.get('schema_sha256') == baseline.get('schema_sha256') and
            metadata.get('user_version') == baseline.get('user_version'), 'DATABASE_SCHEMA_RECOVERY_INCOMPATIBLE')
    require(metadata.get('financial_state_sha256') == baseline.get('financial_state_sha256'), 'FINANCIAL_HISTORY_RECOVERY_INCOMPATIBLE')
    verify_foreign_key_evidence(metadata, baseline)


def verify_foreign_key_evidence(metadata, baseline):
    require(metadata.get('foreign_key_violation_count') == baseline.get('foreign_key_violation_count') and
            isinstance(baseline.get('foreign_key_violations_sha256'), str) and
            metadata.get('foreign_key_violations_sha256') == baseline['foreign_key_violations_sha256'], 'DATABASE_FOREIGN_KEYS_CHANGED')


def compose_args(target, overlay=None):
    args = ['compose', '--project-name', target['project'], '--project-directory', target['checkout'], '--file', target['compose_file']]
    if overlay: args += ['--file', str(overlay)]
    return args


def current_containers(target, runner, expect_images=None, require_running=True, allowed_configs=None,
                       validate_database_configuration=True):
    containers = {}
    for service in ('api', 'web'):
        name = target['services'][service]['container_name']
        container = pre._one(runner.json('docker', ['inspect', '--type', 'container', name], target['checkout']), 'RECOVERY_CONTAINER_INVALID')
        labels = container.get('Config', {}).get('Labels') or {}
        require(container.get('Name') == '/' + name and labels.get('com.docker.compose.project') == target['project'] and
                labels.get('com.docker.compose.service') == service and
                pre._same_path(labels.get('com.docker.compose.project.working_dir'), Path(target['checkout'])), 'RECOVERY_CONTAINER_CONTEXT_MISMATCH')
        require(labels.get('com.docker.compose.project.config_files') in (allowed_configs or {target['compose_file']}), 'RECOVERY_CONTAINER_OVERLAY_UNKNOWN')
        require(isinstance(container.get('Image'), str) and bool(pre.IMAGE.fullmatch(container['Image'])), 'RECOVERY_CURRENT_IMAGE_INVALID')
        if expect_images: require(container['Image'] == expect_images[service], 'RECOVERED_IMAGE_ID_MISMATCH')
        if require_running:
            require(container.get('State', {}).get('Running') is True, 'RECOVERED_CONTAINER_NOT_RUNNING')
            require(container.get('State', {}).get('Health', {}).get('Status') == 'healthy', 'RECOVERED_CONTAINER_UNHEALTHY')
        if service == 'api':
            if validate_database_configuration: pre.validate_runtime_database_configuration(container)
            pre.reject_nested_database_mounts(container.get('Mounts', []), 'Destination')
            mount = pre._one([entry for entry in container.get('Mounts', []) if entry.get('Destination') == '/app/data'], 'RECOVERY_DATABASE_MOUNT_INVALID')
            require(mount.get('Type') == 'volume' and mount.get('Name') == target['database']['volume_name'] and
                    mount.get('RW') is True and pre._same_path(mount.get('Source'), Path(target['database']['volume_source'])), 'RECOVERY_DATABASE_SOURCE_MISMATCH')
        containers[service] = container
    return containers


def controlled_stop(target, runner, allowed_configs=None):
    # A known candidate with wrong DB environment must still be containable.
    # All project/name/service/checkout/overlay/mount identity gates remain.
    known = current_containers(target, runner, require_running=False, allowed_configs=allowed_configs,
                               validate_database_configuration=False)
    identifiers = [known[service].get('Id') for service in ('api', 'web')]
    require(all(isinstance(value, str) and bool(re.fullmatch(r'[0-9a-f]{64}', value)) for value in identifiers)
            and len(set(identifiers)) == 2, 'RECOVERY_STOP_CONTAINER_IDS_INVALID')
    # Do not re-evaluate possibly changed Compose files to choose what to stop.
    runner.text('docker', ['container', 'stop', '--time', '30', *identifiers], target['checkout'])
    for identifier in identifiers:
        stopped = pre._one(runner.json('docker', ['inspect', '--type', 'container', identifier], target['checkout']), 'RECOVERY_STOP_INSPECT_INVALID')
        require(stopped.get('Id') == identifier and stopped.get('State', {}).get('Running') is False, 'RECOVERY_STOP_NOT_VERIFIED')


def verify_checkout_context(config, target, runner, allowed_configs=None):
    # Reuse all checkout/config/mount gates; API may be unhealthy after failure,
    # so inspect its identity separately instead of weakening validate_target.
    root = Path(target['checkout'])
    require(config.get('checkout') == target['checkout'] and config.get('repository') == target['repository'] and
            config.get('project') == target['project'] and config.get('approved_sha') == target['approved_sha'] and
            config.get('db_volume') == target['database']['volume_name'] and
            all(config.get(service + '_container') == target['services'][service]['container_name'] for service in ('api', 'web')),
            'RECOVERY_CONFIGURATION_CONTEXT_MISMATCH')
    git = lambda args: runner.text('git', ['--no-optional-locks', '-C', str(root), *args], root)
    require(pre._same_path(git(['rev-parse', '--show-toplevel']), root), 'RECOVERY_CHECKOUT_ROOT_CHANGED')
    require(git(['remote', 'get-url', 'origin']) in {'https://github.com/' + pre.REPOSITORY, 'https://github.com/' + pre.REPOSITORY + '.git',
                                                  'git@github.com:' + pre.REPOSITORY + '.git', 'ssh://git@github.com/' + pre.REPOSITORY + '.git'},
            'RECOVERY_REPOSITORY_ORIGIN_CHANGED')
    require(git(['rev-parse', 'HEAD']) == target['approved_sha'] and not git(['status', '--porcelain=v1', '--untracked-files=all']), 'RECOVERY_CHECKOUT_CHANGED')
    for relative in pre.REQUIRED_FILES:
        path = root / relative
        require(path.is_file() and pre._same_path(str(path), path), 'RECOVERY_RELEASE_FILE_INVALID')
        require(git(['hash-object', '--no-filters', '--', relative]) == git(['rev-parse', target['approved_sha'] + ':' + relative]), 'RECOVERY_RELEASE_BLOB_CHANGED')
    compose = runner.json('docker', [*compose_args(target), 'config', '--format', 'json'], root)
    require(hashlib.sha256(json.dumps(compose, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == target['compose_sha256'], 'RECOVERY_COMPOSE_CONFIGURATION_CHANGED')
    return current_containers(target, runner, require_running=False, allowed_configs=allowed_configs)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def get_http(url):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(Request(url, method='GET'), timeout=5) as response:
            return response.status, response.read(1024 * 1024 + 1)
    except HTTPError as error:
        try: return error.code, error.read(1024 * 1024 + 1)
        finally: error.close()
    except (OSError, URLError):
        raise ReleaseError('RECOVERY_HTTP_UNAVAILABLE') from None


def validate_base_url(value):
    require(isinstance(value, str), 'EXPLICIT_RELEASE_BASE_URL_REQUIRED')
    parsed = urlsplit(value)
    require(parsed.scheme == 'https' or (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost', '::1')), 'RELEASE_BASE_URL_UNSAFE')
    require(parsed.hostname and not parsed.username and not parsed.password and parsed.path in ('', '/') and
            not parsed.query and not parsed.fragment, 'RELEASE_BASE_URL_INVALID')
    return value.rstrip('/')


def verify_running(target, expected, revision, runner, base_url, http, timeout, overlay):
    deadline = time.monotonic() + timeout
    while True:
        try:
            current_containers(target, runner, expect_images=expected, allowed_configs={target['compose_file'] + ',' + str(overlay)})
            status, body = http(base_url + '/api/v1/health')
            require(status == 200 and len(body) <= 1024 * 1024, 'RECOVERY_API_HEALTH_FAILED')
            health = json.loads(body)
            require(health.get('status') == 'ok' and health.get('checks', {}).get('db', {}).get('status') == 'ok', 'RECOVERY_DATABASE_READINESS_FAILED')
            require(health.get('buildSha') == revision, 'RECOVERY_HEALTH_SHA_MISMATCH')
            require(http(base_url + '/api/v1/courses')[0] == 401, 'RECOVERY_API_AUTH_SMOKE_FAILED')
            front_status, front_body = http(base_url + '/')
            require(front_status == 200 and len(front_body) <= 1024 * 1024 and b'<html' in front_body.lower(), 'RECOVERY_FRONTEND_SMOKE_FAILED')
            return
        except (ReleaseError, ValueError, TypeError, KeyError, AttributeError):
            if time.monotonic() >= deadline: raise ReleaseError('RECOVERY_READINESS_VERIFICATION_FAILED') from None
            time.sleep(min(2, max(0, deadline - time.monotonic())))


def overlay_file(state, images, label):
    path = state / (label + '-' + uuid.uuid4().hex + '.json')
    immutable_json(path, {'services': {service: {'image': reference} for service, reference in images.items()}})
    return path


def stopped_database_metadata(path):
    """Read a clean self-contained WAL file only after a verified writer stop.

    SQLite removes WAL/SHM on a clean close while retaining WAL header mode.
    mode=ro alone would recreate sidecars. immutable=1 is safe ONLY for this
    stopped-writer, absent-sidecar case; active WAL always uses normal snapshots.
    """
    path = pre._path(str(path))
    sidecars = [Path(str(path) + suffix) for suffix in ('-wal', '-shm', '-journal')]
    if sidecars[0].exists() and sidecars[1].exists(): return pre._source_metadata(path)
    require(not any(sidecar.exists() for sidecar in sidecars), 'STOPPED_DATABASE_SIDECAR_STATE_UNKNOWN')
    require(path.is_file() and path.stat().st_size >= 4096, 'STOPPED_DATABASE_MISSING')
    before = pre.file_sha256(path)
    try:
        connection = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
        try:
            connection.execute('PRAGMA query_only=ON'); connection.execute('BEGIN')
            deadline = time.monotonic() + 60
            connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            result = pre.database_metadata(connection)
        finally: connection.close()
    except sqlite3.Error:
        raise ReleaseError('STOPPED_DATABASE_READ_FAILED') from None
    require(not any(sidecar.exists() for sidecar in sidecars) and pre.file_sha256(path) == before, 'STOPPED_DATABASE_CHANGED')
    return result


def recovery_runtime(state, manifest):
    target = manifest['target']
    allowed = {target['compose_file']}
    images = {service: {manifest['images'][service]['image_id']} for service in ('api', 'web')}
    candidate_path = state / ('candidate-' + manifest['manifest_id'] + '.json')
    if candidate_path.exists():
        candidate = read_private_json(candidate_path)
        require(candidate.get('manifest_sha256') == pre.file_sha256(Path(manifest['manifest_file'])), 'RECOVERY_CANDIDATE_CONTEXT_INVALID')
        overlay = pre._path(candidate.get('overlay_file'))
        require(overlay.parent == state and pre.file_sha256(overlay) == candidate.get('overlay_sha256'), 'RECOVERY_CANDIDATE_OVERLAY_INVALID')
        payload = read_private_json(overlay)
        for service in ('api', 'web'):
            image_id = candidate.get('images', {}).get(service)
            require(isinstance(image_id, str) and bool(pre.IMAGE.fullmatch(image_id)) and payload.get('services', {}).get(service, {}).get('image') == image_id,
                    'RECOVERY_CANDIDATE_IMAGE_INVALID')
            images[service].add(image_id)
        allowed.add(target['compose_file'] + ',' + str(overlay))
    rollback_overlay = state / ('rollback-' + manifest['manifest_id'] + '.json')
    payload = {'services': {service: {'image': manifest['images'][service]['tag']} for service in ('api', 'web')}}
    if rollback_overlay.exists():
        require(read_private_json(rollback_overlay) == payload, 'RECOVERY_OVERLAY_CHANGED')
        allowed.add(target['compose_file'] + ',' + str(rollback_overlay))
    return allowed, images, rollback_overlay, payload


def _rollback_locked(config, state, policy, runner, http, timeout):
    manifest = load_manifest(state)
    target = manifest['target']; backup = manifest['backup']
    allowed_configs, allowed_images, overlay, payload = recovery_runtime(state, manifest)
    containers = verify_checkout_context(config, target, runner, allowed_configs)
    for service in ('api', 'web'):
        require(containers[service]['Image'] in allowed_images[service], 'RECOVERY_CURRENT_IMAGE_UNKNOWN')
    verify_backup(target, backup)
    verify_policy(target, backup, policy)
    require(manifest.get('policy_sha256') == digest(policy), 'RECOVERY_POLICY_CHANGED')
    expected = {}
    for service in ('api', 'web'):
        retained = manifest['images'][service]
        image = inspect_image(runner, target, retained['tag'])
        require(image['Id'] == retained['image_id'] == target['services'][service]['image_id'] and
                (image.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL) == retained['revision'], 'RECOVERY_RETAINED_IMAGE_CHANGED')
        expected[service] = retained['image_id']
    base_url = validate_base_url(config.get('base_url'))
    # Stop the sole application writer and verify it is stopped BEFORE taking
    # the final schema/financial snapshot. Other DB writers are an owner NO-GO.
    controlled_stop(target, runner, allowed_configs)
    try:
        verify_database_contract(stopped_database_metadata(target['database']['host_path']), backup)
        if not overlay.exists(): immutable_json(overlay, payload)
        allowed_configs.add(target['compose_file'] + ',' + str(overlay))
        runner.text('docker', [*compose_args(target, overlay), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], target['checkout'])
        verify_running(target, expected, policy['source_sha'], runner, base_url, http, timeout, overlay)
        # Old startup code is not allowed to change the established contracts.
        # A real running API owns WAL/SHM. Fake interfaces may deliberately
        # leave a clean self-contained database unopened after simulated start.
        verify_database_contract(pre._source_metadata(Path(target['database']['host_path'])), backup)
        result = {'status': 'ROLLBACK_VERIFIED', 'recovered_sha': policy['source_sha'], 'manifest_id': manifest['manifest_id']}
        immutable_json(state / ('rollback-result-' + uuid.uuid4().hex + '.json'), result)
        return result
    except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
        controlled_stop(target, runner, allowed_configs)
        raise ReleaseError('ROLLBACK_FAILED_SERVICES_STOPPED') from None


def rollback(config, state, policy, runner=None, http=None, timeout=60):
    runner = runner or pre.CommandRunner(); http = http or get_http
    with release_lock(state):
        return _rollback_locked(config, Path(state), policy, runner, http, timeout)


def _prepare_locked(config, target, state, policy, runner):
    backup = pre.backup_database(target, config['backup_root'])
    return preserve_recovery(target, backup, state, runner, policy)


def prepare(config, runner=None, policy=None, dry_run=False):
    runner = runner or pre.CommandRunner()
    target = pre.validate_target(config, runner)
    if dry_run:
        return {'status': 'DRY_RUN_VALIDATED', 'requested_sha': target['approved_sha'], 'recovery_eligible': False}
    private_directory(Path(config['backup_root']))
    state = Path(config['backup_root']) / 'release-state'
    with release_lock(state):
        manifest = _prepare_locked(config, target, state, policy, runner)
        return {'status': 'RECOVERY_PREPARED_DEPLOYMENT_DISABLED', 'requested_sha': target['approved_sha'],
                'manifest_id': manifest['manifest_id'],
                'recovery_eligible': manifest['eligibility'] == 'EXACT_SCHEMA_AND_FINANCIAL_STATE'}


def deploy(config, runner=None, policy=None, execute=None, http=None, timeout=60):
    require(execute == '1', 'EXPLICIT_DEPLOY_EXECUTE_REQUIRED')
    runner = runner or pre.CommandRunner(); http = http or get_http
    base_url = validate_base_url(config.get('base_url'))
    target = pre.validate_target(config, runner)
    private_directory(Path(config['backup_root']))
    state = Path(config['backup_root']) / 'release-state'
    with release_lock(state):
        manifest = _prepare_locked(config, target, state, policy, runner)
        # Capture/backup can take time; never execute a changed Dockerfile or
        # desired environment merely because it matched before capture.
        before_build = verify_checkout_context(config, target, runner)
        require(all(before_build[service]['Image'] == target['services'][service]['image_id'] for service in ('api', 'web')), 'PRE_BUILD_CONTAINER_IMAGE_CHANGED')
        verify_database_contract(pre._source_metadata(Path(target['database']['host_path'])), manifest['backup'])
        runner.text('docker', [*compose_args(target), 'build', '--build-arg', 'BUILD_SHA=' + target['approved_sha'], 'api', 'web'],
                    target['checkout'], env=dict(os.environ, BUILD_SHA=target['approved_sha']), timeout=1800)
        built = {}
        for service in ('api', 'web'):
            image = inspect_image(runner, target, target['build_image_refs'][service])
            require((image.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL) == target['approved_sha'], 'BUILT_IMAGE_SHA_MISMATCH')
            built[service] = image['Id']
        # Build may be slow: revalidate the original context and baseline just
        # before any replacement; ongoing financial activity blocks this mode.
        containers = verify_checkout_context(config, target, runner)
        require(all(containers[service]['Image'] == target['services'][service]['image_id'] for service in ('api', 'web')), 'PRE_DEPLOY_CONTAINER_IMAGE_CHANGED')
        verify_database_contract(pre._source_metadata(Path(target['database']['host_path'])), manifest['backup'])
        overlay = None
        try:
            controlled_stop(target, runner)
            verify_database_contract(stopped_database_metadata(target['database']['host_path']), manifest['backup'])
            overlay = overlay_file(state, built, 'deploy')
            immutable_json(state / ('candidate-' + manifest['manifest_id'] + '.json'),
                           {'manifest_sha256': pre.file_sha256(Path(manifest['manifest_file'])), 'images': built,
                            'overlay_file': str(overlay), 'overlay_sha256': pre.file_sha256(overlay)})
            runner.text('docker', [*compose_args(target, overlay), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], target['checkout'])
            verify_running(target, built, target['approved_sha'], runner, base_url, http, timeout, overlay)
            post_deploy = pre._source_metadata(Path(target['database']['host_path']))
            verify_foreign_key_evidence(post_deploy, manifest['backup'])
            result = {'status': 'DEPLOYMENT_VERIFIED', 'requested_sha': config['approved_sha'], 'checked_out_sha': target['approved_sha'],
                      'built_sha': target['approved_sha'], 'health_sha': target['approved_sha'], 'deployed_sha': target['approved_sha'],
                      'images': built, 'manifest_id': manifest['manifest_id'],
                      'automatic_recovery_currently_eligible': manifest['eligibility'] == 'EXACT_SCHEMA_AND_FINANCIAL_STATE' and
                          all(post_deploy[key] == manifest['backup'][key]
                              for key in ('schema_sha256', 'financial_state_sha256', 'foreign_key_violations_sha256'))}
            immutable_json(state / ('deploy-result-' + uuid.uuid4().hex + '.json'), result)
            return result
        except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
            try:
                _rollback_locked(config, state, policy, runner, http, timeout)
            except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
                allowed = {target['compose_file']}
                if overlay is not None: allowed.add(target['compose_file'] + ',' + str(overlay))
                try:
                    controlled_stop(target, runner, allowed)
                except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
                    raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_REFUSED_CONTAINMENT_UNVERIFIED') from None
                raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_REFUSED_SERVICES_STOPPED') from None
            raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_VERIFIED') from None


def main():
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'rollback'), 'INVALID_RELEASE_ACTION')
        config = {key: os.environ.get(env) for key, env in pre.ENVIRONMENT.items()}
        config['base_url'] = os.environ.get('DEPLOY_BASE_URL')
        require(all(config.get(key) for key in pre.ENVIRONMENT), 'MISSING_REQUIRED_CONFIGURATION')
        require(config.get('checkout') and pre._same_path(config['checkout'], Path(__file__).resolve().parents[1]), 'ENTRYPOINT_CHECKOUT_MISMATCH')
        dry = os.environ.get('DEPLOY_DRY_RUN', '0'); execute = os.environ.get('DEPLOY_EXECUTE', '0')
        require(dry in ('0', '1') and execute in ('0', '1') and not (dry == execute == '1'), 'INVALID_RELEASE_MODE')
        policy_path = os.environ.get('DEPLOY_RECOVERY_POLICY')
        policy = read_private_json(policy_path) if policy_path else None
        if sys.argv[1] == 'rollback':
            require(execute == '1' and dry == '0', 'EXPLICIT_ROLLBACK_EXECUTE_REQUIRED')
            result = rollback(config, Path(config['backup_root']) / 'release-state', policy)
        elif execute == '1': result = deploy(config, policy=policy, execute=execute)
        else: result = prepare(config, policy=policy, dry_run=dry == '1')
        print(json.dumps(result, sort_keys=True))
        return 0
    except ReleaseError as error:
        print(json.dumps({'status': 'REFUSED', 'code': str(error)}), file=sys.stderr); return 2
    except (OSError, ValueError, TypeError, KeyError, AttributeError, sqlite3.Error):
        print(json.dumps({'status': 'REFUSED', 'code': 'INVALID_RELEASE_STATE'}), file=sys.stderr); return 2


if __name__ == '__main__': sys.exit(main())
