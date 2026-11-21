# Testnet API Runtime Test Matrix

**Date:** 2026-08-19

| # | Test | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Testnet env file exists | Exists | Exists | PASS |
| 2 | Testnet env is gitignored | Ignored | .gitignore:16 matches | PASS |
| 3 | No secrets in testnet env | No SECRET= values | grep empty | PASS |
| 4 | Production .env unchanged | NFT_STELLAR_NETWORK=public | public | PASS |
| 5 | Backend tests pass | 1108/1108 | 1108/1108 | PASS |
| 6 | API starts on port 3003 | Process running | PID assigned | PASS |
| 7 | Health endpoint | status=ok | ok | PASS |
| 8 | Readiness endpoint | ready=True | True | PASS |
| 9 | NFT_STELLAR_NETWORK in process | testnet | testnet | PASS |
| 10 | NFT_CONTRACT_ID in process | CAJ74ZCQ...THRB | Match | PASS |
| 11 | NFT_AUTO_MINT_ENABLED | false | false | PASS |
| 12 | NFT_MINTER_SECRET absent | Not set | Not in env | PASS |
| 13 | Production container healthy | Up (healthy) | Up 10h (healthy) | PASS |
| 14 | Production NFT_STELLAR_NETWORK | public | public | PASS |
| 15 | Blockchain ops count | 3 (unchanged) | 3 | PASS |
| 16 | Latest blockchain op | deploy at 15:58:43Z | invoke_host_function 15:58:43Z | PASS |
| 17 | API stopped cleanly | Port freed | PORT FREE | PASS |
| 18 | Git working tree clean | No changes | Clean | PASS |
| 19 | Remote in sync | 7905561 | 7905561 | PASS |

**Result: 19/19 PASS**
