# Testnet Deployment Test Matrix

**Date:** 2026-08-19

## Deployment Verification Tests

| # | Test | Input | Expected | Actual | Status |
|---|------|-------|----------|--------|--------|
| 1 | Transaction exists | GET /transactions/{hash} | 200 OK | 200 OK | PASS |
| 2 | Transaction successful | successful field | True | True | PASS |
| 3 | Transaction network | Horizon URL | testnet | testnet | PASS |
| 4 | Transaction source | source_account | GBNOP73G...KUUE3 | Match | PASS |
| 5 | Operation count | operation_count | 1 | 1 | PASS |
| 6 | Operation type | type field | CreateContractV2 | CreateContractV2 | PASS |
| 7 | Contract fetch | stellar contract fetch | Success | Success | PASS |
| 8 | Fetched WASM type | file command | WebAssembly | WebAssembly | PASS |
| 9 | Fetched WASM size | stat | 32,110 | 32,110 | PASS |
| 10 | Fetched WASM hash | sha256sum | 2e8c87f0...ed6eb | Match | PASS |
| 11 | Binary identical | diff | IDENTICAL | IDENTICAL | PASS |
| 12 | CLI hash match | stellar contract info hash | 2e8c87f0...ed6eb | Match | PASS |
| 13 | Interface has mint | info interface | mint(to, caller) | Present | PASS |
| 14 | Constructor signature | info interface | __constructor(admin, minter, uri) | Present | PASS |
| 15 | Build metadata | info meta | Rust version, SDK version | 1.96.0, 26.1.0 | PASS |
| 16 | Account ops count | Horizon operations | 3 | 3 | PASS |
| 17 | No post-deploy invocations | Operations after deploy | 0 | 0 | PASS |
| 18 | Production STELLAR_NETWORK | grep app.env | public | public | PASS |
| 19 | No testnet NFT vars | grep app.testnet.env | None | None | PASS |
| 20 | Account balance | Horizon balance | Sufficient | 19,996.5 XLM | PASS |
| 21 | Deploy cost | Pre - post balance | ~1.29 XLM | 1.2878009 XLM | PASS |

**Result: 21/21 PASS**
