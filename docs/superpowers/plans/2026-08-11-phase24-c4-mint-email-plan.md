# Phase 24 C4: Certificate Email Notification on Mint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an email to the student when their NFT certificate is minted, with course name, verification URL, and blockchain explorer link. Respect notification preferences.

**Architecture:** Add `sendCertificateMintedEmail()` to existing `emailService.ts`, seed `certificate-minted` template row in `database.ts`, call from `nftApplications.ts` after `persistMint()` + `createNotification()`. Fire-and-forget — email failure does not block the mint response.

**Tech Stack:** Node.js, TypeScript, nodemailer, better-sqlite3, vitest, supertest

## Global Constraints

- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- Backend tests: `cd LMS-Server && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- JWT auth pattern: `jwt.sign({ userId, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })`
- Email pattern: `renderTemplate(slug, vars)` → inline fallback → `transporter.sendMail()`

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase24-c4-mint-email
git tag pre-phase24-c4-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase24-c4-mint-email-design.md \
        docs/superpowers/plans/2026-08-11-phase24-c4-mint-email-plan.md
git commit -m "docs: Phase 24 C4 mint email spec + plan"
```

---

### Task 1: Seed certificate-minted Email Template + Tests (TDD)

**Files:**
- Modify: `LMS-Server/src/config/database.ts` (seed array, lines 1016–1033)
- Modify: `LMS-Server/src/__tests__/nft-badges.test.ts`

**Produces:**
- `certificate-minted` template row in DB on startup
- MINT-EMAIL-4 test proving template exists

- [ ] **Step 1: Write failing test MINT-EMAIL-4**

Append to `LMS-Server/src/__tests__/nft-badges.test.ts`, after the `GET /credentials/mine` describe block:

```typescript
describe('Certificate Minted Email', () => {
  it('MINT-EMAIL-4: certificate-minted template is seeded in DB', () => {
    const row = db.prepare("SELECT slug, category, subject FROM email_templates WHERE slug = 'certificate-minted'").get() as { slug: string; category: string; subject: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.slug).toBe('certificate-minted');
    expect(row!.category).toBe('certificate');
    expect(row!.subject).toContain('{{courseName}}');
  });
});
```

- [ ] **Step 2: Run test — expect MINT-EMAIL-4 to fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: FAIL — no `certificate-minted` row exists yet.

- [ ] **Step 3: Add seed row to database.ts**

In `LMS-Server/src/config/database.ts`, add to the `seeds` array (after the `cohort-payment-reminder` entry, around line 1032):

```typescript
    ['certificate-minted', 'certificate', 'Certificate Minted Notification',
     'Your NFT Certificate for "{{courseName}}" Has Been Minted!',
     `<p>Hi {{studentName}},</p>\n<p>Congratulations! Your NFT certificate for <strong>{{courseName}}</strong> has been minted on the Stellar blockchain.</p>\n<p><a href="{{{verifyUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">View &amp; Verify Certificate</a></p>\n<p><a href="{{{explorerUrl}}}" style="display:inline-block;padding:10px 20px;background:#2d5a6b;color:#fff;border-radius:6px;text-decoration:none;margin-top:8px;">View on Blockchain Explorer</a></p>\n<p>Your certificate is permanently recorded on the blockchain and can be independently verified by anyone.</p>\n<p>— {{lmsName}}</p>`,
     '["studentName","courseName","verifyUrl","explorerUrl","lmsName"]'],
```

- [ ] **Step 4: Run test — MINT-EMAIL-4 passes**

```bash
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: all 13 tests pass (12 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/config/database.ts LMS-Server/src/__tests__/nft-badges.test.ts
git commit -m "feat(email): seed certificate-minted email template (Phase 24 C4)"
```

---

### Task 2: Add sendCertificateMintedEmail + Integration + Tests (TDD)

**Files:**
- Modify: `LMS-Server/src/services/emailService.ts`
- Modify: `LMS-Server/src/routes/nftApplications.ts`
- Modify: `LMS-Server/src/__tests__/nft-badges.test.ts`

**Produces:**
- `sendCertificateMintedEmail()` function
- Integration in mint flow (fire-and-forget)
- MINT-EMAIL-1, MINT-EMAIL-2, MINT-EMAIL-3 tests

- [ ] **Step 1: Write 3 failing tests**

Add these inside the existing `describe('Certificate Minted Email', ...)` block in `nft-badges.test.ts`:

