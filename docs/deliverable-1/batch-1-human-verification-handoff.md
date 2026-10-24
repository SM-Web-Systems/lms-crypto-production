# Deliverable 1 Batch 1 — Human Verification Handoff

**Created:** 2026-10-15
**Branch:** `docs/deliverable-1-device-verification`
**PR:** [#61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) (MERGED)
**Deployed SHA:** `76d6ecb49d22a4e72e22cc5b252f103d519e0d64`

---

## Purpose

This document hands off Deliverable 1 Batch 1 to a human reviewer for
physical-device verification. It honestly separates what has been verified
automatically from what still requires a person with a mobile device.

**Deliverable 1 is NOT complete.** The SOW requires a demo video and
authenticated mobile screenshots that can only be produced on a real device.
No code-reviewed or unit-tested scenario should be treated as
device-verified.

---

## 1. Honest Verification Status

### Verification Method Key

| Level | Meaning | Confidence | Counts as device-verified? |
|-------|---------|------------|---------------------------|
| **Automated** | Jest unit/integration tests pass for this scenario | High for logic; does not exercise native rendering | No |
| **Web-only** | Expo web mode screenshot captured via Playwright headless Chromium | Moderate for layout; does not exercise native APIs (SecureStore, Sharing, Linking) | No |
| **Code-reviewed** | Source code read and analyzed; no test or visual evidence | Moderate for logic; zero visual evidence | No |
| **Device-verified** | Tested on a physical device or emulator running the native app | High | **Yes** |

### Scenario Verification Matrix

| # | Scenario | Method | Confidence | Evidence | Remaining Human Action |
|---|----------|--------|------------|----------|----------------------|
| TEST-1 | App launch and student sign-in | **Web-only** | Sign-in screen confirmed; auth completion not confirmed | `evidence/TEST-1a-sign-in-screen.png`, `evidence/TEST-1b-credentials-entered.png` | Sign in on device; capture dashboard screenshot; confirm greeting shows student name |
| TEST-2 | Courses tab and course list | **Code-reviewed** | Logic confirmed; no visual evidence | `src/app/(student)/course.tsx` | Open Courses tab on device; capture screenshot showing course cards |
| TEST-3 | Course content navigation | **Code-reviewed** | Logic confirmed; no visual evidence | `src/app/(student)/course.tsx` | Tap a course; navigate to content; capture screenshot of material viewer |
| TEST-4 | Certificates tab and wallet banner | **Automated** | Unit tests pass for banner logic and rendering | `certificates.test.tsx` (38/38) | Open Certificates tab on device; capture screenshot showing wallet banner and certificate list |
| TEST-5 | Certificate list and detail navigation | **Automated** | Unit tests pass for card rendering, count, navigation | `certificates.test.tsx`, `certificate-detail.test.tsx` | Tap a certificate card; confirm detail screen opens; capture screenshots |
| TEST-6 | Certificate detail metadata (no secret exposure) | **Automated** | Unit tests pass; code review confirms no secrets in UI | `certificate-detail.test.tsx` | Visually inspect detail screen on device; confirm NO private keys, seeds, or balances visible; capture screenshot |
| TEST-7 | Actions: Stellar explorer, copy URL, PDF download | **Automated** | Unit tests mock Linking/Clipboard/FileSystem/Sharing; native behavior untested | `certificate-detail.test.tsx` | Tap "View on Stellar" (confirm external browser opens); tap "Copy Verification Link" (confirm alert + clipboard); tap "Download PDF" (confirm share sheet); capture screenshots |
| TEST-N1 | Empty certificate state | **Automated** | Unit tests pass for empty state rendering | `certificates.test.tsx` | Sign in as student with zero credentials; open Certificates tab; capture screenshot |
| TEST-N2 | API/network error state | **Automated** | Unit tests pass for error banner rendering and retry | `certificates.test.tsx` | Enable airplane mode; refresh Certificates tab; capture error banner screenshot; disable airplane mode; tap "Try again" |
| TEST-N3 | Unauthorized/expired session | **Web-only** | Auth gate redirect to sign-in confirmed in Expo web | `evidence/TEST-N3-unauthorized.png` | On device, let session expire or clear token; navigate to Certificates; confirm redirect or error banner |
| TEST-N4 | Wallet unlinked state | **Automated** | Unit tests pass for amber banner rendering | `certificates.test.tsx`, `walletService.test.ts` | Sign in as student with unlinked wallet; open Certificates tab; capture amber banner screenshot |
| TEST-N5 | Pull-to-refresh | **Code-reviewed** | ScrollView + RefreshControl wired; native gesture not testable outside device | `src/app/(student)/certificates.tsx` | Pull down on Certificates tab; confirm teal spinner appears; confirm data reloads without duplication |

### Summary Counts

| Method | Scenarios | Device-verified? |
|--------|-----------|-----------------|
| Device-verified | 0 | Yes |
| Automated (unit tests) | 7 (TEST-4, 5, 6, 7, N1, N2, N4) | No |
| Web-only (Playwright) | 2 (TEST-1, N3) | No |
| Code-reviewed only | 3 (TEST-2, 3, N5) | No |
| **Total** | **12** | **0 of 12 device-verified** |

---

## 2. What Has Been Completed

| Item | Status | Evidence |
|------|--------|----------|
| PR #61 merged | Done | [PR #61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) |
| Production deployment | Done | SHA `76d6ecb`, health check confirmed |
| Smoke tests (5/5) | Done | `batch-1-device-verification.md` |
| Unit tests (38/38) | Done | `npx jest --no-cache` |
| TypeScript (0 errors) | Done | `npx tsc --noEmit` exit 0 |
| Web export (27 routes) | Done | `npx expo export --platform web` |
| Sign-in screen screenshot | Done | `evidence/TEST-1a-sign-in-screen.png` |
| Auth gate screenshot | Done | `evidence/TEST-N3-unauthorized.png` |
| Code security review | Done | No secrets, private keys, or balances in UI |
| Known limitations documented | Done | `batch-1-device-verification.md` |

### What Has NOT Been Completed

| Item | Why | Required For |
|------|-----|-------------|
| Authenticated mobile screenshots | No device/emulator; seed password changed in production | SOW evidence |
| Demo video | No device/emulator | SOW evidence |
| Physical-device test of all 12 scenarios | No device/emulator | Deliverable 1 sign-off |
| Human reviewer sign-off | Awaiting device verification | Deliverable 1 completion |

---

## 3. Physical-Device Test Script

### 3.1 Required Equipment

| Item | Requirement |
|------|-------------|
| Device | Android phone/tablet (API 28+) **or** iOS device (iOS 15+) |
| App | Expo Go from Play Store / App Store, **or** an EAS development/preview APK |
| Network | Device must reach `lms.smwebsystems.com` over HTTPS |
| Development machine | Any machine with Node.js 18+ to run `npx expo start` |
| Screen recorder | Device built-in recorder, or a tool like AZ Screen Recorder (Android) / QuickTime (iOS) |

### 3.2 Test Account Setup

You need three test student accounts. **Do NOT use production admin accounts.**
**Do NOT create new accounts in production without authorization.**

| Account | Requirement | How to identify |
|---------|-------------|-----------------|
| Student A | Has at least one minted NFT credential AND a linked wallet | Check `nft_credentials` table: `mint_status = 'minted'`, `soroban_token_id IS NOT NULL`. Check `students` table: `wallet_linking_status = 'linked'` |
| Student B | Has zero minted credentials | Check `nft_credentials` table: no rows for this student, or all `mint_status != 'minted'` |
| Student C | Wallet is NOT linked | Check `students` table: `wallet_linking_status = 'none'` |

> If you do not know the test account credentials, ask the project
> administrator. Do not guess passwords or attempt brute-force login.

### 3.3 Launching the App

```bash
# On the development machine (server or local)
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Mobile

# Verify tests still pass
npx jest --no-cache
# Expected: 38 passed, 0 failed

# Start the Expo dev server
npx expo start

# The terminal shows a QR code.
# On the device, open Expo Go and scan the QR code.
# The app connects to https://lms.smwebsystems.com/api/v1 automatically.
```

If the device cannot reach the dev server over the local network, use
tunnel mode: `npx expo start --tunnel`.

### 3.4 Scenario Walkthrough

For each scenario below: perform the steps, fill in Actual/Pass-Fail/Notes,
and capture a screenshot or recording as instructed.

---

#### TEST-1: App Launch and Student Sign-In

| Field | Value |
|-------|-------|
| **Account** | Student A |
| **Steps** | 1. Open app in Expo Go. 2. Sign-in screen appears. 3. Enter email and password. 4. Tap "Sign in". |
| **Expected** | Dashboard loads. Greeting shows student's first name. |
| **Capture** | Screenshot of sign-in screen (before tapping). Screenshot of dashboard (after sign-in). |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-2: Courses Tab and Course List

| Field | Value |
|-------|-------|
| **Account** | Student A (signed in) |
| **Steps** | 1. Tap "Course" tab (book icon). 2. Wait for courses to load. |
| **Expected** | At least one course card visible with title and progress indicator. |
| **Capture** | Screenshot of course list. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-3: Course Content Navigation

| Field | Value |
|-------|-------|
| **Account** | Student A (signed in) |
| **Steps** | 1. Tap a course card. 2. Navigate to a week/section. 3. Tap a material (video, PDF, or link). |
| **Expected** | Content viewer opens. Material renders (video plays, PDF shows, link opens). |
| **Capture** | Screenshot of course content viewer. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-4: Certificates Tab and Wallet Status Banner

| Field | Value |
|-------|-------|
| **Account** | Student A (signed in, wallet linked) |
| **Steps** | 1. Tap "Certificates" tab (ribbon icon, between Messages and Profile). 2. Wait for loading. |
| **Expected** | Green banner: "Wallet linked" with truncated wallet address. Certificate list below. |
| **Capture** | Screenshot showing wallet banner AND certificate list together. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-5: Certificate List and Detail Navigation

| Field | Value |
|-------|-------|
| **Account** | Student A (signed in, has certificates) |
| **Steps** | 1. On Certificates tab, verify cards show course title, code, date, network. 2. Verify count label (e.g., "1 certificate"). 3. Tap a certificate card. |
| **Expected** | Detail screen opens with header: ribbon icon, course title, code, issued date. |
| **Capture** | Screenshot of certificate list. Screenshot of certificate detail header. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-6: Certificate Detail — Metadata and Safety

| Field | Value |
|-------|-------|
| **Account** | Student A (certificate detail screen open) |
| **Steps** | 1. Verify "Certificate Details" card shows: Credential ID, Wallet Address, Network, Transaction Hash (truncated), Token ID (#N), Contract (truncated). 2. If credential has a quiz, verify Quiz field. 3. **Scan entire screen**: confirm NO private keys, seed phrases, XLM balances, or secret values. |
| **Expected** | All public metadata visible. No sensitive data exposed. Hashes/IDs truncated with ellipsis. |
| **Capture** | Screenshot of full detail card (scroll if needed to show all rows). |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-7: Certificate Actions — Stellar, Copy URL, PDF

| Field | Value |
|-------|-------|
| **Account** | Student A (certificate detail screen, credential has txHash) |
| **Steps** | 1. Tap "View on Stellar". Verify external browser opens to `stellar.expert/explorer/.../tx/...`. Return to app. 2. Tap "Copy Verification Link". Verify alert "Copied". Paste somewhere to confirm URL format `https://lms.smwebsystems.com/verify/{id}`. 3. Tap "Download PDF". Verify "Downloading..." state, then share sheet appears. |
| **Expected** | Stellar explorer opens externally. URL copied without secrets. PDF share sheet appears. |
| **Capture** | Screenshot/recording of: Stellar explorer page, clipboard alert, PDF share sheet. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-N1: Empty Certificate State

| Field | Value |
|-------|-------|
| **Account** | Student B (zero credentials) |
| **Steps** | 1. Sign out. 2. Sign in as Student B. 3. Open Certificates tab. |
| **Expected** | Ribbon icon, "No certificates yet", "Complete courses and quizzes to earn NFT certificates." Count: "0 certificates". |
| **Capture** | Screenshot of empty state. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-N2: API/Network Error State

| Field | Value |
|-------|-------|
| **Account** | Any signed-in student |
| **Steps** | 1. Enable airplane mode. 2. Open Certificates tab or pull-to-refresh. |
| **Expected** | Error banner: "Unable to reach the server. Check your internet connection and try again." + "Try again" button. App does not crash. |
| **Capture** | Screenshot of error banner. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | After capturing, disable airplane mode and tap "Try again" to confirm recovery. |

---

#### TEST-N3: Unauthorized / Expired Session

| Field | Value |
|-------|-------|
| **Account** | Any student |
| **Steps** | 1. Sign in. 2. Let session expire, or clear app data / token. 3. Navigate to Certificates tab. |
| **Expected** | Redirects to sign-in screen or shows error banner. No crash or raw error. |
| **Capture** | Screenshot of redirect or error state. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | Session expiry may take time. If difficult to reproduce, note "Skipped — session expiry TTL not reached" and mark as ACCEPTED LIMITATION. |

---

#### TEST-N4: Wallet Unlinked State

| Field | Value |
|-------|-------|
| **Account** | Student C (wallet not linked) |
| **Steps** | 1. Sign in as Student C. 2. Open Certificates tab. |
| **Expected** | Amber banner: warning icon, "Wallet not linked", "Link your wallet on the web dashboard to receive certificates." No XLM balance shown. |
| **Capture** | Screenshot of amber banner. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

#### TEST-N5: Pull-to-Refresh

| Field | Value |
|-------|-------|
| **Account** | Any signed-in student with certificates |
| **Steps** | 1. Open Certificates tab, wait for load. 2. Pull down to refresh. |
| **Expected** | Teal refresh spinner appears. Data reloads. No duplication of certificates. |
| **Capture** | Screen recording showing pull gesture and spinner. |
| **Actual** | |
| **Pass/Fail** | |
| **Notes** | |

---

## 4. Demo Video Recording Script

### Requirements

| Field | Value |
|-------|-------|
| Length | 5-10 minutes |
| Resolution | 1080x1920 (portrait) or device native resolution |
| Orientation | Portrait (matches mobile app layout) |
| Format | MP4 (H.264) |
| File naming | `deliverable-1-batch1-demo-YYYY-MM-DD.mp4` |
| Storage | `docs/deliverable-1/evidence/` in this repository, or linked from an external host if file size exceeds Git limits (>50 MB) |
| Audio | Optional. If included, narrate what you are demonstrating. |

### Privacy and Redaction Rules

- Do NOT show real student personal data (names, emails) of non-test users.
- Do NOT show passwords being typed (mask the password field or skip that frame).
- Do NOT show tokens, session cookies, or API keys in developer tools.
- Do NOT show database contents, server logs, or admin panels.
- If the device notification bar shows personal notifications, crop or blur them.
- Safe to show: test student name, test email, public blockchain data (wallet addresses, transaction hashes, contract IDs).

### Recording Script

Record these scenes in order. Each scene corresponds to a SOW deliverable requirement.

**Scene 1 — Student Sign-In** (~1 min)
1. Show Expo Go opening and scanning the QR code.
2. Show the sign-in screen with SM Web Systems branding.
3. Enter test student email (visible) and password (masked).
4. Tap "Sign in".
5. Show the Dashboard tab with student greeting.

**Scene 2 — Course Navigation** (~1 min)
1. Tap the "Course" tab.
2. Show at least one course card.
3. Tap a course card.
4. Show course content (weeks/sections).
5. Tap a material item and show it loading.

**Scene 3 — Course Content Access** (~1 min)
1. Show a video playing, a PDF rendering, or an external link opening.
2. Navigate back to the course list.

**Scene 4 — NFT Certificate List** (~1 min)
1. Tap the "Certificates" tab (ribbon icon).
2. Show the wallet status banner (green or amber).
3. Show the certificate count label.
4. Show certificate cards with course title, code, date, and network.
5. Scroll if multiple certificates exist.

**Scene 5 — Certificate Detail and On-Chain References** (~2 min)
1. Tap a certificate card.
2. Show the detail header (course title, code, issued date).
3. Scroll to show all metadata rows:
   - Credential ID, Wallet Address, Network, Transaction Hash, Token ID,
     Contract ID, Quiz Title (if present).
4. Pause on the metadata to confirm NO private keys or secret values.

**Scene 6 — External Stellar Verification** (~1 min)
1. Tap "View on Stellar".
2. Show the external browser opening `stellar.expert/explorer/.../tx/...`.
3. Show the transaction details on Stellar Explorer.
4. Return to the app.

**Scene 7 — PDF Download/Share** (~30 sec)
1. Tap "Download PDF".
2. Show "Downloading..." state.
3. Show the native share sheet with the PDF file.
4. Dismiss the share sheet.

**Scene 8 — Copy Verification Link** (~30 sec)
1. Tap "Copy Verification Link".
2. Show the "Copied" alert.
3. Optionally paste the URL into a browser to show the verification page.

**Scene 9 — Empty State** (~30 sec)
1. Sign out.
2. Sign in as a student with zero credentials.
3. Show the empty Certificates tab with "No certificates yet".

**Scene 10 — Error State** (~30 sec)
1. Enable airplane mode.
2. Refresh the Certificates tab.
3. Show the error banner with "Try again".
4. Disable airplane mode and tap "Try again".
5. Show certificates reloading.

**Scene 11 — Wallet Unlinked State** (~30 sec)
1. Sign in as a student with an unlinked wallet (or show from current session
   if applicable).
2. Show the amber "Wallet not linked" banner.

**End recording.**

---

## 5. Mobile App Access

### Option A: Expo Go (recommended for demo and verification)

1. Install Expo Go on the device:
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
2. On the development machine:
   ```bash
   cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Mobile
   npm install
   npx expo start
   ```
3. Scan the QR code displayed in the terminal with Expo Go.
4. The app loads and connects to `https://lms.smwebsystems.com/api/v1`.
5. If the device and server are on different networks, use tunnel mode:
   ```bash
   npx expo start --tunnel
   ```

### Option B: EAS Development Build (APK with dev tools)

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Mobile
npx eas build --platform android --profile development
```

Download the APK from the EAS dashboard. Install on the device. Open the app
and connect to the Expo dev server. This build includes developer tools and
requires the dev server to be running.

### Option C: EAS Preview Build (standalone APK)

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Mobile
npx eas build --platform android --profile preview
```

Download the APK from the EAS dashboard. Install on any Android device. This
build runs standalone (no dev server required) and connects to
`https://lms.smwebsystems.com/api/v1`.

### Warning

> **Do NOT run `npx eas build --profile production` or `npx eas submit`
> without separate written approval.** A production build triggers app-store
> submission workflows. A preview or development build is sufficient for
> verification and demo purposes.

---

## 6. Reviewer Sign-Off

Complete this section after performing all 12 device scenarios and recording
the demo video.

| Field | Value |
|-------|-------|
| Reviewer name | |
| Date | |
| Device / emulator used | |
| OS version | |
| App build method | Expo Go / EAS dev build / EAS preview build |
| App version / build SHA | |
| Scenarios passed | /12 |
| Scenarios failed | |
| Accepted limitations | |
| Demo video filename | |
| Demo video location | |
| Demo video duration | |
| Approval decision | Approve / Request changes |
| Comments | |

---

## 7. Related Documents

| Document | Path |
|----------|------|
| Device verification checklist | `docs/deliverable-1/batch-1-device-verification.md` |
| Automated verification results | `docs/deliverable-1/batch-1-device-verification-results.md` |
| Demo script (scene descriptions) | `docs/deliverable-1/batch-1-demo-script.md` |
| Web screenshots | `LMS-Mobile/docs/deliverable-1/evidence/` |
| PR #61 | [GitHub](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) |
| Known limitations | `docs/deliverable-1/batch-1-device-verification.md` § Known Limitations |

---

## 8. Safety Confirmation

- No NFT minting, mainnet transaction, or mutating credential/wallet
  operation occurred during the preparation of this handoff.
- No EAS production build was created.
- No app-store submission was created.
- No RBAC roles, permissions, or seed data were changed.
- No AmmaWallet containers or configuration were modified.
- No private keys, seed phrases, tokens, passwords, or personal data
  were captured or committed in evidence.
- Deliverable 3 remains not started.
