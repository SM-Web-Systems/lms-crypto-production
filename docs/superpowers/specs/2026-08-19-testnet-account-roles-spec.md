# Testnet Account Roles Specification

**Date:** 2026-08-19
**Status:** Approved
**Author:** SM Web Systems Engineering
**Phase:** Testnet NFT Deployment Prerequisite

---

## 1. Problem Statement

The LMS NFT certificate system requires a Stellar testnet account to fulfil three distinct on-chain roles before any contract can be deployed or minted against:

1. **Deployer** — the account that submits the `stellar contract deploy` transaction
2. **Admin** — the address passed to `__constructor(admin, ...)` that has elevated contract control rights
3. **Minter** — the address passed to `__constructor(..., minter, ...)` and used by `mintService.ts` when calling `mint(to, caller)`

This specification defines which Stellar account(s) fill each role on testnet, the rationale for the chosen design, and the constraints that prevent testnet and production roles from interfering with each other.

---

## 2. Goals

- Define a clear, unambiguous mapping of testnet roles to Stellar keypairs
- Establish that testnet keypairs never touch mainnet and production keypairs never touch testnet
- Document the constructor parameter values that flow from the role design
- Define the mint call pattern (caller identity) on testnet
- Record the recipient pattern for testnet minting (student wallet addresses)

---

## 3. Non-Goals

- Defining multi-party or threshold custody for testnet (out of scope; single key is acceptable for isolated testing)
- Defining production role assignment (production admin and minter roles are already live; this spec does not alter them)
- Defining on-chain role rotation mechanisms (the testnet contract is disposable)
- Smart contract access control internals beyond what is needed to drive the constructor and mint call

---

## 4. Selected Role Design

### 4.1 Decision: Single Keypair for All Testnet Roles

A single testnet Stellar keypair serves as deployer, admin, and minter simultaneously.

**Rationale:**

- Testnet exists for isolated functional testing; strict role separation provides no additional security value when all roles are already controlled by the same operator on an ephemeral network
- Using a single keypair eliminates the need to manage, fund, and rotate multiple testnet accounts
- The production system already uses a dedicated minter key separate from any admin key; testnet deliberately simplifies this to reduce operational surface
- The testnet account holds only test XLM (no real funds); the risk of role conflation is negligible
- On testnet, the same key is passed to both the `admin` and `minter` constructor parameters. This is an accepted trade-off documented here and must not be replicated in production

---

## 5. Role-to-Keypair Mapping

| Role | Keypair | Key Type |
|---|---|---|
| Deployer | Testnet keypair | Secret key (S...) used to sign deploy transaction |
| Contract Admin | Testnet keypair | Public key (G...) passed as `admin` constructor argument |
| Contract Minter | Testnet keypair | Public key (G...) passed as `minter` constructor argument |
| Mint Caller (`mintService.ts`) | Testnet keypair | Secret key (S...) used to sign `mint(to, caller)` invocations |

All four roles resolve to the same underlying keypair. The testnet public key (`G...`) appears in two constructor parameters. The testnet secret key (`S...`) is used for all signed transactions on testnet.

---

## 6. Role Permissions Matrix

| Permission | Testnet Keypair | Production Minter Key | Notes |
|---|---|---|---|
| Deploy contract on testnet | Yes | No | Never use production key on testnet |
| Call `__constructor` on testnet | Yes | No | |
| Call `mint()` on testnet | Yes | No | mintService.ts uses env var; must be testnet value when in testnet mode |
| Admin operations on testnet contract | Yes | No | Admin role granted at constructor time |
| Deploy contract on mainnet | No | No | Production contract already live; not redeployed |
| Call `mint()` on mainnet | No | Yes | Production minter key only |
| Admin operations on mainnet contract | No | No | Production admin key (separate, out of scope) |

---

## 7. Network Separation Rules

These rules are absolute and have no exceptions:

1. **The testnet keypair public key must never be passed to any mainnet transaction.** A mainnet contract would grant admin or minter rights to an address whose private key is stored with lower security guarantees than the production minter.

2. **The testnet secret key must never be loaded into the production application environment.** The application reads `NFT_MINTER_SECRET` from `process.env`. On testnet deployments, this value must be the testnet secret key. On production, it must be the production minter secret key. These values must never swap.

3. **The production minter secret key must never be loaded into `~/.stellar-testnet-secrets.gpg`.** That file is testnet-only.

4. **`NFT_STELLAR_NETWORK` must be `testnet` whenever testnet keys are in use** and `public` when production keys are in use. This is the primary application-level guard against cross-network operations.

5. **`NFT_CONTRACT_ID` must be the testnet contract address** when the application is running in testnet mode. The production contract (`CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524`) must never appear in testnet environment files.

---

## 8. Mint Call Pattern

