# Phase 25 C2: Dynamic OG Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve dynamic OG meta tags for certificate verification pages so social media previews show course name and student name.

**Architecture:** New Express route `GET /verify/:credentialId` serves a standalone HTML page with dynamic OG tags. Host nginx routes `/verify/` to Express. No frontend changes.

**Tech Stack:** Node.js, TypeScript, Express, better-sqlite3, vitest, supertest

## Global Constraints

- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- Backend tests: `cd LMS-Server && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- HTML output must escape all DB-sourced values to prevent XSS

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase25-c2-dynamic-og
git tag pre-phase25-c2-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase25-c2-dynamic-og-design.md \
        docs/superpowers/plans/2026-08-11-phase25-c2-dynamic-og-plan.md
git commit -m "docs: Phase 25 C2 dynamic OG tags spec + plan"
```

---

### Task 1: OG Pages Route + Tests (TDD)

**Files:**
- Create: `LMS-Server/src/routes/ogPages.ts`
- Create: `LMS-Server/src/__tests__/og-pages.test.ts`
- Modify: `LMS-Server/src/app.ts`

- [ ] **Step 1: Write 4 failing tests**

Create `LMS-Server/src/__tests__/og-pages.test.ts`:

```typescript
/**
 * og-pages.test.ts — Phase 25 C2
 *
 * OG-BE-1: GET /verify/:id returns HTML with og:title containing course name
 * OG-BE-2: GET /verify/:id returns HTML with og:title containing student name
 * OG-BE-3: GET /verify/:id returns text/html content-type
 * OG-BE-4: GET /verify/nonexistent returns 404
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';

const WALLET = 'GBOHFMJWVGMYTWWBKRTDAZZ2MYXGKOVZWEW3JFPVJ4EK3CYG7BADGE01';

let userId: string;
let courseId: string;
let credentialId: string;

function seedOgData() {
  userId = uuidv4();
  courseId = uuidv4();
  credentialId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Alice Test', ?, 'hash', 'student')`,
  ).run(userId, `og-test-${userId}@test.com`);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Blockchain Fundamentals', 'Test course', 'BLK-101', '[]')`,
  ).run(courseId);

  db.prepare(
    `INSERT INTO nft_credentials
       (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, ?, 'minted', 'ogtxhash123', 'CDPKSOOE4UZF', 'public', ?, 99, 0)`,
  ).run(credentialId, userId, WALLET, courseId);
}

beforeEach(() => {
  seedOgData();
});

