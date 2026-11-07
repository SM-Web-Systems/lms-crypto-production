# LMS-023 course checkout validation

Status **in progress**. The Paystack checkout implementation has local regression coverage. The integrated Wallet and Paystack sandbox acceptance still require the approved provider and staging accounts.

The checkout route previously sent a response for an existing pending payment and continued into another provider initialization. It also supplied a fixed USD currency. The route now reserves the application's payment reference in an immediate SQLite transaction before any provider call and uses the stored course price and currency. It verifies the returned reference and Paystack checkout origin, then stores the provider link separately from normal payment payloads. Repeated requests can reuse the stored checkout when the payment owner and terms still match.

A missing link after a timeout, unexpected provider response or release hold leaves one reference available for reconciliation. Historical pending or failed Paystack records without a reusable link also require reconciliation. The route refuses a new checkout for those cases because an earlier reference may still receive a late success. Signed webhooks can still settle the reserved payment. Before approving any replacement attempt, verify the earlier reference and amount against provider evidence and record the decision privately. [Paystack transaction API](https://paystack.com/docs/api/transaction/#initialize) · [Paystack checkout guidance](https://paystack.com/docs/payments/accept-payments/)

## Remaining sandbox acceptance

Use the approved staging course, authorized synthetic learner, and a confirmed Paystack test-mode merchant. Record the deployed LMS and Wallet revisions and the test-mode evidence. Verify paid checkout for the configured merchant currency, duplicate/concurrent initiation, mismatched and reordered signed webhooks, receipt ownership, and a sandbox refund. Record the provider outcome and local payment ledger for each reference without including payment credentials. Test Wallet SSO, verified-email recovery and the enabled challenge and second-factor flows using the approved capture mechanism. A separate decision governs any live enablement.

Local regressions use mocked responses at the HTTP boundary and synthetic signatures. They cover the checkout race, replay, price currency, provider mismatch, late webhook settlement, release hold and additive schema startup. No real transaction or provider call was made.
