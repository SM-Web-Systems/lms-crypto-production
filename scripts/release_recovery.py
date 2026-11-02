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
ONE_SHOT_NOT_CONTAINED = 'ONE_SHOT_CONTAINER_NOT_CONTAINED'
WRITER_HOLD_SCRIPT = 'dist/scripts/writerHold.js'
MIGRATION_SCRIPT = 'dist/scripts/migrateRewardTxnCheck.js'
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
                       'financial_state_sha256': backup['financial_state_sha256'],
                       'foreign_key_violation_count': backup['foreign_key_violation_count'],
                       'foreign_key_violations_sha256': backup['foreign_key_violations_sha256'],
                       'images': {service: target['services'][service]['image_id'] for service in ('api', 'web')}}.items():
        require(policy.get(key) == value, 'COMPATIBILITY_POLICY_MISMATCH')
    # A migrating release has two reviewed schemas; the recovery contract
    # still compares the live database against this exact backup.
    migration = policy.get('migration')
    if migration is not None:
        require(isinstance(migration, dict) and set(migration) == {'pre_schema_sha256'} and
                isinstance(migration['pre_schema_sha256'], str) and bool(HASH.fullmatch(migration['pre_schema_sha256'])), 'MIGRATION_POLICY_INVALID')
    require(backup['schema_sha256'] in (policy.get('schema_sha256'), (migration or {}).get('pre_schema_sha256')), 'COMPATIBILITY_POLICY_MISMATCH')
    for key in ('schema_sha256', 'financial_state_sha256', 'compose_sha256', 'foreign_key_violations_sha256'):
        require(isinstance(policy[key], str) and bool(HASH.fullmatch(policy[key])), 'COMPATIBILITY_HASH_INVALID')


def reviewed_images(target, policy, runner):
    """The exact image IDs the independent review and rehearsal covered.

    A revision label or a tag is not image identity: only these IDs may start.
    """
    reviewed = policy.get('candidate_images') if isinstance(policy, dict) else None
    require(isinstance(reviewed, dict) and set(reviewed) == {'api', 'web'} and
            all(isinstance(value, str) and bool(pre.IMAGE.fullmatch(value)) for value in reviewed.values()), 'REVIEWED_IMAGE_BINDING_REQUIRED')
    require(policy.get('target_sha') == target['approved_sha'], 'REVIEWED_IMAGE_TARGET_MISMATCH')
    for service in ('api', 'web'):
        image = inspect_image(runner, target, reviewed[service])
        require(image['Id'] == reviewed[service], 'REVIEWED_IMAGE_ID_MISMATCH')
        require((image.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL) == target['approved_sha'], 'REVIEWED_IMAGE_REVISION_MISMATCH')
    return dict(reviewed)


def publish_recovery_pointer(state, path):
    pointer = {'version': 1, 'manifest': path.name, 'sha256': pre.file_sha256(path)}
    temporary = state / ('pointer-' + uuid.uuid4().hex + '.json')
    immutable_json(temporary, pointer)
    try:
        os.replace(temporary, state / 'current-recovery.json'); sync_directory(state)
    finally:
        temporary.unlink(missing_ok=True)


