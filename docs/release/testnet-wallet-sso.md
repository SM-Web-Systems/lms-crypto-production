# Isolated Wallet SSO

Deploy the companion Wallet SSO change first. Before any deployment, independently confirm the Wallet and LMS staging databases, secrets, callback allowlist and frontend are isolated from production. Back up the LMS database and verify the backup and rollback procedure. Do not copy or print secrets in this repository.

For the isolated Wallet deployment set `SSO_WALLET_NETWORK=testnet`. Its signed assertion includes `testnetWalletAddress` (including null) and no mainnet address. The default `public` mode retains the existing mainnet assertion.

For LMS staging set `AMMA_WALLET_URL` and `AMMA_SSO_ISSUER` to the same exact HTTPS testnet Wallet base URL without a trailing slash, and set `AMMA_SSO_WALLET_NETWORK=testnet`. Configure the staging-scoped Wallet API key, callback allowlist and SSO state secret separately. Build the LMS web app with `VITE_AMMA_WALLET_URL` set to that same Wallet URL. The mobile preview profile uses the documented Wallet testnet URL; SSO initiation follows the LMS server configuration.

Existing unscoped LMS identities remain legacy mainnet bindings. A same-ID testnet identity cannot claim them, and a same-email conflict requires controlled account recovery. Do not rewrite or automatically link existing accounts. Use fresh synthetic staging identities for validation. The additive schema migration records the issuer and network only on new or refreshed bindings; take and verify the database backup before applying it.

Verify sign-in and callback with synthetic accounts, confirm testnet labels and testnet Horizon balance calls, and confirm legacy bindings do not cause mainnet balance requests in testnet mode. Check certificate minting is disabled or points exclusively to testnet. No blockchain transaction is needed for this check.
