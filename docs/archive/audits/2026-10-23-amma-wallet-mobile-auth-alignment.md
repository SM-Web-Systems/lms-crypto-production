# AmmaWallet mobile authentication alignment

Date: 2026-10-23

This corrects the account-authority gap left by the five-step platform remediation in PR #77. Web sign-in/registration already used AmmaWallet, but mobile retained its older local password login and registration. Step 5 added recovery around that local flow without implementing native AmmaWallet sign-in. Normal mobile accounts now use the existing wallet integration. This is local development and review work; no production server, wallet deployment, secrets, payment, or database volume was accessed or changed.

## Account authority and scope

- AmmaWallet handles normal account creation, sign-in, and password recovery. Mobile registration/recovery open its existing `/register?source=lms` and `/forgot-password` pages. Users return to the app and sign in after completing those actions. No wallet source code or wallet API contract changed.
- Mobile no longer calls the LMS local registration endpoint or collects a second registration password. Existing internal accounts retain password sign-in under an explicit disclosure, with separately labelled internal password recovery/reset.
- The existing server-side wallet assertion verification and LMS profile provisioning remain shared by web and mobile. Managed roles remain authoritative; signing in does not restore revoked grants.
- Web sign-in/registration pages and the web callback destination are preserved. Mobile role routing, account controls, session persistence, and transient-outage recovery from the prior remediation remain in place.
- The legacy local registration API remains for compatibility with existing clients and test fixtures. This change removes its mobile caller; it does not retire the endpoint or change all local-account provisioning policies.
- This change does not implement AUTH-13 database bootstrap, payment, monitoring, or infrastructure work.

## Native return flow

```mermaid
sequenceDiagram
    participant App as Installed LMS app
    participant Browser as System auth browser
    participant LMS as LMS API
    participant Wallet as AmmaWallet
    App->>App: Generate verifier and correlation state
    App->>Browser: Open LMS amma-login with S256 challenge
    Browser->>LMS: GET amma-login (mobile context)
    LMS->>Wallet: Existing SSO redirect with signed state
    Wallet->>LMS: Existing assertion and state callback
    LMS->>LMS: Validate state/replay and verify wallet identity
    LMS->>App: Fixed lmsmobile callback with one-use code and state
    App->>App: Verify callback destination and correlation state
    App->>LMS: POST amma-mobile-session (code + verifier)
    LMS->>LMS: Consume code; check current account/version
    LMS-->>App: LMS token + effective authorization context
    App->>App: Store session and select authorized workspace
```

The app generates cryptographic randomness through `expo-crypto`'s asynchronous native API. Only its S256 challenge is placed in the initiation URL. The verifier remains in memory for the active attempt. Native callbacks contain no LMS bearer token or role claims; interception of a custom-scheme code alone cannot redeem it.

The existing signed, five-minute, replay-protected LMS state includes the native challenge and correlation state. The return destination is fixed to `lmsmobile://sso-callback`; callers cannot supply redirect URIs. The native code expires after 60 seconds and can be redeemed once. Incorrect proofs do not consume another client's valid code. The exchange rechecks the current account and authorization version, so account deletion or managed invalidation between wallet verification and redemption prevents session creation. Pending-deletion users may establish a restricted account-management session.

Codes are stored hashed in a bounded, process-local cache, without bearer tokens. This deliberately retains the existing SSO nonce cache's single-process assumption. API restarts discard pending handoffs; users restart sign-in. Multiple API workers require shared state for both caches before scaling. No schema migration is introduced here.

Only the active browser attempt can exchange the code. The callback screen cannot accept a URL token or establish a session independently. Sign-out/unmount cancels pending browser work, and existing generation guards reject late results. Foreground refresh does not hydrate the previous identity during wallet sign-in. The new public code-exchange endpoint is protected by the existing auth write limiter; its 401 errors do not invalidate a different active client session. Code responses use `Cache-Control: no-store`; callback responses also suppress referrers.

## Configuration and dependency impact

| Setting | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Existing LMS API origin/path used for SSO initiation and code exchange |
| `EXPO_PUBLIC_WEB_BASE_URL` | Existing web workspace handoffs; browser preview opens its normal web login |
| `EXPO_PUBLIC_AMMA_WALLET_URL` | Wallet registration/recovery host; defaults to `https://ammawallet.com` |
| Existing API `AMMA_WALLET_URL`, API key, state secret, and `FRONTEND_URL` | Unchanged server-side wallet verification and externally reachable API callback configuration |

