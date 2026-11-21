# Stellar SDK v16 Migration Spec — 2026-08-14

## Overview

Upgrade `@stellar/stellar-sdk` from 15.1.0 to 16.2.0 in the LMS-AmmaWallet project to resolve the transitive axios vulnerability (28 CVEs, GHSA range 1.0.0–1.17.0).

## Versions

| Component | Before | After |
|-----------|--------|-------|
| @stellar/stellar-sdk | 15.1.0 | 16.2.0 |
| axios (transitive) | 1.15.0 (vulnerable) | 1.18.0 (fixed) |
| @stellar/stellar-base | transitive | folded into SDK |
| Node.js requirement | >=18 | >=22 |

## Node 22 Requirement

SDK v16 declares `engines.node: ">=22.0.0"`.

| Environment | Version | Compatible |
|-------------|---------|------------|
| Docker API (Dockerfile) | node:22-bookworm-slim | YES |
| Docker Frontend (Dockerfile) | node:22-alpine | YES |
| Production container | v22.23.2 | YES |
| CI (GitHub Actions) | 22 | YES |
| System dev (host) | v20.20.0 | NO — dev-only, not runtime |

## NodeNext/ESM Compatibility

- v16 is `type: "module"` but ships dual CJS/ESM via package `exports`
- Our `tsconfig.json`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- `skipLibCheck: true` is set — avoids transitive type conflicts
- The `exports` map provides `.require` entries for CJS consumers
- No import path changes required

## API Touchpoint Analysis (17 touchpoints)

All APIs used in `mintService.ts` are stable across v15→v16:

| # | API | v16 Status | Change Required |
|---|-----|-----------|-----------------|
| 1 | `import * as StellarSdk from '@stellar/stellar-sdk'` | Stable (namespace import) | None |
| 2 | `StellarSdk.StrKey.isValidEd25519PublicKey()` | Stable | None |
| 3 | `StellarSdk.rpc.Server(url)` | Stable | None |
| 4 | `StellarSdk.Keypair.fromSecret(secret)` | Stable | None |
| 5 | `StellarSdk.Contract(contractId)` | Stable | None |
| 6 | `StellarSdk.TransactionBuilder(account, {fee, networkPassphrase})` | Stable* | None |
| 7 | `StellarSdk.Networks.PUBLIC` | Stable | None |
| 8 | `StellarSdk.Address(pubkey).toScVal()` | Stable | None |
| 9 | `contract.call('mint', ...)` | Stable | None |
| 10 | `.setTimeout(120).build()` | Stable | None |
| 11 | `server.simulateTransaction(tx)` | Stable | None |
| 12 | `StellarSdk.rpc.Api.isSimulationSuccess()` | Stable | None |
| 13 | `StellarSdk.rpc.Api.SimulateTransactionErrorResponse` | Stable | None |
| 14 | `StellarSdk.rpc.assembleTransaction(tx, sim).build()` | Stable | None |
| 15 | `prepared.sign(minterKeypair)` | Stable | None |
| 16 | `server.sendTransaction(prepared)` | Stable | None |
| 17 | `StellarSdk.scValToNative(val)` | Stable | None |

*TransactionBuilder: `minAccountSequenceAge` changed from number to bigint in v16, but we do not use this parameter.

## v16 Breaking Changes — Confirmed Unused

| v16 Breaking Change | Our Usage | Impact |
|--------------------|-----------|--------|
| `Asset.issuer` readonly | Not used | None |
| `authorizeInvocation()` params object | Not used | None |
| `extraSigners` type change | Not used | None |
| `revokeSponsorship` type split | Not used | None |
| `minAccountSequenceAge` bigint | Not used | None |
| `serverURL` URI→URL | Not accessed | None |
| `rawSecretKey()` throws | Not used | None |
| `authorizeEntry` requires networkPassphrase | Not used | None |
| Horizon `CallBuilder` streaming | No Horizon usage | None |

## Native Fetch vs Axios

- v16 defaults to native `fetch` instead of axios for HTTP transport
- axios remains bundled for opt-in via `@stellar/stellar-sdk/axios`
- Our `rpc.Server` calls are transport-agnostic — they use the SDK's internal client
- No custom axios interceptors or adapters in our code
- The switch to native `fetch` is transparent and requires no code changes
- axios@1.18.0 remains in the dependency tree (for the `/axios` entrypoint) but is no longer in the default request path

## Lockfile Expectations

- `package.json`: `@stellar/stellar-sdk` version specifier changes from `^15.1.0` to `^16.2.0`
- `package-lock.json`: large diff expected due to new transitive dependencies
  - New: `feaxios`, `smol-toml`, `eventsource`, `uint8array-extras`, `@noble/ed25519`, `commander`
  - Removed: `urijs` (replaced by native URL)
  - Updated: `axios` 1.15.0→1.18.0, `bignumber.js` 9→11, `@noble/hashes` version bump
  - Removed as direct dep: `@stellar/stellar-base` (folded into SDK)

## Rollback

```bash
git checkout HEAD~1 -- LMS-Server/package.json LMS-Server/package-lock.json
cd LMS-Server && npm ci
```

Alternatively, revert to the pre-upgrade commit tag.

## Verification Matrix

| Check | Command | Expected |
|-------|---------|----------|
| Backend tests | `npx vitest run` | 1076/1076 pass |
| Frontend tests | `cd ../LMS-Frontend && npx vitest run` | 206/206 pass |
| TypeScript build | `npx tsc --noEmit` | Exit 0 |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Dependency tree | `npm ls @stellar/stellar-sdk axios` | sdk@16.2.0, axios@1.18.0 |
| Docker build | `docker compose build api` | Exit 0 |
| SDK import test | Dedicated regression test | All assertions pass |
| E2E tests | `cd ../e2e && npx playwright test` | 14/14 pass |
