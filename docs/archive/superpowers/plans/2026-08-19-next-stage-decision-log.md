# Next Stage Decision Log

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)

## Decision 1: Assessment Approach

**Question:** How to evaluate mint readiness without invoking the contract?

**Options considered:**
1. Read source code only — fast but no runtime evidence
2. Source code + existing tests + infrastructure checks — comprehensive without blockchain activity
3. Source code + new tests + simulation — most thorough but touches more surface area

**Decision:** Option 2 — Source code analysis + existing test verification + infrastructure checks.

**Rationale:** Provides comprehensive coverage without writing new code or touching blockchain. All 24 assessment checks pass. Infrastructure checks confirm deployment, funding, and isolation.

## Decision 2: Progression Strategy

**Question:** What order should the next verification stages proceed?

**Options considered:**
1. Jump directly to testnet mint (Option C) — fastest but skips verifiable preconditions
2. Read-only → Simulation → Mint (A → B → C) — incremental, each stage de-risks the next
3. Full integration first (Option D) — most thorough but heaviest lift
4. Parallel A+B, then C — faster but harder to diagnose failures

**Decision:** Sequential A → B → C, each with separate approval.

**Rationale:** Each stage is zero or near-zero risk. Sequential progression means Stage A's constructor verification informs Stage B's simulation, which informs Stage C's live mint. If any stage fails, we stop and diagnose without having committed to more.

## Decision 3: CLI vs API for First Mint

**Question:** Should the first testnet mint use CLI direct (`stellar contract invoke`) or the application's mintCredential() function?

**Options considered:**
1. CLI direct — simpler, more isolated, fewer dependencies
2. API endpoint — tests application stack, but needs test user + wallet setup

**Decision:** Deferred to Stage C approval. Recommend CLI (Option C1) for simplicity.

**Rationale:** CLI isolates the contract interaction from the application. If CLI mint works, we know the contract is correct. API mint tests the application's integration but has more failure points. CLI first, then API if CLI succeeds.

## Decision 4: Test Database Boundary

**Question:** Should testnet mints use the same SQLite DB as production?

**Assessment:** The nft_credentials table has a `network` column ('public' or 'testnet'). For a controlled single mint, same DB is acceptable. For ongoing testnet usage, a separate DB would be cleaner.

**Decision:** Same DB for Stage C (single mint). Revisit if testnet becomes ongoing.

## Decision 5: What NOT To Do

Explicitly decided NOT to:
- Enable NFT_AUTO_MINT_ENABLED on any network
- Modify production .env
- Create a testnet Docker compose for LMS (yet)
- Write new application code before completing read-only verification
- Deploy any changes to production
- Start more than one verification stage per approval cycle