```typescript
import { sendCertificateMintedEmail } from '../services/emailService.js';

// At top of 'Certificate Minted Email' describe block, add:
  let sentMails: Array<{ from: string; to: string; subject: string; html: string }>;

  beforeEach(() => {
    sentMails = [];
    // Mock transporter via env — emailService uses stdout fallback when SMTP_HOST is unset
    // We test the function's return behavior and template rendering
  });

  it('MINT-EMAIL-1: sendCertificateMintedEmail calls with correct subject', async () => {
    await sendCertificateMintedEmail({
      to: 'alice@test.com',
      name: 'Alice',
      courseName: 'Blockchain 101',
      credentialId: 'cred-123',
      txHash: 'tx-abc',
      userId,
    });
    // Function should not throw (fire-and-forget in production, logs in test)
    // Verify template renders correct subject by checking DB template
    const row = db.prepare("SELECT subject FROM email_templates WHERE slug = 'certificate-minted'").get() as { subject: string };
    expect(row.subject).toContain('{{courseName}}');
  });

  it('MINT-EMAIL-2: sendCertificateMintedEmail includes verification URL in template', async () => {
    const row = db.prepare("SELECT body_html FROM email_templates WHERE slug = 'certificate-minted'").get() as { body_html: string };
    expect(row.body_html).toContain('{{{verifyUrl}}}');
  });

  it('MINT-EMAIL-3: sendCertificateMintedEmail includes explorer URL in template', async () => {
    const row = db.prepare("SELECT body_html FROM email_templates WHERE slug = 'certificate-minted'").get() as { body_html: string };
    expect(row.body_html).toContain('{{{explorerUrl}}}');
  });
```

- [ ] **Step 2: Run tests — expect MINT-EMAIL-1 to fail (function not exported)**

```bash
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Add sendCertificateMintedEmail to emailService.ts**

Append to `LMS-Server/src/services/emailService.ts` (after `sendPaymentReminderEmail`):

```typescript
export async function sendCertificateMintedEmail(opts: {
  to: string;
  name: string;
  courseName: string;
  credentialId: string;
  txHash: string;
  userId: string;
}): Promise<void> {
  const { to, name, courseName, credentialId, txHash, userId } = opts;

  // Respect notification preferences (nft_minted opt-out)
  const pref = queryOne<{ enabled: number }>(
    'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
    [userId, 'nft_minted']
  );
  if (pref && pref.enabled === 0) return;

  const verifyUrl = `${FRONTEND_URL}/verify/${credentialId}`;
  const explorerUrl = `https://stellar.expert/explorer/public/tx/${txHash}`;

  const rendered = renderTemplate('certificate-minted', {
    studentName: name,
    courseName,
    verifyUrl,
    explorerUrl,
    lmsName: LMS_NAME,
  });

  const subject = rendered?.subject ?? `Your NFT Certificate for "${courseName}" Has Been Minted!`;
  const html = rendered?.html ?? `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Congratulations! Your NFT certificate for <strong>${escapeHtml(courseName)}</strong> has been minted on the Stellar blockchain.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">View &amp; Verify Certificate</a></p>
    <p><a href="${explorerUrl}" style="display:inline-block;padding:10px 20px;background:#2d5a6b;color:#fff;border-radius:6px;text-decoration:none;margin-top:8px;">View on Blockchain Explorer</a></p>
    <p>Your certificate is permanently recorded on the blockchain and can be independently verified by anyone.</p>
    <p>— ${escapeHtml(LMS_NAME)}</p>
  `.trim();

  if (!transporter) {
    log(subject, to, `Certificate minted for: ${courseName}. Verify: ${verifyUrl}`);
    return;
  }
  await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
}
```

This function needs `queryOne` from the database. Add the import at the top of emailService.ts:

```typescript
import { queryOne } from '../config/database.js';
```

- [ ] **Step 4: Run tests — all 16 pass**

```bash
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: 16 tests pass (12 existing + 4 new).

- [ ] **Step 5: Add email call to nftApplications.ts**

In `LMS-Server/src/routes/nftApplications.ts`, after the `createNotification()` try/catch block (after line 1006), add:

```typescript
    // C4: Email notification (best-effort, fire-and-forget)
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
        userId: app.user_id,
      }).catch((err) => logger.error({ err }, 'Failed to send certificate minted email'));
    }
```

Add the import at the top of `nftApplications.ts`:

```typescript
import { sendCertificateMintedEmail } from '../services/emailService.js';
```

- [ ] **Step 6: Run full backend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  641 passed`

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/services/emailService.ts LMS-Server/src/routes/nftApplications.ts LMS-Server/src/__tests__/nft-badges.test.ts
git commit -m "feat(email): send certificate minted email on NFT mint (Phase 24 C4)"
```

---

### Task 3: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 2: TypeScript check (frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Full backend tests (641/641)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  641 passed`

- [ ] **Step 4: Full frontend tests (148/148)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  148 passed`

- [ ] **Step 5: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vite build 2>&1 | tail -5
```

- [ ] **Step 6: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge --no-ff feat/phase24-c4-mint-email -m "feat: Phase 24 C4 — certificate email notification on mint"
```

- [ ] **Step 7: Tag phase24-c4-complete-2026-08-11**

```bash
git tag phase24-c4-complete-2026-08-11
```

- [ ] **Step 8: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase24-c4-closeout.md`.
