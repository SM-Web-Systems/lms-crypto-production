# Phase 5 Backlog — Tier 3 (Nice-to-Have / Future Consideration)

These findings are LOW priority — either low exploitability, low impact,
code quality improvements, or require significant architectural changes.

## Frontend Code Quality

| Finding | Severity | Description | Effort |
|---------|----------|-------------|--------|
| P0-3-F9 | MEDIUM | encryptedSecret in localStorage via zustand persist | Large — requires IndexedDB migration |
| P0-3-F10 | MEDIUM | Mnemonic in localStorage under predictable key | Medium — needs zustand refactor |
| P0-4-F5 | MEDIUM | Debug console.log leaks XDR in production | Small — gate behind `import.meta.env.DEV` |
| P0-4-F6 | MEDIUM | Hardcoded 100k stroops swap fee | Small — use `feeStats()` or BASE_FEE |
| P0-4-F7 | MEDIUM | Fee injection silently fails | Small — add warning log |
| P4-1-F1 | MEDIUM | Mnemonic in localStorage outside zustand scope | Medium — architectural change |
| P4-1-F2 | MEDIUM | Plaintext secret key in state with no auto-lock | Medium — needs timeout + clear logic |
| P4-2-F3 | MEDIUM | No AbortController support in API client | Medium |
| P4-2-F4 | MEDIUM | Race condition in concurrent 401 refresh | Medium — needs mutex/queue |
| P4-2-F5 | MEDIUM | useEffect promise chain no cleanup | Small |
| P4-2-F6 | MEDIUM | subscribe() bypasses centralized request() | Medium |
| P4-2-F7 | MEDIUM | Push subscription response not validated | Small |
| P4-3-F1 | MEDIUM | TOTP secret not cleared on component unmount | Small |
| P4-3-F2 | MEDIUM | Turnstile stale closure — missing deps | Small |
| P4-4-F1 | MEDIUM | Hardcoded Transak API key in source | Small — move to env var |
| P4-4-F2 | MEDIUM | Hardcoded LMS API base URL | Small — move to env var |
| P4-4-F3 | MEDIUM | ForgotPassword missing Turnstile | Medium |

## Backend Code Quality

| Finding | Severity | Description | Effort |
|---------|----------|-------------|--------|
| P0-3-F5 | MEDIUM | decrypt-secret.ts no error handling for corrupted data | Small |
| P1-1-F6 | MEDIUM | requireScope() silent no-op without prior middleware | Small |
| P1-3-F1 | MEDIUM | acquisitionModeEnabled not checked before debt limit | Small |
| P2-5-F1 | MEDIUM | addressBook.userId no FK constraint or index | Small — migration |
| P2-7-F2 | MEDIUM | Successful login never audit-logged | Moved to Tier 2 |
| P2-7-F3 | MEDIUM | 9 of 17 AuditAction types never emitted | Medium — many handlers |
| P4-6-F2 | MEDIUM | Irreversible migration drops NOT NULL on email | Info — already applied |
| P4-6-F3 | MEDIUM | fix-xlm-dupes no DRY_RUN mode | Small — one-time script |
| P4-7-F2 | MEDIUM | Unbounded cache map size | Small — add max entries |
| P4-7-F6 | MEDIUM | No download size limit on icon fetch | Small |
| P4-8-F6 | MEDIUM | .dockerignore missing | Moved to Tier 2 |

## Test Coverage Gaps

| Finding | Severity | Description | Effort |
|---------|----------|-------------|--------|
| P4-9-F2 | HIGH | Wallet routes zero test coverage | Large — complex mocking |
| P4-9-F4 | MEDIUM | NFT routes zero test coverage | Medium — partially covered by nft-audit.test.ts |
| P4-9-F5 | MEDIUM | User auth middleware zero test coverage | Small |
| P4-9-F6 | MEDIUM | Turnstile middleware zero test coverage | Medium |
| P4-9-F7 | MEDIUM | All module services zero test coverage | Large |
| P4-9-F8 | MEDIUM | Job files zero test coverage | Medium |
| P4-9-F9 | MEDIUM | Inlined handler reimplementations risk divergence | Medium — needs refactor |

## Architectural Issues (Deferred)

| Finding | Severity | Description | Effort |
|---------|----------|-------------|--------|
| P0-3-F2 | HIGH | Mnemonic sent to server (from-mnemonic) | Large — move HD derivation to client |
| P0-3-F4 | HIGH | Raw secret fallback without PIN | Moved to Tier 1 |
| P0-4-F2 | HIGH | sign-and-submit falls back to raw secret | Moved to Tier 1 (same fix) |

## Notes

- P0-3-F2 (mnemonic to server) is architecturally significant but the
  endpoint is only used for mnemonic-based wallet creation/import, which
  is an optional flow. The primary "self mode" flow generates keys
  client-side. This should be addressed in a future refactor of the
  wallet creation flow.
- Frontend localStorage findings (P0-3-F9, P0-3-F10, P4-1-F1, P4-1-F2)
  are interconnected and should be addressed together in a dedicated
  "client-side secret management" sprint.
- Test coverage gaps (P4-9-*) are important but don't represent active
  security vulnerabilities. They reduce confidence in the fixes we've
  made. Address incrementally as we touch the affected files.
