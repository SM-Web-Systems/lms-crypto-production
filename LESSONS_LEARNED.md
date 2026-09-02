# AmmaWallet Security Audit — Lessons Learned

> Retrospective for the 3-day audit session (2026-07-25 to 2026-07-27)

---

## What Worked Well

### 1. TDD-first approach
Writing failing tests before fixes caught real bugs and prevented regressions. The source-assertion test pattern (reading `.ts` files as strings and asserting code patterns) was effective for validating fixes that are hard to integration-test without a full database.

### 2. One commit per fix
Each fix is independently revertable. When the audit log fix (P0-1-F3) needed a residual fix in Phase 6A, the original commit was easy to trace and the scope was clear.

### 3. Phased approach with merge checkpoints
Breaking work into phases (Critical → Hardening → Docker → Transaction → Config → Admin → Defense-in-Depth → Quick Wins → Phase 6A) kept scope manageable. Each phase had its own test verification and plan document.

### 4. Smoke tests after deployment
The 10-item smoke test after Phase 5 and 4-item smoke test after Phase 6A caught the deploy path issue (rsync target was host path, not container path) and confirmed all fixes were live.

### 5. FINDINGS.md as single source of truth
Marking findings FIXED with commit hashes in FINDINGS.md made cross-referencing straightforward. The cumulative status report was derived directly from grep counts.

---

## Bottlenecks

### 1. Context window pressure
The audit generated extensive documentation (FINDINGS.md alone is 600+ lines). Multiple conversation continuations were needed. Information was lost between sessions and had to be re-read.

**Improvement:** Keep FINDINGS.md lean — use tables instead of prose for bulk findings. Link to detailed write-ups only for CRITICAL/HIGH items.

### 2. Background agents couldn't use Edit tool
Three agents dispatched in parallel for low-priority fixes all failed because they lacked Edit tool permissions. All 10 edits had to be made sequentially in the main context.

**Improvement:** For edit-heavy work, make edits directly rather than dispatching agents. Reserve agents for read-only research and exploration.

### 3. Git credential setup
The push command failed because `GIT_USER` wasn't defined in `~/.env.git-write`. Had to debug and use the token directly in the URL.

**Improvement:** Document the exact push command that works in MEMORY.md. (Done — pattern is `git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/amma-wallet-production.git main`.)

### 4. Deploy path confusion
The rsync target `/var/www/html/amma-wallet/dist/` doesn't exist on the host — it's mapped via Docker volume from `/home/webadmin/web-stack/html/amma-wallet/dist/`.

**Improvement:** Document the correct deploy path. (Done in MEMORY.md.)

### 5. Finding count discrepancies
Multiple attempts to count FIXED findings yielded different numbers (69, 71, 101) due to the word "FIXED" appearing in different contexts (headers, tables, cross-references). Required Python scripts to get accurate counts.

**Improvement:** Use a structured format (YAML/JSON) for finding status tracking, or at least a consistent marker pattern that's unambiguous to grep.

---

## Technical Debt Acknowledged

### Compromises Made

1. **Source-assertion tests** — Tests that read `.ts` source as strings are brittle. They'll break on refactors even if behavior is preserved. Proper integration tests with database fixtures would be more robust, but take 10x longer to write.

2. **P0-3-F9 (encryptedSecret in localStorage)** — We strip it from Zustand persist, but the real fix is using IndexedDB with non-exportable CryptoKey. The current fix reduces the attack surface but doesn't eliminate it entirely (the data is still in memory).

3. **P0-3-F10 (mnemonic in localStorage)** — We removed the `setItem` calls, but existing users may still have `mnemonic_*` keys in their localStorage until the cleanup runs. The `removeItem` calls handle migration, but there's no forced cleanup on app load.

4. **P0-3-F2 (mnemonic POSTed to server)** — Deferred. This is the highest-impact remaining finding. The server receives the mnemonic in plaintext during HD wallet derivation. Requires client-side BIP39/BIP44 derivation — a 3-5 day refactor.

5. **P2-4-F2 (empty secret defaults)** — Partially fixed with startup warnings, but the defaults are still empty strings. A crash-on-empty-secret approach would be safer but could break cold starts.

### Patterns to Carry Forward

- **Rate limiting pattern:** `config: { rateLimit: { max: N, timeWindow: "X minutes" } }` on Fastify route options
- **Input validation pattern:** JSON Schema with `pattern`, `minLength`, `maxLength` on body/params
- **Audit logging pattern:** `auditLog(action, { userId, ip, detail })` — always use named params
- **Raw SQL gotcha:** `db.execute(sql\`...\`)` returns snake_case columns; Drizzle ORM returns camelCase

---

## Metrics

| Metric | Start | End | Delta |
|--------|------:|----:|------:|
| Tests | 218 | 382 | +164 |
| CRITICAL open | 14 | 0 | -14 |
| HIGH open (exploitable) | 22 | 1 | -21 |
| Total findings fixed | 0 | 75 | +75 |
| Git commits | 0 | 81 | +81 |
| Production deploys | 0 | 2 | +2 |
| Downtime | — | 0 min | — |
