# Deliverable 1 Batch 1 — Demo Script

**Purpose:** Walk through the complete student journey in the LMS mobile app,
demonstrating NFT certificate viewing, blockchain verification, and error
handling.

**Duration:** ~10 minutes

**Audience:** SOW reviewers, stakeholders

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Device | Android phone/tablet (API 28+) or iOS device (iOS 15+) |
| Expo Go | Install from [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) or [App Store](https://apps.apple.com/app/expo-go/id982107779) |
| Network | Device must reach `lms.smwebsystems.com` over HTTPS |
| Test account A | A student account WITH at least one minted NFT credential |
| Test account B | A student account with ZERO minted credentials (for empty state) |
| Test account C | A student account whose wallet is NOT linked (`walletLinkingStatus = "none"`) |
| Screen recording | Use device built-in screen recorder or a third-party tool |

### Starting the Development Server

```bash
cd /path/to/LMS-AmmaWallet/LMS-Mobile

# 1. Install dependencies
npm install

# 2. Verify tests pass
npx jest --no-cache
# Expected: 38 passed, 0 failed

# 3. Verify TypeScript
npx tsc --noEmit
# Expected: exit 0, no errors

# 4. Start Expo development server
npx expo start
# Scan the QR code with Expo Go
```

The app connects to `https://lms.smwebsystems.com/api/v1` by default. No
`.env` file with secrets is required.

---

## Demo Scenes

### Scene 1: App Launch and Sign-In (TEST-1)

**Start recording.**

1. Open Expo Go on the device.
2. Scan the QR code from the Expo dev server.
3. Wait for the app to load — the sign-in screen appears.
4. **Show:** SM Web Systems logo, "Learning Management" subtitle, Email
   and Password fields, teal "Sign in" button, "New here? Create an
   account" link.
5. Enter the test student email address.
6. Enter the password.
7. Tap "Sign in".
8. **Show:** Student is redirected to the Dashboard tab. The greeting
   displays the student's first name.

**Expected on screen:** Clean sign-in form with branded dark-blue logo.
After sign-in, the dashboard with the student's name.

---

### Scene 2: Course Navigation (TEST-2, TEST-3)

1. Tap the **Course** tab (book icon) in the bottom navigation bar.
2. **Show:** At least one course card with a title and progress indicator.
3. Tap a course card to open it.
4. **Show:** Course content loads — weeks/sections are visible.
5. Tap a material item (video, PDF, or link).
6. **Show:** The content viewer opens. Video plays, PDF renders, or
   external link opens.

**Expected on screen:** Course list with cards, then course detail with
sections and materials.

---

### Scene 3: Certificates Tab (TEST-4, TEST-5)

1. Tap the **Certificates** tab (ribbon icon) between Messages and
   Profile.
2. **Show:** Certificates screen loads with:
   - Wallet status banner at the top (green "Wallet linked" with truncated
     address, OR amber "Wallet not linked" with linking message).
   - "My Certificates" heading.
   - Count label (e.g., "3 certificates").
   - Certificate cards showing course title, course code, issued date,
     and network.
3. **Pause** to show the full certificate list.

**Expected on screen:** Wallet banner + certificate cards in a scrollable
list.

---

### Scene 4: Certificate Detail (TEST-5, TEST-6)

1. Tap a certificate card.
2. **Show:** Certificate detail screen with:
   - Header: ribbon icon, course title, course code, issued date.
   - "Certificate Details" card with metadata rows:
     - Credential ID
     - Wallet Address
     - Network (e.g., "Public")
     - Transaction Hash (truncated: `abcdef01...xyz89012`)
     - Token ID (e.g., `#42`)
     - Contract ID (truncated)
     - Quiz Title (if applicable)
3. Scroll down to show all metadata.
4. **Verify:** NO private keys, seed phrases, XLM balances, or secret
   values are visible anywhere on screen.

**Expected on screen:** Clean detail view with public blockchain metadata.
All sensitive data is absent.

---

### Scene 5: Certificate Actions (TEST-7)

1. **View on Stellar:**
   - Tap "View on Stellar" (primary teal button).
   - **Show:** External browser opens to
     `https://stellar.expert/explorer/public/tx/{txHash}` (or testnet).
   - Return to the app.

2. **Copy Verification Link:**
   - Tap "Copy Verification Link" (ghost teal button).
   - **Show:** Alert says "Copied — Verification link copied to clipboard."
   - Optionally paste into a browser to show the URL format:
     `https://lms.smwebsystems.com/verify/{credentialId}`.

3. **Download PDF:**
   - Tap "Download PDF" (outline button).
   - **Show:** Button text changes to "Downloading..." with a spinner.
   - **Show:** Native share sheet appears with the PDF file.
   - Dismiss the share sheet.

**Expected on screen:** Stellar explorer in browser, clipboard alert, PDF
share sheet.

---

### Scene 6: Empty State (TEST-N1)

1. Sign out (go to Profile tab, tap "Sign Out").
2. Sign in with **Test Account B** (student with zero credentials).
3. Tap the **Certificates** tab.
4. **Show:** Empty state with:
   - Ribbon icon (gray).
   - "No certificates yet"
   - "Complete courses and quizzes to earn NFT certificates."
   - "0 certificates" count.

**Expected on screen:** Friendly empty state encouraging the student to
earn certificates.

---

### Scene 7: Error States (TEST-N2)

1. Enable **airplane mode** on the device.
2. Pull down to refresh the Certificates tab (or navigate away and back).
3. **Show:** Error banner appears:
   - "Unable to reach the server. Check your internet connection and try
     again."
   - "Try again" button.
4. App does NOT crash.
5. Disable airplane mode.
6. Tap "Try again".
7. **Show:** Certificates reload successfully.

**Expected on screen:** Error banner with retry, then successful recovery.

---

### Scene 8: Wallet Unlinked State (TEST-N4)

1. Sign in with **Test Account C** (wallet not linked).
2. Tap the **Certificates** tab.
3. **Show:** Amber banner at top:
   - Warning icon.
   - "Wallet not linked"
   - "Link your wallet on the web dashboard to receive certificates."
4. No XLM balance is displayed.

**Expected on screen:** Amber warning banner encouraging wallet linking.

---

### Scene 9: Pull-to-Refresh (TEST-N5)

1. On the Certificates tab (with certificates loaded), pull down.
2. **Show:** Teal refresh spinner appears at the top.
3. Data reloads.
4. **Show:** Previously loaded certificates are replaced with fresh data.
   No duplication.

**Expected on screen:** Smooth pull-to-refresh animation with data reload.

---

### Scene 10: Session Handling (TEST-N3)

*(Optional — may be difficult to reproduce reliably.)*

1. While signed in, note the certificate data is loaded.
2. If possible, expire the session (e.g., wait for token TTL or manually
   clear the token via developer tools).
3. Navigate to the Certificates tab.
4. **Show:** App redirects to sign-in screen or shows error banner
   "Please sign in again to continue."
5. App does not crash or show raw error details.

**Expected on screen:** Graceful session expiry handling.

**Stop recording.**

---

## Evidence Index

| # | Evidence Item | Status | Location |
|---|--------------|--------|----------|
| 1 | Sign-in screen screenshot | DONE | `evidence/TEST-1a-sign-in-screen.png` |
| 2 | Credentials entered screenshot | DONE | `evidence/TEST-1b-credentials-entered.png` |
| 3 | Auth gate redirect screenshot | DONE | `evidence/TEST-N3-unauthorized.png` |
| 4 | Demo video: full student journey | PENDING | Human reviewer to record |
| 5 | Authenticated screen screenshots | PENDING | Human reviewer to capture |
| 6 | PR link | DONE | [PR #61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) |
| 7 | Deployed SHA | DONE | `76d6ecb49d22a4e72e22cc5b252f103d519e0d64` |
| 8 | Test evidence (38/38) | DONE | `npx jest --no-cache` |
| 9 | TypeScript evidence | DONE | `npx tsc --noEmit` exit 0 |
| 10 | CI evidence | DONE | GitHub Actions: Frontend Tests & Build PASS |
| 11 | Production smoke tests (5/5) | DONE | `batch-1-device-verification.md` |
| 12 | Device verification results | DONE | `batch-1-device-verification-results.md` |
| 13 | Known limitations | DONE | `batch-1-device-verification.md` |

---

## Mobile App Access Instructions

### Option A: Expo Go (Recommended for Demo)

1. Install Expo Go on your Android or iOS device.
2. On the development machine, run:
   ```bash
   cd /path/to/LMS-AmmaWallet/LMS-Mobile
   npm install
   npx expo start
   ```
3. Scan the QR code with Expo Go.
4. The app connects to `https://lms.smwebsystems.com/api/v1` automatically.

### Option B: EAS Development Build

1. Run:
   ```bash
   cd /path/to/LMS-AmmaWallet/LMS-Mobile
   npx eas build --platform android --profile development
   ```
2. Download and install the APK on an Android device.
3. Open the app and connect to the Expo dev server.

### Option C: EAS Preview Build (Standalone APK)

1. Run:
   ```bash
   npx eas build --platform android --profile preview
   ```
2. Download the APK from the EAS dashboard.
3. Install on any Android device (no Expo Go required).
4. The app uses `https://lms.smwebsystems.com/api/v1` as the API endpoint.

**Note:** No production build or app store submission was created.

---

## Safety Confirmation

- No NFT minting, mainnet transaction, or mutating credential/wallet
  operation occurred during this verification.
- No app store release was created.
- No EAS production build was created.
- No RBAC roles, permissions, or seed data were changed.
- No AmmaWallet containers or configuration were modified.
- No private keys, seed phrases, tokens, passwords, or personal data
  were captured in evidence.
- Deliverable 3 remains not started.
