# LMS-031 — Stellar funding verification

Status: **in progress**. This is an isolated verifier implementation; it is not yet connected to funding availability, stored intents or ledger consumption. The existing Stellar funding path still refuses funding. No real network request, transaction signature, submission or funding operation was performed by these tests.

The verifier reads only fixed HTTPS Horizon endpoints for the explicitly selected network. It checks the network passphrase, operation identity/type/success, native asset, exact destination and integer stroop amount; transaction success, ledger inclusion, intent hash memo and intent time window; and the matching closed ledger. It rejects issued-asset XLM lookalikes, wrong-network evidence, under/overpayment, failed transactions and mismatched memos. Provider failures become retryable safe errors. Requests share a five-second deadline, refuse redirects and cap response bodies at 128 KiB. Provider links and caller-controlled URLs are never followed.

The [Stellar operation](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/operations/object), [payment](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/payments/object) and [transaction](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/transactions/object) contracts define the fields being checked. Verification trusts the pinned HTTPS provider's ledger view; it is not an independent consensus implementation.

Fifteen local provider-contract tests pass with mocked responses; see the [receipt](evidence/lms-031-verifier-validation.json). Mocked testnet records are not an actual testnet funding receipt.

Required next work:

1. Persist destination and server-generated intent hash binding with the existing immutable funding intent. Use a distinct operation reference and network namespace for unique consumption.
2. Route verification through the existing private verified funding transaction, rechecking current scope, immutable obligation and expiry before atomically recording provider evidence, fund, reserve and consumption. Replays/restarts/concurrent claims must not credit twice.
3. Expose the exact network, destination, asset, amount and memo instructions through the availability/confirmation UI. Keep the path unavailable without explicit valid configuration.
4. Obtain the staging network and public receiving account from the owner, then perform authorized synthetic testnet acceptance, provider timeout/retry and wrong-network/replay cases. The owner was asked for the public configuration; no secret key is needed to verify payments.

LMS-030 and LMS-011 closure dependencies remain open. Provider integration and actual testnet evidence are not supplied by this preparatory verifier commit.
