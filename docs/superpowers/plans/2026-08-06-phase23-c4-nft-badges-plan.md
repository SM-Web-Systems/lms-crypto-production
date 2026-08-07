# Phase 23 C4: NFT Certificate Badge Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enhanced NFT badge display, public certificate verification, shareable links, certificate PDF download, and mint animation to the LMS.

**Architecture:** Three new files (NFTBadge component, CertificateVerification page, certificatePdfService), two new public API endpoints on the existing publicCredentials router, and integration into LmsCertificatesSection + App.tsx routing. No schema migrations — all data exists in nft_credentials + courses + users tables.

**Tech Stack:** React 18 + TypeScript + Tailwind (frontend), Express + pdfkit + better-sqlite3 (backend), vitest + @testing-library/react (tests)

## Global Constraints

- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- pdfkit already installed (used by invoiceService.ts)
- Frontend build: `npm run build` in `LMS-Frontend/` (Vite)
- Backend tests: `cd LMS-Server && npx vitest run`
- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- RBAC: public endpoints need no permission; authenticated endpoints use `requirePermission()`
- Lucide React for icons (already installed)
- Existing pattern: `query<T>()` and `queryOne<T>()` from `../config/database.js`

---

### Task 0: Branch Setup + Baseline Verification

**Files:**
- None created or modified

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git pull
git checkout -b feat/phase23-c4-nft-badges
```

- [ ] **Step 2: Verify backend baseline**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -5
```

Expected: `Tests  625 passed` (0 failed)

- [ ] **Step 3: Verify frontend baseline**

```bash
cd ../LMS-Frontend && npx vitest run 2>&1 | tail -5
```

Expected: `Tests  135 passed` (0 failed)

- [ ] **Step 4: Verify TypeScript**

```bash
cd ../LMS-Server && npx tsc --noEmit 2>&1 | tail -3
cd ../LMS-Frontend && npx tsc --noEmit 2>&1 | tail -3
```

Expected: No errors