describe('GET /verify/:credentialId (OG pages)', () => {
  it('OG-BE-1: returns HTML with og:title containing course name', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.text).toContain('og:title');
    expect(res.text).toContain('Blockchain Fundamentals');
  });

  it('OG-BE-2: returns HTML with og:title containing student name', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.text).toContain('Alice Test');
  });

  it('OG-BE-3: returns text/html content-type', async () => {
    const res = await request(app)
      .get(`/verify/${credentialId}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
  });

  it('OG-BE-4: returns 404 for non-existent credential', async () => {
    await request(app)
      .get(`/verify/${uuidv4()}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run tests — expect 4 failures**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/og-pages.test.ts 2>&1 | tail -15
```

Expected: 4 failures — route not defined.

- [ ] **Step 3: Create ogPages.ts route**

Create `LMS-Server/src/routes/ogPages.ts`:

```typescript
/**
 * OG Pages — Phase 25 C2: Dynamic Open Graph tags for certificate verification.
 *
 * Serves a standalone HTML page at /verify/:credentialId with dynamic OG meta tags.
 * Social crawlers (LinkedIn, Twitter, WhatsApp) read the tags from the initial HTML.
 * Requires nginx to route /verify/ to Express (not the SPA container).
 */

import { Router, Request, Response } from 'express';
import { queryOne } from '../config/database.js';

const router = Router();

const SITE_NAME = 'SM Web Systems Blockchain Academy';
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'https://lms.smwebsystems.com').replace(/\/$/, '');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderVerifyPage(cred: {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  network: string;
  issuedAt: string;
}): string {
  const ogTitle = `${cred.studentName}'s ${cred.courseTitle} Certificate`;
  const ogDesc = `Blockchain-verified NFT certificate issued by ${SITE_NAME}. Verified on the Stellar network.`;
  const ogUrl = `${FRONTEND_URL}/verify/${cred.credentialId}`;
  const explorerUrl = cred.txHash
    ? `https://stellar.expert/explorer/${cred.network}/tx/${cred.txHash}`
    : null;
  const issuedDate = new Date(cred.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ogTitle)} | ${escapeHtml(SITE_NAME)}</title>
  <meta name="description" content="${escapeHtml(ogDesc)}" />
  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDesc)}" />
  <meta property="og:url" content="${escapeHtml(ogUrl)}" />
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { max-width: 480px; width: 100%; margin: 2rem; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #3d7a8c 0%, #2d5a6b 100%); color: #fff; padding: 2rem; text-align: center; }
    .header h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
    .header p { font-size: 0.875rem; opacity: 0.9; }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.2); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 600; margin-top: 1rem; }
    .body { padding: 1.5rem 2rem; }
    .field { margin-bottom: 1rem; }
    .field label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .field p { font-size: 0.875rem; margin-top: 0.25rem; word-break: break-all; }
    .footer { padding: 1rem 2rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.75rem; color: #94a3b8; }
    a { color: #3d7a8c; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${escapeHtml(cred.courseTitle)}</h1>
      <p>Awarded to <strong>${escapeHtml(cred.studentName)}</strong></p>
      <div class="badge">&#x2714; Blockchain Verified</div>
    </div>
    <div class="body">
      <div class="field"><label>Course Code</label><p>${escapeHtml(cred.courseCode)}</p></div>
      <div class="field"><label>Issued</label><p>${escapeHtml(issuedDate)}</p></div>
      <div class="field"><label>Wallet</label><p>${escapeHtml(cred.walletAddress)}</p></div>
      <div class="field"><label>Network</label><p>${escapeHtml(cred.network)}</p></div>
      ${explorerUrl ? `<div class="field"><a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener">View on Blockchain Explorer &rarr;</a></div>` : ''}
    </div>
    <div class="footer">${escapeHtml(SITE_NAME)}</div>
  </div>
</body>
</html>`;
}

function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificate Not Found | ${escapeHtml(SITE_NAME)}</title>
  <meta property="og:title" content="Certificate Not Found" />
  <meta property="og:description" content="This certificate could not be found or has not been issued yet." />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .msg { text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #64748b; }
  </style>
</head>
<body><div class="msg"><h1>Certificate Not Found</h1><p>This certificate could not be found or has not been issued yet.</p></div></body>
</html>`;
}

router.get('/verify/:credentialId', (req: Request, res: Response): void => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    student_name: string | null;
    course_title: string | null;
    course_code: string | null;
    wallet_address: string;
    tx_hash: string | null;
    network: string;
    created_at: string;
  }>(
    `SELECT nc.id, u.name AS student_name, c.title AS course_title,
            c.course_code, nc.wallet_address, nc.tx_hash,
            nc.network, nc.created_at
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).send(render404Page());
    return;
  }

  res.send(renderVerifyPage({
    credentialId: row.id,
    studentName: row.student_name ?? 'Certificate Holder',
    courseTitle: row.course_title ?? 'Certificate',
    courseCode: row.course_code ?? '',
    walletAddress: row.wallet_address,
    txHash: row.tx_hash,
    network: row.network,
    issuedAt: row.created_at,
  }));
});

export default router;
```

- [ ] **Step 4: Register route in app.ts**

Add import and registration in `LMS-Server/src/app.ts`:

Import (after other imports):
```typescript
import ogPagesRoutes from './routes/ogPages.js';
```

Register (after health routes, before `/api/v1` routes):
```typescript
app.use(ogPagesRoutes);
```

- [ ] **Step 5: Run tests — all 4 pass**

```bash
npx vitest run src/__tests__/og-pages.test.ts 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 6: Run full backend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  645 passed`

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/routes/ogPages.ts LMS-Server/src/__tests__/og-pages.test.ts LMS-Server/src/app.ts
git commit -m "feat(og): dynamic OG tags for certificate verification pages (Phase 25 C2)"
```

---

### Task 2: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend + frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 2: Full backend tests (645/645)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 3: Full frontend tests (151/151)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run 2>&1 | grep "Tests"
```

- [ ] **Step 4: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge --no-ff feat/phase25-c2-dynamic-og -m "feat: Phase 25 C2 — dynamic OG tags for certificate verification"
```

- [ ] **Step 6: Tag phase25-c2-complete-2026-08-11**

```bash
git tag phase25-c2-complete-2026-08-11
```

- [ ] **Step 7: Write closeout document**

Save to `docs/superpowers/plans/2026-08-11-phase25-c2-closeout.md`.
