# Phase 24 C4: Certificate Email Notification on Mint — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 24 C4
**Baseline:** 785 tests (637 BE + 148 FE)

---

## 1. Problem Statement

When an admin mints a student's NFT certificate, the student only receives an in-app notification (`nft_minted` type via `createNotification()`). There is no email notification. Students who aren't actively logged in may not know their certificate was minted for hours or days.

## 2. Goals

1. Send an email to the student when their NFT certificate is minted
2. Email includes course name, verification URL, blockchain explorer link
3. Respect notification preferences (if user opted out of `nft_minted`, skip email)
4. Seed a `certificate-minted` email template in the DB (category: `certificate`)
5. Fire-and-forget — email failure does not block the mint response

## 3. Non-Goals

- CC admin who minted (unnecessary, admin sees the result in UI)
- Email on remint (separate concern, lower value)
- Frontend changes (this is purely backend — email sending + template seeding)
- Custom email editor for this template (admin can edit via existing EmailTemplates panel)

## 4. Architecture

### 4.1 Pattern: Follow Existing Email Functions

Follow the established pattern in `emailService.ts`:
1. `renderTemplate(slug, vars)` for DB-backed template
2. Inline fallback HTML if template not in DB
3. `transporter.sendMail()` with `from`, `to`, `subject`, `html`

### 4.2 Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/services/emailService.ts` | Add `sendCertificateMintedEmail()` function |
| `LMS-Server/src/config/database.ts` | Seed `certificate-minted` template row |
| `LMS-Server/src/routes/nftApplications.ts` | Call email after `persistMint()` + `createNotification()` |
| `LMS-Server/src/__tests__/nft-badges.test.ts` | Add 4 BE tests |

### 4.3 No New Files

Email function added to existing `emailService.ts`. Template seeded in existing `database.ts`.

### 4.4 No Frontend Changes

This is purely backend. The `nft_minted` notification type already exists in the preferences UI.

## 5. Detailed Design

### 5.1 Email Function

```typescript
export async function sendCertificateMintedEmail(opts: {
  to: string;
  name: string;
  courseName: string;
  credentialId: string;
  txHash: string;
}): Promise<void>
```

**Template slug:** `certificate-minted`

**Template variables:**
- `{{studentName}}` — student name
- `{{courseName}}` — course title
- `{{{verifyUrl}}}` — `${FRONTEND_URL}/verify/${credentialId}` (unescaped, URL)
- `{{{explorerUrl}}}` — `https://stellar.expert/explorer/public/tx/${txHash}` (unescaped, URL)
- `{{lmsName}}` — LMS name

**Inline fallback subject:** `Your NFT Certificate for "${courseName}" Has Been Minted!`

### 5.2 Template Seed

Category: `certificate` (already allowed by CHECK constraint)

```sql
INSERT INTO email_templates (id, slug, category, name, subject, body_html, variables)
VALUES (
  uuid, 'certificate-minted', 'certificate',
  'Certificate Minted Notification',
  'Your NFT Certificate for "{{courseName}}" Has Been Minted!',
  '<html>...</html>',
  '["studentName","courseName","verifyUrl","explorerUrl","lmsName"]'
);
```

### 5.3 Integration Point

In `nftApplications.ts`, after `createNotification()` (line ~1005), add:

```typescript
// Email notification (best-effort, fire-and-forget)
const studentRow = queryOne<{ email: string; name: string }>(
  'SELECT email, name FROM users WHERE id = ?',
  [app.user_id]
);
if (studentRow?.email) {
  sendCertificateMintedEmail({
    to: studentRow.email,
    name: studentRow.name || 'Student',
    courseName: courseRow?.title ?? 'your course',
    credentialId: credId,
    txHash: txHash!,
  }).catch((err) => logger.error({ err }, 'Failed to send certificate minted email'));
}
```

### 5.4 Notification Preference Check

The `sendCertificateMintedEmail` function checks notification preferences before sending:

```typescript
const pref = queryOne<{ enabled: number }>(
  'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
  [userId, 'nft_minted']
);
if (pref && pref.enabled === 0) return; // User opted out
```

This requires passing `userId` to the email function so it can check preferences.

## 6. Security

- Email contains only public information (course name, verification URL)
- Credential IDs are UUIDs (not guessable)
- Fire-and-forget prevents email failures from leaking error info to admin
- Template uses `{{}}` (escaped) for text, `{{{}}}` (unescaped) for URLs

## 7. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| MINT-EMAIL-1 | sendCertificateMintedEmail calls transporter with correct subject | Subject contains course name |
| MINT-EMAIL-2 | sendCertificateMintedEmail includes verification URL in body | Body contains `/verify/{credentialId}` |
| MINT-EMAIL-3 | sendCertificateMintedEmail includes explorer URL in body | Body contains `stellar.expert` link |
| MINT-EMAIL-4 | certificate-minted template is seeded in DB | Template exists with slug `certificate-minted` |

### Frontend (0 new tests — no frontend changes)

### Target counts:
- Backend: 637 → 641 (+4)
- Frontend: 148 → 148 (unchanged)

## 8. Rollback

- Revert the merge commit or `git reset --hard pre-phase24-c4-2026-08-11`
- Template row auto-seeded on startup — will be re-seeded after rollback
- No schema changes — clean rollback