- [ ] **Step 5: Tag baseline**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag pre-phase23-c4-2026-08-07
```

---

### Task 1: Backend — Verification + PDF Endpoints (TDD)

**Files:**
- Create: `LMS-Server/src/__tests__/nft-badges.test.ts`
- Create: `LMS-Server/src/services/certificatePdfService.ts`
- Modify: `LMS-Server/src/routes/publicCredentials.ts`

**Interfaces:**
- Consumes: `query<T>()`, `queryOne<T>()` from `../config/database.js`; `generateBadgeSvg()` from `../services/badgeService.js`; `PDFDocument` from `pdfkit`
- Produces:
  - `GET /credentials/verify/:credentialId` → `{ success, data: { credential: VerifiedCredential } }` or 404
  - `GET /credentials/:credentialId/pdf` → `application/pdf` buffer or 404
  - `generateCertificatePdf(data: CertificateData): Promise<Buffer>`

- [ ] **Step 1: Write 6 failing backend tests**

Create `LMS-Server/src/__tests__/nft-badges.test.ts`:

```typescript
/**
 * Phase 23 C4: NFT Badge endpoints — verification + PDF.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../testSetup.js';
import { execute, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

let app: ReturnType<typeof createServer>;
const BASE = '/api/v1';

// Seed data
const userId = uuidv4();
const courseId = uuidv4();
const mintedCredId = uuidv4();
const supersededCredId = uuidv4();
const pendingCredId = uuidv4();

beforeAll(() => {
  app = createServer();

  // Seed user
  execute(
    `INSERT INTO users (id, name, email, password, role)
     VALUES (?, 'Alice Test', 'alice-badge@test.com', 'hashed', 'student')`,
    [userId],
  );

  // Seed course
  execute(
    `INSERT INTO courses (id, title, course_code, description)
     VALUES (?, 'Blockchain 101', 'BVC-101', 'Intro course')`,
    [courseId],
  );

  // Minted credential (valid)
  execute(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE', 'minted', 'abc123txhash', 'CDPKSOOE4UZF', 'public', ?, 42, 0)`,
    [mintedCredId, userId, courseId],
  );

  // Superseded credential
  execute(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network, course_id, soroban_token_id, is_superseded)
     VALUES (?, ?, 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE', 'minted', 'old_tx', 'CDPKSOOE4UZF', 'public', ?, 41, 1)`,
    [supersededCredId, userId, courseId],
  );

  // Pending credential
  execute(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, is_superseded)
     VALUES (?, ?, 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE', 'pending', 'CDPKSOOE4UZF', 'public', ?, 0)`,
    [pendingCredId, userId, courseId],
  );
});

afterAll(() => {
  execute('DELETE FROM nft_credentials WHERE user_id = ?', [userId]);
  execute('DELETE FROM courses WHERE id = ?', [courseId]);
  execute('DELETE FROM users WHERE id = ?', [userId]);
});

describe('GET /credentials/verify/:credentialId', () => {
  it('BADGE-1: returns credential for minted, non-superseded', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/verify/${mintedCredId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.credential.credentialId).toBe(mintedCredId);
    expect(body.data.credential.studentName).toBe('Alice Test');
    expect(body.data.credential.courseTitle).toBe('Blockchain 101');
    expect(body.data.credential.courseCode).toBe('BVC-101');
    expect(body.data.credential.txHash).toBe('abc123txhash');
    expect(body.data.credential.sorobanTokenId).toBe(42);
    expect(body.data.credential.issuer).toBe('SM Web Systems Blockchain Academy');
  });

  it('BADGE-2: returns 404 for non-existent ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/verify/${uuidv4()}`,
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('BADGE-3: returns 404 for superseded credential', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/verify/${supersededCredId}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('BADGE-4: returns 404 for pending credential', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/verify/${pendingCredId}`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /credentials/:credentialId/pdf', () => {
  it('BADGE-5: returns PDF for minted credential', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/${mintedCredId}/pdf`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('certificate-');
  });

  it('BADGE-6: returns 404 for non-existent credential', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/credentials/${uuidv4()}/pdf`,
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: 6 FAIL (routes not implemented yet)

- [ ] **Step 3: Create certificatePdfService.ts**

Create `LMS-Server/src/services/certificatePdfService.ts`:

```typescript
/**
 * Certificate PDF generation — Phase 23 C4.
 *
 * Generates PDF certificates for verified NFT credentials.
 * Reuses pdfkit patterns from invoiceService.ts.
 */
import PDFDocument from 'pdfkit';

