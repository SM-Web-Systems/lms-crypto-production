# Testnet Keypair Generation Flow

**Date:** 2026-08-19
**Status:** COMPLETE

> **Public Address:** `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`
> **Encrypted file:** `~/.stellar-testnet-secrets.gpg` (mode 600, AES-256)
> **Account:** NOT funded

```mermaid
flowchart TD
    A[Approval Granted] --> B["stellar keys generate lms-testnet-minter --network testnet"]
    B --> C["stellar keys public-key lms-testnet-minter"]
    C --> D["Record public address G..."]
    D --> E["stellar keys secret lms-testnet-minter | gpg --symmetric --cipher-algo AES256 -o ~/.stellar-testnet-secrets.gpg"]
    E --> F[Enter GPG passphrase]
    F --> G["stellar keys rm lms-testnet-minter"]
    G --> H["Verify: ls -la ~/.stellar-testnet-secrets.gpg"]
    H --> I{Permissions 600?}
    I -->|Yes| J[COMPLETE]
    I -->|No| K[chmod 600]
    K --> J

    style A fill:#90EE90
    style J fill:#90EE90
```
