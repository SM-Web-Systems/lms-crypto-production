# AmmaWallet Security Audit — Detailed Metrics

> Generated: 2026-07-27 | Final HEAD: `bd21cc3`

---

## 1. Finding Counts

### By Severity × Status

| Severity | Fixed | INFO | Deferred | Total |
|----------|------:|-----:|---------:|------:|
| CRITICAL | 14 | 0 | 0 | 14 |
| HIGH | 24 | 0 | 19 | 43 |
| MEDIUM | 29 | 0 | 65 | 94 |
| LOW | 10 | 0 | 91 | 101 |
| INFO | 0 | 67 | 0 | 67 |
| **Total** | **77** | **67** | **175** | **319** |

### By Category

| Category | Findings | Fixed | Fix Rate |
|----------|------:|------:|---------:|
| Authentication & Authorization | ~45 | ~25 | ~56% |
| Cryptographic Operations | ~30 | ~12 | ~40% |
| Transaction Security | ~25 | ~10 | ~40% |
| Data Protection | ~20 | ~8 | ~40% |
| Infrastructure (Docker/Config) | ~35 | ~12 | ~34% |
| Input Validation | ~50 | ~10 | ~20% |
| Integration Security (SSO/LMS) | ~15 | ~5 | ~33% |
| Test Coverage | ~30 | ~5 | ~17% |
| Code Quality | ~69 | 0 | 0% |

---

## 2. Commit Metrics

| Metric | Value |
|--------|------:|
| Total commits | 90 |
| Fix commits (code changes) | 53 |
| Documentation commits | 37 |
| Merge commits | 4 |
| Tags created | 4 |
| Branches created | 4 |
| Production deploys | 3 |

### Commits by Phase

| Phase | Fix Commits | Tests Added | Date |
|-------|------:|------:|------|
| Phase 1 (Critical Fixes) | 6 | +42 | Jul 25 |
| Phase 2 (Security Hardening) | 8 | +30 | Jul 25 |
| Phase 3 (Docker Security) | 7 | +25 | Jul 26 |
| Phase 5A (Transaction Security) | 3 | +25 | Jul 26 |
| Phase 5B (Config & Crypto) | 5 | +25 | Jul 26 |
| Phase 5C (Admin Integrity) | 2 | +10 | Jul 26 |
| Phase 5D (Defense-in-Depth) | 6 | +2 | Jul 27 |
| Low-Priority Pass | 10 | 0 | Jul 27 |
| Phase 6A (Quick Wins) | 4 | +5 | Jul 27 |
| Phase 6B (Crypto Refactor) | 2 | +5 | Jul 27 |
| **Total** | **53** | **+169** | |

---

## 3. Test Metrics

| Metric | Before | After | Change |
|--------|-------:|------:|-------:|
| Total tests | 218 | 387 | +169 (+77.5%) |
| Test files | ~25 | 43+ | +18 |
| Pass rate | 100% | 100% | — |

### New Test Coverage Areas

| Area | Tests Added | Type |
|------|------:|------|
| Auth (login/register/reset) | ~50 | Unit + integration |
| Transaction signing | ~20 | Unit + integration |
| Crypto (decrypt, TOTP, PBKDF2) | ~15 | Unit |
| Docker/config validation | ~10 | Source-assertion |
| SSO/integration | ~10 | Unit |
| Input validation schemas | ~15 | Unit |
| Source-assertion (code patterns) | ~20 | Static analysis |
| HD wallet derivation | 8 | Unit (BIP39 vectors) |
| Client-side HD migration | 5 | Source-assertion |
| Backend endpoint removal | 3 | Source-assertion |
| Secret validation guards | 2 | Source-assertion |
| localStorage persistence | 3 | Source-assertion |
| Audit log field names | 2 | Source-assertion |

---

## 4. Lines of Code Changed

| Component | Lines Added | Lines Removed | Net |
|-----------|------:|------:|------:|
| Backend routes | ~400 | ~180 | +220 |
| Backend lib | ~120 | ~20 | +100 |
| Backend config | ~60 | ~10 | +50 |
| Backend tests | ~1,200 | ~50 | +1,150 |
| Frontend store | ~30 | ~25 | +5 |
| Frontend lib | ~30 | ~5 | +25 |
| Frontend tests | ~80 | 0 | +80 |
| Docker/infra | ~40 | ~30 | +10 |
| Documentation | ~3,000 | ~200 | +2,800 |

---

## 5. Rate Limits Applied

| Endpoint | Limit | Window | Phase |
|----------|------:|--------|-------|
| Login | 10 | 5 min | Existing |
| Register | 5 | 15 min | Existing |
| Password reset | 3 | 15 min | Existing |
| Transaction signing | 3 | 1 min | 5A |
| Admin login | 5 | 5 min | 5D |
| Resend verification | 3 | 15 min | LP |
| Token refresh | 30 | 1 min | LP |
| Trustline operations | 5 | 1 min | 5D |
| Global | 60 | 1 min | Existing |

---

## 6. Deployment Metrics

| Deploy | Date | Phase | Downtime | Smoke Tests |
|--------|------|-------|----------|------:|
| Deploy 1 | Jul 27 | Phase 5 merge | 0 | 10/10 |
| Deploy 2 | Jul 27 | Phase 6A merge | 0 | 4/4 |
| Deploy 3 | Jul 27 | Phase 6B merge | 0 | 4/4 |

---

## 7. Timeline Efficiency

| Metric | Value |
|--------|-------|
| Audit duration | 3 days (Jul 25-27) |
| Findings per day | ~106 |
| Fixes per day | ~26 |
| Tests added per day | ~56 |
| Deploys per day | 1 |
| Zero-downtime deploys | 3/3 (100%) |
