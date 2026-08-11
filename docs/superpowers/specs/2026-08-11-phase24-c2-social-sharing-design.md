# Phase 24 C2: Social Media Sharing — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 24 C2
**Baseline:** 774 tests (633 BE + 141 FE)

---

## 1. Problem Statement

Certificate holders cannot share their blockchain-verified credentials on social media. The verification page and NFTBadge component lack LinkedIn/Twitter share buttons, and the site has no Open Graph meta tags for branded link previews.

## 2. Goals

1. Add LinkedIn and Twitter share buttons to the CertificateVerification page
2. Add LinkedIn and Twitter share buttons to the NFTBadge component
3. Add static Open Graph + Twitter Card meta tags to `index.html` for branded previews
4. Enhance the existing NFTBadge "Share" button with a dropdown menu (LinkedIn, Twitter, Copy Link)

## 3. Non-Goals

- Dynamic per-certificate OG tags (requires SSR/prerender — future enhancement)
- Facebook/Instagram sharing (low developer audience overlap)
- Embedded social SDKs (privacy concerns, bundle size)
- Share count tracking or analytics
- OG image generation (certificate screenshot service)

## 4. Architecture

### 4.1 Approach: URL-Based Share Dialogs

Social sharing uses platform URL schemes — no SDK required:

- **LinkedIn:** `https://www.linkedin.com/sharing/share-offsite/?url={encodedUrl}`
- **Twitter:** `https://twitter.com/intent/tweet?url={encodedUrl}&text={encodedText}`

Both open in a new window/tab via `window.open()`.

### 4.2 New Files

| File | Purpose |
|------|---------|
| `LMS-Frontend/src/components/SocialShare.tsx` | Reusable share button group (LinkedIn, Twitter, Copy Link) |
| `LMS-Frontend/src/__tests__/components/SocialShare.test.tsx` | Frontend tests for SocialShare component |

### 4.3 Modified Files

| File | Change |
|------|--------|
| `LMS-Frontend/index.html` | Add static OG + Twitter Card meta tags |
| `LMS-Frontend/src/pages/CertificateVerification.tsx` | Import and render SocialShare |
| `LMS-Frontend/src/components/NFTBadge.tsx` | Replace clipboard-only share with SocialShare dropdown |
| `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx` | Update BADGE-FE-3 (share button now opens menu), add new tests |

### 4.4 No Backend Changes

All sharing is client-side. No new API endpoints needed.

## 5. Detailed Design

### 5.1 SocialShare Component

```tsx
interface SocialShareProps {
  url: string;          // The URL to share (e.g., /verify/:credentialId)
  title: string;        // Certificate title for share text
  compact?: boolean;    // true = icon-only buttons (for NFTBadge), false = labeled buttons (for verification page)
}
```

**Renders:**
- LinkedIn button (Linkedin icon from lucide-react)
- Twitter/X button (Twitter icon from lucide-react)
- Copy Link button (Link icon + "Copied!" feedback)

**Share URLs:**
- LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
- Twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`I earned a blockchain-verified certificate: ${title}`)}`

**Behavior:**
- LinkedIn/Twitter buttons call `window.open(shareUrl, '_blank', 'width=600,height=400')`
- Copy Link calls `navigator.clipboard.writeText(url)` with "Copied!" feedback (2s timeout)
- All buttons are `type="button"` with accessible `aria-label`

### 5.2 CertificateVerification Integration

After the QR code section, before the closing `</div>` of the certificate card:

```tsx
<SocialShare
  url={`${window.location.origin}/verify/${credential.credentialId}`}
  title={credential.courseTitle}
/>
```

### 5.3 NFTBadge Integration

Replace the existing `handleShare` clipboard-only button with:

```tsx
<SocialShare
  url={`${window.location.origin}/verify/${credentialId}`}
  title={courseTitle}
  compact
/>
```

This replaces the existing Share2 icon button. The Copy Link functionality is preserved within SocialShare.

### 5.4 Static Open Graph Tags (index.html)

```html
<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SM Web Systems Blockchain Academy" />
<meta property="og:title" content="Blockchain-Verified Certificate" />
<meta property="og:description" content="Verify this blockchain credential on the Stellar network." />
<meta property="og:url" content="https://lms.smwebsystems.com" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Blockchain-Verified Certificate" />
<meta name="twitter:description" content="Verify this blockchain credential on the Stellar network." />
```

These are generic but provide a branded preview when any page is shared. No `og:image` — the favicon will be used by default.

## 6. Security

- Share URLs use `encodeURIComponent()` to prevent injection
- `window.open()` with `noopener` is implicit in modern browsers for `_blank`
- No external SDKs loaded — zero third-party JavaScript
- Copy link uses the existing clipboard pattern (try/catch for permission denial)

## 7. Test Plan

### Frontend (3 new tests)

| ID | Test | Expected |
|----|------|----------|
| SHARE-FE-1 | SocialShare renders LinkedIn and Twitter buttons | Both buttons in DOM with correct aria-labels |
| SHARE-FE-2 | LinkedIn button opens share URL in new window | `window.open` called with LinkedIn sharing URL |
| SHARE-FE-3 | Copy Link button copies URL to clipboard | `navigator.clipboard.writeText` called with verification URL |

### Backend (0 new tests — no backend changes)

### Modified test

| ID | Test | Change |
|----|------|--------|
| BADGE-FE-3 | NFTBadge share button | Update to test new SocialShare integration (Copy Link within SocialShare) |

### Target counts:
- Backend: 633 → 633 (unchanged)
- Frontend: 141 → 144 (+3)
- E2E: unchanged

## 8. Rollback

- Revert the merge commit or `git reset --hard pre-phase24-c2-2026-08-11`
- No dependencies added — no package changes needed
- No schema changes — clean rollback