Mobile public configuration contains no wallet API key or state secret. Native return uses the app's existing `lmsmobile` scheme; no new arbitrary callback configuration is accepted. The browser preview opens the LMS web dashboard rather than attempting native session establishment.

Added one SDK-compatible dependency, `expo-crypto ~15.0.9`, with its already-present `base64-js` dependency. Expo remains SDK 54. The mobile AGENTS requirement to read [the exact SDK 56 reference](https://docs.expo.dev/versions/v56.0.0/) was followed; actual API compatibility was checked against installed SDK 54 WebBrowser/Crypto declarations and native bundle exports. A fresh npm audit reports 96 dependency findings (1 low, 23 moderate, 70 high, 2 critical); neither `expo-crypto` nor `base64-js` is listed as vulnerable. Broad dependency upgrades remain a separate workstream and were not applied with this authentication fix.

## Validation

- Before implementation, API regressions reproduced the missing native handoff (13 failures, 2 passes) and all five mobile account-authority checks failed.
- Initial focused API/managed-role/SSO compatibility run: **39 tests passed across 3 files**.
- Final full backend regression: **1,704 tests passed across 174 files**; backend production TypeScript build passed.
- Final full mobile regression: **147 tests passed across 16 suites**. Mobile TypeScript passed after Expo regenerated types for the new routes. Android/iOS Hermes bundle exports passed (4.78 MB each); these are not installable APK/IPA builds.
- New coverage exercises callback tampering/replay/expiry, wrong verifier, code replay/expiry, managed roles, authorization invalidation, deleted/pending accounts, native cancellation, wrong callback destinations/correlation state, ambiguous/bearer-token callbacks, concurrent attempts, late responses after logout, independent internal recovery, and wallet-owned registration/recovery.
- The web source tree is unchanged by this correction. Prior PR #77 CI passed backend, frontend/build, and E2E checks; that run predates this correction and is not claimed as validation of these new changes.
- Phone browser previews at 360/390 pixels verified wallet-first sign-in, internal-account disclosure, wallet registration, and recovery/return navigation without using real credentials. Screenshots are saved under `output/playwright/amma-*.png`. Native system-browser/OS linking, SecureStore, and actual wallet interoperability still require installed-device acceptance.

One full mobile run hit the first UI test's five-second timeout while the cold preview and regressions ran concurrently. The first UI test now allows 15 seconds; the final full run passed. The preview emitted existing React Native Web shadow-style and browser password-form diagnostics, with no application console errors during the reviewed account screens.

## Release and device acceptance

1. Obtain review and passing CI for the updated PR. No merge or deployment is performed by this work.
2. Deploy the backwards-compatible LMS API extension before distributing the new app. Older APIs return only the web callback and cannot complete native sign-in. Existing web SSO continues using the existing token-fragment callback.
3. Build new installed Android/iOS apps with `expo-crypto` and the existing custom scheme. Expo Go and a browser preview do not validate the installed return flow. Use reachable API/web/wallet hosts for the same environment; keep server credentials on the server.
4. Test wallet login, first-time profile provisioning, registration then return, wallet recovery then return, browser cancellation, and wallet failure. Test student, sponsor-only, instructor, multi-role, and empty-workspace accounts against effective access. Preserve the internal-login case.
5. Test expired/replayed assertions/state, a stolen code without its verifier, consumed/expired codes, and restart during handoff. None may establish an unintended identity. After process termination, restart sign-in rather than accepting a callback without its original verifier.
6. Test offline startup/reconnection, exchange timeout, foregrounding, logout during sign-in, and a late response after logout. Verify native storage and role/session revocation behavior on both platforms.
7. Confirm pending-deletion accounts open account management and can cancel deletion; learning remains restricted until cancellation. Password recovery for an AmmaWallet account must stay with AmmaWallet.
8. Logout here revokes the LMS session and clears the app's token. It does not sign out the wallet's browser session or perform a wallet-wide logout. That existing separation is intentional and should be verified with shared-device expectations.

Rollback: retain prior authorization-version enforcement. Roll back the mobile release first if the API extension must be removed. Existing web SSO is independent of the native extension. A restart invalidates pending native codes without changing established sessions or wallet accounts. Do not discard security/session fixes as part of a UI rollback.
