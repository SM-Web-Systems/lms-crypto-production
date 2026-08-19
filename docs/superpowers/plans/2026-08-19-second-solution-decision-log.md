# Second NFT Solution — Decision Log

| # | Decision | Alternatives Considered | Rationale | Date |
|---|----------|------------------------|-----------|------|
| D-01 | Selected Candidate A (Provider Abstraction) | B (Event-driven), C (Off-chain cert), D (Metadata service), E (Verification indexer) | A is foundational — enables B/D/E as future additions without touching core routes. Lowest risk, highest testability. |  2026-08-19 |
| D-02 | Rejected Candidate B (Event-driven pipeline) | — | Too complex for initial iteration. Requires new tables, worker processes. Can be built on top of provider abstraction later. | 2026-08-19 |
| D-03 | Rejected Candidate C (Off-chain signed cert) | — | Changes product definition (cert vs NFT). Out of scope for infrastructure improvement. | 2026-08-19 |
| D-04 | Selected Candidate D as fallback | — | Smallest scope, no DB changes, high standalone value if A proves too invasive. | 2026-08-19 |
| D-05 | Feature flag: `NFT_PROVIDER=legacy` | `NFT_SECOND_SOLUTION_ENABLED=false`, `NFT_V2_ENABLED` | String enum is more extensible than boolean. Matches potential future providers. Fail-safe: missing/invalid → legacy. | 2026-08-19 |
| D-06 | LegacyStellarProvider wraps existing code | Rewrite existing code to implement interface | Adapter pattern = zero risk to existing behavior. No production code paths change. | 2026-08-19 |
| D-07 | EnhancedStellarProvider starts as stub | Full implementation | Stub validates interface contract. Full implementation requires activation approval. | 2026-08-19 |
| D-08 | No database migration | Add provider column to nft_credentials | Current schema supports both providers via existing columns. Migration can be added later if needed. | 2026-08-19 |
| D-09 | Provider info added to integration-status | New dedicated endpoint | Existing admin endpoint already shows NFT config. Adding provider info is additive. | 2026-08-19 |