def preserve_recovery(target, backup, state, runner, policy, read_database=None, publish=True):
    """Caller owns release_lock; keep prior pointer on any incomplete capture.

    Verified tags and immutable evidence remain even if eligibility is unknown.
    Only a fully verified eligible manifest can replace the recovery pointer.
    A deploy publishes only at its stop, because the pointer also proves the
    source's overlay: moving it earlier would fail the next validate_target.
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
        live = (read_database or pre._source_metadata)(Path(target['database']['host_path']))
        verify_database_contract(live, backup)
        manifest['eligibility'] = ('HISTORICAL_TRANSITION' if policy.get('historical_transition') is True
                                   else 'EXACT_SCHEMA_AND_FINANCIAL_STATE')
        filename = 'recovery-' + identifier + '.json'
        path = state / filename
        immutable_json(path, manifest)
        for service in ('api', 'web'):
            require(inspect_image(runner, target, images[service]['tag'])['Id'] == images[service]['image_id'], 'RECOVERY_TAG_ID_MISMATCH')
        if publish: publish_recovery_pointer(state, path)
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


def verify_protected_content(metadata, baseline):
    # Only valid across the held window; open service changes rows constantly.
    require(isinstance(baseline.get('protected_content_sha256'), str) and
            metadata.get('protected_content_sha256') == baseline['protected_content_sha256'], 'PROTECTED_CONTENT_CHANGED')


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


def verify_running(target, expected, revision, runner, base_url, http, timeout, overlay, writer_hold=None):
    deadline = time.monotonic() + timeout
    while True:
        try:
            current_containers(target, runner, expect_images=expected, allowed_configs={target['compose_file'] + ',' + str(overlay)})
            status, body = http(base_url + '/api/v1/health')
            require(status == 200 and len(body) <= 1024 * 1024, 'RECOVERY_API_HEALTH_FAILED')
            health = json.loads(body)
            require(health.get('status') == 'ok' and health.get('checks', {}).get('db', {}).get('status') == 'ok', 'RECOVERY_DATABASE_READINESS_FAILED')
            require(health.get('buildSha') == revision, 'RECOVERY_HEALTH_SHA_MISMATCH')
            if writer_hold is not None:
                require(health.get('writerHold', {}).get('active') is writer_hold, 'WRITER_HOLD_STATE_MISMATCH')
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
    """Metadata of a database only after a verified writer stop."""
    path = pre._path(str(path))
    if Path(str(path) + '-wal').exists() and Path(str(path) + '-shm').exists(): return pre._source_metadata(path)
    before = pre.file_sha256(path) if path.is_file() else None
    with pre.stopped_readonly_database(path) as connection:
        connection.execute('BEGIN')
        result = pre.database_metadata(connection)
    require(pre.file_sha256(path) == before, 'STOPPED_DATABASE_CHANGED')
    return result


def one_shot(target, image_id, script, arguments, runner, timeout=300):
    """Run a reviewed script from the reviewed API image while services are stopped.

    A client timeout leaves the container running, so a failed run is not over
    until that container is confirmed gone.
    """
    name = target['project'] + '-oneshot-' + uuid.uuid4().hex
    try:
        return runner.text('docker', ['run', '--rm', '--name', name, '--network', 'none', '--read-only', '--tmpfs', '/tmp',
                                      '--mount', 'type=volume,src=' + target['database']['volume_name'] + ',dst=/app/data',
                                      '--entrypoint', 'node', image_id, script, *arguments],
                           target['checkout'], timeout=timeout)
    except ReleaseError:
        try:
            runner.text('docker', ['rm', '-f', name], target['checkout'])
        except ReleaseError:
            pass  # Already gone is normal with --rm; the check below decides.
        try:
            remaining = runner.text('docker', ['ps', '--all', '--quiet', '--filter', 'name=^/' + name + '$'], target['checkout'])
        except ReleaseError:
            remaining = 'unknown'
        require(not remaining, ONE_SHOT_NOT_CONTAINED)
        raise


def migrate_while_stopped(target, state, policy, images, runner, before):
    """Back up, migrate and verify. Returns the recovery manifest for the new schema."""
    window_backup = pre.backup_stopped_database(target, str(state.parent))
    verify_backup(target, window_backup)
    one_shot(target, images['api'], MIGRATION_SCRIPT,
             ['--apply', target['database']['container_path'],
              '--fk-count', str(policy['foreign_key_violation_count']),
              '--fk-sha256', policy['foreign_key_violations_sha256']], runner)
    migrated = stopped_database_metadata(target['database']['host_path'])
    require(migrated['schema_sha256'] == policy['schema_sha256'], 'POST_MIGRATION_SCHEMA_MISMATCH')
    require(migrated['financial_state_sha256'] == before['financial_state_sha256'], 'FINANCIAL_HISTORY_RECOVERY_INCOMPATIBLE')
    verify_foreign_key_evidence(migrated, before)
    verify_protected_content(migrated, before)
    backup = pre.backup_stopped_database(target, str(state.parent))
    manifest = preserve_recovery(target, backup, state, runner, policy, read_database=stopped_database_metadata)
    return manifest, window_backup, migrated


def source_configs(target):
    # validate_target proved any overlay in the source's own label.
    return {target['compose_file'], target.get('source_config_files') or target['compose_file']}


def recovery_runtime(state, manifest):
    target = manifest['target']
    allowed = source_configs(target)
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
    # Once writers were released (or may have been) candidate writes can exist
    # that the schema and financial contract cannot see.
    require(not (state / ('released-' + manifest['manifest_id'] + '.json')).exists(), 'ROLLBACK_REFUSED_WRITERS_RELEASED')
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
        runner.text('docker', [*compose_args(target, overlay), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], target['checkout'], timeout=300)
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
    # Evidence only: publishing here would stop proving the running source's overlay.
    backup = pre.backup_database(target, config['backup_root'])
    return preserve_recovery(target, backup, state, runner, policy, publish=False)


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


def _database_unchanged(target, before):
    try:
        current = stopped_database_metadata(target['database']['host_path'])
        verify_database_contract(current, before)
        verify_protected_content(current, before)
        return True
    except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
        return False


def build(config, runner=None):
    """Build candidate images for review and rehearsal. Deployment never builds."""
    runner = runner or pre.CommandRunner()
    target = pre.validate_target(config, runner)
    runner.text('docker', [*compose_args(target), 'build', '--build-arg', 'BUILD_SHA=' + target['approved_sha'], 'api', 'web'],
                target['checkout'], env=dict(os.environ, BUILD_SHA=target['approved_sha']), timeout=1800)
    images = {}
    for service in ('api', 'web'):
        image = inspect_image(runner, target, target['build_image_refs'][service])
        require((image.get('Config', {}).get('Labels') or {}).get(REVISION_LABEL) == target['approved_sha'], 'BUILT_IMAGE_SHA_MISMATCH')
        # Keeps the exact ID available after a later build moves :latest.
        tag = target['project'] + '-' + service + ':candidate-' + target['approved_sha']
        runner.text('docker', ['image', 'tag', image['Id'], tag], target['checkout'])
        images[service] = image['Id']
    return {'status': 'CANDIDATE_IMAGES_BUILT', 'approved_sha': target['approved_sha'], 'images': images}


def released_already(target, images, runner, base_url, http, overlay):
    try:
        verify_running(target, images, target['approved_sha'], runner, base_url, http, 0, overlay, writer_hold=False)
        return True
    except ReleaseError:
        return False


def finish_release(state, target, images, manifest):
    result = {'status': 'WRITERS_RELEASED', 'deployed_sha': target['approved_sha'], 'images': images, 'manifest_id': manifest['manifest_id']}
    immutable_json(state / ('release-hold-result-' + uuid.uuid4().hex + '.json'), result)
    return result


def release_hold(config, runner=None, policy=None, execute=None, http=None, timeout=60):
    """Resume writers on the verified held candidate. Nothing is released on doubt."""
    require(execute == '1', 'EXPLICIT_RELEASE_HOLD_EXECUTE_REQUIRED')
    runner = runner or pre.CommandRunner(); http = http or get_http
    base_url = validate_base_url(config.get('base_url'))
    state = Path(config['backup_root']) / 'release-state'
    with release_lock(state):
        manifest = load_manifest(state); target = manifest['target']
        # Written only after deploy fully verified the held candidate.
        held = read_private_json(state / ('held-' + manifest['manifest_id'] + '.json'))
        candidate = read_private_json(state / ('candidate-' + manifest['manifest_id'] + '.json'))
        require(candidate.get('manifest_sha256') == pre.file_sha256(Path(manifest['manifest_file'])), 'RECOVERY_CANDIDATE_CONTEXT_INVALID')
        images = candidate.get('images')
        verify_policy(target, manifest['backup'], policy)
        require(manifest.get('policy_sha256') == digest(policy) and policy.get('candidate_images') == images, 'RECOVERY_POLICY_CHANGED')
        overlay = pre._path(candidate.get('overlay_file'))
        marker = state / ('released-' + manifest['manifest_id'] + '.json')
        if marker.exists() and released_already(target, images, runner, base_url, http, overlay):
            return finish_release(state, target, images, manifest)
        verify_running(target, images, target['approved_sha'], runner, base_url, http, timeout, overlay, writer_hold=True)
        containers = verify_checkout_context(config, target, runner, {target['compose_file'] + ',' + str(overlay)})
        current = pre._source_metadata(Path(target['database']['host_path']))
        verify_database_contract(current, manifest['backup'])
        verify_protected_content(current, held)
        # Before the release, so a lost exec can never leave rollback eligible.
        if not marker.exists(): immutable_json(marker, {'manifest_id': manifest['manifest_id']})
        try:
            runner.text('docker', ['exec', containers['api']['Id'], 'node', WRITER_HOLD_SCRIPT, 'release'], target['checkout'])
            verify_running(target, images, target['approved_sha'], runner, base_url, http, timeout, overlay, writer_hold=False)
        except (ReleaseError, OSError, ValueError, TypeError, KeyError):
            raise ReleaseError('WRITER_RELEASE_UNCONFIRMED') from None
        return finish_release(state, target, images, manifest)


def deploy(config, runner=None, policy=None, execute=None, http=None, timeout=60):
    require(execute == '1', 'EXPLICIT_DEPLOY_EXECUTE_REQUIRED')
    runner = runner or pre.CommandRunner(); http = http or get_http
    base_url = validate_base_url(config.get('base_url'))
    target = pre.validate_target(config, runner)
    reviewed_images(target, policy, runner)
    private_directory(Path(config['backup_root']))
    state = Path(config['backup_root']) / 'release-state'
    with release_lock(state):
        manifest = _prepare_locked(config, target, state, policy, runner)
        # Capture/backup can take time: revalidate the original context, the
        # reviewed image IDs and baseline just before any replacement; ongoing
        # financial activity blocks this mode.
        built = reviewed_images(target, policy, runner)
        containers = verify_checkout_context(config, target, runner, source_configs(target))
        require(all(containers[service]['Image'] == target['services'][service]['image_id'] for service in ('api', 'web')), 'PRE_DEPLOY_CONTAINER_IMAGE_CHANGED')
        verify_database_contract(pre._source_metadata(Path(target['database']['host_path'])), manifest['backup'])
        publish_recovery_pointer(state, Path(manifest['manifest_file']))
        overlay = None
        migration_started = False; window_backup = None; before = None
        try:
            # Stopping the old image is the hold for everything it runs: requests,
            # callbacks and workers. It cannot be held any other way.
            controlled_stop(target, runner, source_configs(target))
            before = stopped_database_metadata(target['database']['host_path'])
            verify_database_contract(before, manifest['backup'])
            held_state = before
            if policy.get('migration') is not None:
                migration_started = True
                manifest, window_backup, held_state = migrate_while_stopped(target, state, policy, built, runner, before)
                migration_started = False
            # Before candidate start, so no startup or scheduled worker can run unheld.
            one_shot(target, built['api'], WRITER_HOLD_SCRIPT, ['hold'], runner, timeout=60)
            overlay = overlay_file(state, built, 'deploy')
            immutable_json(state / ('candidate-' + manifest['manifest_id'] + '.json'),
                           {'manifest_sha256': pre.file_sha256(Path(manifest['manifest_file'])), 'images': built,
                            'overlay_file': str(overlay), 'overlay_sha256': pre.file_sha256(overlay)})
            runner.text('docker', [*compose_args(target, overlay), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api', 'web'], target['checkout'], timeout=300)
            verify_running(target, built, target['approved_sha'], runner, base_url, http, timeout, overlay, writer_hold=True)
            post_deploy = pre._source_metadata(Path(target['database']['host_path']))
            verify_database_contract(post_deploy, manifest['backup'])
            verify_protected_content(post_deploy, held_state)
            result = {'status': 'DEPLOYMENT_VERIFIED_WRITERS_HELD', 'requested_sha': config['approved_sha'], 'checked_out_sha': target['approved_sha'],
                      'built_sha': target['approved_sha'], 'health_sha': target['approved_sha'], 'deployed_sha': target['approved_sha'],
                      'images': built, 'manifest_id': manifest['manifest_id'],
                      'pre_migration_backup': window_backup['file'] if window_backup else None,
                      'automatic_recovery_currently_eligible': manifest['eligibility'] == 'EXACT_SCHEMA_AND_FINANCIAL_STATE' and
                          all(post_deploy[key] == manifest['backup'][key]
                              for key in ('schema_sha256', 'financial_state_sha256', 'foreign_key_violations_sha256'))}
            immutable_json(state / ('held-' + manifest['manifest_id'] + '.json'),
                           {'protected_content_sha256': post_deploy['protected_content_sha256']})
            immutable_json(state / ('deploy-result-' + uuid.uuid4().hex + '.json'), result)
            return result
        except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error) as error:
            # A migration that may have changed anything needs an owner decision;
            # only an exactly unchanged database may go back to the old service.
            if migration_started and (str(error) == ONE_SHOT_NOT_CONTAINED or not _database_unchanged(target, before)):
                raise ReleaseError('DEPLOYMENT_HALTED_AFTER_MIGRATION_SERVICES_STOPPED') from None
            try:
                _rollback_locked(config, state, policy, runner, http, timeout)
            except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
                allowed = source_configs(target)
                if overlay is not None: allowed.add(target['compose_file'] + ',' + str(overlay))
                try:
                    controlled_stop(target, runner, allowed)
                except (ReleaseError, OSError, ValueError, TypeError, KeyError, sqlite3.Error):
                    raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_REFUSED_CONTAINMENT_UNVERIFIED') from None
                raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_REFUSED_SERVICES_STOPPED') from None
            raise ReleaseError('DEPLOYMENT_FAILED_RECOVERY_VERIFIED') from None


def main():
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'rollback', 'build', 'release-hold'), 'INVALID_RELEASE_ACTION')
        config = {key: os.environ.get(env) for key, env in pre.ENVIRONMENT.items()}
        config['base_url'] = os.environ.get('DEPLOY_BASE_URL')
        require(all(config.get(key) for key in pre.ENVIRONMENT), 'MISSING_REQUIRED_CONFIGURATION')
        require(config.get('checkout') and pre._same_path(config['checkout'], Path(__file__).resolve().parents[1]), 'ENTRYPOINT_CHECKOUT_MISMATCH')
        dry = os.environ.get('DEPLOY_DRY_RUN', '0'); execute = os.environ.get('DEPLOY_EXECUTE', '0')
        require(dry in ('0', '1') and execute in ('0', '1') and not (dry == execute == '1'), 'INVALID_RELEASE_MODE')
        policy_path = os.environ.get('DEPLOY_RECOVERY_POLICY')
        policy = read_private_json(policy_path) if policy_path else None
        if sys.argv[1] == 'build':
            require(dry == '0' and execute == '0', 'INVALID_RELEASE_MODE')
            result = build(config)
        elif sys.argv[1] == 'release-hold':
            require(execute == '1' and dry == '0', 'EXPLICIT_RELEASE_HOLD_EXECUTE_REQUIRED')
            result = release_hold(config, policy=policy, execute=execute)
        elif sys.argv[1] == 'rollback':
            require(execute == '1' and dry == '0', 'EXPLICIT_ROLLBACK_EXECUTE_REQUIRED')
            result = rollback(config, Path(config['backup_root']) / 'release-state', policy)
        elif execute == '1': result = deploy(config, policy=policy, execute=execute)
        else: result = prepare(config, policy=policy, dry_run=dry == '1')
        print(json.dumps(result, sort_keys=True))
        return 0
    except ReleaseError as error:
        status = str(error) if str(error) == 'WRITER_RELEASE_UNCONFIRMED' else 'REFUSED'
        print(json.dumps({'status': status, 'code': str(error)}), file=sys.stderr); return 2
    except (OSError, ValueError, TypeError, KeyError, AttributeError, sqlite3.Error):
        print(json.dumps({'status': 'REFUSED', 'code': 'INVALID_RELEASE_STATE'}), file=sys.stderr); return 2


if __name__ == '__main__': sys.exit(main())
