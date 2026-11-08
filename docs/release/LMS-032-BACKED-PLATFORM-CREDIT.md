# LMS-032 — backed platform credit

Status: **in progress**. The verified-backing, independent approval, reservation and consumption implementation passes local tests. Hosted validation of the published change, staging treasury/provider acceptance and the LMS-030 closure dependency remain open. No real deposit was requested, signed, submitted or credited by this work.

## Financial model

Platform credit partitions an asset pool backed by verified native XLM deposits. It is distinct from the existing independently authorized administrator grant. An administrator's assertion, wallet balance, issued deposit instructions or approval alone cannot add backing. A new backing intent pins requester, selected network, receiving account, exact integer amount, purpose and hash memo. Provider network/account readiness and the existing Stellar verifier check the actual finalized payment. The deposit receipt records operation, transaction and closed-ledger evidence.

The owner-selected public receiver remains in the ignored local staging configuration. Its earlier activation payment is not automatically classified as platform backing: backing needs its own issued intent and memo. No server configuration was changed.

One administrator requests a credit allocation for an eligible beneficiary; another administrator approves it. Requester, beneficiary and approver cannot collapse into a self-approval. Both operations require current `reward.manage`; beneficiary must have current reward-funding access. Every transition appends an immutable audit record. Requests reserve verified unallocated backing for 30 minutes; cancellation or expiry releases that hold. Replays are bound to the original beneficiary, amount, reason and action.

An approved allocation becomes available credit for its beneficiary. An independent reward administrator may reserve it for an immutable reward funding intent. Reservation holds, consumption and expiry are calculated from the durable journal rather than an increment-only balance. Funding rechecks authorization, owner, amount, network and reservation inside the existing immediate SQLite transaction. Credit consumption, its evidence, fund/reserve ledger entries and reward status commit together. Failure rolls them all back. Released or expired reservations cannot be consumed; consumed credit cannot be released again.

Conservation by network:

```text
verified deposits = unallocated pool + live pending allocation requests + approved allocations
approved allocation = available credit + live reward reservations + consumed credit
```

Consumed credit is represented in the existing reward ledger; do not add it again as another user balance. Reward cancellation/refund returns value through that ledger and does not mint the platform allowance again. Testnet backing is never available as public-network credit. Integer amounts and total backing are capped at the existing safe stroop limit. SQL triggers prevent one Stellar operation from being consumed as both direct reward funding and platform backing, including writers that bypass an application pre-check.

This is ledger backing, not on-chain escrow. Treasury custody, reserve control and reconciliation still require operational acceptance under LMS-033/034/061; historical payment evidence does not establish permanent control over an externally managed account.

### Public treasury pilot limits

The owner set a cumulative limit of **0.1 XLM per learner account**. Activation checks existing pending and eligible allocations plus amounts already released, including released amounts later refunded. Release rechecks amounts already credited before it writes to the ledger. The checks use immutable public-network platform-credit evidence and include rewards from different funders. Cancelled allocations that never reached the learner free their capacity.

An authorized operator sets the separately approved total in `REWARD_TREASURY_PILOT_TOTAL_STROOPS`. The server rejects new public pilot credit requests and approvals and blocks new allocations or releases while this value is missing or invalid. Requests reserve capacity against the budget, and approvals recheck the current budget against approved commitments. A lower budget does not erase recorded commitments. Testnet credit stays separate. The total remains pending and the public pilot requires operational acceptance.

Configure the distinct company treasury sender privately with REWARD_TREASURY_SOURCE_ACCOUNT before issuing public platform-backing instructions. New public backing intents commit to that sender in their memo hash, and verification requires it as the source of the actual native payment operation. The API returns the receiving address and memo, while the treasury sender stays in operator configuration. Testnet backing and direct Stellar reward funding keep their existing source rules.

Reconcile any open public backing intents before a sender rotation. Intents issued before sender binding, or under a different source, require private reconciliation and fresh instructions before further payments. Existing verified receipts retain their original history. Review historical receipts separately before counting them as company funds. On 8 November 2026 the designated treasury address was present on Stellar's public network. Wallet control, usable reserves and the total pilot budget still require private acceptance. [Stellar account lookup](https://developers.stellar.org/docs/data/apis/horizon/api-reference/retrieve-an-account)

### Treasury reconciliation