### 8.1 Contract ABI

```
mint(to: Address, caller: Address)
```

### 8.2 Testnet Mint Parameters

| Parameter | Value |
|---|---|
| `to` | Student's Amma Wallet-linked Stellar address (G...) |
| `caller` | Testnet keypair public key (G...) |

The `caller` parameter must match the `minter` address set in the constructor. On testnet, this is the testnet public key. The transaction is signed with the testnet secret key.

### 8.3 Recipient Flow (Unchanged from Production)

Recipients are student Amma Wallet addresses obtained via the existing SSO flow:

1. Student authenticates via Amma Wallet SSO
2. `sso/token` response includes `mainnetWalletAddress`
3. LMS `ammaCallback` sets `walletAddress` and `wallet_linking_status='linked'`
4. When NFT minting is triggered, `mintService.ts` reads the student's `walletAddress` from the LMS database
5. On testnet, this address is passed as `to` in the `mint()` call

The recipient flow is identical on testnet and production. The only difference is which contract and which minter key are used.

**Note:** On testnet, student addresses are real Stellar addresses (the same G... addresses linked via Amma Wallet SSO). These addresses exist on mainnet as funded accounts. On testnet, they may not have XLM balances, but they are valid Stellar addresses and can receive Soroban token transfers regardless of XLM balance (Soroban token storage is paid by the contract, not the recipient).

---

## 9. Constructor Parameter Assignment

The following parameter values flow directly from this role design:

| Constructor Parameter | Testnet Value |
|---|---|
| `admin` | Testnet keypair public key (G...) |
| `minter` | Testnet keypair public key (G...) — same address |
| `uri` | `https://lms.smwebsystems.com/api/v1/credentials/{id}/verify` |

The `uri` parameter uses the production LMS verification endpoint. This is intentional: the URI is baked into token metadata and the verification endpoint is live and accessible. Testnet certificates will produce valid verification URLs; the endpoint will return credential data if a matching credential exists in the database.

Full constructor specification is in `2026-08-19-testnet-contract-constructor-spec.md`.

---

## 10. mintService.ts Integration

`mintService.ts` reads the following environment variables at runtime:

| Variable | Testnet Value |
|---|---|
| `NFT_STELLAR_NETWORK` | `testnet` |
| `NFT_CONTRACT_ID` | Testnet contract address (set after deployment) |
| `NFT_MINTER_PUBLIC_KEY` | Testnet keypair public key |
| `NFT_MINTER_SECRET` | Testnet keypair secret key |
| `NFT_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NFT_AUTO_MINT_ENABLED` | `false` (admin-triggered, same as production) |
| `NFT_TRIGGER_QUIZ_IDS` | Testnet quiz IDs (configured per test scenario) |

These values are loaded from a testnet-specific `.env` file (e.g., `LMS-Server/.env.testnet`) that is never committed to git and is derived from the decrypted contents of `~/.stellar-testnet-secrets.gpg`.

The production `.env` file (`LMS-Server/.env`) is not modified during testnet operations.

---

## 11. Comparison with Production Role Design

| Aspect | Testnet | Production |
|---|---|---|
| Number of keypairs | 1 (deployer = admin = minter) | 2+ (admin separate from minter) |
| Admin key storage | `~/.stellar-testnet-secrets.gpg` | Separate, out of scope for this spec |
| Minter key storage | `~/.stellar-testnet-secrets.gpg` | `~/.env.secrets` |
| Application env var | `NFT_MINTER_SECRET` = testnet S... | `NFT_MINTER_SECRET` = production S... |
| Network | `testnet` | `public` |
| Funds at risk | None (test XLM only) | Real XLM in ops wallet |
| Role separation | None (acceptable) | Required |

---

## 12. Acceptance Criteria

- [ ] A single testnet keypair is generated and stored per `2026-08-19-testnet-keypair-storage-spec.md`
- [ ] The testnet public key (G...) is used for both `admin` and `minter` constructor parameters — verified in the deployment command before submission
- [ ] `NFT_STELLAR_NETWORK=testnet` in all testnet environment files
- [ ] `NFT_MINTER_PUBLIC_KEY` in testnet env matches the public key decrypted from `~/.stellar-testnet-secrets.gpg`
- [ ] `NFT_MINTER_SECRET` in testnet env matches the secret key decrypted from `~/.stellar-testnet-secrets.gpg`
- [ ] The production `~/.env.secrets` file shows no modification after testnet keypair operations
- [ ] A test mint call on testnet succeeds with the testnet minter as `caller`
- [ ] A test mint call on testnet uses a real student wallet address as `to`
- [ ] The production contract ID (`CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524`) does not appear in any testnet environment file
- [ ] The testnet keypair public key does not appear in any production environment file or the production database as `NFT_MINTER_PUBLIC_KEY`
