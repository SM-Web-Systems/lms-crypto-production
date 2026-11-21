# Stellar SDK v16 Pre-Upgrade Inventory — 2026-08-14

## Step 1: Current Versions

| Component | Version |
|-----------|---------|
| @stellar/stellar-sdk | 15.1.0 |
| @stellar/stellar-base | Not directly installed (transitive) |
| axios | 1.15.0 (transitive via stellar-sdk, vulnerable range 1.0.0–1.17.0) |
| Node.js (system) | v20.20.0 |
| Node.js (Docker/prod) | v22.23.2 |
| npm | 10.8.2 |
| Lockfile version | 3 |

## Step 2: Baseline Test Results

| Suite | Result |
|-------|--------|
| Backend (vitest) | 1076/1076 PASS |
| Frontend (vitest) | 206/206 PASS |
| TypeScript build (tsc --noEmit) | PASS |
| npm audit --omit=dev | 2 high (axios via stellar-sdk) |
| E2E (Playwright) | Skipped (requires Docker containers) |

## Step 3: Stellar API Usage Inventory

### Single File: `src/services/mintService.ts` (262 lines)

| API | Usage | Lines |
|-----|-------|-------|
| `import * as StellarSdk from '@stellar/stellar-sdk'` | Namespace import | 11 |
| `StellarSdk.StrKey.isValidEd25519PublicKey()` | Validate wallet address | 60, 196 |
| `StellarSdk.rpc.Server(url)` | Soroban RPC client | 95, 202 |
| `StellarSdk.Keypair.fromSecret()` | Load minter keypair | 96, 203 |
| `StellarSdk.Contract(contractId)` | Contract handle | 98, 205 |
| `StellarSdk.TransactionBuilder(account, opts)` | Build transaction | 100, 207 |
| `StellarSdk.Networks.PUBLIC` | Network passphrase | 102, 209 |
| `StellarSdk.Address(pubkey).toScVal()` | Convert address to ScVal | 107–108, 214–215 |
| `contract.call('mint', ...)` | Invoke contract method | 105–109, 212–216 |
| `.setTimeout(120).build()` | TX timeout + build | 111–112, 218–219 |
| `server.simulateTransaction(tx)` | Simulate before submit | 115, 221 |
| `StellarSdk.rpc.Api.isSimulationSuccess()` | Check simulation result | 116, 222 |
| `StellarSdk.rpc.Api.SimulateTransactionErrorResponse` | Type assertion | 117, 223 |
| `StellarSdk.rpc.assembleTransaction(tx, sim).build()` | Assemble with resource fees | 122, 227 |
| `prepared.sign(minterKeypair)` | Sign transaction | 123, 228 |
| `server.sendTransaction(prepared)` | Submit to network | 125, 230 |
| `server.getTransaction(hash)` | Poll for confirmation | 136, 240 |
| `StellarSdk.scValToNative()` | Extract return value | 144, 252 |

### Not Used

- Horizon API — only Soroban RPC
- `Asset` class
- Custom axios clients or interceptors
- Deep imports from `@stellar/stellar-base`
- XDR manipulation (only `scValToNative`)

### Exported Functions

1. `isTriggerQuiz(quizId)` — no Stellar API usage
2. `mintCredentialForQuiz(params)` — fire-and-forget, catches all errors
3. `mintCredential(params)` — throws on failure, used by admin endpoint

## Step 4: Node Version Compatibility

SDK v16 requires Node ≥ 22.

| Environment | Node Version | Compatible |
|-------------|-------------|------------|
| System (host) | v20.20.0 | NO (dev only) |
| Docker API (Dockerfile) | node:22-bookworm-slim | YES |
| Docker Frontend (Dockerfile) | node:22-alpine | YES |
| Production container | v22.23.2 | YES |
| CI (GitHub Actions) | 22 | YES |

**Verdict:** All runtime environments use Node 22. Safe to proceed.

## Upgrade Target

- `@stellar/stellar-sdk@16.2.0` uses `axios@1.18.0` (outside vulnerable range)
- Will resolve all 2 remaining npm audit vulnerabilities
- Single file to migrate: `mintService.ts`

## v16 Breaking Changes to Evaluate

Before upgrading, review the stellar-sdk v16 changelog for changes to:
1. `rpc.Server` constructor and methods
2. `TransactionBuilder` API
3. `Contract.call()` signature
4. `assembleTransaction()` function location/signature
5. `scValToNative()` function location
6. `Address.toScVal()` method
7. Namespace structure changes (`rpc.Api.*`)
