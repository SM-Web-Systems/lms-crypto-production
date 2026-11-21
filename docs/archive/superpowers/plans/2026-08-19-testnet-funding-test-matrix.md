# Testnet Funding Test Matrix

**Date:** 2026-08-19
**Status:** ALL PASS

| ID | Category | Test | Expected | Actual | Status |
|----|----------|------|----------|--------|--------|
| TF-001 | ADDRESS | Runbook address is 56 characters | 56 | 56 | PASS |
| TF-002 | ADDRESS | Address starts with G | G | G | PASS |
| TF-003 | ADDRESS | Address matches across all docs | Consistent | Consistent (8 files) | PASS |
| TF-004 | NETWORK | Query targets testnet Horizon | horizon-testnet.stellar.org | horizon-testnet.stellar.org | PASS |
| TF-005 | NETWORK | No production network queries | 0 | 0 | PASS |
| TF-006 | ACCOUNT | Account exists | Yes | Yes | PASS |
| TF-007 | BALANCE | Balance > 0 | Yes | 19,997.8 XLM | PASS |
| TF-008 | BALANCE | Balance reconciles with operations | 19,997.8 | 9,998.9 + 9,998.9 = 19,997.8 | PASS |
| TF-009 | FUNDING | Friendbot funding 1 recorded | ~9,998.9 | 9,998.9 (create_account) | PASS |
| TF-010 | FUNDING | Friendbot funding 2 recorded | ~9,998.9 | 9,998.9 (payment) | PASS |
| TF-011 | FUNDING | Both operations successful | True | True | PASS |
| TF-012 | SECURITY | No contract deployments | 0 | 0 | PASS |
| TF-013 | SECURITY | No outbound transfers | 0 | 0 | PASS |
| TF-014 | SECURITY | No unauthorized operations | 0 | 0 | PASS |
| TF-015 | SECURITY | No secrets disclosed | 0 | 0 | PASS |
| TF-016 | SECURITY | Production config unchanged | public/false | public/false | PASS |
| TF-017 | TDD | TDD not applicable (read-only) | N/A | N/A | N/A |
