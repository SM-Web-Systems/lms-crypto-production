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

For candidate acceptance, run the smoke check with the approved full API revision:

```bash
SMOKE_BASE_URL=https://lms.smwebsystems.com/api/v1 \
  SMOKE_EXPECTED_BUILD_SHA="$APPROVED_LMS_API_SHA" \
  SMOKE_REQUIRE_WALLET_CALLBACK=1 bash scripts/smoke-test.sh
```

On 8 November 2026 the public staging API matched the observed f5a64e8 revision and passed the other four API checks. The callback header check failed.

The approved origin probe then observed HTTP 302, no-referrer and no-store inside the running API container at the exact same full revision. A fresh public GET returned HTTP 302 and no-store with strict-origin-when-cross-origin. The header changes after the API. The approved operator probe subsequently found the differing policy on the shared Nginx response itself. A read-only configuration inspection identified the two responsible directives. See the proposed proxy correction below. Preserve the API's no-referrer header on this callback route and recheck the public response before authenticated Wallet acceptance. [Approved origin probe](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42452140347/job/128643469809)

### Read-only shared proxy check

The GitHub SSH workflow now uses the restricted forced-command gate from [PR #173](https://github.com/SM-Web-Systems/lms-crypto-production/pull/173). Its allowlist does not accept the diagnostic mode proposed in [PR #172](https://github.com/SM-Web-Systems/lms-crypto-production/pull/172). Use an existing interactive operator session on the staging host. The following command reads Docker metadata and makes one parameter-free GET using the LMS hostname for TLS and HTTP routing. It requires normal certificate validation, follows no redirects and prints only status and booleans.

```bash
(
  set -eu
  api=$(docker container inspect --format '{{if and .State.Running (index .NetworkSettings.Networks "web-stack_default")}}{{.Id}}{{end}}' lms-api)
  proxy=$(docker container inspect --format '{{if and .State.Running (index .NetworkSettings.Networks "web-stack_default")}}{{(index .NetworkSettings.Networks "web-stack_default").IPAddress}}{{end}}' nginx_server)
  test -n "$api" && test -n "$proxy" || { echo 'Expected staging containers are unavailable.' >&2; exit 2; }
  image=$(docker container inspect --format '{{.Image}}' "$api")
  revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
  test "$revision" = f5a64e8ac92aca6b33ae54bda70617d475893e3e || { echo 'Staging API revision changed.' >&2; exit 2; }
  docker exec -i --workdir / --env NODE_OPTIONS= "$api" node - "$proxy" <<'LMS_WALLET_PROXY'
const { get } = require('node:https');
const { isIPv4 } = require('node:net');
const proxy = process.argv[2];
if (!isIPv4(proxy)) process.exit(2);
const site = 'lms.smwebsystems.com';
const request = get({
  hostname: proxy,
  port: 443,
  servername: site,
  headers: { Host: site },
  path: '/api/v1/auth/amma-callback',
  rejectUnauthorized: true,
  agent: false,
  timeout: 5000,
}, response => {
  const values = response.headersDistinct;
  const referrer = values['referrer-policy'] ?? [];
  const cache = values['cache-control'] ?? [];
  const location = values.location ?? [];
  console.log(JSON.stringify({
    httpStatus: response.statusCode,
    missingParamsRedirect: response.statusCode === 302 && location.length === 1 &&
      location[0] === 'https://lms.smwebsystems.com/login?sso_error=missing_params',
    noReferrer: referrer.length === 1 && referrer[0].toLowerCase() === 'no-referrer',
    strictOriginWhenCrossOrigin: referrer.length === 1 && referrer[0].toLowerCase() === 'strict-origin-when-cross-origin',
    noStore: cache.length === 1 && cache[0].toLowerCase() === 'no-store',
  }));
  response.destroy();
});
request.on('timeout', () => request.destroy(new Error('callback probe timed out')));
request.on('error', () => { process.exitCode = 1; });
LMS_WALLET_PROXY
)
```

Compare the result with a fresh public callback check on the same deployed API revision. An expected redirect with `noReferrer: true` at Nginx and a different public header places the change after that Nginx path. An expected redirect with a different policy at Nginx places a change at or before that proxy. A TLS or connection failure, a changed revision, or `missingParamsRedirect: false` is inconclusive. Keep the check parameter-free and share only the result object.

On 8 November 2026, the authorized operator SSH probe confirmed the expected HTTP 302 and `no-store` at shared Nginx, with `strict-origin-when-cross-origin`. The public callback still returned the same policy, and public health reported the same full API revision. The policy change is already present before Cloudflare. [Staging proxy evidence](evidence/lms-023-staging-proxy-validation.json)

### Shared proxy correction

In the LMS HTTPS virtual host, the `/api/` location hides the upstream `Referrer-Policy`. The server then adds `strict-origin-when-cross-origin` with `always`. The inspected configuration is on a directory bind mount and the container and host copies matched.

Add the map in the enclosing Nginx `http` context, such as alongside the server blocks in its included configuration. In the LMS HTTPS server block, replace only the existing `Referrer-Policy` header directive with the second block. The existing upstream-header filter gives the callback a single policy. Using `$uri` covers the normalized callback path with or without a query string. The map defaults to the existing policy for all other paths in this host. [Nginx map](https://nginx.org/en/docs/http/ngx_http_map_module.html) · [Nginx response headers](https://nginx.org/en/docs/http/ngx_http_headers_module.html) · [Nginx upstream header filtering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_hide_header)

```nginx
map $uri $lms_referrer_policy {
    default strict-origin-when-cross-origin;
    /api/v1/auth/amma-callback no-referrer;
    /api/v1/auth/amma-callback/ no-referrer;
}
```

```nginx
add_header Referrer-Policy $lms_referrer_policy always;
```

An isolated Ubuntu Nginx 1.24.0 fixture reproduced the original override and passed nine correction checks, including callback variants, an adjacent API denial, and a separate virtual host. The staging correction subsequently passed its own Nginx 1.29.4 syntax and post-reload checks. [Rehearsal evidence](evidence/lms-023-proxy-correction-rehearsal.json)

For the authorized staging change, verify the current host and container configuration still match the reviewed snapshot. Retain a private backup outside the active include glob and preserve file metadata on replacement. Run `nginx -t` in the existing proxy container before a graceful reload. Check the parameter-free callback directly through Nginx and through the public endpoint. Require the expected 302, exactly one `Referrer-Policy: no-referrer`, and exactly one `Cache-Control: no-store`. Check that the adjacent LMS health and login routes retain their baseline and that other virtual hosts pass their agreed smoke checks. Restore the saved configuration if syntax or smoke validation fails. If the candidate was loaded, validate and gracefully reload the restoration before repeating the baseline checks.

On 8 November 2026 the approved staging correction passed the Nginx configuration test, graceful reload, and direct and public callback verification. The adjacent LMS health and login routes matched their baselines. An independent workstation smoke run passed all six checks against the same deployed API revision. Authenticated AmmaWallet and Paystack sandbox acceptance remain open. [Staging correction evidence](evidence/lms-023-staging-proxy-correction.json)

For the selected Wallet-enabled release, the independent compatibility policy should include `"require_wallet_callback": true` before recovery capture. The release tool checks the public parameter-free callback while writes are held. A failed check leaves the hold active. [Guarded release procedure](AUTH-14-held-release.md)

### Staging provider readiness

The designated AmmaWallet tester matches exactly one account with a verified email. The read-only check confirmed the Wallet host routes to the expected API and database. Mukhtar reported that the tester signed in and reached the staging LMS student dashboard after an API interruption. A separate read-only check found the tester account with an active LMS session and both public health endpoints responding. The Wallet API container had started at 18:28 UTC with a different image ID. Its source revision and the cause of the earlier interruption remain unverified. [Staging sign-in evidence](evidence/lms-023-staging-tester-sign-in.json) Wallet SMTP is configured, and a controlled capture inbox remains unverified.

The running LMS API points to the approved AmmaWallet origin, and both public health checks passed. The Wallet image serving that origin has a known image ID. Its OCI label, runtime environment and health response did not expose a Git revision. The separate Wallet testnet image is labelled and serves a different target. A reviewed Wallet deployment receipt tying the observed image to a full commit, or a selected labelled Wallet image, is still needed for signed mobile acceptance. [Wallet build evidence](evidence/lms-023-staging-wallet-build-provenance.json)

The running staging LMS currently has a Paystack live-mode key. Use a separately approved test-mode target for checkout and refund acceptance. Set `PAYSTACK_REQUIRED_MODE=test` on the isolated acceptance LMS and use a separate database with synthetic applications and payments. The LMS refuses Paystack checkout, refund, verification and webhook processing if the configured key is missing or does not match the required mode. Existing deployments can omit this setting. Confirm the test merchant before opening checkout. [Staging readiness evidence](evidence/lms-023-staging-provider-readiness.json) · [Paystack key modes](https://paystack.com/docs/developer-tools/api-keys/)

Use the approved staging course, authorized synthetic learner, and a confirmed Paystack test-mode merchant. Record the deployed LMS and Wallet revisions and the test-mode evidence. Verify paid checkout for the configured merchant currency, duplicate/concurrent initiation, mismatched and reordered signed webhooks, receipt ownership, and a sandbox refund. Record the provider outcome and local payment ledger for each reference without including payment credentials. Test Wallet SSO, verified-email recovery and the enabled challenge and second-factor flows using the approved capture mechanism. A separate decision governs any live enablement.

Local regressions use mocked responses at the HTTP boundary and synthetic signatures. They cover the checkout race, replay, price currency, provider mismatch, late webhook settlement, release hold and additive schema startup. No real transaction or provider call was made.