export interface CertificateData {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  contractId: string;
  network: string;
  sorobanTokenId: number | null;
  issuedAt: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate a PDF certificate buffer for a verified NFT credential.
 */
export function generateCertificatePdf(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(24).font('Helvetica-Bold')
      .text('Certificate of Completion', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#666666')
      .text('SM Web Systems Blockchain Academy', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).text('https://lms.smwebsystems.com', { align: 'center' });
    doc.moveDown(2);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#c9a96e').lineWidth(2).stroke();
    doc.moveDown(2);

    // Body
    doc.fillColor('#000000').fontSize(12).font('Helvetica')
      .text('This certifies that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica-Bold')
      .text(data.studentName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica')
      .text('has successfully completed', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold')
      .text(data.courseTitle, { align: 'center' });
    if (data.courseCode) {
      doc.fontSize(10).font('Helvetica').fillColor('#666666')
        .text(`(${data.courseCode})`, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#333333')
      .text(`Completed on ${formatDate(data.issuedAt)}`, { align: 'center' });
    doc.moveDown(2);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#c9a96e').lineWidth(1).stroke();
    doc.moveDown(1.5);

    // Blockchain verification section
    doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold')
      .text('Blockchain Verification', { align: 'left' });
    doc.moveDown(0.5);

    const labelX = 50;
    const valueX = 200;

    const addRow = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666666')
        .text(label, labelX, y, { width: 140 });
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
        .text(value, valueX, y, { width: 340 });
      doc.moveDown(0.5);
    };

    if (data.txHash) {
      addRow('Transaction:', data.txHash);
      const network = data.network === 'testnet' ? 'testnet' : 'public';
      addRow('Explorer:', `https://stellar.expert/explorer/${network}/tx/${data.txHash}`);
    }
    addRow('Contract:', data.contractId);
    if (data.sorobanTokenId != null) {
      addRow('Token ID:', String(data.sorobanTokenId));
    }
    addRow('Network:', data.network === 'testnet' ? 'Stellar Testnet' : 'Stellar Mainnet');
    addRow('Wallet:', data.walletAddress);

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#999999')
      .text(`Verify at: https://lms.smwebsystems.com/verify/${data.credentialId}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.text(`Generated on ${new Date().toISOString().slice(0, 10)}. This is a blockchain-verified credential.`, {
      align: 'center',
    });

    doc.end();
  });
}
```

- [ ] **Step 4: Add verification + PDF routes to publicCredentials.ts**

Add to `LMS-Server/src/routes/publicCredentials.ts`, after the existing `/credentials/mine` route:

```typescript
// ─── GET /credentials/verify/:credentialId (public) ─────────────────────────
/**
 * @openapi
 * /credentials/verify/{credentialId}:
 *   get:
 *     tags: [Certificates]
 *     summary: Verify an NFT certificate (public)
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: The credential UUID to verify
 *     responses:
 *       '200':
 *         description: Verified credential with full metadata
 *       '404':
 *         description: Certificate not found or not yet issued
 */
router.get('/credentials/verify/:credentialId', (req: Request, res: Response): void => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string;
    network: string;
    created_at: string;
    soroban_token_id: number | null;
    course_id: string | null;
    course_title: string | null;
    course_code: string | null;
    student_name: string | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash, nc.contract_id,
            nc.network, nc.created_at, nc.soroban_token_id,
            nc.course_id, c.title AS course_title, c.course_code,
            u.name AS student_name
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Certificate not found or not yet issued' },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      credential: {
        credentialId: row.id,
        studentName: row.student_name ?? 'Student',
        courseTitle: row.course_title ?? 'Course',
        courseCode: row.course_code ?? '',
        walletAddress: row.wallet_address,
        txHash: row.tx_hash,
        contractId: row.contract_id,
        network: row.network,
        sorobanTokenId: row.soroban_token_id,
        issuedAt: row.created_at,
        issuer: 'SM Web Systems Blockchain Academy',
      },
    },
  });
});

// ─── GET /credentials/:credentialId/pdf (public) ────────────────────────────
/**
 * @openapi
 * /credentials/{credentialId}/pdf:
 *   get:
 *     tags: [Certificates]
 *     summary: Download certificate as PDF (public)
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: The credential UUID
 *     responses:
 *       '200':
 *         description: PDF certificate file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       '404':
 *         description: Certificate not found
 */
router.get('/credentials/:credentialId/pdf', async (req: Request, res: Response): Promise<void> => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string;
    network: string;
    created_at: string;
    soroban_token_id: number | null;
    course_title: string | null;
    course_code: string | null;
    student_name: string | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash, nc.contract_id,
            nc.network, nc.created_at, nc.soroban_token_id,
            c.title AS course_title, c.course_code,
            u.name AS student_name
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Certificate not found' },
    });
    return;
  }

  try {
    const { generateCertificatePdf } = await import('../services/certificatePdfService.js');
    const pdfBuffer = await generateCertificatePdf({
      credentialId: row.id,
      studentName: row.student_name ?? 'Student',
      courseTitle: row.course_title ?? 'Course',
      courseCode: row.course_code ?? '',
      walletAddress: row.wallet_address,
      txHash: row.tx_hash,
      contractId: row.contract_id,
      network: row.network,
      sorobanTokenId: row.soroban_token_id,
      issuedAt: row.created_at,
    });

    const shortId = credentialId.slice(0, 8);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${shortId}.pdf"`);
    res.send(pdfBuffer);
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Failed to generate PDF' },
    });
  }
});
```

Import `queryOne` is already imported at the top of publicCredentials.ts. No new imports needed for the route file — `generateCertificatePdf` is dynamically imported.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: 6 PASS

- [ ] **Step 6: Run full backend suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 631 passed

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/__tests__/nft-badges.test.ts \
        LMS-Server/src/services/certificatePdfService.ts \
        LMS-Server/src/routes/publicCredentials.ts
git commit -m "feat(certificates): add public verification + PDF download endpoints (Phase 23 C4)"
```

---

### Task 2: Frontend — NFTBadge Component + Tests (TDD)

**Files:**
- Create: `LMS-Frontend/src/components/NFTBadge.tsx`
- Create: `LMS-Frontend/src/__tests__/NFTBadge.test.tsx`
- Modify: `LMS-Frontend/src/components/dashboard/LmsCertificatesSection.tsx`

**Interfaces:**
- Consumes: `MyCredential` type from `../types/api`; lucide-react icons
- Produces: `<NFTBadge>` component with props: `credentialId, courseTitle, courseCode?, walletAddress, txHash, sorobanTokenId?, issuedAt, network?, isNewlyMinted?`

- [ ] **Step 1: Write 3 failing frontend tests for NFTBadge**

Create `LMS-Frontend/src/__tests__/NFTBadge.test.tsx`:

```tsx
/**
 * Phase 23 C4: NFTBadge component tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NFTBadge from '../components/NFTBadge';

const mockCredential = {
  credentialId: 'cred-1234-5678-abcd-efgh',
  courseTitle: 'Blockchain 101',
  courseCode: 'BVC-101',
  walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
  txHash: 'abc123txhash456def',
  sorobanTokenId: 42,
  issuedAt: '2026-08-07T12:00:00Z',
  network: 'public',
};

describe('NFTBadge', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('BADGE-FE-1: renders course title, date, and wallet', () => {
    render(<NFTBadge {...mockCredential} />);
    expect(screen.getByText('Blockchain 101')).toBeTruthy();
    expect(screen.getByText('BVC-101')).toBeTruthy();
    // Truncated wallet
    expect(screen.getByText(/GABC…BCDE/)).toBeTruthy();
    // Date
    expect(screen.getByText(/August 7, 2026/)).toBeTruthy();
  });

  it('BADGE-FE-2: shows Stellar explorer link when txHash present', () => {
    render(<NFTBadge {...mockCredential} />);
    const link = screen.getByRole('link', { name: /View on Stellar/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(
      'https://stellar.expert/explorer/public/tx/abc123txhash456def',
    );
  });

  it('BADGE-FE-3: share button copies verification URL', async () => {
    render(<NFTBadge {...mockCredential} />);
    const shareBtn = screen.getByRole('button', { name: /Share/i });
    fireEvent.click(shareBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/verify/cred-1234-5678-abcd-efgh'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: 3 FAIL (component doesn't exist yet)

- [ ] **Step 3: Create NFTBadge component**

Create `LMS-Frontend/src/components/NFTBadge.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Award, ExternalLink, Share2, Download } from 'lucide-react';

