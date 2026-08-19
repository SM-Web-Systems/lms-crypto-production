# Token Metadata Verification Spec

**Date:** 2026-08-19
**Status:** PARTIALLY AVAILABLE
**Scope:** Assessment of NFT token metadata availability and compliance

---

## Summary

The on-chain `base_uri` is correctly set and verified. However, HTTP requests to the metadata URL return the Amma Wallet single-page application (SPA) HTML instead of NFT-specific JSON metadata. The metadata service for token-specific JSON is not yet implemented.

This is NOT a blocker for testnet verification. The contract works correctly and stores the base_uri. Metadata is a frontend/API concern that requires separate implementation.

---

## On-Chain Metadata

| Field | Value | Status |
|---|---|---|
| `base_uri` | `https://testnet.ammawallet.com/nft/` | VERIFIED on-chain |
| `name` | `Stellar Course Certificate` | VERIFIED on-chain |
| `symbol` | `SCC` | VERIFIED on-chain |

The contract storage contains the correct metadata fields as set during deployment.

---

## HTTP Metadata Endpoint Assessment

### GET `https://testnet.ammawallet.com/nft/`

- **HTTP Status:** 200
- **Content-Type:** text/html
- **Response:** Amma Wallet SPA (React application HTML)
- **Expected:** NFT collection-level JSON metadata (optional)

### GET `https://testnet.ammawallet.com/nft/0`

- **HTTP Status:** 200
- **Content-Type:** text/html
- **Response:** Amma Wallet SPA (React application HTML, same as above)
- **Expected:** Token-specific JSON metadata for token ID 0

### Assessment

The `/nft/` and `/nft/0` paths are caught by the SPA's catch-all routing rule (typical for single-page applications where the web server serves `index.html` for all unmatched routes). The Amma Wallet frontend is the application being served, not an NFT metadata endpoint.

No NFT metadata service exists at these URLs. The 200 status is misleading — it is the SPA responding, not a metadata API.

---

## NFT Metadata Compliance Gap

For full NFT metadata compliance, a JSON endpoint should return per-token metadata. Standard NFT metadata JSON format:

```json
{
  "name": "Stellar Course Certificate #0",
  "description": "Certificate of completion for [course name]",
  "image": "https://testnet.ammawallet.com/nft/0/image.png",
  "attributes": [
    { "trait_type": "Course", "value": "..." },
    { "trait_type": "Issued", "value": "2026-08-19" },
    { "trait_type": "Recipient", "value": "..." }
  ]
}
```

The `base_uri` convention expects `{base_uri}{token_id}` to resolve to token-specific JSON. Currently this does not work.

---

## Impact Assessment

| Concern | Impact |
|---|---|
| Contract functionality | NONE — contract mints, tracks tokens, emits events correctly |
| Token ownership | NONE — ownership is on-chain, independent of metadata |
| Testnet verification | NONE — metadata is a presentation layer concern |
| Production readiness | BLOCKING — metadata endpoint required before production NFTs are publicly shareable |
| Certificate verification page | PARTIAL — the `/verify/:credentialId` page works from the LMS DB, not from on-chain metadata |

---

## Recommendation

Implement a `/nft/:tokenId` API endpoint that returns JSON metadata. This requires:

1. A backend route (in Amma Wallet API or LMS API) that queries the credential DB
2. JSON response with token name, description, image URL, and attributes
3. Proper `Content-Type: application/json` header
4. 404 for non-existent token IDs

This implementation requires separate approval and is not part of the current verification scope.

---

## Distinction

- **On-chain metadata fields** (base_uri, name, symbol): VERIFIED and correct
- **HTTP metadata service** (JSON endpoint at base_uri): NOT YET IMPLEMENTED
- **Certificate verification page** (/verify/:credentialId in LMS): EXISTS and functional (uses LMS DB, not on-chain metadata)
