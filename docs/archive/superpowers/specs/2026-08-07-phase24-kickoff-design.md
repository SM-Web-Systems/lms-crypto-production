# Phase 24 C1: QR Code on Certificate PDF + Verification Page — Design Spec

**Date:** 2026-08-07
**Status:** Draft
**Phase:** 24 C1
**Baseline:** 770 tests (631 BE + 139 FE)

---

## 1. Problem Statement

Certificate PDFs and the verification page lack a QR code. Users who receive a printed or shared certificate cannot quickly scan to verify it on-chain. Adding a QR code that links to `/verify/:credentialId` closes this UX gap.

## 2. Goals

1. Embed a QR code in the certificate PDF that links to the public verification URL
2. Display a QR code on the CertificateVerification page for easy sharing/scanning
3. No new API endpoints — QR is generated inline

## 3. Non-Goals

- Social media sharing buttons (Phase 24 C2)
- Badge gallery page (Phase 24 C3)
- Certificate email notification (Phase 24 C4)
- QR code customization (colors, logo overlay)

## 4. Architecture

### 4.1 Dependencies

- **Backend:** `qrcode` (npm, MIT, pure JS, 10M+ weekly downloads) + `@types/qrcode`
- **Frontend:** `qrcode` (same package, browser-compatible) + `@types/qrcode`

### 4.2 Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/services/certificatePdfService.ts` | Generate QR PNG via `qrcode.toBuffer()`, embed with `doc.image()` in footer |
| `LMS-Frontend/src/pages/CertificateVerification.tsx` | Generate QR data URL via `qrcode.toDataURL()`, display as `<img>` |
| `LMS-Server/src/__tests__/nft-badges.test.ts` | Add BADGE-7, BADGE-8 |
| `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx` | Add BADGE-FE-5, BADGE-FE-6 |

### 4.3 No New Files

QR generation is added inline to existing services/components.

## 5. Detailed Design

### 5.1 PDF QR Code (Backend)

In `certificatePdfService.ts`, after the blockchain verification section and before the footer:

```typescript
import QRCode from 'qrcode';

// Generate QR code PNG buffer
const verifyUrl = `https://lms.smwebsystems.com/verify/${data.credentialId}`;
const qrBuffer = await QRCode.toBuffer(verifyUrl, {
  width: 120,
  margin: 1,
  errorCorrectionLevel: 'M',
});

// Embed centered in PDF
const qrX = (595.28 - 120) / 2; // A4 width = 595.28pt
doc.image(qrBuffer, qrX, doc.y, { width: 120, height: 120 });
doc.moveDown(8); // Skip past QR image
doc.fontSize(7).fillColor('#999999')
  .text('Scan to verify', { align: 'center' });
```

Position: Between the blockchain details and the footer text. Centered, 120x120pt.

### 5.2 Verification Page QR Code (Frontend)

In `CertificateVerification.tsx`, after the "Download Certificate PDF" button:

```tsx
import QRCode from 'qrcode';

// In component, after credential is loaded:
const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

useEffect(() => {
  if (!credential) return;
  const url = `${window.location.origin}/verify/${credential.credentialId}`;
  QRCode.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
    .then(setQrDataUrl)
    .catch(() => {}); // Non-critical, don't break page
}, [credential]);

// In JSX, after the PDF download button:
{qrDataUrl && (
  <div className="text-center pt-4">
    <img src={qrDataUrl} alt="QR code" className="mx-auto" width={160} height={160} />
    <p className="text-xs text-neutral-400 mt-1">Scan to verify this certificate</p>
  </div>
)}
```

### 5.3 QR Code Content

The QR encodes: `https://lms.smwebsystems.com/verify/{credentialId}`

This is the same URL already used by the Share button in NFTBadge. When scanned, it opens the CertificateVerification page directly.

## 6. Security

- QR contains only the public verification URL (already accessible without auth)
- No PII or secrets in the QR payload
- Credential IDs are UUIDs (122 bits entropy) — not guessable

## 7. Test Plan

### Backend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| BADGE-7 | PDF for minted credential contains embedded image data | PDF buffer size > 2000 bytes |
| BADGE-8 | Verification endpoint still returns 200 + correct metadata after QR changes | 200 + credential fields |

### Frontend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| BADGE-FE-5 | CertificateVerification renders QR code image | img[alt="QR code"] in DOM |
| BADGE-FE-6 | QR code image has data URL src | src starts with "data:image" |

### Target counts:
- Backend: 631 → 633
- Frontend: 139 → 141
- E2E: unchanged

## 8. Rollback

- Revert the merge commit or `git reset --hard pre-phase24-c1-2026-08-07`
- Remove `qrcode` + `@types/qrcode` from both package.json files
- No schema changes — clean rollback