interface NFTBadgeProps {
  credentialId: string;
  courseTitle: string;
  courseCode?: string;
  walletAddress: string;
  txHash: string | null;
  sorobanTokenId?: number | null;
  issuedAt: string;
  network?: string;
  isNewlyMinted?: boolean;
}

const CONFETTI_COLORS = [
  '#c9a96e', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1', '#22c55e',
];

const NFTBadge: React.FC<NFTBadgeProps> = ({
  credentialId,
  courseTitle,
  courseCode,
  walletAddress,
  txHash,
  sorobanTokenId,
  issuedAt,
  network = 'public',
  isNewlyMinted = false,
}) => {
  const [showConfetti, setShowConfetti] = useState(isNewlyMinted);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  const handleShare = async () => {
    const url = `${window.location.origin}/verify/${credentialId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no-op, clipboard unavailable
    }
  };

  const explorerNetwork = network === 'testnet' ? 'testnet' : 'public';
  const formattedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const truncatedWallet = `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;
  const apiBase = (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE_URL || '/api/v1';

  return (
    <div className="relative rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/40 px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02] overflow-hidden">
      {/* Confetti animation */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          {CONFETTI_COLORS.map((color, i) => (
            <span
              key={i}
              className="absolute w-1.5 h-1.5 rounded-sm animate-confetti"
              style={{
                backgroundColor: color,
                left: `${8 + (i * 7.5)}%`,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-900 truncate">{courseTitle}</p>
              {courseCode && (
                <span className="text-xs text-neutral-500 font-mono">{courseCode}</span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                <Award className="h-3 w-3" aria-hidden />
                NFT Issued
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
              <span>{formattedDate}</span>
              <span className="font-mono">{truncatedWallet}</span>
              {sorobanTokenId != null && (
                <span>Token #{sorobanTokenId}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {txHash && (
              <a
                href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
              >
                View on Stellar
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
              aria-label="Share"
            >
              <Share2 className="h-3 w-3" aria-hidden />
              {copied ? 'Copied!' : 'Share'}
            </button>
            <a
              href={`${apiBase}/credentials/${credentialId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <Download className="h-3 w-3" aria-hidden />
              PDF
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NFTBadge;
```

- [ ] **Step 4: Add confetti keyframes to Tailwind CSS**

Add to `LMS-Frontend/src/index.css` (or the global CSS file) inside an `@layer utilities` block or as raw CSS:

```css
@keyframes confetti {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(300px) rotate(720deg); opacity: 0; }
}
.animate-confetti {
  animation: confetti 2.5s ease-out forwards;
}
```

- [ ] **Step 5: Run NFTBadge tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: 3 PASS

- [ ] **Step 6: Update LmsCertificatesSection to use NFTBadge**

Replace the inline card in `LMS-Frontend/src/components/dashboard/LmsCertificatesSection.tsx` with the `NFTBadge` component:

Replace lines 48-91 (the map body) with:

```tsx
{lmsCredentials!.map((cred) => (
  <NFTBadge
    key={cred.credentialId}
    credentialId={cred.credentialId}
    courseTitle={cred.courseTitle ?? cred.quizTitle ?? 'Certificate'}
    courseCode={cred.courseCode ?? undefined}
    walletAddress={cred.walletAddress}
    txHash={cred.txHash}
    issuedAt={cred.issuedAt}
    network="public"
  />
))}
```

Add import at top: `import NFTBadge from '../NFTBadge';`

Remove unused imports: `Award`, `ExternalLink` (if no longer used in this file).

- [ ] **Step 7: Run full frontend suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 138 passed (135 + 3 new)

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/NFTBadge.tsx \
        LMS-Frontend/src/__tests__/NFTBadge.test.tsx \
        LMS-Frontend/src/components/dashboard/LmsCertificatesSection.tsx \
        LMS-Frontend/src/index.css
git commit -m "feat(frontend): add NFTBadge component with metadata + animation (Phase 23 C4)"
```

---

### Task 3: Frontend — CertificateVerification Page + Test

**Files:**
- Create: `LMS-Frontend/src/pages/CertificateVerification.tsx`
- Modify: `LMS-Frontend/src/App.tsx`
- Modify: `LMS-Frontend/src/__tests__/NFTBadge.test.tsx` (add verification page test)

**Interfaces:**
- Consumes: `GET /api/v1/credentials/verify/:credentialId` from Task 1
- Produces: `/verify/:credentialId` public route

- [ ] **Step 1: Write failing test for CertificateVerification page**

Add to `LMS-Frontend/src/__tests__/NFTBadge.test.tsx`:

```tsx
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CertificateVerification from '../pages/CertificateVerification';

// Add at end of file:
describe('CertificateVerification', () => {
  it('BADGE-FE-4: renders verified credential data', async () => {
    // Mock fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          credential: {
            credentialId: 'cred-test-id',
            studentName: 'Alice Test',
            courseTitle: 'Blockchain 101',
            courseCode: 'BVC-101',
            walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
            txHash: 'txhash123',
            contractId: 'CDPKSOOE4UZF',
            network: 'public',
            sorobanTokenId: 42,
            issuedAt: '2026-08-07T12:00:00Z',
            issuer: 'SM Web Systems Blockchain Academy',
          },
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/verify/cred-test-id']}>
        <Routes>
          <Route path="/verify/:credentialId" element={<CertificateVerification />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for data to load
    expect(await screen.findByText('Blockchain 101')).toBeTruthy();
    expect(screen.getByText('Alice Test')).toBeTruthy();
    expect(screen.getByText(/Verified Certificate/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: BADGE-FE-4 FAIL (page doesn't exist)

- [ ] **Step 3: Create CertificateVerification page**

Create `LMS-Frontend/src/pages/CertificateVerification.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, ExternalLink, Download, AlertCircle, Loader2 } from 'lucide-react';

interface VerifiedCredential {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  contractId: string;
  network: string;
  sorobanTokenId: number | null;
  issuedAt: string;
  issuer: string;
}

const CertificateVerification: React.FC = () => {
  const { credentialId } = useParams<{ credentialId: string }>();
  const [credential, setCredential] = useState<VerifiedCredential | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const apiBase = (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE_URL || '/api/v1';

  useEffect(() => {
    if (!credentialId) return;
    setLoading(true);
    fetch(`${apiBase}/credentials/verify/${credentialId}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((body) => {
        setCredential(body.data.credential);
        setNotFound(false);
      })
      .catch(() => {
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [credentialId, apiBase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (notFound || !credential) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-neutral-900 mb-2">Certificate Not Found</h1>
          <p className="text-sm text-neutral-500">
            This certificate does not exist or has not been issued yet.
          </p>
        </div>
      </div>
    );
  }

  const explorerNetwork = credential.network === 'testnet' ? 'testnet' : 'public';
  const formattedDate = new Date(credential.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Verified header */}
        <div className="text-center mb-8">
          <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-neutral-900">Verified Certificate</h1>
          <p className="text-sm text-neutral-500 mt-1">
            This credential has been verified on the Stellar blockchain.
          </p>
        </div>

        {/* Certificate card */}
        <div className="rounded-2xl border border-violet-200 bg-white shadow-lg p-6 space-y-5">
          {/* Course */}
          <div className="text-center">
            <h2 className="text-lg font-bold text-neutral-900">{credential.courseTitle}</h2>
            {credential.courseCode && (
              <p className="text-sm text-neutral-500 font-mono">{credential.courseCode}</p>
            )}
          </div>

          {/* Student */}
          <div className="text-center">
            <p className="text-sm text-neutral-500">Awarded to</p>
            <p className="text-lg font-semibold text-neutral-900">{credential.studentName}</p>
          </div>

          {/* Date */}
          <div className="text-center">
            <p className="text-sm text-neutral-500">Completed on</p>
            <p className="text-sm font-medium text-neutral-700">{formattedDate}</p>
          </div>

          {/* Issuer */}
          <div className="text-center">
            <p className="text-xs text-neutral-400">{credential.issuer}</p>
          </div>

          {/* Divider */}
          <hr className="border-neutral-200" />

          {/* Blockchain details */}
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold text-neutral-700 text-xs uppercase tracking-wide">
              Blockchain Verification
            </h3>
            {credential.txHash && (
              <div className="flex justify-between items-start gap-2">
                <span className="text-neutral-500 shrink-0">Transaction</span>
                <a
                  href={`https://stellar.expert/explorer/${explorerNetwork}/tx/${credential.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline font-mono text-xs break-all text-right inline-flex items-center gap-1"
                >
                  {credential.txHash.slice(0, 12)}...{credential.txHash.slice(-4)}
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-500">Network</span>
              <span className="text-neutral-700">
                {credential.network === 'testnet' ? 'Stellar Testnet' : 'Stellar Mainnet'}
              </span>
            </div>
            {credential.sorobanTokenId != null && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Token ID</span>
                <span className="text-neutral-700 font-mono">#{credential.sorobanTokenId}</span>
              </div>
            )}
            <div className="flex justify-between items-start gap-2">
              <span className="text-neutral-500 shrink-0">Wallet</span>
              <span className="text-neutral-700 font-mono text-xs break-all text-right">
                {credential.walletAddress}
              </span>
            </div>
          </div>

          {/* Download PDF */}
          <div className="pt-2">
            <a
              href={`${apiBase}/credentials/${credential.credentialId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download Certificate PDF
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-400 mt-6">
          SM Web Systems Blockchain Academy
        </p>
      </div>
    </div>
  );
};

export default CertificateVerification;
```

- [ ] **Step 4: Add route to App.tsx**

In `LMS-Frontend/src/App.tsx`, add import at top:

```tsx
import CertificateVerification from './pages/CertificateVerification';
```

Add route before the catch-all `<Route path="*">`, after the SSO callback route:

```tsx
{/* Public certificate verification — no auth required */}
<Route path="/verify/:credentialId" element={<CertificateVerification />} />
```

- [ ] **Step 5: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: 4 PASS (3 NFTBadge + 1 CertificateVerification)

- [ ] **Step 6: Run full frontend suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 139 passed (135 + 4 new)

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/CertificateVerification.tsx \
        LMS-Frontend/src/App.tsx \
        LMS-Frontend/src/__tests__/NFTBadge.test.tsx
git commit -m "feat(frontend): add certificate verification page + route (Phase 23 C4)"
```

---

### Task 4: Verification Gates

**Files:**
- None created or modified (verification only)

- [ ] **Step 1: TypeScript check (backend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx tsc --noEmit 2>&1 | tail -5
```

Expected: No errors

- [ ] **Step 2: TypeScript check (frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx tsc --noEmit 2>&1 | tail -5
```

Expected: No errors

- [ ] **Step 3: Full backend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run 2>&1 | tail -5
```

Expected: 631 passed

- [ ] **Step 4: Full frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run 2>&1 | tail -5
```

Expected: 139 passed

- [ ] **Step 5: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npm run build 2>&1 | tail -10
```

Expected: Build succeeds with dist/ output

- [ ] **Step 6: E2E tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
npx playwright test 2>&1 | tail -10
```

Expected: 14 passed (existing E2E unchanged)

---

### Task 5: Merge + Tag + Closeout

**Files:**
- Create: `docs/superpowers/plans/2026-08-07-phase23-c4-closeout.md`

- [ ] **Step 1: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge feat/phase23-c4-nft-badges --no-ff -m "Phase 23 C4: NFT Certificate Badge Improvements"
```

- [ ] **Step 2: Tag**

```bash
git tag phase23-c4-complete-2026-08-07
```

- [ ] **Step 3: Write closeout document**

Create `docs/superpowers/plans/2026-08-07-phase23-c4-closeout.md` with:
- Summary of all changes
- Files changed count
- Tests added (6 BE + 4 FE)
- Final test counts (631 BE + 139 FE + 14 E2E)
- Phase 24 candidates

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-08-07-phase23-c4-closeout.md
git commit -m "docs: Phase 23 C4 closeout"
```
