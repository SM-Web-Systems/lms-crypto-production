# Phase 24 C1: QR Code on Certificate PDF + Verification Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QR codes to the certificate PDF and the public verification page, linking to `/verify/:credentialId`.

**Architecture:** Install `qrcode` npm package in both backend and frontend. Backend generates QR PNG buffer and embeds in PDF via pdfkit's `doc.image()`. Frontend generates QR data URL and renders as `<img>`. No new API endpoints — QR is inline in existing flows.

**Tech Stack:** qrcode (npm), pdfkit (backend), React (frontend), vitest + @testing-library/react (tests)

## Global Constraints

- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- pdfkit already installed (used by certificatePdfService.ts)
- Backend tests: `cd LMS-Server && npx vitest run`
- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- The PDF endpoint handler is already `async` (uses `await generateCertificatePdf()`) — safe for `await QRCode.toBuffer()`

---

### Task 0: Branch Setup + Baseline + Install Dependencies

**Files:**
- Modify: `LMS-Server/package.json` (add `qrcode`, `@types/qrcode`)
- Modify: `LMS-Frontend/package.json` (add `qrcode`, `@types/qrcode`)

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git pull
git checkout -b feat/phase24-c1-qr-code
```

- [ ] **Step 2: Verify backend baseline**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -5
```

Expected: `Tests  631 passed`

- [ ] **Step 3: Verify frontend baseline**

```bash
cd ../LMS-Frontend && npx vitest run 2>&1 | tail -5
```

Expected: `Tests  139 passed`

- [ ] **Step 4: Install qrcode in backend**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npm install qrcode @types/qrcode
```

- [ ] **Step 5: Install qrcode in frontend**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npm install qrcode @types/qrcode
```

- [ ] **Step 6: Tag baseline**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag pre-phase24-c1-2026-08-07
```

- [ ] **Step 7: Commit dependency additions**

```bash
git add LMS-Server/package.json LMS-Server/package-lock.json \
        LMS-Frontend/package.json LMS-Frontend/package-lock.json
git commit -m "chore: add qrcode dependency for Phase 24 C1"
```

---

### Task 1: Backend — QR Code in Certificate PDF (TDD)

**Files:**
- Modify: `LMS-Server/src/services/certificatePdfService.ts`
- Modify: `LMS-Server/src/__tests__/nft-badges.test.ts`

**Interfaces:**
- Consumes: `qrcode.toBuffer(url, options)` → `Promise<Buffer>`
- Produces: Updated `generateCertificatePdf()` that embeds a QR code PNG in the PDF

- [ ] **Step 1: Write 2 failing backend tests**

Append to `LMS-Server/src/__tests__/nft-badges.test.ts`, inside the existing `describe('GET /credentials/:credentialId/pdf')` block, after the BADGE-6 test:

```typescript
  it('BADGE-7: PDF contains QR code image data (buffer is large enough)', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/${mintedCredId}/pdf`)
      .expect(200);

    // A PDF with an embedded QR PNG should be significantly larger than 2KB
    expect(res.body.length).toBeGreaterThan(2000);
  });

  it('BADGE-8: PDF still returns correct content-type after QR addition', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/${mintedCredId}/pdf`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('certificate-');
  });
