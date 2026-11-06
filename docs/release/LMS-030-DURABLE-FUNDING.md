# LMS-030 — durable reward funding foundation

Status: **in progress**. The local implementation can be tested independently of the outstanding LMS-011 private cutover decisions. Staging acceptance and that closure dependency remain open. This change has not been deployed and moves no real funds.

The existing independent administrator grant is the only available funding path. Stellar still requires LMS-031 verification, platform credit still requires LMS-032 backed provisioning, and Paystack-to-XLM still requires the LMS-033 provider/custody decision. The API does not interpret client claims or feature flags as verified funding. These unavailable methods are explained in the portal without offering a submission action.

## Implemented contract

- `GET /api/v1/{sponsor|employer|parent|teacher}/rewards/:id/funding-options` requires current `reward.fund` permission and current resource access. It reports availability for the actual actor and reward state. The independent grant additionally requires `reward.manage` and an authorizer different from the reward creator.
- `POST .../:id/funding-intents` accepts `sourceType`, optional opaque `reference` and a stable `idempotencyKey`. Owner, actor, reward, network, native asset, currency and integer total exposure come from authoritative server state. Caller-supplied financial/verification assertions are ignored. The initial implemented network is `internal`, asset `native:XLM`; external adapters must define and verify their own immutable binding before becoming available.
- An intent expires after 30 minutes. Payload fields are immutable. Reusing a creation key for another resource, reference or changed financial obligation fails. Expired intent retries cannot credit value.
- `POST .../:id/fund` accepts an optional `intentId`; the server rechecks binding and current authorization inside the ledger transaction. Existing clients receive an automatically created intent in that same transaction. Historical fund transactions are not retroactively labeled verified.
- Fund, reserve, evidence insertion, intent consumption and final reward state commit together. Any failure rolls them back together. A unique evidence record links one intent to one fund transaction. Grant references and server-generated intent evidence occupy separate internal namespaces; the previous global ledger reference constraint remains enforced.
- Funding writers acquire the SQLite write lock before rechecking idempotency. Simultaneous retries from separate processes return the same committed result. A restart retry cannot create another credit; a different key cannot fund an already funded reward.
- The portal prepares the intent, displays the exact XLM exposure to seven decimal places and asks the authorized administrator to confirm. Ambiguous submission failures retry the same key/intent. Target changes discard stale responses. Keyboard focus stays in the dialog and returns to its actual opening control, including WebKit pointer activation.

## Storage and upgrade

The additive migration creates empty `reward_funding_intents` and `reward_funding_evidence` tables after the existing reward tables. It does not modify historical financial rows or create synthetic evidence. Startup accepts a wholly absent new table before that migration, but refuses partial or altered existing funding DDL. Post-migration validation requires the full schema, constraints, keys and immutable-history triggers. Existing RBAC fences, integrity/FK checks and writer controls stay enforced.

`npm run test:reward-funding-runtime` exercises the compiled application against a disposable synthetic database: pre-funding-table upgrade, three simultaneous child processes, a new-process retry, a different-key refusal, exact ledger/balance counts, integrity and foreign keys. CI runs this drill after compilation.

## Acceptance evidence

The [validation receipt](evidence/lms-030-validation.json) records the actual commands, counts and hashes, including initial failed attempts. Local tests establish the implemented grant contract; they do not establish external settlement, a configured Stellar destination/network, backed credit, staging sign-off or production enablement. LMS-031/032 must extend this contract rather than create a separate credit path. LMS-033 remains awaiting provider and treasury/custody selection.
