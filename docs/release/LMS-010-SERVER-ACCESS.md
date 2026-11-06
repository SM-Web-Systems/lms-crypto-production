# LMS-010 — private inventory and staging access

Status: **in progress; private inventory not yet obtained**. Updated 6 November 2026.

The owner confirmed that `https://lms.smwebsystems.com` and `https://ammawallet.com` are staging. GitHub's existing environment is named `production`; its LMS URL is the confirmed staging URL and its branch policy permits only `main`. The configured SSH secret names are `DEPLOY_HOST`, `DEPLOY_USER` and `DEPLOY_SSH_KEY`. Their values were neither retrieved nor printed.

With the owner's conditional approval to preserve SSH access, the existing deployment workflow was dispatched at main `e1929c2c401511a793d03526391a3bb9e8d96ac1` with `execute=false`. The reviewed path does not change SSH configuration, keys, firewall, accounts or services. It can prepare private recovery files after its preconditions pass. [Run 42174117506](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42174117506) authenticated SSH and executed the remote script, which exited with status 1 without a recovery-preparation result. The exact failing precondition is unknown. No backup creation or database inventory is claimed.

A separate [draft diagnostic PR #154](https://github.com/SM-Web-Systems/lms-crypto-production/pull/154), commit `2b919e744f6530c19dcb28219cb640db8b1c3d39`, is ready for review. Its default probe only reads selected Docker and Git metadata; it does not invoke deployment preparation or change SSH, services, checkout or databases. Six synthetic controller tests pass; workflow YAML, runner preparation and generated Bash syntax were checked. Merging and running the new workflow awaits the owner's response because the credentials remain protected by the existing main-only policy.

The optional inventory mode requires a fresh, existing, private, hash-verified recovery snapshot matching both running images and the reviewed inventory tool. It reads that closed copy with no network and read-only source mounts, writing account exceptions only to a private server directory. It is not part of the requested initial probe. No environment protection is weakened and no private key is exported.

Next: diagnose checkout/image metadata, obtain a consistent snapshot through the supported recovery path, inventory it offline, then have the actual zero/multi/custom/revoked-grant and learner-profile exceptions reviewed privately. Record installed supported web/mobile builds and legacy endpoint usage separately; Docker image metadata cannot establish those facts. LMS-010 remains open until all those acceptance inputs exist.
