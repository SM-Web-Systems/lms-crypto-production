# Staging server inventory through existing GitHub SSH credentials

The owner confirmed `https://lms.smwebsystems.com` is staging. Its existing GitHub environment is named `production` and permits only `main`. This workflow retains that protection and the existing pinned SSH host fingerprint. Adding it does not trigger any server action automatically.

The execution-disabled access check [42174117506](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42174117506) authenticated to SSH but exited before a recovery result. The approved read-only [probe 42177426724](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42177426724) succeeded: the clean checkout and both running images identify `f5a64e8ac92aca6b33ae54bda70617d475893e3e`. This differs from the newer main SHA demanded by the earlier bootstrap. No checkout or service change was made to bypass it.

## Probe

Manually dispatch **Staging runtime and private RBAC inventory** on `main` with `mode=probe`. Its synthetic controller tests run before SSH. Probe mode reads only the two configured containers' running state, project/image/revision metadata and checkout Git metadata. It prints hashes and booleans, not SSH credentials, environment contents, remote URLs, filenames or account records.

Probe mode creates no server files or containers and runs no checkout update, application startup, migration, backup, role change, service restart, SSH/key/firewall/user configuration command. Git uses `--no-optional-locks`. This provides a narrow way to diagnose the preparation precondition without changing it.

## Optional private snapshot inventory

`mode=inventory` additionally requires the explicit 32-character ID of a fresh, verified recovery manifest. It checks the repository/project, running image IDs, one-hour snapshot freshness, private file permissions and snapshot/tool hashes. It refuses unsupported or drifting inputs; it does not initialize or repair them.

The controller starts one resource-limited container from the existing API image, overrides its entrypoint to the checksum-verified inventory tool, disables networking/capabilities and makes its root filesystem read-only. Only the separate completed snapshot is mounted read-only. The live data volume and Docker socket are never mounted. No application modules are imported or services started. The unique one-off container is cleaned up; existing containers are never stopped or replaced.

Account-level exception details stay in a new private directory under the configured backup root. Only the inventory tool's aggregate summary is returned to GitHub logs. No snapshot or account-details artifact is uploaded. The workflow does not claim mobile installed-build, endpoint-usage or account-decision acceptance; those remain separate review gates.

## Optional capture on the observed checkout

`mode=capture` first requires **both** running images and the clean checkout to remain exactly at the observed `f5a64e8` revision. It verifies raw SHA-256 hashes of that revision's four release entrypoints before invoking only `python3 scripts/release_recovery.py prepare`, with execution and dry-run flags fixed to zero. The source revision is pinned in code, not supplied by a caller. A later revision requires a new review; no branch policy or deployment SHA check is relaxed.

The existing prepare routine validates repository, compose/container/database volume context, backup location and a minimum 512 MB or three times the database size of free space. It uses SQLite's WAL-safe online backup, writes private backup/evidence/recovery files and retains image tags. It does not stop writers, build/deploy images, start/restart services, update the checkout, modify live database contents or touch SSH/firewall/account configuration. The small difference between this revision's recovery helper and main's helper concerns publication after a writer release; prepare does not enter that path.

Only a successful, recovery-eligible result can proceed to the closed-snapshot inventory checks above. A refused inventory may leave its private backup evidence retained; no automatic destructive cleanup is performed. Capture is a server-writing preparation action and must be explicitly approved separately from a metadata probe. The owner approved capture; [initial run 42182053717](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42182053717) authenticated SSH but returned `COMMAND_REFUSED`, without confirming inventory. The controller now forwards only the reviewed preparation helper's fixed uppercase refusal code, prefixed `PREPARATION_`; raw stderr, paths, credentials and tracebacks remain private. No gate is weakened by this diagnostic change.

## Validation

The diagnostic retry [42183426898](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42183426898) identified `PREPARATION_COMPATIBILITY_POLICY_MISMATCH`. The existing recovery helper verifies and retains a completed private SQLite backup, image tags and `capture-*.json` evidence before that independent policy check. Its refusal must remain a refusal of recovery eligibility.

`mode=inventory-capture` only reads one of those retained closed copies. Supply its capture ID or leave the ID empty to select the latest private capture; all existing target/image/hash/freshness/permission/tool checks still apply. It requires the capture to remain explicitly `UNVERIFIED`, reports that status plus `inventoryOnly=true`, and keeps the inventory's migration-ready flag false. It does not rerun preparation, approve/change the policy, rewrite capture evidence or publish a recovery pointer. A separate private exception report is its only file output. This provides account inventory evidence while recovery approval remains an open gate.

The first retained-copy inventory run authenticated SSH but its container returned no report. The launcher now observes only the mounted snapshot/report UID/GID metadata inside a bounded, network-disabled, read-only helper container, then runs the inventory as that observed owner. This handles normal and rootless Docker mappings without assuming container root can bypass private 0600/0700 permissions. The owner probe mounts both paths read-only, imports only Node's filesystem builtin and is removed before inventory. Both containers retain capability dropping and no-new-privileges; no host file/account permissions change. Inventory failures expose fixed stage/schema/runtime codes rather than raw Docker, Node or SQLite errors.

Twenty synthetic tests cover probe/inventory checks, capture's fixed prepare-only command, revision/checkout/script-drift refusals, safe refusal-code filtering, owner metadata validation and reading retained capture evidence without granting recovery eligibility. Workflow YAML and generated Bash syntax are checked. No server is contacted by those tests. The pinned release hashes are separately compared with raw Git objects from `f5a64e8`.
