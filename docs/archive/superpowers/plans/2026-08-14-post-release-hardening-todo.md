# Post-Release Hardening TODO — 2026-08-14

## Completed

### H0: Verify release handoff and tag
- [x] Local HEAD: `8e94ee2`
- [x] Remote HEAD: `8e94ee2`
- [x] N15 tag: `n15-scheduler-refund-notifications-2026-08-14` (local + remote)
- [x] Working tree: clean
- [x] Release report: exists

### H1: Inventory and classify dependency advisories
- [x] 14 total vulnerabilities identified (5 moderate, 8 high, 1 critical)
- [x] Categorized: 10 safe fixes, 2 breaking upgrades, 2 accepted risk

### H2: Apply safe npm audit fixes
- [x] express 4.22.1 → 4.22.2
- [x] body-parser → 1.20.6
- [x] qs → 6.15.3
- [x] form-data → 4.0.6
- [x] ip-address → 10.5.0
- [x] express-rate-limit → 8.6.2
- [x] vitest → 4.1.10 (critical fix)
- [x] vite → 8.2.1
- [x] postcss → 8.5.26
- [x] nanoid → 3.3.18
- [x] Backend: 1076/1076 pass after fixes
- [x] Frontend: 206/206 pass after fixes

### H3: Remediate high-severity vulnerabilities (nodemailer)
- [x] Evaluated: only createTransport + sendMail used
- [x] Upgraded: nodemailer 6.10.1 → 9.0.5
- [x] Updated: @types/nodemailer to latest

### H4: Remediate moderate vulnerabilities (uuid)
- [x] Evaluated: only v4() with zero parameters (1,019 calls)
- [x] Vulnerability not exploitable (needs buf parameter to v3/v5/v6)
- [x] Upgraded: uuid 10.0.0 → 14.0.1
- [x] Node 22 exceeds all version requirements

### H5: Verify Stellar compatibility
- [x] @stellar/stellar-sdk@15.1.0 unchanged (axios transitive accepted)
- [x] mintService.ts APIs: rpc.Server, Keypair, Contract, TransactionBuilder, Networks, Address, StrKey
- [x] v16 upgrade deferred due to significant API breaking changes
- [x] Accepted risk: axios used server-to-server only, admin-triggered, no user input

### H6: Full backend/frontend/E2E regression
- [x] TypeScript build: passes (3 pre-existing type errors fixed)
- [x] Backend: 1076/1076 pass
- [x] Frontend: 206/206 pass
- [ ] E2E: pending final run

### H7: Documentation
- [x] Dependency remediation spec
- [x] Post-release operations spec
- [x] Post-release hardening todo (this file)
- [x] Diagrams (operations flow, dependency remediation)

## Remaining

### Accepted Risk — Stellar SDK Axios (Owner: Engineering Lead, Deadline: 2026-09-15)
- [ ] Create worktree for @stellar/stellar-sdk@16.2.0 upgrade
- [ ] Migrate mintService.ts to v16 API
- [ ] Test NFT minting on testnet
- [ ] Run full suite + npm audit
- [ ] Deploy

### Future Work
- [ ] Add SQLite backup script (like AmmaWallet rclone pattern)
- [ ] Document disaster recovery procedures
- [ ] Load testing baseline
- [ ] Secrets rotation runbook
- [ ] Docker Compose-based E2E in CI
