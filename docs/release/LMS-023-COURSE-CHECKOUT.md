# LMS-023 course checkout validation

Status **in progress**. The Paystack checkout implementation has local regression coverage. The integrated Wallet and Paystack sandbox acceptance still require the approved provider and staging accounts.

The checkout route previously sent a response for an existing pending payment and continued into another provider initialization. It also supplied a fixed USD currency. The route now reserves the application's payment reference in an immediate SQLite transaction before any provider call and uses the stored course price and currency. It verifies the returned reference and Paystack checkout origin, then stores the provider link separately from normal payment payloads. Repeated requests can reuse the stored checkout when the payment owner and terms still match.

A missing link after a timeout, unexpected provider response or release hold leaves one reference available for reconciliation. Historical pending or failed Paystack records without a reusable link also require reconciliation. The route refuses a new checkout for those cases because an earlier reference may still receive a late success. Signed webhooks can still settle the reserved payment. Before approving any replacement attempt, verify the earlier reference and amount against provider evidence and record the decision privately. [Paystack transaction API](https://paystack.com/docs/api/transaction/#initialize) · [Paystack checkout guidance](https://paystack.com/docs/payments/accept-payments/)

## Full refunds

An authorized administrator can submit one full refund per confirmed Paystack payment. The LMS reserves the merchant refund reference before contacting Paystack, sends the original charge reference, amount and currency, and returns HTTP 202 after verifying the provider acknowledgment. The payment remains confirmed until a signed, matching full `refund.processed` webhook arrives. A concurrent request, an ambiguous response, or prior partial refund evidence requires reconciliation before any further refund action. A replay of an acknowledged request does not send another provider request. [Paystack refunds](https://paystack.com/docs/payments/refunds/)

In the approved merchant environment, reconcile by the stored merchant refund reference in `paystack_refund_requests` and the original charge reference on the payment. Check historical LMS records already marked refunded against Paystack because the prior endpoint recorded that status at submission. Record provider exceptions privately and use the merchant's refund support process for failed or needs-attention refunds. [Paystack refund reference lookup](https://paystack.com/docs/payments/refunds/#fetch-a-refund-by-reference)

## Remaining sandbox acceptance

An unauthenticated staging probe on 7 November observed LMS build `f5a64e8`, which predates the current candidate. Web and native SSO starts pointed to `https://ammawallet.com/sso/login` with the exact staging LMS callback. The API rejected a caller-supplied callback and returned to the LMS login page when the required callback parameters were missing. The public Wallet sign-in page responded, but its deployed build and test account were unverified. The LMS health response reported the Wallet network as public. [Staging probe receipt](evidence/lms-023-staging-sso-entry.json)

The public LMS callback carried `Referrer-Policy: strict-origin-when-cross-origin` while that deployed API revision sets `no-referrer`. The public response identified Cloudflare. The origin of the header change is unverified. Before authenticated staging acceptance, the platform owner should check the staging proxy and edge response rules for the callback and confirm the public response preserves `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Use a parameter-free callback to recheck the headers before using real sign-in assertions. [Referrer Policy specification](https://www.w3.org/TR/referrer-policy/#referrer-policy)

```bash
curl --silent --show-error --dump-header - --output /dev/null \
  https://lms.smwebsystems.com/api/v1/auth/amma-callback \
  | grep -Ei '^(HTTP/|referrer-policy:|cache-control:)'
```

The candidate now also applies `Cache-Control: no-store` at web and native SSO entry, where the redirect carries an attempt-specific signed state.

The assertion exchange sends its POST only to the configured AmmaWallet verification endpoint. It rejects redirects and applies the request deadline through response parsing. Provider error bodies and malformed identity payloads are excluded from the errors logged by the LMS callback. The loopback regression uses a second origin to verify that HTTP 307 and 308 deliver no request to the redirect target.

The parameter-free public callback recheck still returned HTTP 302, `Cache-Control: no-store` and `Referrer-Policy: strict-origin-when-cross-origin`. The repository's deployment compose delegates the public edge to the host's shared proxy. To isolate the hop, the authorized server operator can compare the public check above with this check directly inside the LMS API container. Both commands report only status and the two relevant headers.

```bash
docker exec lms-api node -e '
fetch("http://127.0.0.1:3001/api/v1/auth/amma-callback", {
  redirect: "manual", signal: AbortSignal.timeout(5000)
}).then(response => {
  console.log(response.status, response.headers.get("cache-control"),
    response.headers.get("referrer-policy"));
  return response.body?.cancel();
}).catch(() => { process.exitCode = 1; });
'
```

If the container returns `no-referrer` and the public response differs, compare the shared proxy response with the public response to identify the overriding hop. If the container also differs, verify its running image and callback route. Recheck the public response before using authenticated assertions.

Use the approved staging course, authorized synthetic learner, and a confirmed Paystack test-mode merchant. Record the deployed LMS and Wallet revisions and the test-mode evidence. Verify paid checkout for the configured merchant currency, duplicate/concurrent initiation, mismatched and reordered signed webhooks, receipt ownership, and a sandbox refund. Record the provider outcome and local payment ledger for each reference without including payment credentials. Test Wallet SSO, verified-email recovery and the enabled challenge and second-factor flows using the approved capture mechanism. A separate decision governs any live enablement.

Local regressions use mocked responses at the HTTP boundary and synthetic signatures. They cover the checkout race, replay, price currency, provider mismatch, late webhook settlement, release hold and additive schema startup. No real transaction or provider call was made.
