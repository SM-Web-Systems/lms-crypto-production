# Integrated LMS candidate and release gates

This candidate brings the reconciled RBAC, Sponsor Portal, course-payment,
reward-funding, mobile, push and offline implementations onto current main.
Existing explicit grants remain authoritative. The compatibility bridge stays
in place; legacy schema and endpoint retirement are separate releases.

The source includes scoped sponsor access and revocation, quantitative reporting
and protected receipts; durable payment/funding verification and credit
accounting; native Wallet session handling; and durable push/offline queues.
Provider credentials, private inventory decisions, treasury policy and physical
acceptance evidence are supplied through separate operator records.

This branch contains source and synthetic tests. It does not contain the private
audit history or account, database, mail, provider, signing or recovery records.
It preserves the read-only release-verification request identity already merged
on main, together with exact callback header checks. It changes no SSH settings.

## Validate this exact candidate

Use clean locked dependency installs. Run the required API, web, mobile,
cross-platform fixture and release-tooling checks. Build exact API/web images
from the committed source, pin their digests and revisions, and run synthetic
startup/write-hold checks. Earlier feature-branch CI does not certify this
reconciled snapshot. Local automated results are recorded below; hosted and live release gates remain pending.

## Release sequence

1. Inventory a finalized consistent staging snapshot offline. Review every
   account/profile/integrity finding and record known installed clients and
   endpoint observations, including coverage limits. Keep existing grants and
   managed revocations authoritative. See [private review procedure](LMS-010-PRIVATE-REVIEW.md).
2. Rehearse the supported offline RBAC cutover, startup holds, exact-image
   recovery and data preservation on protected copies. Preserve recoverable
   source images and finalized backup/receipt pairs. A successful inventory
   worksheet alone does not authorize migration or establish recovery readiness.
3. Reconcile provider configuration with the exact candidate. AmmaWallet remains
   the account and wallet authority. Use an isolated Paystack test-mode target
   for charges/refunds; promote credentials only through the reviewed release.
   Keep course payments separate from reward funding. Public-network treasury
   operations require their own budget, custody, approval and reconciliation
   decisions; no transfer is authorized by this source change.
4. Verify authenticated dummy sponsor lifecycles, isolation, revocation,
   receipts and exports. Accept signed, pinned Android and iOS builds on
   physical devices, including all core groups and separate push/offline cases.
   Native mocks, build exports and configured Firebase credentials do not prove
   device acceptance or notification delivery.
5. Review the exact release/recovery bindings, execute the separately authorized
   staging release, verify the API revision, authorization and Wallet callback,
   and complete the observation window. Retire legacy compatibility only after
   its independent client and recovery gates pass.

Keep private account identities, keys, tokens, addresses associated with private
treasury decisions and raw customer evidence outside Git. Report actual test
results, failures, retries and unexecuted gates without converting a synthetic
rehearsal into production or hardware acceptance.

## Local automated results

The API build and 2,550 tests passed, with one existing protected-copy skip.
The web build and all 727 tests passed. Fresh locked API/web installs reported
zero dependency findings. The Windows release-tool suite ran 347 cases:
335 passed and 12 platform-conditional cases were skipped. Existing hosted Linux
monitoring covers the applicable POSIX/GNU-tar cases; Windows release-tool
coverage is now explicit too.

Compiled source-free startup, RBAC refusal/restart/restore, funding, credit and
push process-death drills passed with synthetic data/providers. The actual
previous backend was not included in this local runtime drill; exact-image
protected-copy recovery remains a separate gate.

The initial shared-server browser run passed 131 of 132 cases. The final WebKit
sponsor-revocation request hit the test API's existing IP write allowance.
Running each browser with its own fresh API and synthetic database passed
92 Chromium, 20 Firefox and 20 WebKit cases, all with zero retries. CI now uses
the same isolation. Production limits and test assertions are unchanged, and
the original failure evidence is retained separately.

See the [structured local results](LMS-INTEGRATED-VALIDATION.json). These results
do not certify provider delivery, physical devices, a live migration or a
deployment. Hosted checks must pass on the exact proposed commit before merge.
