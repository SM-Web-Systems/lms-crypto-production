# Testnet Contract Constructor Specification

**Date:** 2026-08-19
**Status:** Approved
**Author:** SM Web Systems Engineering
**Phase:** Testnet NFT Deployment Prerequisite

---

## 1. Problem Statement

Before a testnet NFT certificate contract can be used, it must be deployed to Stellar testnet and initialized via its `__constructor`. This specification documents the exact constructor parameters, their values and rationale, the deployment command shape, and the initialization command shape. It provides a precise, repeatable reference that an operator can follow without ambiguity.

---

## 2. Goals

- Document the constructor signature and each parameter's testnet value
- Explain the rationale for each parameter value
- Provide the deployment command shape (structure without live secret values)
- Provide the initialization command shape
- Identify the WASM artifact and its expected SHA-256 hash
- Define post-deployment verification steps

---

## 3. Non-Goals

- Generating or storing the testnet keypair (see `2026-08-19-testnet-keypair-storage-spec.md`)
- Defining the minting flow after construction (see `2026-08-19-testnet-account-roles-spec.md`)
- Modifying or redeploying the production contract (`CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524`)
- Soroban contract internals or access control implementation details

---

## 4. Contract Reference

| Item | Value |
|---|---|
| Production contract | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` |
| WASM SHA-256 | `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` |
| Contract ABI (mint) | `mint(to: Address, caller: Address)` |
| Constructor | `__constructor(admin: Address, minter: Address, uri: String)` |
| Stellar CLI version | `v27.1.0` at `~/.local/bin/stellar` |
| Testnet network | `testnet` |
| Testnet RPC URL | `https://soroban-testnet.stellar.org` |

The same WASM artifact used for production is deployed to testnet. The SHA-256 hash is the authoritative integrity check before any deployment command is issued.

---

## 5. Constructor Parameters

### 5.1 Parameter: `admin`

| Attribute | Value |
|---|---|
| Type | `Address` (Stellar) |
| Testnet value | Testnet keypair public key (`G...`, 56 characters) |
| Source | Decrypted from `~/.stellar-testnet-secrets.gpg` as `TESTNET_PUBLIC_KEY` |
| Rationale | Single keypair serves all roles on testnet (see roles spec). The admin address receives contract administrative rights, including the ability to update contract parameters. On testnet, this is the same key used for deployment and minting, which is acceptable because the account holds no real value. |
| Must NOT be | Production minter public key, any mainnet address, any address not controlled by the operator |

### 5.2 Parameter: `minter`

| Attribute | Value |
|---|---|
| Type | `Address` (Stellar) |
| Testnet value | Testnet keypair public key (`G...`, 56 characters) — same as `admin` |
| Source | Decrypted from `~/.stellar-testnet-secrets.gpg` as `TESTNET_PUBLIC_KEY` |
| Rationale | The `minter` address is the only address authorized to call `mint(to, caller)`. It must match the address whose secret key is loaded into `NFT_MINTER_SECRET` at runtime, because `mintService.ts` signs mint transactions with that key. On testnet, this is the same public key as `admin`. |
| Must NOT be | Production minter public key, any student address, any address whose secret key is not available to the LMS backend |

### 5.3 Parameter: `uri`

| Attribute | Value |
|---|---|
| Type | `String` |
| Testnet value | `https://lms.smwebsystems.com/api/v1/credentials/{id}/verify` |
| Rationale | The URI is embedded in NFT token metadata and serves as the base URL for certificate verification. The production LMS verification endpoint is live and accepts credential ID lookups. Using the production endpoint means testnet-minted certificates produce real verification URLs that resolve if the credential exists in the database. The `{id}` placeholder is substituted with the actual credential ID by the contract or the metadata consumer. |
| Alternative considered | A testnet-specific URL (`https://testnet-lms.smwebsystems.com/...`) — rejected because no testnet LMS instance exists; the production endpoint is accessible and appropriate |
| Must NOT be | An empty string, a localhost URL, or a URL that does not resolve |

---

## 6. Deployment Command Shape

The following shows the command structure. Placeholder tokens in angle brackets (`<...>`) must be substituted by the operator at runtime. No actual secret values appear in this document.

### 6.1 Step 1: Verify WASM Integrity

Before deploying, confirm the WASM file matches the known-good hash:

```bash
sha256sum <path-to-wasm-file>
# Expected: 2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb  <filename>
```

If the hash does not match, do not proceed. The WASM artifact is corrupt or has been replaced.

### 6.2 Step 2: Decrypt Testnet Keys

Decrypt the testnet keypair into shell variables (values are in-memory only, not written to disk):

```bash
eval "$(gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg)"
# Shell now has: $TESTNET_PUBLIC_KEY, $TESTNET_SECRET_KEY
```

### 6.3 Step 3: Configure Stellar CLI Identity

The Stellar CLI requires a named identity for the `--source` flag. Create a temporary in-session identity from the testnet secret key:

```bash
~/.local/bin/stellar keys add testnet-deploy --secret-key
# CLI will prompt: enter $TESTNET_SECRET_KEY interactively
```

Alternatively, if the CLI supports environment-based key input, pass the key via the appropriate flag. Consult `stellar keys --help` for the exact syntax of the installed version (v27.1.0).