```

- [ ] **Step 2: Run tests to verify they pass (these are additive assertions on existing behavior)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: 8 tests total. BADGE-7 may pass or fail depending on current PDF size. BADGE-8 should pass (existing behavior). If BADGE-7 already passes, the QR addition will still increase size further — the test documents the expectation.

- [ ] **Step 3: Add QR code generation to certificatePdfService.ts**

At the top of `LMS-Server/src/services/certificatePdfService.ts`, add import:

```typescript
import QRCode from 'qrcode';
```

In the `generateCertificatePdf()` function, replace the footer section (lines 111-122) with:

```typescript
    // QR Code
    const verifyUrl = `https://lms.smwebsystems.com/verify/${data.credentialId}`;
    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    doc.moveDown(1);
    const qrX = (595.28 - 120) / 2; // Center on A4 page
    doc.image(qrBuffer, qrX, doc.y, { width: 120, height: 120 });
    doc.y += 125; // Move past QR image
    doc.fontSize(7).fillColor('#999999')
      .text('Scan to verify', { align: 'center' });

    // Footer
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#999999')
      .text(`Verify at: ${verifyUrl}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.text(`Generated on ${new Date().toISOString().slice(0, 10)}. This is a blockchain-verified credential.`, {
      align: 'center',
    });

    doc.end();
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

Expected: 8 passed

- [ ] **Step 5: Run full backend suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 633 passed

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/services/certificatePdfService.ts \
        LMS-Server/src/__tests__/nft-badges.test.ts
git commit -m "feat(certificates): embed QR code in certificate PDF (Phase 24 C1)"
```

---

### Task 2: Frontend — QR Code on Verification Page (TDD)

**Files:**
- Modify: `LMS-Frontend/src/pages/CertificateVerification.tsx`
- Modify: `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx`

**Interfaces:**
- Consumes: `qrcode.toDataURL(url, options)` → `Promise<string>`
- Produces: QR code `<img>` rendered on the CertificateVerification page

- [ ] **Step 1: Write 2 failing frontend tests**

Append to `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx`, inside the existing `describe('CertificateVerification')` block, after the BADGE-FE-4 test:

```tsx
  it('BADGE-FE-5: renders QR code image', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            credential: {
              credentialId: 'cred-qr-test',
              studentName: 'QR Student',
              courseTitle: 'QR Course',
              courseCode: 'QR-101',
              walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
              txHash: 'qrhash123',
              contractId: 'CDPKSOOE4UZF',
              network: 'public',
              sorobanTokenId: 99,
              issuedAt: '2026-08-07T12:00:00Z',
              issuer: 'SM Web Systems Blockchain Academy',
            },
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/verify/cred-qr-test']}>
        <Routes>
          <Route path="/verify/:credentialId" element={<CertificateVerification />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for credential to load
    await screen.findByText('QR Course');
    // QR code image should appear (qrcode.toDataURL is async, may need waitFor)
    const qrImg = await screen.findByAltText('QR code');
    expect(qrImg).toBeTruthy();
  });

  it('BADGE-FE-6: QR code image has data URL src', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            credential: {
              credentialId: 'cred-qr-test2',
              studentName: 'QR Student 2',
              courseTitle: 'QR Course 2',
              courseCode: 'QR-102',
              walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
              txHash: 'qrhash456',
              contractId: 'CDPKSOOE4UZF',
              network: 'public',
              sorobanTokenId: 100,
              issuedAt: '2026-08-07T12:00:00Z',
              issuer: 'SM Web Systems Blockchain Academy',
            },
          },
        }),
    });

    render(
      <MemoryRouter initialEntries={['/verify/cred-qr-test2']}>
        <Routes>
          <Route path="/verify/:credentialId" element={<CertificateVerification />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('QR Course 2');
    const qrImg = await screen.findByAltText('QR code');
    expect(qrImg.getAttribute('src')).toMatch(/^data:image/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/components/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: BADGE-FE-5, BADGE-FE-6 FAIL (no QR image in DOM yet)

- [ ] **Step 3: Add QR code to CertificateVerification.tsx**

At the top, add import:

```tsx
import QRCode from 'qrcode';
```

Inside the component, after the existing `useState` hooks, add:

```tsx
const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
```

Add a second `useEffect` after the existing fetch effect:

```tsx
useEffect(() => {
  if (!credential) return;
  const url = `${window.location.origin}/verify/${credential.credentialId}`;
  QRCode.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
    .then(setQrDataUrl)
    .catch(() => {});
}, [credential]);
```

In the JSX, after the "Download Certificate PDF" `<a>` closing `</div>` (line 161) and before the closing `</div>` of the certificate card (line 162), add:

```tsx
          {/* QR Code */}
          {qrDataUrl && (
            <div className="text-center pt-4">
              <img src={qrDataUrl} alt="QR code" className="mx-auto" width={160} height={160} />
              <p className="text-xs text-neutral-400 mt-1">Scan to verify this certificate</p>
            </div>
          )}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/components/NFTBadge.test.tsx 2>&1 | tail -10
```

Expected: 6 passed (4 existing + 2 new)

- [ ] **Step 5: Run full frontend suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: 141 passed

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/CertificateVerification.tsx \
        LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx
git commit -m "feat(frontend): add QR code to certificate verification page (Phase 24 C1)"
```

---

### Task 3: Verification Gates

**Files:** None modified

- [ ] **Step 1: TypeScript check (backend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: TypeScript check (frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Full backend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 633 passed

- [ ] **Step 4: Full frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 141 passed

- [ ] **Step 5: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npm run build
```

Expected: Build succeeds

---

### Task 4: Merge + Tag + Closeout

- [ ] **Step 1: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge feat/phase24-c1-qr-code --no-ff -m "Phase 24 C1: QR Code on Certificate PDF + Verification Page"
```

- [ ] **Step 2: Tag**

```bash
git tag phase24-c1-complete-2026-08-07
```

- [ ] **Step 3: Write closeout document**

Create `docs/superpowers/plans/2026-08-07-phase24-c1-closeout.md`

- [ ] **Step 4: Commit closeout**

```bash
git add docs/superpowers/plans/2026-08-07-phase24-c1-closeout.md
git commit -m "docs: Phase 24 C1 closeout"
```
