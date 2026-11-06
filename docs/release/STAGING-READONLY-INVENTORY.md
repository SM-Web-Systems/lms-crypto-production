# Staging server inventory through existing GitHub SSH credentials

The owner confirmed `https://lms.smwebsystems.com` is staging. Its existing GitHub environment is named `production` and permits only `main`. This workflow retains that protection and the existing pinned SSH host fingerprint. Adding it does not trigger any server action automatically.

The execution-disabled access check [42174117506](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42174117506) authenticated to SSH and received a remote exit status of 1 without a recovery-preparation result. The precise checkout/precondition failure is not yet known. It did not provide an interactive key or a private account inventory.

## Probe

After review/merge, manually dispatch **Read-only staging server inventory** on `main` with `mode=probe`. Its synthetic controller tests run before SSH. Probe mode reads only the two configured containers' running state, project/image/revision metadata and checkout Git metadata. It prints hashes and booleans, not SSH credentials, environment contents, remote URLs, filenames or account records.

Probe mode creates no server files or containers and runs no checkout update, application startup, migration, backup, role change, service restart, SSH/key/firewall/user configuration command. Git uses `--no-optional-locks`. This provides a narrow way to diagnose the preparation precondition without changing it.

## Optional private snapshot inventory

`mode=inventory` additionally requires the explicit 32-character ID of a fresh, verified recovery manifest. It checks the repository/project, running image IDs, one-hour snapshot freshness, private file permissions and snapshot/tool hashes. It refuses unsupported or drifting inputs; it does not initialize or repair them.

The controller starts one resource-limited container from the existing API image, overrides its entrypoint to the checksum-verified inventory tool, disables networking/capabilities and makes its root filesystem read-only. Only the separate completed snapshot is mounted read-only. The live data volume and Docker socket are never mounted. No application modules are imported or services started. The unique one-off container is cleaned up; existing containers are never stopped or replaced.

Account-level exception details stay in a new private directory under the configured backup root. Only the inventory tool's aggregate summary is returned to GitHub logs. No snapshot or account-details artifact is uploaded. The workflow does not claim mobile installed-build, endpoint-usage or account-decision acceptance; those remain separate review gates.

## Validation

Six synthetic tests cover probe-only commands and privacy, target/injection refusal, bounded read-only mounts and unique-container cleanup, stale snapshots, snapshot/tool drift and rejection of account identifiers in the public summary. Workflow YAML and generated Bash syntax are checked. No server is contacted by those tests.
