# AmmaWallet interaction hardening

Implemented 2026-10-23 in the LMS review branch and companion [Wallet PR #2](https://github.com/SM-Web-Systems/amma-wallet-production/pull/2) (`codex/lms-verified-email-onboarding`, commit `04c3f0c`). These changes address W01–W06 in the [interaction review](2026-10-23-amma-wallet-interaction-review.md). Neither repository has been merged or deployed.

## Identity and account connection

- Every assertion is checked at runtime: non-empty immutable Wallet user ID, nullable email, boolean verification status, nullable names, and a valid Stellar public key or null. Missing, malformed, or unverified email cannot provision or authenticate an LMS account, including provisioning allowlists. Web and native clients receive actionable errors.
- Ordinary SSO resolves an existing account only by immutable Wallet ID. A verified email matching an unconnected LMS account returns `link_required`; an email matching a different binding returns `identity_conflict`. Neither creates a session or mutates the matched account.
- An internal/local account connects through its own LMS profile. `POST /auth/amma-link` requires its authenticated LMS session and current LMS password. The server chooses the target from authentication, not request data. The confirmation explains that conversion switches sign-in to Wallet and ends existing LMS sessions.
- A five-minute signed, single-use state binds the target user, authorization version, initiating session hash, and session expiry. Callback checks revocation, account deletion and version changes again. Initial connection requires the same verified email and an unused Wallet identity. Connection, wallet synchronization, and old-session invalidation occur in one immediate SQLite transaction. Roles, courses and existing profile IDs are retained.
- A connected user refreshes through the same profile action without a local password. Refresh accepts only the existing Wallet ID. A later verified Wallet email change does not redirect identity lookup or automatically change the LMS email. Duplicate historical Wallet IDs fail closed for administrative recovery.
- Conflicting bindings have no automatic relink path. Use the original Wallet account or request administrator-assisted recovery after independent ownership verification. This patch never guesses which identity owns an account.

## Verified-email recovery

LMS login and native sign-in explain missing/unverified email and open Wallet settings. Connecting errors return to the authenticated LMS profile; expired/revoked sessions require sign-in again.

The companion Wallet change makes that journey usable: login accepts the existing E.164 phone identifier as well as email, while retaining Turnstile and second-factor handling. Authenticated settings are accessible before Stellar wallet creation. A phone-only account can add one email after current Wallet password confirmation. The conditional transactional write refuses replacement of any existing email, preserves database uniqueness, resets verification to false and creates a new verification token. Delivery failure leaves a usable resend action; email is not treated as verified until the existing inbox-link verification succeeds.

Wallet user responses now include verification status, and the web store consumes the API's existing flat profile responses correctly. The Wallet settings action must be reviewed/deployed with the LMS change for self-service phone-only onboarding. No schema migration or new production secret is required by this follow-up.

## Current-wallet policy

Current LMS linkage is the last successfully verified Wallet assertion. Every accepted sign-in or identity-bound refresh replaces both current address and linking status, including clearing both when Wallet reports no active mainnet wallet. Issued credential recipient records are never rewritten.

Wallet's existing selection policy remains its newest active `public`/mainnet wallet by creation time. This can differ from the wallet selected in its dashboard. LMS profile and wallet card explain the policy, expose the full recipient for review and provide an explicit refresh journey. Status reports `last_confirmed_address`, is not cacheable, and uses its returned address for the displayed balance rather than mixing it with an older UI profile address. A Horizon balance is not presented as a live provider ownership check.

There is no new background ownership API, wallet creation, recipient picker, automatic credential transfer, or blockchain transaction. Users should refresh after Wallet changes and review the recipient before applying for a certificate. Existing mint-time linkage checks now reject a wallet cleared by the next accepted assertion. A provider change made after that assertion remains unknown until the next sign-in/refresh; live revocation would require a separate provider contract.

## Web session corrections

The AuthProvider owns Wallet token acceptance through `completeSso`: token fallback storage, session generation guards and explicit-token `/auth/me` verification happen together. Callback recovery recognizes a verified user after hash removal/remount. Composed regressions cover recovery, blocked persistence, old-account races and logout during verification.

## Validation

All accounts, emails, assertions and database rows were synthetic. No SSH, production database, live sign-in, email delivery or wallet/blockchain operation was used.

| Check | Final result |
| --- | --- |
| LMS API full regression | 1,733 tests passed across 175 files |
| LMS web full regression | 515 tests passed across 55 files |
| LMS mobile full regression | 153 tests passed across 16 suites |
| Focused final identity/linking, role preservation and native handoff | 69 tests passed |
| LMS API and web production builds | Passed |
| LMS mobile TypeScript | Passed |
| Wallet backend full regression | 576 tests passed across 82 files |
| Wallet web account-state regressions | 5 tests passed independently |
| Wallet web production build | Passed |
| Wallet local browser | Add-email, confirmation/resend, settings without a wallet; desktop and 390px layouts inspected |

The first concurrent full web/mobile runs each hit a timing-only failure during laptop contention. The full web rerun with two workers and full mobile rerun passed. Existing jsdom network diagnostics remain in passing web tests. Wallet build chunk-size warnings remain. The local Wallet Vite development browser required a harness-only process shim for an existing Stellar HD dependency; this is recorded in the companion report and is not a production runtime claim.

## Review and release acceptance

Keep both PRs in draft until review. On a controlled environment, verify the actual Wallet tenant key/scope, callback whitelist and state secret; then exercise verified/unverified/phone-only sign-in, explicit local conversion, conflicting IDs, wallet removal/refresh, and Android/iOS system-browser return. Physical-device acceptance, actual email delivery and operational configuration remain unverified here. The existing single-instance SSO nonce/handoff storage requirement remains. The server owner performs deployment.
