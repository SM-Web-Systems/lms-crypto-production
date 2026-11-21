# Second NFT Solution — Architecture

> **Status:** IN PROGRESS
> **Date:** 2026-08-19

## Components

```
┌─────────────────────────────────────────────────┐
│ Routes (nftApplications.ts, admin.ts)           │
│ ┌─────────────────────────────────────────────┐ │
│ │ getNftProvider(config)                      │ │
│ │   ├─ NFT_PROVIDER=legacy → LegacyStellar   │ │
│ │   └─ NFT_PROVIDER=enhanced → EnhancedV2    │ │
│ └─────────────────────────────────────────────┘ │
│                    ↓                            │
│ ┌─────────────────────────────────────────────┐ │
│ │ NftProvider interface                       │ │
│ │   mint(params) → MintResult                 │ │
│ │   getMetadata(tokenId) → MetadataResult     │ │
│ │   reconcile(credId) → ReconcileResult       │ │
│ │   getStatus(credId) → StatusResult          │ │
│ │   getProviderInfo() → ProviderInfo          │ │
│ └─────────────────────────────────────────────┘ │
│          ↓                    ↓                 │
│ ┌──────────────┐  ┌─────────────────────────┐   │
│ │ LegacyStellar│  │ EnhancedStellarProvider │   │
│ │ (adapter)    │  │ (state machine,         │   │
│ │ delegates to │  │  idempotency keys,      │   │
│ │ mintService  │  │  structured errors)     │   │
│ │ + reconcSvc  │  │  DISABLED BY DEFAULT    │   │
│ └──────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Interfaces

### NftProvider

```typescript
interface NftProvider {
  readonly name: string;
  readonly version: string;

  mint(params: MintParams): Promise<MintResult>;
  getMetadata(tokenId: number): Promise<MetadataResult | null>;
  reconcile(credentialId: string): Promise<ReconcileResult>;
  getStatus(credentialId: string): Promise<CredentialStatus>;
  getProviderInfo(): ProviderInfo;
}

interface MintParams {
  userId: string;
  walletAddress: string;
  courseId?: string;
  quizId?: string;
  applicationId?: string;
  idempotencyKey?: string;
}

interface MintResult {
  txHash: string;
  sorobanTokenId: number | null;
  network: string;
  provider: string;
}

interface ProviderInfo {
  name: string;
  version: string;
  network: string;
  contractId: string;
  capabilities: string[];
}
```

### Provider Selection

```typescript
function getNftProvider(): NftProvider {
  const providerName = process.env.NFT_PROVIDER || 'legacy';
  switch (providerName) {
    case 'legacy': return new LegacyStellarProvider();
    case 'enhanced': return new EnhancedStellarProvider();
    default: return new LegacyStellarProvider(); // fail safe
  }
}
```

## Data Flow

1. Route handler calls `getNftProvider()` → returns provider based on feature flag
2. Route handler calls `provider.mint(params)` → provider handles all blockchain interaction
3. Provider persists tx_hash, status, errors to `nft_credentials` table
4. Provider returns structured `MintResult` or throws typed error
5. Route handler does NOT directly import `mintService.ts`

## State Model

The provider abstraction does not change the existing state model (`pending` → `minted` | `failed`). The enhanced provider adds internal substates for observability but maps them to the same DB values.

## Configuration

| Variable | Values | Default | Behavior |
|----------|--------|---------|----------|
| `NFT_PROVIDER` | `legacy`, `enhanced` | `legacy` | Missing → legacy |
| `NFT_STELLAR_NETWORK` | `public`, `testnet` | (required) | Unchanged |
| `NFT_AUTO_MINT_ENABLED` | `true`, `false` | `false` | Unchanged |

## Network Boundaries

- LegacyStellarProvider: delegates to existing `mintService.ts` (Soroban RPC)
- EnhancedStellarProvider: same Soroban RPC but with state machine wrapper
- No new network endpoints introduced
- No cross-network calls

## Security Controls

- No private key, seed, passphrase, signing payload, or decrypted credential may appear in logs, API responses, test fixtures, committed files, or diagrams.
- Provider interface never exposes secret material
- Enhanced provider uses same secret-loading path as existing (`getNftNetworkConfig()`)
- Feature flag cannot be set to `enhanced` in production without explicit approval