### 6.4 Step 4: Deploy the WASM

```bash
~/.local/bin/stellar contract deploy \
  --wasm <path-to-wasm-file> \
  --source testnet-deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

On success, this command prints the deployed contract ID (a `C...` address). Record this value — it becomes `NFT_CONTRACT_ID` in the testnet environment.

### 6.5 Step 5: Initialize the Contract

Call `__constructor` with the three parameters. The Stellar CLI uses `stellar contract invoke` for post-deploy initialization if the constructor is not called automatically at deploy time:

```bash
~/.local/bin/stellar contract invoke \
  --id <DEPLOYED_CONTRACT_ID> \
  --source testnet-deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  __constructor \
  --admin $TESTNET_PUBLIC_KEY \
  --minter $TESTNET_PUBLIC_KEY \
  --uri "https://lms.smwebsystems.com/api/v1/credentials/{id}/verify"
```

**Parameter substitution at execution time:**

| Placeholder | Resolved from |
|---|---|
| `<DEPLOYED_CONTRACT_ID>` | Output of Step 4 |
| `$TESTNET_PUBLIC_KEY` | Shell variable from Step 2 |

### 6.6 Step 6: Clean Up In-Memory Secrets

After deployment is complete:

```bash
unset TESTNET_PUBLIC_KEY TESTNET_SECRET_KEY TESTNET_NETWORK TESTNET_CREATED
~/.local/bin/stellar keys remove testnet-deploy 2>/dev/null || true
```

The Stellar CLI identity `testnet-deploy` is ephemeral (added only for this session). Removing it ensures the secret key is not persisted in the CLI's local keystore beyond what is needed.

---

## 7. Post-Deployment Verification

After the contract is deployed and initialized, verify each constructor parameter was set correctly.

### 7.1 Verify Admin

```bash
~/.local/bin/stellar contract invoke \
  --id <DEPLOYED_CONTRACT_ID> \
  --source testnet-deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  get_admin
```

Expected output: the testnet public key (`G...`).

### 7.2 Verify Minter

```bash
~/.local/bin/stellar contract invoke \
  --id <DEPLOYED_CONTRACT_ID> \
  --source testnet-deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  get_minter
```

Expected output: the testnet public key (`G...`) — same as admin.

Note: These read-only query methods (`get_admin`, `get_minter`) must exist in the contract ABI. If they do not, verification is performed by inspecting the ledger entry for the contract's data storage keys via the RPC endpoint or a block explorer such as `stellar.expert` (testnet network).

### 7.3 Verify URI

```bash
~/.local/bin/stellar contract invoke \
  --id <DEPLOYED_CONTRACT_ID> \
  --source testnet-deploy \
  --network testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- \
  get_uri
```

Expected output: `https://lms.smwebsystems.com/api/v1/credentials/{id}/verify`

### 7.4 Record the Contract ID

After verification, update the testnet environment configuration:

```
NFT_CONTRACT_ID=<DEPLOYED_CONTRACT_ID>
```

This value goes into the LMS testnet environment file (not `~/.env.secrets`, not `LMS-Server/.env`). The exact file and injection mechanism is defined in the application environment setup for testnet mode.

---

## 8. Environment Variables After Deployment

Once the contract is deployed and initialized, the full set of testnet environment variables is:

| Variable | Value |
|---|---|
| `NFT_STELLAR_NETWORK` | `testnet` |
| `NFT_CONTRACT_ID` | `<DEPLOYED_CONTRACT_ID>` (output of Step 4) |
| `NFT_MINTER_PUBLIC_KEY` | `<TESTNET_PUBLIC_KEY>` |
| `NFT_MINTER_SECRET` | `<TESTNET_SECRET_KEY>` |
| `NFT_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NFT_AUTO_MINT_ENABLED` | `false` |
| `NFT_TRIGGER_QUIZ_IDS` | Configured per test scenario |

These values are never committed to git and are loaded at runtime via the testnet-specific environment mechanism.

---

## 9. Acceptance Criteria

- [ ] WASM SHA-256 verified as `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` before deployment
- [ ] `stellar contract deploy` exits with code 0 and returns a `C...` contract ID
- [ ] `stellar contract invoke __constructor` exits with code 0
- [ ] Post-deployment `get_admin` (or equivalent) returns the testnet public key
- [ ] Post-deployment `get_minter` (or equivalent) returns the testnet public key (same address as admin)
- [ ] Post-deployment `get_uri` (or equivalent) returns `https://lms.smwebsystems.com/api/v1/credentials/{id}/verify`
- [ ] `NFT_CONTRACT_ID` in the testnet environment is the deployed testnet contract address — NOT `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524`
- [ ] `NFT_STELLAR_NETWORK` is `testnet` in all testnet environment files
- [ ] Shell variables `TESTNET_PUBLIC_KEY` and `TESTNET_SECRET_KEY` are unset after deployment is complete
- [ ] Stellar CLI identity `testnet-deploy` is removed from the CLI keystore after deployment
- [ ] The production `~/.env.secrets` file is unmodified after the deployment procedure
- [ ] A test `mint()` call against the deployed testnet contract succeeds using the testnet minter key