An operator with current reward-management permission can request `GET /api/v1/admin/rewards/platform-credit/reconciliation/public` or the corresponding `testnet` report. Each response reads one SQLite snapshot and uses the same instant for request and grant hold expiry. It returns totals and exception counts for the full network ledger, including deposit-to-intent links, independent approvals, reservation bindings, missing or mismatched consumption evidence, and grants or pools committed beyond their backing. The report sends `Cache-Control: no-store` and contains no account, wallet, transaction or evidence identifiers.

The public report also returns treasurySourceBinding. It counts receipts and the amount whose intent memo cannot be matched to the current configured sender. The unmatched values are null when no valid sender is configured. Review those receipts against the private on-chain evidence, including receipts from an earlier authorized treasury wallet. This summary leaves balances and historical receipts intact.

Both candidate lines passed hosted CI for treasury sender binding and the public reconciliation report. [Hosted treasury receipt](evidence/lms-033-hosted-treasury-validation.json)

Record the report alongside independently checked reserve custody evidence. A balanced LMS report confirms the internal relationships checked by the endpoint. The operator still needs to compare the authorized wallet's available reserves and any external disbursements with the private source records before approving the pilot.

## Administrative API

Every route below is under `/api/v1/admin/rewards/platform-credit`, authenticated and guarded by current `reward.manage`. Requests return the normal `{success,data}` envelope. No secrets or signing keys are accepted.

| Method/path | Input or result |
|---|---|
| `GET /` | Network pool totals and the 100 most recent backing intents, allocation requests, reward reservations and audit events; expired states are explicit |
| `GET /credits/:owner` | Allocation totals, available/held/consumed amounts for that beneficiary |
| `POST /deposit-intents` | `amountStroops` decimal string, `reason`, `idempotencyKey`; returns pinned instructions |
| `POST /deposit-intents/:id/verify` | `operationId`; verifies the actual purpose-bound native payment |
| `POST /requests` | `beneficiaryUserId`, `amountStroops`, `reason`, `idempotencyKey`; reserves unallocated backing on the configured network |
| `POST /requests/:id/approve` | Independent administrator, `reason`, `idempotencyKey` |
| `POST /requests/:id/cancel` | `reason`; releases a pending allocation request |
| `POST /reservations/:intentId/release` | Releases an unconsumed reward funding reservation |

The existing portal funding-options endpoint offers only approved allocations with sufficient available credit to an independent administrator. Its confirmation dialog reserves the selected allocation, shows exact XLM exposure/network and retains the same intent/reference/key on retries. Ordinary reward owners cannot self-authorize this path. The established role-scoped intent/fund endpoints remain the only reward-crediting path.

## Storage and validation

The additive migration creates empty backing, approval, reservation, consumption and audit tables. It invents no historical receipts or approvals and leaves existing reward transaction CHECK constraints unchanged. Full schema/keys/immutable-trigger validation applies after migration. Only wholly absent new tables are tolerated before the additive migration.

See the [validation receipt](evidence/lms-032-validation.json). The final 79-case regression/HTTP group passes, along with 50 focused web assertions and 169 Windows CRLF migration cases. Current account-deletion restrictions are rechecked after provider waits; legal-hold access follows the existing authentication policy. Local checks cover insufficient backing, permission and independence, immutable/idempotent approval, network separation, partial consumption, cancellation/expiry, storage rollback, both cross-domain database refusal directions, and HTTP boundaries. The compiled separate-process drill verifies one backing deposit/allocation after restart, three competing reservations with only one success, concurrent funding/replay without new value and exact remaining capacity. CI runs it with the existing funding restart drill.

All 27 funding cases pass across Chromium/Firefox/WebKit at 320/390/768px with retries disabled. The credit UI cases simulate retry responses; the actual authorization and financial mutations are exercised by the HTTP and compiled SQLite runtime tests. These results do not establish physical-device, live provider, treasury or production-release acceptance.

Hosted candidate `d575fd8` passed all CI and mobile jobs; see the [hosted receipt](evidence/lms-032-hosted-validation.json). The [approved real Stellar testnet run](evidence/lms-031-real-testnet-validation.json) also verified an actual testnet backing payment, one independent allocation approval and a replay-safe consumption. This testnet value is isolated from the public-network pool. Actual treasury/custody and staging acceptance remain open.
