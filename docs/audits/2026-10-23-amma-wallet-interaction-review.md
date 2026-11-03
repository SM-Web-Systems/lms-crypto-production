# LMS and AmmaWallet interaction review

Date: 2026-10-23

Compared LMS baseline `bef865366f36293ea152a9f89524ce1bb7337603`, the pushed review implementation `6d9ea763936841e9c7cbb38c45989411e8971ca5`, and AmmaWallet `a65e19c202f2641ad669c50f048a15efb3719ad2`. The web corrections described here are local follow-up changes, not part of the pushed head. No production system, real credentials, wallet transaction, blockchain operation, or production database was used. Wallet application source remains unchanged.

## Implementation follow-up

W01–W06 now have code/policy solutions in the LMS review branch and companion Wallet branch. See [the hardening report](2026-10-23-amma-wallet-hardening.md) for final behavior, validation and remaining release acceptance. The findings below describe the pre-hardening review snapshot.

## Verdict at review time

The core SSO wire contract is preserved, and the native extension does not require a new wallet API or native callback in the wallet whitelist. However, **PR #77 should not be released until the account-linking policy below is hardened**. Two web regressions introduced by the earlier session changes were reproduced and corrected locally. Older identity-linking and identity-shape gaps remain open and affect both web and the new native flow.

## Previous and reviewed interaction (before hardening)

| Interaction | Baseline | Current implementation | Assessment |
| --- | --- | --- | --- |
| Web sign-in and account creation | Wallet `/sso/login`; registration on Wallet | Same wallet entry pages | Preserved |
| Provider callback | LMS HTTPS `/api/v1/auth/amma-callback` with assertion/state | Same destination for web and native initiation | Preserved; the final app callback is performed by LMS, not Wallet |
| Assertion verification | LMS POSTs `{assertion}` to Wallet `/api/v1/sso/verify` with `x-api-key` | Same request and plain JSON identity response | Contract matches actual provider source |
| Assertion protection | Provider JWT issuer/audience, 60-second expiry, DB-backed single-use JTI | Unchanged | Provider tests pass; live keys/configuration not inspected |
| Web return | LMS JWT in `/sso-callback#token=...`; legacy-role landing | Same token-fragment return; `/auth/me` selects effective workspace | Intentional routing/session change; regressions corrected below |
| Role management | Email provisioning lists could re-promote an existing demoted account at login | Managed roles remain authoritative on local and wallet sign-in | Intentional security correction |
| Native sign-in | Local LMS password login | Existing wallet SSO followed by one-use PKCE code redemption | New app-facing extension; installed-device acceptance still pending |
| Mobile registration/recovery | Local password forms and LMS APIs | Wallet account/recovery pages; explicit internal-account exception | Removes duplicate mobile password registration |
| Stellar wallet creation | Local LMS registration attempted provider registration/keypair/wallet creation | That legacy backend route still exists; mobile no longer invokes it | Normal wallet account creation does not itself guarantee an active Stellar wallet |
| Wallet address and credentials | Wallet SSO supplies an active mainnet address when available; LMS caches linkage | Same address selection and caching; mint service/recipient logic unchanged | Existing stale-address and multi-wallet questions remain |
| Logout | LMS-local session handling | LMS token revocation/storage clearing; Wallet browser session remains separate | Intentional LMS-only logout; not federated wallet logout |

Wallet's current verifier accepts DB keys with `sso:verify` scope and the existing legacy environment-key bridge. Both use the same `x-api-key` header already sent by LMS. Actual key validity, tenant scopes, server secrets, and callback whitelist configuration require later operational verification; passing mocked tests does not prove those settings.

## Findings

### W01 — P1, pre-existing: unverified email can claim an existing LMS identity

Wallet registration can issue access tokens before email verification. The real Wallet SSO handler can issue and verify assertions with `isEmailVerified: false`. LMS does not check that flag before its email fallback and can convert an existing local profile to the asserted wallet identity.

An isolated probe seeded a local administrator, supplied a valid-shaped unverified wallet identity with the same email, and received an LMS JWT for that administrator. The profile's wallet-user ID was replaced. This behavior is present in the baseline callback and was not introduced by the audit changes, but the new native flow inherits it.

Required policy: use the immutable wallet user ID for identity, require verified email for any email-based match, and require explicit authenticated linking or an administrative migration process for protected/internal accounts. Provisioning allowlists must not grant privileged accounts from an unverified email claim. Runtime production exposure was not tested.

### W02 — P1, pre-existing: email fallback can replace an established wallet-user binding

