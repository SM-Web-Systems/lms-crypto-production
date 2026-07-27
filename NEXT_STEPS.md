# AmmaWallet — Next Steps

> After Phase 6A completion (2026-07-27)
> 2 Phase 6 findings remain, 175 deferred backlog items

---

## Option A: Phase 6B — Crypto Refactor (Recommended)

**What:** Fix the last HIGH finding (P0-3-F2) — mnemonic is POSTed to the server in plaintext during HD wallet derivation. Move BIP39/BIP44 derivation entirely to the client.

**Why:** This is the only remaining HIGH-severity finding with a direct exploit path. If the server is compromised, an attacker can intercept mnemonics during HD wallet creation. All other HIGH findings are either fixed or in low-priority modules (Earn, Fiat, MoneyGram).

**Scope:**
- P0-3-F2 (HIGH): Client-side BIP39 seed → BIP44 derivation → keypair generation
- P2-4-F2 (MEDIUM): Crash on empty PLATFORM_SECRET/SIGNING_SECRET_KEY (quick add-on, 15 min)

**Effort:** 3-5 days (mostly P0-3-F2)

**Risk:** Medium — changes the wallet creation flow. Needs careful testing of HD derivation compatibility (existing wallets must still work with server-derived keys).

**Earliest start:** 2026-08-15

---

## Option B: Backlog Cleanup — Quick Wins

**What:** Pick 10-15 items from the 175 deferred backlog that are quick wins (< 30 min each). Focus on input validation, rate limiting, and error handling improvements.

**Why:** Improves code quality and defense-in-depth without architectural risk. Good prep work before the crypto refactor.

**Candidate items:**
- Rate limits on contacts CRUD, push test, curated seed endpoints (~5 items)
- Input validation for asset codes, amount bounds, URL schemes (~5 items)
- Error handling: replace generic 500s with specific error messages (~5 items)

**Effort:** 1-2 days

**Risk:** Low — each fix is small and independently revertable.

---

## Option C: Documentation & Onboarding

**What:** Create/update README, ARCHITECTURE.md, and developer onboarding docs. Document the security audit findings, deployment procedures, and development workflows.

**Why:** The codebase has grown significantly. New developers need context on the security model, rate limiting patterns, audit logging, and deployment procedures. The audit uncovered undocumented patterns that should be captured.

**Scope:**
- ARCHITECTURE.md — system overview, component diagram, data flow
- DEVELOPMENT.md — local setup, testing, deployment procedures
- SECURITY.md — security model, threat model, audit summary
- Update README with current state

**Effort:** 1-2 days

**Risk:** None — documentation only.

---

## Recommendation

**Option A (Phase 6B)** is the highest-value next step. P0-3-F2 is the last finding where an attacker could extract sensitive cryptographic material. Fixing it eliminates all exploitable findings from the audit.

However, if the crypto refactor timeline (3-5 days) doesn't fit the next session, **Option B** is a productive alternative that reduces the backlog and improves the overall codebase quality.

**Option C** can be done in parallel with either A or B — documentation doesn't block code work.

---

## Decision

_To be filled in after discussion:_

- [ ] Option A: Phase 6B crypto refactor
- [ ] Option B: Backlog cleanup
- [ ] Option C: Documentation
- [ ] Combination (specify): _______________
- [ ] Start date: _______________
