#!/usr/bin/env python3
"""Fail-closed release preparation; no container replacement or DB restoration.

Subprocess output and SQLite errors remain private. Only reviewed aggregate
metadata crosses the public boundary. Commands never use shell evaluation.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import time
import uuid
from contextlib import closing, contextmanager

REPOSITORY = 'SM-Web-Systems/lms-crypto-production'
REQUIRED_TABLES = ('users', 'courses', 'nft_credentials', 'payments', 'webhook_events',
                   'roles', 'permissions', 'role_permissions', 'user_roles')
SHA = re.compile(r'[0-9a-f]{40}\Z')
IMAGE = re.compile(r'sha256:[0-9a-f]{64}\Z')
NAME = re.compile(r'[a-z0-9][a-z0-9_.-]*\Z')
ENVIRONMENT = {'checkout': 'DEPLOY_DIR', 'repository': 'DEPLOY_REPOSITORY',
               'approved_sha': 'DEPLOY_SHA', 'project': 'DEPLOY_PROJECT',
               'api_container': 'DEPLOY_API_CONTAINER', 'web_container': 'DEPLOY_WEB_CONTAINER',
               'db_volume': 'DEPLOY_DB_VOLUME', 'backup_root': 'DEPLOY_BACKUP_DIR'}
REQUIRED_FILES = ('docker-compose.yml', 'scripts/deploy.sh', 'scripts/release_preflight.py',
                  'LMS-Server/Dockerfile', 'LMS-Frontend/Dockerfile')


class ReleaseError(Exception):
    """Safe gate code: do not include subprocess/configuration/customer data."""


def require(condition, code):
    if not condition:
        raise ReleaseError(code)


class CommandRunner:
    def __init__(self, git=None, docker=None):
        self.git = git or ['git']
        self.docker = docker or ['docker']

    def text(self, tool, args, cwd):
        command = self.git if tool == 'git' else self.docker
        try:
            result = subprocess.run([*command, *args], cwd=cwd, capture_output=True,
                                    text=True, timeout=45, check=False)
        except (OSError, subprocess.SubprocessError):
            raise ReleaseError('COMMAND_UNAVAILABLE') from None
        require(result.returncode == 0, 'COMMAND_FAILED')
        return result.stdout.strip()

    def json(self, tool, args, cwd):
        try:
            return json.loads(self.text(tool, args, cwd))
        except (ValueError, TypeError):
            raise ReleaseError('INVALID_COMMAND_JSON') from None


def run_json(argv, cwd):
    """Compatibility interface for recovery: parsed output is never printed."""
    require(isinstance(argv, list) and argv, 'INVALID_COMMAND')
    return CommandRunner(docker=[argv[0]]).json('docker', argv[1:], cwd)


def _path(value, code='INVALID_PATH'):
    require(isinstance(value, str) and bool(value) and '\n' not in value and '\r' not in value, code)
    path = Path(value)
    require(path.is_absolute(), code)
    require(path.absolute() == path.resolve(), code)
    return path.resolve()


def _same_path(value, expected):
    try:
        return _path(value) == expected
    except ReleaseError:
        return False


def _one(value, code):
    require(isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict), code)
    return value[0]


def _is_within(path, parent):
    return path == parent or parent in path.parents


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


@contextmanager
def readonly_database(path):
    """Refuse absent WAL sidecars, because SQLite mode=ro can create them.

    immutable=1 is deliberately avoided: it would ignore committed WAL rows.
    """
    path = Path(path)
    try:
        require(path.is_file() and not path.is_symlink() and path.stat().st_size >= 4096,
                'SOURCE_DATABASE_MISSING_OR_TOO_SMALL')
        with path.open('rb') as source:
            header = source.read(100)
        require(header[:16] == b'SQLite format 3\x00', 'SOURCE_DATABASE_INVALID')
        if header[18:20] == b'\x02\x02':
            for suffix in ('-wal', '-shm'):
                sidecar = Path(str(path) + suffix)
                require(sidecar.is_file() and not sidecar.is_symlink(), 'WAL_SIDECARS_REQUIRED')
                with sidecar.open('rb'):
                    pass
        db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=3)
        try:
            db.execute('PRAGMA query_only=ON')
            deadline = time.monotonic() + 60
            db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            yield db
        finally:
            db.close()
    except ReleaseError:
        raise
    except (OSError, sqlite3.Error):
        raise ReleaseError('DATABASE_READ_FAILED') from None


def _cell(value):
    return {'blob_sha256': hashlib.sha256(value).hexdigest()} if isinstance(value, bytes) else value


def database_metadata(db):
    # Caller holds one source read transaction or owns a completed backup.
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'DATABASE_INTEGRITY_FAILED')
    schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    tables = {row[1] for row in schema if row[0] == 'table'}
    require(set(REQUIRED_TABLES) <= tables, 'DATABASE_REQUIRED_TABLE_MISSING')
    user_version = db.execute('PRAGMA user_version').fetchone()[0]
    counts = {table: db.execute('SELECT COUNT(*) FROM "' + table + '"').fetchone()[0]
              for table in REQUIRED_TABLES}
    financial = hashlib.sha256()
    for table in ('payments', 'webhook_events'):
        columns = [row[1] for row in db.execute('PRAGMA table_info("' + table + '")')]
        quoted = ','.join('"' + column.replace('"', '""') + '"' for column in columns)
        financial.update(json.dumps([table, columns], separators=(',', ':')).encode())
        for row in db.execute('SELECT * FROM "' + table + '" ORDER BY ' + quoted):
            financial.update(json.dumps([_cell(value) for value in row], separators=(',', ':'), ensure_ascii=True).encode())
            financial.update(b'\n')
    return {'schema_sha256': hashlib.sha256(json.dumps([schema, user_version], separators=(',', ':')).encode()).hexdigest(),
            'user_version': user_version, 'table_counts': counts,
            'financial_state_sha256': financial.hexdigest(),
            'foreign_key_violation_count': sum(1 for _ in db.execute('PRAGMA foreign_key_check'))}


def _source_metadata(path):
    with readonly_database(path) as db:
        db.execute('BEGIN')
        result = database_metadata(db)
    return dict(result, size_bytes=path.stat().st_size)


def validate_target(config, runner=None):
    runner = runner or CommandRunner()
    require(all(config.get(key) for key in ENVIRONMENT), 'MISSING_REQUIRED_CONFIGURATION')
    require(config['repository'] == REPOSITORY, 'REPOSITORY_NOT_APPROVED')
    require(bool(SHA.fullmatch(config['approved_sha'])), 'FULL_APPROVED_SHA_REQUIRED')
    for key in ('project', 'api_container', 'web_container', 'db_volume'):
        require(bool(NAME.fullmatch(config[key])), 'INVALID_TARGET_NAME')
    root = _path(config['checkout']); require(root.is_dir(), 'CHECKOUT_MISSING')
    backup_root = _path(config['backup_root'])
    require(not _is_within(backup_root, root), 'BACKUP_LOCATION_INSIDE_CHECKOUT')
    for relative in REQUIRED_FILES:
        file = root / relative
        require(file.is_file() and _same_path(str(file), file), 'REQUIRED_RELEASE_FILE_MISSING_OR_LINKED')
    # git status normally refreshes the index; disable optional locks/writes.
    git = lambda args: runner.text('git', ['--no-optional-locks', '-C', str(root), *args], root)
    require(_same_path(git(['rev-parse', '--show-toplevel']), root), 'CHECKOUT_ROOT_MISMATCH')
    require(git(['rev-parse', 'HEAD']) == config['approved_sha'], 'APPROVED_SHA_MISMATCH')
    require(not git(['status', '--porcelain=v1', '--untracked-files=all']), 'CHECKOUT_DIRTY')
    remote = git(['remote', 'get-url', 'origin'])
    require(remote in {'https://github.com/' + REPOSITORY, 'https://github.com/' + REPOSITORY + '.git',
                       'git@github.com:' + REPOSITORY + '.git', 'ssh://git@github.com/' + REPOSITORY + '.git'},
            'REMOTE_REPOSITORY_MISMATCH')
    for relative in REQUIRED_FILES:
        require(git(['hash-object', '--no-filters', '--', relative])
                == git(['rev-parse', config['approved_sha'] + ':' + relative]), 'RELEASE_FILE_BLOB_MISMATCH')
    compose_file = root / 'docker-compose.yml'
    compose_args = ['compose', '--project-name', config['project'], '--project-directory', str(root), '--file', str(compose_file)]
    compose = runner.json('docker', [*compose_args, 'config', '--format', 'json'], root)
    require(isinstance(compose, dict) and compose.get('name') == config['project'], 'COMPOSE_PROJECT_MISMATCH')
    desired_api = compose.get('services', {}).get('api', {})
    desired_env = desired_api.get('environment') or {}
    require(isinstance(desired_env, dict), 'COMPOSE_API_ENVIRONMENT_INVALID')
    require(not desired_env.get('VITEST'), 'COMPOSE_TEST_DATABASE_FORBIDDEN')
    require(desired_env.get('DATABASE_PATH') in (None, './data/student_ms.db', '/app/data/student_ms.db'),
            'COMPOSE_DATABASE_PATH_MISMATCH')
    require(desired_api.get('working_dir') in (None, '/app'), 'COMPOSE_API_WORKDIR_MISMATCH')
    services = {}; raw_api = None
    for service in ('api', 'web'):
        name = config[service + '_container']
        declared = compose.get('services', {}).get(service, {})
        require(declared.get('container_name') == name, 'COMPOSE_CONTAINER_MISMATCH')
        container = _one(runner.json('docker', ['inspect', '--type', 'container', name], root), 'CONTAINER_INSPECT_INVALID')
        labels = container.get('Config', {}).get('Labels') or {}
        require(container.get('Name') == '/' + name and container.get('State', {}).get('Running') is True, 'CONTAINER_NOT_RUNNING_OR_WRONG_NAME')
        require(labels.get('com.docker.compose.project') == config['project'] and labels.get('com.docker.compose.service') == service,
                'CONTAINER_COMPOSE_IDENTITY_MISMATCH')
        require(_same_path(labels.get('com.docker.compose.project.working_dir'), root)
                and _same_path(labels.get('com.docker.compose.project.config_files'), compose_file), 'CONTAINER_CHECKOUT_MISMATCH')
        container_id = container.get('Id', '')
        require(bool(re.fullmatch(r'[0-9a-f]{64}', container_id)), 'CONTAINER_ID_INVALID')
        require(runner.text('docker', [*compose_args, 'ps', '--quiet', service], root) == container_id, 'COMPOSE_CONTAINER_ID_MISMATCH')
        image_id = container.get('Image', '')
        require(bool(IMAGE.fullmatch(image_id)), 'IMAGE_ID_INVALID')
        image = _one(runner.json('docker', ['image', 'inspect', image_id], root), 'IMAGE_INSPECT_INVALID')
        require(image.get('Id') == image_id, 'IMAGE_ID_MISMATCH')
        revision = (image.get('Config', {}).get('Labels') or {}).get('org.opencontainers.image.revision')
        require(revision is None or bool(SHA.fullmatch(revision)), 'IMAGE_REVISION_INVALID')
        services[service] = {'container_id': container_id, 'container_name': name, 'image_id': image_id, 'revision': revision}
        if service == 'api': raw_api = container
    require(raw_api['Config'].get('WorkingDir') == '/app', 'API_WORKDIR_MISMATCH')
    environment = raw_api['Config'].get('Env') or []
    require(not any(value.startswith('VITEST=') and value != 'VITEST=' for value in environment), 'RUNNING_TEST_DATABASE_FORBIDDEN')
    database_paths = [value.split('=', 1)[1] for value in environment if value.startswith('DATABASE_PATH=')]
    require(len(database_paths) <= 1 and (not database_paths or database_paths[0] in ('./data/student_ms.db', '/app/data/student_ms.db')),
            'DATABASE_CONTAINER_PATH_MISMATCH')
    declared_mounts = [mount for mount in compose['services']['api'].get('volumes', []) if mount.get('target') == '/app/data']
    declared_mount = _one(declared_mounts, 'COMPOSE_DATABASE_MOUNT_INVALID')
    logical_name = declared_mount.get('source')
    require(declared_mount.get('type') == 'volume' and isinstance(logical_name, str)
            and not declared_mount.get('read_only'), 'COMPOSE_DATABASE_MOUNT_INVALID')
    require(compose.get('volumes', {}).get(logical_name, {}).get('name') == config['db_volume'], 'COMPOSE_DATABASE_VOLUME_MISMATCH')
    mounted = _one([mount for mount in raw_api.get('Mounts', []) if mount.get('Destination') == '/app/data'], 'DATABASE_MOUNT_INVALID')
    require(mounted.get('Type') == 'volume' and mounted.get('Name') == config['db_volume'] and mounted.get('RW') is True,
            'DATABASE_MOUNT_IDENTITY_MISMATCH')
    volume = _one(runner.json('docker', ['volume', 'inspect', config['db_volume']], root), 'VOLUME_INSPECT_INVALID')
    volume_labels = volume.get('Labels') or {}
    require(volume.get('Name') == config['db_volume'] and volume_labels.get('com.docker.compose.project') == config['project']
            and volume_labels.get('com.docker.compose.volume') == logical_name, 'VOLUME_IDENTITY_MISMATCH')
    mount_source = _path(mounted.get('Source'))
    require(mount_source.is_dir() and _same_path(volume.get('Mountpoint'), mount_source), 'VOLUME_SOURCE_MISMATCH')
    require(not _is_within(backup_root, mount_source), 'BACKUP_LOCATION_INSIDE_SOURCE_VOLUME')
    database = mount_source / 'student_ms.db'
    metadata = _source_metadata(database)
    _check_backup_location(backup_root, database)
    return {'checkout': str(root), 'repository': REPOSITORY, 'approved_sha': config['approved_sha'],
            'project': config['project'], 'compose_file': str(compose_file), 'services': services,
            'database': {'volume_name': config['db_volume'], 'volume_source': str(mount_source),
                         'host_path': str(database), 'container_path': '/app/data/student_ms.db'},
            'source_database': metadata}


def _check_backup_location(root, source):
    root = _path(str(root)); ancestor = root
    require(root.parent.is_dir() or root.is_dir(), 'BACKUP_PARENT_MISSING')
    while not ancestor.exists() and ancestor != ancestor.parent:
        ancestor = ancestor.parent
    require(ancestor.is_dir() and os.access(ancestor, os.W_OK | os.X_OK), 'BACKUP_PARENT_INACCESSIBLE')
    if root.exists():
        require(root.is_dir() and not root.is_symlink(), 'BACKUP_DIRECTORY_INVALID')
        if os.name != 'nt':
            require(stat.S_IMODE(root.stat().st_mode) & 0o077 == 0, 'BACKUP_DIRECTORY_NOT_PRIVATE')
    total = source.stat().st_size
    wal = Path(str(source) + '-wal')
    if wal.exists(): total += wal.stat().st_size
    require(shutil.disk_usage(ancestor).free >= max(512 * 1024 * 1024, total * 3), 'BACKUP_DISK_SPACE_INSUFFICIENT')


def backup_database(target, backup_root):
    """Create a unique WAL-safe snapshot; never update recovery pointers."""
    source = Path(target['database']['host_path']); root = _path(str(backup_root))
    require(not _is_within(root, source.parent) and not _is_within(root, Path(target['checkout'])), 'BACKUP_LOCATION_INVALID')
    created = []
    try:
        _check_backup_location(root, source)
        require(root.parent.is_dir() or root.is_dir(), 'BACKUP_PARENT_MISSING')
        root.mkdir(mode=0o700, exist_ok=True)
        artifact = root / ('pre-deploy-' + uuid.uuid4().hex + '.sqlite3')
        descriptor = os.open(artifact, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        created.append(artifact); os.close(descriptor)
        started = time.monotonic()
        def progress(status, remaining, total):
            require(time.monotonic() - started < 60, 'DATABASE_BACKUP_TIMEOUT')
        with readonly_database(source) as src:
            with closing(sqlite3.connect(artifact, timeout=3)) as dst:
                src.backup(dst, pages=256, progress=progress, sleep=0.05)
                # The private completed artifact must be self-contained, even
                # when the source database uses WAL journal mode.
                dst.execute('PRAGMA journal_mode=DELETE')
        with readonly_database(artifact) as db:
            db.execute('BEGIN'); metadata = database_metadata(db)
        require(artifact.stat().st_size >= 4096, 'BACKUP_TOO_SMALL')
        require(metadata['schema_sha256'] == target['source_database']['schema_sha256'], 'SOURCE_SCHEMA_CHANGED')
        with artifact.open('r+b') as completed: os.fsync(completed.fileno())
        result = dict(metadata, file=str(artifact), size_bytes=artifact.stat().st_size, sha256=file_sha256(artifact))
        evidence = artifact.with_suffix('.json')
        descriptor = os.open(evidence, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        created.append(evidence)
        with os.fdopen(descriptor, 'w', encoding='utf8', newline='\n') as output:
            json.dump({'version': 1, 'approved_sha': target['approved_sha'],
                       'database': target['database'], 'backup': result}, output, sort_keys=True)
            output.write('\n'); output.flush(); os.fsync(output.fileno())
        if os.name != 'nt':
            descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(descriptor)
            finally: os.close(descriptor)
        return dict(result, evidence_file=str(evidence))
    except ReleaseError:
        for file in reversed(created): file.unlink(missing_ok=True)
        raise
    except (OSError, sqlite3.Error):
        for file in reversed(created): file.unlink(missing_ok=True)
        raise ReleaseError('DATABASE_BACKUP_FAILED') from None


def prepare_release(config, runner=None, dry_run=False):
    target = validate_target(config, runner)
    if dry_run:
        return {'status': 'DRY_RUN_VALIDATED', 'approved_sha': target['approved_sha'],
                'recovery_eligible': False, 'reason': 'RECOVERY_GATE_REQUIRED'}
    backup_database(target, config['backup_root'])
    # Phase 2 must independently gate source/target compatibility and retained
    # images before adding any build/replacement or pointer publication path.
    raise ReleaseError('RECOVERY_GATE_REQUIRED')


def main():
    try:
        require(len(sys.argv) == 1, 'UNEXPECTED_ARGUMENTS')
        config = {key: os.environ.get(env) for key, env in ENVIRONMENT.items()}
        dry = os.environ.get('DEPLOY_DRY_RUN', '')
        require(dry in ('', '0', '1'), 'INVALID_DRY_RUN_VALUE')
        if config.get('checkout'):
            require(_same_path(config['checkout'], Path(__file__).resolve().parents[1]), 'ENTRYPOINT_CHECKOUT_MISMATCH')
        print(json.dumps(prepare_release(config, dry_run=dry == '1'), sort_keys=True))
        return 0
    except ReleaseError as error:
        print(json.dumps({'status': 'REFUSED', 'code': str(error)}), file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, KeyError, AttributeError, sqlite3.Error):
        print(json.dumps({'status': 'REFUSED', 'code': 'INVALID_RELEASE_STATE'}), file=sys.stderr)
        return 2


if __name__ == '__main__': sys.exit(main())
