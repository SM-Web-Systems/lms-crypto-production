# NFT TTL keeper

The mainnet certificate contract (`CDPKSOOE…H524`, OpenZeppelin NFT wasm) never extends its own
instance or wasm TTL, and its 30-day per-token extensions are below the network minimum of 120 days.
When the instance and wasm archive, the next mint has to pay the restore (21.61 XLM on 20 Nov 2026),
and the mint fee cap refuses it. The keeper sends `ExtendFootprintTTL` from the minter account so the
contract stays about one to two months ahead. No contract change is needed.

## Behaviour

- Checks every `NFT_TTL_CHECK_INTERVAL_HOURS` (default 24). It tracks the instance, the wasm, the
  minter role, and for every token: Owner, GlobalTokens, GlobalTokensIndex, OwnerTokensIndex, plus
  the owner's Balance and OwnerTokens entries.
- A live entry with fewer than `NFT_TTL_THRESHOLD_DAYS` (default 30) left is extended to
  `NFT_TTL_TARGET_DAYS` (default 60) from now. Entries further ahead cost nothing.
- It batches up to 40 entries per transaction and refuses any fee above `NFT_TTL_MAX_FEE_STROOPS`
  (default 100000000 = 10 XLM).
- It never restores archived entries. It logs them as `nft_ttl_archived`.

## Switches (all off by default)

| Env | Effect |
|---|---|
| `NFT_TTL_KEEPER_ENABLED=true` | run the check (dry run: simulate and log the cost) |
| `NFT_TTL_KEEPER_SEND=true` | also sign and send (spends XLM from the minter) |

`npm run nft:ttl-check` (inside the API container) prints a one-off dry run. It never sends.

## Expected cost (simulated 23 Nov 2026)

- Instance + wasm: about 6.17 XLM per 30 days (almost all of it is wasm rent).
- All 36 certificates' entries: about 1.05 XLM per 30 days.
- With the defaults, the first contract top-up is due about 18 Feb 2027 (it is live until about 20 Mar 2027).
