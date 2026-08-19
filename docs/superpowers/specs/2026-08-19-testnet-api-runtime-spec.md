# Testnet API Runtime Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem
Start the LMS API with isolated testnet NFT configuration to verify it initializes correctly without invoking the contract or minting NFTs.

## Goals
- Start API with testnet NFT config
- Verify health and readiness
- Confirm environment isolation from production
- Confirm no blockchain activity
- Stop API cleanly

## Non-Goals
- Contract invocation (not authorized)
- NFT minting (not authorized)
- Production changes
- Auto-mint enablement

## Authorized Scope
This phase starts the API only. It does not authorize contract invocation, NFT minting, or any blockchain transaction.

## Runtime Architecture
The LMS API (`LMS-Server/src/server.ts`) uses `dotenv.config()` to load `.env` at startup. Shell environment variables override dotenv values. The testnet NFT vars are provided as process-local env vars at startup, overriding the mainnet values from `.env`.

## Configuration Precedence
1. Shell environment variables (highest) — testnet NFT overrides
2. `.env` file via dotenv — production defaults
3. Hardcoded defaults in source — fallbacks

## Startup Command Shape (secrets removed)
```
NFT_STELLAR_NETWORK=testnet \
NFT_CONTRACT_ID=CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB \
NFT_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
NFT_MINTER_PUBLIC_KEY=GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 \
NFT_AUTO_MINT_ENABLED=false \
PORT=3003 \
NODE_ENV=development \
npx tsx src/server.ts
```

## Secret-Loading Boundary
`NFT_MINTER_SECRET` is NOT required for API startup. The `mintService.ts` reads it at call time only (`getNftNetworkConfig()` is called when minting is requested). The API starts and serves health/readiness endpoints without the minter secret.

## Auto-Mint Safety
`NFT_AUTO_MINT_ENABLED=false` is explicitly set. The quiz controller checks `process.env.NFT_AUTO_MINT_ENABLED === 'true'` before triggering auto-mint. With `false`, no automatic minting occurs.

## Health/Readiness
- `/health` — status: ok, DB latency, memory, AmmaWallet config
- `/healthz` — ready: true, DB read/write, disk availability

## Verification Evidence

| Check | Result | Status |
|-------|--------|--------|
| API starts | PID assigned, process running | VERIFIED |
| Health endpoint | status=ok | VERIFIED |
| Readiness endpoint | ready=True, DB ok | VERIFIED |
| NFT_STELLAR_NETWORK | testnet | VERIFIED |
| NFT_CONTRACT_ID | CAJ74ZCQ...THRB (testnet) | VERIFIED |
| NFT_AUTO_MINT_ENABLED | false | VERIFIED |
| NFT_MINTER_SECRET | Not provided (not needed for startup) | VERIFIED |
| Production container | lms-api healthy, NFT_STELLAR_NETWORK=public | VERIFIED |
| Blockchain activity | 3 ops (unchanged from deployment) | VERIFIED |
| API stopped | Process killed, port 3003 freed | VERIFIED |
| Tests | 1108/1108 PASS | VERIFIED |
| Source changes | None | VERIFIED |
| Production .env | Unchanged | VERIFIED |

## Error Taxonomy
- Missing NFT_MINTER_SECRET at startup: No error (read at call time)
- Missing NFT_MINTER_SECRET at mint time: Throws `NFT_MINTER_SECRET is not configured`
- Invalid NFT_STELLAR_NETWORK: Throws at mint time, not startup
- Port conflict: EADDRINUSE (use alternative port)

## Risks
- `dotenv.config()` loads production .env first; shell vars must override
- Health endpoint reports `ammaWallet.network: public` (from AMMA_WALLET_NETWORK in .env, not NFT config)
- Future startup changes could load NFT config eagerly

## Prohibited Actions
- Contract invocation
- NFT minting
- Auto-mint enablement
- Production configuration changes
- Any blockchain transaction

## Acceptance Criteria
- [x] API starts with testnet NFT config
- [x] Health/readiness pass
- [x] No blockchain activity
- [x] Production unchanged
- [x] API stopped cleanly
- [x] No source changes needed
