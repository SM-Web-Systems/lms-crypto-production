# LMS-030 — durable reward funding foundation

Status: **in progress**. The local implementation can be tested independently of the outstanding LMS-011 private cutover decisions. Staging acceptance and that closure dependency remain open. This change has not been deployed and moves no real funds.

The foundation now has the original independent administrator grant, [verified Stellar funding](LMS-031-STELLAR-VERIFICATION.md) and [backed platform credit](LMS-032-BACKED-PLATFORM-CREDIT.md) implemented locally. Availability depends on actual configuration, receiver readiness, current authorization and approved backing. The MVP uses company-funded rewards. Paystack-to-XLM conversion is deferred beyond the MVP. The API does not interpret client claims or feature flags as verified funding. These unavailable methods are explained in the portal without offering a submission action.

## Implemented contract

- `GET /api/v1/{sponsor|employer|parent|teacher}/rewards/:id/funding-options` requires current `reward.fund` permission and current resource access. It reports availability for the actual actor and reward state. The independent grant additionally requires `reward.manage` and an authorizer different from the reward creator.
- `POST .../:id/funding-intents` accepts `sourceType`, optional opaque `reference` and a stable `idempotencyKey`. Owner, actor, reward, network, native asset, currency and integer total exposure come from authoritative server state. Caller-supplied financial/verification assertions are ignored. Administrator grants use `internal`; Stellar and backed credit pin `testnet` or `public`, with asset `native:XLM`.
- An intent expires after 30 minutes. Payload fields are immutable. Reusing a creation key for another resource, reference or changed financial obligation fails. Expired intent retries cannot credit value.
- `POST .../:id/fund` accepts an optional `intentId`; the server rechecks binding and current authorization inside the ledger transaction. Existing administrator-grant clients receive an automatically created intent in that same transaction. Stellar and backed-credit callers must present their original issued intent. Historical fund transactions are not retroactively labeled verified.
- Fund, reserve, evidence insertion, intent consumption and final reward state commit together. Any failure rolls them back together. A unique evidence record links one intent to one fund transaction. Grant references and server-generated intent evidence occupy separate internal namespaces; the previous global ledger reference constraint remains enforced.
- Funding writers acquire the SQLite write lock before rechecking idempotency. Simultaneous retries from separate processes return the same committed result. A restart retry cannot create another credit; a different key cannot fund an already funded reward.
- The portal prepares the intent, displays the exact XLM exposure to seven decimal places and asks the authorized administrator to confirm. Ambiguous submission failures retry the same key/intent. Target changes discard stale responses. Keyboard focus stays in the dialog and returns to its actual opening control, including WebKit pointer activation.

## Storage and upgrade

The additive migration creates empty `reward_funding_intents` and `reward_funding_evidence` tables after the existing reward tables. It does not modify historical financial rows or create synthetic evidence. Startup accepts a wholly absent new table before that migration, but refuses partial or altered existing funding DDL. Post-migration validation requires the full schema, constraints, keys and immutable-history triggers. Existing RBAC fences, integrity/FK checks and writer controls stay enforced.

`npm run test:reward-funding-runtime` exercises the compiled application against a disposable synthetic database: pre-funding-table upgrade, three simultaneous child processes, a new-process retry, a different-key refusal, exact ledger/balance counts, integrity and foreign keys. CI runs this drill after compilation.

## Acceptance evidence

The complete published candidate `4bd7a63` passed [all eight CI jobs](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42255590949) and [mobile CI](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42255590982). Linux API: **2,423 passed, one existing protected-copy skip**; web: **718 passed**; Chromium: **86 passed without retries**. Both Windows fixture lanes and the compiled three-process/restart funding drill passed. See the [hosted receipt](evidence/lms-030-hosted-validation.json).

The [validation receipt](evidence/lms-030-validation.json) records the actual commands, counts and hashes, including initial failed attempts. The foundation receipt records its original grant-only candidate. Later Stellar/credit receipts extend the same intent and financial transaction. Local implementation does not establish external settlement, staging sign-off or production enablement. LMS-033 tracks custody and operating acceptance for the company reserve.
