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
