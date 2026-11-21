# Production–Testnet Boundary Specification

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** ASSESSMENT

## Purpose

Document the isolation mechanisms between production (mainnet) and testnet NFT operations, and verify that testnet activities cannot affect production.

## Boundary Architecture

### Environment Variable Isolation

| Variable | Production Value | Testnet Override |
|----------|-----------------|------------------|
| NFT_STELLAR_NETWORK | public | testnet (shell env) |
| NFT_CONTRACT_ID | CDPKSOOE...H524 (mainnet) | CAJ74ZCQ...THRB (testnet) |
| NFT_SOROBAN_RPC_URL | https://mainnet.sorobanrpc.com | https://soroban-testnet.stellar.org |
| NFT_MINTER_SECRET | SB646D3PR... (mainnet, in .env) | From GPG (separate key, runtime only) |
| NFT_MINTER_PUBLIC_KEY | (mainnet deployer) | GBNOP73G...UUE3 |
| NFT_AUTO_MINT_ENABLED | false | false |

### Isolation Mechanisms

1. **File-level:** `.env.testnet-nft` is a separate file, gitignored, never sourced by production Docker.
2. **Process-level:** Testnet API runs as bare `npx tsx` on port 3003. Production runs in Docker on port 3001.
3. **Network-level:** Different Stellar networks (public vs testnet) have different passphrases. A testnet-signed transaction cannot be accepted by mainnet, and vice versa.
4. **Key-level:** Testnet uses a different keypair than production. Even if testnet secret leaked, it cannot sign mainnet transactions.
5. **Contract-level:** Different contract IDs on different networks. Testnet contract ID doesn't exist on mainnet.
6. **Database-level:** Both processes use the same SQLite DB (student_ms.db). nft_credentials rows include `network` column ('public' or 'testnet') to distinguish.

### Cross-Contamination Vectors

| Vector | Risk | Mitigation |
|--------|------|------------|
| Testnet API accidentally uses production .env | LOW | Shell env vars override dotenv; explicit NFT_STELLAR_NETWORK=testnet |
| Production Docker picks up testnet env | NONE | Docker compose uses `env_file: .env`, not `.env.testnet-nft` |
| DB records mix testnet/mainnet | LOW | `network` column distinguishes; admin UI doesn't filter by network yet |
| Testnet secret in production .env | NONE | Separate GPG-encrypted file, different key |
| Testnet key signs mainnet tx | IMPOSSIBLE | Network passphrase mismatch prevents cross-network signing |
| WASM on testnet different from mainnet | IMPOSSIBLE | Binary-verified identical (SHA-256 match) |

### Verified in Phase 15 (API Runtime)

- Production lms-api container: NFT_STELLAR_NETWORK=public (confirmed via `docker exec`)
- Testnet API process: NFT_STELLAR_NETWORK=testnet (confirmed via `/proc/<pid>/environ`)
- No NFT_MINTER_SECRET in testnet process environment (not provided, not needed for health check)
- Blockchain: 3 operations total on testnet account, no new activity during API runtime test

## Database Boundary

The `nft_credentials` table stores both production and testnet records:

```sql
-- Schema columns relevant to boundary:
network TEXT DEFAULT 'public',  -- 'public' or 'testnet'
contract_id TEXT,               -- different per network
```

**Current status:** All existing rows have `network='public'`. First testnet mint will create `network='testnet'` rows.

**Gap:** Admin UI (AdminCertificates, NFTBadge, BadgeGallery) does not filter by network. Testnet credentials would appear alongside production ones. This is acceptable for a controlled single mint but should be addressed before ongoing testnet usage.

## Secret Boundary

| Secret | Storage | Access |
|--------|---------|--------|
| Mainnet NFT_MINTER_SECRET | LMS-Server/.env (plaintext in file, mode 600) | Loaded by dotenv at process startup |
| Testnet NFT_MINTER_SECRET | ~/.stellar-testnet-secrets.gpg (AES-256 symmetric) | Decrypted at runtime, passed as env var |

**Key isolation:** The testnet key (GBNOP73G...UUE3) is entirely different from the mainnet minter key. They are cryptographically independent Stellar keypairs.

## Recommendations

1. **For single testnet mint:** Current isolation is sufficient. No changes needed.
2. **For ongoing testnet usage:** Add network filter to admin UI, consider separate test DB.
3. **For CI/CD testnet:** Would need separate Docker compose with testnet env — already partially exists as `.env.testnet-nft`.
