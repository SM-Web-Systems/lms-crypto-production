# Deliverable 1 Batch 1 — Device Verification Checklist

**PR:** [SM-Web-Systems/lms-crypto-production#61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61)
**Branch:** `feat/mobile-certificates-batch1` -> `main`
**Commits:** `ff2aac2` (Batch 1 implementation), `43384bd` (accessibility fix)
**Review status:** Code review APPROVED with non-blocking suggestions
**PR state:** OPEN, UNMERGED, UNDEPLOYED
**Automated checks:** 38/38 tests pass, TypeScript zero errors, CI Frontend pass

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Device / Emulator | Android device/emulator (API 28+) or iOS device/simulator (iOS 15+) |
| Expo Go | Install from App Store / Play Store, **or** build a development client |
| Node.js | v18+ installed on the machine running `npx expo start` |
| Git | Branch `feat/mobile-certificates-batch1` checked out |
| Test account | A student account on the LMS with email/password credentials |
| Network | Device/emulator must reach `lms.smwebsystems.com` (HTTPS) |
| Certificates | At least one test student with a minted credential, and one with zero credentials |

**Do NOT use production admin accounts for device testing.**

---

## Environment Setup

```bash
# 1. Clone and checkout the PR branch
cd /path/to/LMS-AmmaWallet/LMS-Mobile
git fetch origin feat/mobile-certificates-batch1
git checkout feat/mobile-certificates-batch1

# 2. Install dependencies
npm install

# 3. Verify tests pass locally
npx jest --no-cache
# Expected: 38 passed, 0 failed

# 4. Verify TypeScript
npx tsc --noEmit
# Expected: exit 0, no errors

# 5. Start Expo development server
npx expo start
# Scan the QR code with Expo Go, or press 'a' for Android / 'i' for iOS
```

**Environment variables:** The app uses `EXPO_PUBLIC_API_BASE_URL` which defaults to `https://lms.smwebsystems.com/api/v1`. No `.env` file with secrets is required for device testing.

---

## Manual Test Script

### Positive Scenarios

#### TEST-1: App Launch and Student Sign-In

| Field | Value |
|-------|-------|
| **Steps** | 1. Open the app in Expo Go or development build. 2. Enter test student email and password. 3. Tap "Sign In". |
| **Expected** | Student is authenticated and lands on the Dashboard tab. Greeting shows student's first name. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-2: Courses Tab and Course List

| Field | Value |
|-------|-------|
| **Steps** | 1. Tap the "Course" tab. 2. Verify the enrolled course appears. |
| **Expected** | Course tab loads. At least one course card is visible with title and progress indicator. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-3: Course Content Navigation

| Field | Value |
|-------|-------|
| **Steps** | 1. Tap a course card. 2. Navigate to a week/section. 3. Tap a material (video, PDF, or link). |
| **Expected** | Course content viewer opens. Material renders correctly (video player, PDF viewer, or external link). |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-4: Certificates Tab

| Field | Value |
|-------|-------|
| **Steps** | 1. Tap the "Certificates" tab (ribbon icon) in the bottom navigation bar. 2. Wait for loading to complete. |
| **Expected** | Certificates tab is visible in the tab bar between Messages and Profile. Screen shows either the certificate list or the empty state. Wallet status banner appears at the top (green "Wallet linked" or amber "Wallet not linked"). |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-5: Certificate List and Detail Navigation

| Field | Value |
|-------|-------|
| **Precondition** | Use a student account that has at least one minted credential. |
| **Steps** | 1. Open the Certificates tab. 2. Verify certificate cards appear with course title, course code, issued date, and network. 3. Verify the count label (e.g., "1 certificate"). 4. Tap a certificate card. |
| **Expected** | Certificate detail screen opens. Header shows course title, code, and issued date. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-6: Certificate Detail — Metadata and Safety

| Field | Value |
|-------|-------|
| **Precondition** | Certificate detail screen is open (from TEST-5). |
| **Steps** | 1. Verify "Certificate Details" card displays: Credential ID, Wallet Address, Network, Transaction Hash (truncated), Token ID (#N), Contract (truncated). 2. If the credential has a quiz, verify Quiz field appears. 3. Verify NO private keys, seed phrases, XLM balances, or secret values are displayed anywhere on screen. |
| **Expected** | All public metadata fields are visible and correctly formatted. No sensitive data is exposed. Transaction hash and contract ID are truncated with ellipsis. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-7: Certificate Actions — Stellar, Copy URL, PDF

| Field | Value |
|-------|-------|
| **Precondition** | Certificate detail screen is open for a credential with a txHash. |
| **Steps** | 1. Tap "View on Stellar". Verify an external browser opens to `stellar.expert/explorer/.../tx/...`. 2. Return to the app. Tap "Copy Verification Link". Verify an alert says "Copied" and the clipboard contains a URL like `https://lms.smwebsystems.com/verify/{credentialId}`. 3. Tap "Download PDF". Verify a download starts and the system share sheet appears (or a "Downloaded" alert on devices without sharing). |
| **Expected** | Stellar explorer opens externally (not in-app). Verification URL is copied to clipboard without exposing secrets. PDF download triggers the share sheet. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

### Negative Scenarios

#### TEST-N1: Empty Certificate State

| Field | Value |
|-------|-------|
| **Precondition** | Use a student account with zero minted credentials. |
| **Steps** | 1. Open the Certificates tab. |
| **Expected** | Empty state displays: ribbon icon, "No certificates yet", "Complete courses and quizzes to earn NFT certificates." Count shows "0 certificates". |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-N2: API/Network Error State

| Field | Value |
|-------|-------|
| **Steps** | 1. Enable airplane mode or disconnect from network. 2. Open the Certificates tab (or pull-to-refresh if already open). |
| **Expected** | Error banner appears with a user-friendly message (e.g., "Could not load your certificates.") and a "Try again" button. App does not crash. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-N3: Unauthorized / Expired Session

| Field | Value |
|-------|-------|
| **Steps** | 1. Sign in as a student. 2. Wait for session to expire or manually clear the token (if possible). 3. Navigate to the Certificates tab. |
| **Expected** | App handles the 401 error gracefully — either redirects to sign-in or shows an error banner. App does not crash or expose raw error details. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | Session expiry may be difficult to reproduce manually; note if skipped. |
| **Screenshot/Video** | |

#### TEST-N4: Wallet Unlinked State

| Field | Value |
|-------|-------|
| **Precondition** | Use a student account whose wallet is NOT linked (walletLinkingStatus = "none"). |
| **Steps** | 1. Open the Certificates tab. |
| **Expected** | Amber banner displays: warning icon, "Wallet not linked", "Link your wallet on the web dashboard to receive certificates." No XLM balance is shown. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

#### TEST-N5: Pull-to-Refresh

| Field | Value |
|-------|-------|
| **Steps** | 1. Open the Certificates tab and let it load. 2. Pull down to trigger refresh. |
| **Expected** | Refresh spinner appears with teal tint. Data reloads. Previously loaded certificates are replaced with fresh data. No duplication. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |
| **Screenshot/Video** | |

---

## Known Limitations

| # | Limitation | Rationale |
|---|-----------|-----------|
| 1 | Certificate detail refetches the full credential list to find one credential by ID | No single-credential GET endpoint exists; acceptable for small lists in Batch 1 |
| 2 | No XLM balance display | Excluded from Batch 1 scope by design |
| 3 | No student progress screen | Deferred to Batch 2 |
| 4 | No AmmaWallet SSO OAuth | Retains existing email/password auth |
| 5 | No credential mutation operations | Read-only by design; no minting, linking, or unlinking |
| 6 | PDF download requires network access to `lms.smwebsystems.com` | PDF is served from the LMS API |
| 7 | Backend `GET /wallet/status` also returns `xlmBalance` (ignored by mobile type) | By design — mobile type excludes unused fields |

---

## Rollback / Abort Instructions

If device testing reveals a blocking issue:

1. **Do NOT merge PR #61.** The PR remains on its feature branch.
2. Document the failure in the test table above with screenshots/video.
3. File findings as comments on PR #61.
4. The feature branch can be safely abandoned — no production code was changed.
5. To remove the branch: `git push origin --delete feat/mobile-certificates-batch1` (only after confirming no further work is needed).
6. Main branch remains unaffected; existing app functionality is unchanged.

---

## SOW Evidence Checklist

| # | Evidence Item | Status | Location / Notes |
|---|--------------|--------|------------------|
| 1 | Demo video: student login | PENDING | Record during TEST-1 |
| 2 | Demo video: course navigation | PENDING | Record during TEST-2 and TEST-3 |
| 3 | Demo video: NFT certificate viewing | PENDING | Record during TEST-4, TEST-5, TEST-6, TEST-7 |
| 4 | Mobile app build / dev-build instructions | DONE | This document, "Environment Setup" section |
| 5 | PR link | DONE | [PR #61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) |
| 6 | Test evidence (38/38 pass) | DONE | `npx jest --no-cache` — 38 passed, 0 failed |
| 7 | TypeScript evidence (zero errors) | DONE | `npx tsc --noEmit` — exit 0 |
| 8 | CI evidence | DONE | Frontend Tests & Build — PASS |
| 9 | Device verification results | PENDING | Fill in test tables above |
| 10 | Known limitations | DONE | This document, "Known Limitations" section |
| 11 | Human reviewer approval | PENDING | Reviewer name and date below |

### Human Reviewer Sign-Off

| Field | Value |
|-------|-------|
| Reviewer name | |
| Date | |
| Verdict (approve / request changes) | |
| Notes | |

---

**PR #61 remains OPEN and UNMERGED until all device verification tests pass and a human reviewer signs off.**
