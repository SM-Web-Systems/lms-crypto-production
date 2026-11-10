#!/usr/bin/env python3
"""Plan, or explicitly run, a network-isolated Stalwart restore on a new copy.

The source capture and running mail service are never modified. Runtime readiness
is narrower than authenticated mailbox recovery or a separate-host rehearsal.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import sys
import tempfile

# -I deliberately omits the script directory. Load only these adjacent, reviewed
# helpers; the private operator bundle independently pins all three file digests.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_stalwart_backup import CaptureError, canonical_directory, inspect, overlaps, run
from verify_stalwart_capture import VerificationError, digest, verify

MEMORY = 2 * 1024 ** 3
PROBE = r"""const net=require('node:net');
const s=net.createConnection({host:'127.0.0.1',port:25});
s.setTimeout(4000);let text='',greeted=false;process.exitCode=2;
s.on('data',b=>{if(greeted)return;text+=b.toString();if(text.includes('\n')){
 if(!text.startsWith('220')){s.destroy();process.exitCode=2;return;}
 greeted=true;process.exitCode=0;s.end('QUIT\r\n');console.log('SMTP_220_READY');}});
s.on('timeout',()=>{s.destroy();process.exitCode=3;});
s.on('error',()=>{process.exitCode=4;});
"""


def require(value, code):
    if not value:
        raise CaptureError(code)


def headroom(parent, archive_bytes):
    require(shutil.disk_usage(parent).free >= archive_bytes * 2 + 1024 ** 3,
            'INSUFFICIENT_RESTORE_DISK')
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    require(int(memory['MemAvailable'].split()[0]) * 1024 >= MEMORY + 1024 ** 3,
            'INSUFFICIENT_RESTORE_MEMORY')


def live_binding(args, runner):
    info = inspect(args.expected_container_id, runner)
    require(info['Id'] == args.expected_container_id and info['Image'] == args.expected_image,
            'LIVE_MAIL_IDENTITY_DRIFT')
    require(info['State'].get('Running') and not info['State'].get('Restarting')
            and not info['State'].get('Paused'), 'LIVE_MAIL_NOT_RUNNING')
    binds = [{k: m.get(k) for k in ['Source', 'Destination', 'RW', 'Type']}
             for m in info['Mounts']]
    expected = [dict(Source=args.data_root, Destination='/opt/stalwart', RW=True, Type='bind'),
                dict(Source=args.certificate_root, Destination='/etc/letsencrypt', RW=False,
                     Type='volume')]
    require(sorted(binds, key=lambda m: m['Destination'])
            == sorted(expected, key=lambda m: m['Destination']), 'LIVE_MAIL_MOUNT_DRIFT')
    return {'id': info['Id'], 'image': info['Image'], 'startedAt': info['State']['StartedAt'],
            'restarts': info['RestartCount']}


def plan(args, runner=run):
    require(re.fullmatch(r'[a-f0-9]{64}', args.expected_container_id), 'INVALID_CONTAINER_ID')
    for image in [args.expected_image, args.probe_image]:
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', image), 'INVALID_IMAGE_ID')
        metadata = json.loads(runner(['docker', 'image', 'inspect', image]))
        require(len(metadata) == 1 and metadata[0]['Id'] == image, 'PINNED_IMAGE_UNAVAILABLE')
    data = canonical_directory(args.data_root)
    certificate = canonical_directory(args.certificate_root)
    parent = canonical_directory(args.rehearsal_parent)
    require(not stat.S_IMODE(parent.stat().st_mode) & 0o077, 'REHEARSAL_PARENT_NOT_PRIVATE')
    require(not overlaps(parent, data) and not overlaps(parent, certificate),
            'REHEARSAL_OVERLAPS_LIVE_DEPENDENCY')
    archive = Path(args.archive)
    receipt = Path(args.receipt)
    require(parent != archive.parent and archive.parent not in parent.parents,
            'REHEARSAL_OVERLAPS_IMMUTABLE_CAPTURE')
    require(not overlaps(data, archive.parent), 'CAPTURE_OVERLAPS_LIVE_MAIL')
    capture = verify(archive, receipt, args.expected_receipt_sha256, args.expected_image)
    binding = live_binding(args, runner)
    headroom(parent, archive.stat().st_size)
    return {'status': 'ISOLATED_MAIL_RESTORE_PLAN_READY', 'capture': capture,
            'liveBaseline': binding, 'network': 'none', 'publishedPorts': [],
            'memoryBytes': MEMORY, 'cpuLimit': 0.5, 'pidsLimit': 256,
            'liveServiceWillBeStopped': False, 'sourceWillBeModified': False,
            'mailboxRead': False, 'separateHostRestored': False}


def create_arguments(args, folder):
    return ['docker', 'create', '--name', folder.name,
            '--label', 'lms.isolated-mail-restore=' + folder.name,
            '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--memory', str(MEMORY),
            '--memory-swap', str(MEMORY), '--cpus', '0.5', '--pids-limit', '256',
            '--log-opt', 'max-size=10m', '--log-opt', 'max-file=1',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
            '--mount', f'type=bind,src={folder / "restored"},dst=/opt/stalwart',
            '--mount', f'type=bind,src={args.certificate_root},dst=/etc/letsencrypt,readonly',
            args.expected_image]


def isolated_contract(info, args, folder, container):
    require(info['Id'] == container and info['Image'] == args.expected_image,
            'RESTORE_CONTAINER_IDENTITY_DRIFT')
    host = info['HostConfig']
    require(host['NetworkMode'] == 'none' and host['ReadonlyRootfs']
            and not host.get('PortBindings')
            and not any((info['NetworkSettings'].get('Ports') or {}).values())
            and host['Memory'] == MEMORY and host['MemorySwap'] == MEMORY
            and host['NanoCpus'] == 500000000 and host['PidsLimit'] == 256
            and 'ALL' in host['CapDrop']
            and any(item.startswith('no-new-privileges') for item in host['SecurityOpt']),
            'RESTORE_ISOLATION_CONTRACT_FAILED')
    mounts = [m for m in info['Mounts'] if m['Type'] != 'tmpfs']
    require(len(mounts) == 2 and {(m['Source'], m['Destination'], m['RW']) for m in mounts}
            == {(str(folder / 'restored'), '/opt/stalwart', True),
                (args.certificate_root, '/etc/letsencrypt', False)},
            'RESTORE_MOUNT_CONTRACT_FAILED')
    require(info['Config']['Labels'].get('lms.isolated-mail-restore') == folder.name,
            'RESTORE_LABEL_MISMATCH')


def execute(args, prepared, runner=run):
    require(live_binding(args, runner) == prepared['liveBaseline'], 'LIVE_MAIL_CHANGED_SINCE_PLAN')
    require(digest(Path(args.archive)) == prepared['capture']['archive_sha256']
            and digest(Path(args.receipt)) == args.expected_receipt_sha256, 'CAPTURE_CHANGED_SINCE_PLAN')
    parent = canonical_directory(args.rehearsal_parent)
    folder = Path(tempfile.mkdtemp(prefix='mail-runtime-rehearsal-', dir=parent))
    folder.chmod(0o700)
    require(not overlaps(folder, Path(args.archive).parent), 'REHEARSAL_OVERLAPS_IMMUTABLE_CAPTURE')
    restored = folder / 'restored'
    restored.mkdir(mode=0o700)
    out = dict(prepared, status='ISOLATED_MAIL_RESTORE_IN_PROGRESS', privateRoot=str(folder),
               runtimeReadinessVerified=False, containerRemoved=False)
    container = None
    try:
        runner(['tar', '--extract', '--file', args.archive, '--directory', str(restored),
                '--numeric-owner', '--same-owner', '--same-permissions', '--acls', '--xattrs'], timeout=180)
        require((restored / 'etc/config.toml').is_file() and (restored / 'data/CURRENT').is_file(),
                'EXTRACTED_CAPTURE_INCOMPLETE')
        raw = runner(create_arguments(args, folder)).decode().strip()
        require(re.fullmatch(r'[a-f0-9]{64}', raw), 'CREATE_CONTAINER_ID_INVALID')
        container = raw
        isolated_contract(inspect(container, runner), args, folder, container)
        runner(['docker', 'start', container])
        # The helper inherits this container's isolated network namespace. It
        # cannot access the production network or bind a host port.
        probe = ['docker', 'run', '--rm', '--network', 'container:' + container,
                 '--name', folder.name + '-probe',
                 '--label', 'lms.isolated-mail-restore=' + folder.name,
                 '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                 '--memory', str(128 * 1024 ** 2), '--pids-limit', '32', '--cpus', '0.25',
                 '--entrypoint', 'node', args.probe_image, '-e',
                 "const {execFileSync}=require('node:child_process');"
                 "const end=Date.now()+60000;let ok=false;while(Date.now()<end){"
                 "try{const result=execFileSync(process.execPath,['-e'," + json.dumps(PROBE)
                 + "],{stdio:'pipe',timeout:5000});if(result.toString().trim()!=='SMTP_220_READY')throw Error();ok=true;break;}catch{"
                 "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);}}"
                 "if(!ok)process.exit(2);console.log('SMTP_220_READY');"]
        require(runner(probe, timeout=80).strip() == b'SMTP_220_READY', 'RESTORED_SMTP_NOT_READY')
        isolated_contract(inspect(container, runner), args, folder, container)
        out['runtimeReadinessVerified'] = True
    finally:
        out['status'] = 'ISOLATED_MAIL_RESTORE_INCOMPLETE'
        cleanup_error = None
        # A timed-out create may have completed at the daemon. Recover only our
        # unique name, exact label/image and isolated mount contract.
        if container is None:
            try:
                possible = inspect(folder.name, runner)
            except CaptureError:
                possible = None
            if possible is not None:
                try:
                    isolated_contract(possible, args, folder, possible['Id'])
                    container = possible['Id']
                except CaptureError as error:
                    cleanup_error = error
                    out['containerCleanupIdentityRefused'] = True
        try:
            helper = inspect(folder.name + '-probe', runner)
        except CaptureError:
            helper = None
        if helper is not None:
            try:
                require(helper['Image'] == args.probe_image
                        and helper['Config']['Labels'].get('lms.isolated-mail-restore') == folder.name
                        and container is not None
                        and helper['HostConfig']['NetworkMode'] == 'container:' + container,
                        'PROBE_CLEANUP_IDENTITY_REFUSED')
                runner(['docker', 'rm', '-f', helper['Id']], timeout=30)
            except CaptureError as error:
                cleanup_error = error
                out['probeCleanupFailed'] = True
        out['probeRemoved'] = not out.get('probeCleanupFailed', False)
        if container is not None:
            try:
                log = folder / 'private-runtime.log'
                log.write_bytes(runner(['docker', 'logs', '--tail', '200', container]))
                log.chmod(0o600)
            except (CaptureError, OSError):
                out['privateLogCaptureFailed'] = True
            try:
                # Only the exact ID returned by our create is removed. Bind
                # data and private logs remain for review; live mail is untouched.
                runner(['docker', 'rm', '-f', container], timeout=30)
                out['containerRemoved'] = True
            except CaptureError as error:
                cleanup_error = error
                out['containerCleanupFailed'] = True
        try:
            require(live_binding(args, runner) == prepared['liveBaseline'], 'LIVE_MAIL_BASELINE_CHANGED')
            require(digest(Path(args.archive)) == prepared['capture']['archive_sha256']
                    and digest(Path(args.receipt)) == args.expected_receipt_sha256,
                    'IMMUTABLE_CAPTURE_CHANGED')
            out['sourceUnchanged'] = True
            out['liveBaselineUnchanged'] = True
            out['status'] = ('ISOLATED_MAIL_RUNTIME_READINESS_VERIFIED'
                             if out['runtimeReadinessVerified'] and out['containerRemoved'] and out['probeRemoved']
                             else 'ISOLATED_MAIL_RESTORE_INCOMPLETE')
        finally:
            out['completedAt'] = datetime.now(timezone.utc).isoformat()
            p = folder / 'runtime-receipt.json'
            p.write_text(json.dumps(out, indent=2) + '\n')
            p.chmod(0o600)
        if cleanup_error:
            raise CaptureError('ISOLATED_CONTAINER_CLEANUP_FAILED') from cleanup_error
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['archive', 'receipt', 'expected-receipt-sha256', 'expected-container-id',
                 'expected-image', 'probe-image', 'data-root', 'certificate-root', 'rehearsal-parent']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        require(os.name == 'posix' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
        prepared = plan(args)
        if args.execute:
            def interrupted(signum, frame):
                raise CaptureError('MAIL_RESTORE_INTERRUPTED')
            previous = {sig: signal.signal(sig, interrupted) for sig in [signal.SIGINT, signal.SIGTERM]}
            try:
                result = execute(args, prepared)
            finally:
                for sig, handler in previous.items():
                    signal.signal(sig, handler)
        else:
            result = prepared
        print(json.dumps(result, sort_keys=True))
        return 0
    except (CaptureError, VerificationError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'status': 'REFUSED_OR_INCOMPLETE',
                          'code': str(error) if isinstance(error, (CaptureError, VerificationError))
                          else 'MAIL_RESTORE_FAILED_PRIVATE_EVIDENCE_RETAINED'}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
