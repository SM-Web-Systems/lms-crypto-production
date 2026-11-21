# Phase 3 — Rewards engine, NFT minting and production migration

**When:** 13–20 August 2026
**Archive:** the 2026-08-13 to 2026-08-20 files in [`docs/archive/superpowers/`](../archive/superpowers/), including `2026-08-20-PRODUCTION-MIGRATION-INDEX.md` and the `nft-*`, `reward-*`, `stellar-sdk-v16-*`, `post-mint-*`, `idempotency-*` and `migration-*` documents, and their diagrams.

## Goal

Add learner rewards in XLM and make NFT certificate minting on Stellar safe enough for production.

## What was built

- **Reward engine (loops R0–R12).** A schema, ledger, balance service, 13-state state machine, scope rules and permissions, routes for sponsors, employers, parents and teachers, and an eligibility outbox. All amounts are whole stroops (no floating point) and only XLM is accepted. Reward tests: 143 of about 170 planned.
- **Release readiness.** A dependency vulnerability sweep, the Stellar SDK v16 upgrade, a reward scheduler and notifications, and blocked-refund handling.
- **NFT minting.** A code review and release loop, testnet operations and verification, AmmaWallet integration, mint verification, and a fix to the outbox schema.
- **Safe minting in production (19–20 August).** Contract and ABI compatibility checks, minting safety and idempotency, a durable mint-operation key (migration `001-add-mint-operation-key.sql`) with backup, restore and rollback plans, and approval gates for each step.

## Outcome

The integration-hardening release (`fe82378`) passed its production smoke tests on 19 August, with NFTs on the public network and auto-mint left off. The mint-key migration was fully documented and gated for approval. The reward front end, reward expiry, outbox retry and funding verification were still to do.

## Key documents

- `superpowers/2026-08-20-PRODUCTION-MIGRATION-INDEX.md`: the index for the migration package.
- `superpowers/plans/2026-08-19-production-smoke-results.md`: the smoke-test record.
- `superpowers/specs/2026-08-14-developed-vs-remaining-inventory.md`, section 6: reward status at the start of this phase.