When lookup by the incoming wallet ID misses, LMS falls back to email even if the matching profile is already linked to a different wallet ID. The callback then overwrites that stable binding. A synthetic linked-profile probe confirmed the overwrite.

Reject conflicting bindings and provide a deliberate account-recovery/relinking process. A matching email must not silently replace an established provider identity. W01 and W02 should be fixed together before release.

### W03 — P2, pre-existing: phone-only Wallet identities cause HTTP 500

Wallet supports phone-only accounts and its actual handler can issue/verify an identity with `email: null`. LMS declares email as a string and calls `.toLowerCase()` without checking it. Both web and native callback probes returned HTTP 500.

Define the LMS identity requirement. The smallest compatible policy is a clear add-and-verify-email journey on Wallet, returning a controlled SSO error instead of a server failure. Supporting email-free LMS profiles would require a separate schema/product decision; do not invent synthetic email addresses during login.

### W04 — P2, introduced web regression: SSO bypassed the token storage abstraction

The session changes added an in-memory fallback when browser storage fails, but SsoCallback wrote directly to localStorage. If persistence recovered after an internal login had established a fallback token, SSO could send the old token to `/auth/me`, leave the previous identity active, and navigate incorrectly.

**Corrected locally:** AuthProvider now owns SSO token acceptance, storage replacement, generation changes, and explicit-token `/auth/me` verification through `completeSso()`. Composed tests use the actual provider and Axios adapter rather than independently mocking the callback's authorization update.

### W05 — P2, introduced web regression: reconnect could strand successful SSO

During a startup outage, the provider's recovery screen unmounted the callback after its hash token had been removed. Successful retry restored authentication, but the callback remounted without its hash and incorrectly reported missing SSO data.

**Corrected locally:** after provider-level recovery, the callback recognizes the verified current user and navigates to the effective workspace. Tests also cover denied persistence, a late internal-login result, and logout during wallet verification.

### W06 — P2, pre-existing synchronization behavior: no active wallet leaves old linkage cached

If an already-linked user signs in and Wallet now returns `mainnetWalletAddress: null`, LMS retains its old address and `linked` status. The wallet-status route uses that cached address and queries Horizon rather than refreshing provider ownership/activation. A synthetic probe confirmed retention. Whether this is acceptable historical linkage or stale eligibility needs an explicit policy before minting to it; no mint or transaction was performed.

The provider selects the newest active `public` wallet by creation time. It does not use the wallet currently selected in the web UI. This also predates the changes. Document or implement deliberate recipient selection, and preserve credential history when refreshing current linkage.

## Local evidence

| Check | Result |
| --- | --- |
| Wallet SSO routes and tenant API-key middleware | 50 existing tests passed across 2 files |
| Additional provider identity probes | 2 new cases passed; temporary suite ran 12 tests including the 10 existing SSO cases |
| LMS SSO, role preservation, wallet status, wallet RBAC invariants, and audit probes | 78 tests passed across 5 files, including 5 observed-defect cases |
| New composed web tests before the correction | Both original reproduction tests failed |
| Focused web SSO/session tests after the correction | 21 passed across 3 files before adding further race/persistence cases |
| Final full web regression | 506 passed across 54 files |
| Final web production build | Passed (TypeScript and Vite) |
| Final composed web checks after TypeScript-compatible test syntax adjustment | 5 passed |

All database rows, assertions, emails, and wallet addresses in the probes are synthetic. Provider tests mock database/auth middleware while exercising actual issuance, JWT verification, replay handling, and response serialization. Separate API-key middleware tests cover its own policy. No combined live HTTP deployment, live Wallet login, or physical-device test is claimed.

The two audit probe archives beside this report assert observed defects and are intentionally outside normal test discovery. Temporary executable copies were removed from both repositories. They must not become security acceptance tests that require vulnerable behavior. The proper future regressions must assert rejection or safe recovery.

Some pre-existing jsdom XMLHttpRequest diagnostics remain in the passing web suite. Mobile/backend application code was not changed during this review, so their previously completed full test counts are not presented as newly rerun full suites here.

## Next action and release boundary

1. Harden W01/W02 identity linking first, with negative tests for unverified emails, local administrators, existing different provider IDs, and email changes. Preserve legitimate already-linked identities.
2. Define and implement W03's verified-email journey and W06's current-wallet synchronization/selection policy.
3. Review the local W04/W05 fixes and incorporate them into PR #77. Run CI for the resulting head and complete installed Android/iOS Wallet acceptance before release.
4. Resume the separate safe-database-bootstrap workstream after the authentication blockers are addressed.

The original probes were kept local while the blockers were unpatched. This historical review is incorporated with the hardening changes for review. No production deployment is authorized or performed.
