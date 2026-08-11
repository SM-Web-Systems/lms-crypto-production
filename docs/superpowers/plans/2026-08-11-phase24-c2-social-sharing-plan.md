# Phase 24 C2: Social Media Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LinkedIn, Twitter, and Copy Link share buttons to the certificate verification page and NFTBadge component, plus static Open Graph meta tags for branded link previews.

**Architecture:** A single reusable `SocialShare` component renders three share actions (LinkedIn, Twitter, Copy Link). It integrates into two existing pages — CertificateVerification and NFTBadge. Static OG/Twitter Card meta tags are added to `index.html`. All changes are frontend-only; no backend modifications.

**Tech Stack:** React, TypeScript, lucide-react (icons), Tailwind CSS, vitest + @testing-library/react (tests)

## Global Constraints

- Node 22, TypeScript strict mode
- Frontend tests: `cd LMS-Frontend && npx vitest run`
- No new npm dependencies — lucide-react already provides Linkedin, Twitter, Link, Check icons
- Share URLs use `window.open()` with `encodeURIComponent()` — no external SDKs
- Build: `cd LMS-Frontend && npm run build` (Vite)
- Docker build: `docker compose build web` (required for production — injects `VITE_API_BASE_URL`)

---

### Task 0: Branch Setup + Baseline Verification

**Files:** None modified

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git pull
git checkout -b feat/phase24-c2-social-sharing
```

- [ ] **Step 2: Verify backend baseline**

```bash
cd LMS-Server && npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  633 passed`

- [ ] **Step 3: Verify frontend baseline**

```bash
cd ../LMS-Frontend && npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  141 passed`

- [ ] **Step 4: Tag baseline**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag pre-phase24-c2-2026-08-11
```

---

### Task 1: SocialShare Component + Tests (TDD)

**Files:**
- Create: `LMS-Frontend/src/components/SocialShare.tsx`
- Create: `LMS-Frontend/src/__tests__/components/SocialShare.test.tsx`

**Interfaces:**
- Consumes: `lucide-react` icons (Linkedin, Twitter, Link, Check)
- Produces: `<SocialShare url={string} title={string} compact?: boolean />` component

- [ ] **Step 1: Write 3 failing frontend tests**

Create `LMS-Frontend/src/__tests__/components/SocialShare.test.tsx`:

```tsx
/**
 * Phase 24 C2: SocialShare component tests.
 *
 * SHARE-FE-1: SocialShare renders LinkedIn and Twitter buttons
 * SHARE-FE-2: LinkedIn button opens share URL in new window
 * SHARE-FE-3: Copy Link button copies URL to clipboard
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SocialShare from '../../components/SocialShare';

describe('SocialShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('SHARE-FE-1: renders LinkedIn, Twitter, and Copy Link buttons', () => {
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);
    expect(screen.getByLabelText('Share on LinkedIn')).toBeTruthy();
    expect(screen.getByLabelText('Share on Twitter')).toBeTruthy();
    expect(screen.getByLabelText('Copy link')).toBeTruthy();
  });

  it('SHARE-FE-2: LinkedIn button opens share URL in new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);

    fireEvent.click(screen.getByLabelText('Share on LinkedIn'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('linkedin.com/sharing/share-offsite'),
      '_blank',
      expect.any(String),
    );
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('https://lms.smwebsystems.com/verify/abc123')),
      '_blank',
      expect.any(String),
    );
  });

  it('SHARE-FE-3: Copy Link button copies URL to clipboard', async () => {
    render(<SocialShare url="https://lms.smwebsystems.com/verify/abc123" title="Blockchain 101" />);

    fireEvent.click(screen.getByLabelText('Copy link'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://lms.smwebsystems.com/verify/abc123',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/components/SocialShare.test.tsx 2>&1 | tail -5
```

Expected: 3 FAILED (module not found)

- [ ] **Step 3: Create SocialShare component**

Create `LMS-Frontend/src/components/SocialShare.tsx`:

```tsx
import React, { useState } from 'react';
import { Linkedin, Twitter, Link, Check } from 'lucide-react';

interface SocialShareProps {
  url: string;
  title: string;
  compact?: boolean;
}

const SocialShare: React.FC<SocialShareProps> = ({ url, title, compact = false }) => {
  const [copied, setCopied] = useState(false);

  const shareOnLinkedIn = () => {
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  const shareOnTwitter = () => {
    const text = `I earned a blockchain-verified certificate: ${title}`;
    const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const btnClass = compact
    ? 'inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors'
    : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition-colors';

  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className={compact ? 'flex items-center gap-3' : 'flex items-center justify-center gap-3 pt-4'}>
      <button type="button" onClick={shareOnLinkedIn} className={btnClass} aria-label="Share on LinkedIn">
        <Linkedin className={iconSize} aria-hidden />
        {!compact && 'LinkedIn'}
      </button>
      <button type="button" onClick={shareOnTwitter} className={btnClass} aria-label="Share on Twitter">
        <Twitter className={iconSize} aria-hidden />
        {!compact && 'Twitter'}
      </button>
      <button type="button" onClick={copyLink} className={btnClass} aria-label="Copy link">
        {copied ? <Check className={iconSize} aria-hidden /> : <Link className={iconSize} aria-hidden />}
        {!compact && (copied ? 'Copied!' : 'Copy Link')}
        {compact && copied && <span className="text-xs">Copied!</span>}
      </button>
    </div>
  );
};

export default SocialShare;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/components/SocialShare.test.tsx 2>&1 | tail -5
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/SocialShare.tsx \
        LMS-Frontend/src/__tests__/components/SocialShare.test.tsx
git commit -m "feat: add SocialShare component with LinkedIn, Twitter, Copy Link (Phase 24 C2)"
```

---

### Task 2: Integrate SocialShare + OG Tags + Update NFTBadge

**Files:**
- Modify: `LMS-Frontend/index.html`
- Modify: `LMS-Frontend/src/pages/CertificateVerification.tsx`
- Modify: `LMS-Frontend/src/components/NFTBadge.tsx`
- Modify: `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx`

**Interfaces:**
- Consumes: `<SocialShare url={string} title={string} compact?: boolean />` from Task 1
- Produces: Share buttons on verification page + NFTBadge, OG tags in HTML

- [ ] **Step 1: Add Open Graph + Twitter Card meta tags to index.html**

In `LMS-Frontend/index.html`, after the existing `<title>` tag, add:

```html
    <meta name="description" content="Blockchain-verified certificates on the Stellar network. SM Web Systems Blockchain Academy." />
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

- [ ] **Step 2: Add SocialShare to CertificateVerification.tsx**

Add import at the top:

```tsx
import SocialShare from '../components/SocialShare';
```

After the QR code section (after the `{qrDataUrl && (...)}` block), before the closing `</div>` of the certificate card, add:

```tsx
          {/* Social Sharing */}
          <SocialShare
            url={`${window.location.origin}/verify/${credential.credentialId}`}
            title={credential.courseTitle}
          />
```

- [ ] **Step 3: Replace NFTBadge clipboard-only share with SocialShare**

In `LMS-Frontend/src/components/NFTBadge.tsx`:

Add import at the top:

```tsx
import SocialShare from './SocialShare';
```

Remove the `handleShare` function and the `copied` state variable.

Remove the old share button:
```tsx
<button type="button" onClick={handleShare} ...>
  <Share2 ... />
  {copied ? 'Copied!' : 'Share'}
</button>
```

Replace with:
```tsx
<SocialShare
  url={`${window.location.origin}/verify/${credentialId}`}
  title={courseTitle}
  compact
/>
```

Remove the `Share2` import from lucide-react (no longer used directly).

Remove the `copied` state: `const [copied, setCopied] = useState(false);`

Remove the `handleShare` function entirely.

- [ ] **Step 4: Update BADGE-FE-3 test**

In `LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx`, update the BADGE-FE-3 test to work with the new SocialShare component. The old test looked for a "Share" button; the new component has a "Copy link" button instead:

Replace the BADGE-FE-3 test body:

```tsx
  it('BADGE-FE-3: share Copy Link copies verification URL', () => {
    render(<NFTBadge {...mockCredential} />);
    const copyBtn = screen.getByLabelText('Copy link');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/verify/cred-1234-5678-abcd-efgh'),
    );
  });
```

- [ ] **Step 5: Run NFTBadge tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/components/NFTBadge.test.tsx 2>&1 | tail -5
```

Expected: 6 passed

- [ ] **Step 6: Run full frontend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  144 passed` (141 baseline + 3 new SocialShare tests)

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/index.html \
        LMS-Frontend/src/pages/CertificateVerification.tsx \
        LMS-Frontend/src/components/NFTBadge.tsx \
        LMS-Frontend/src/__tests__/components/NFTBadge.test.tsx
git commit -m "feat: integrate SocialShare into verification page and NFTBadge, add OG tags (Phase 24 C2)"
```

---

### Task 3: Verification Gates + Merge + Closeout

**Files:** None modified (unless review finds issues)

- [ ] **Step 1: TypeScript check (frontend)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Full frontend tests**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  144 passed`

- [ ] **Step 3: Backend tests (regression check)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  633 passed` (unchanged)

- [ ] **Step 4: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npm run build
```

Expected: Build succeeds

- [ ] **Step 5: Merge to main**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main
git merge feat/phase24-c2-social-sharing --no-ff -m "Phase 24 C2: Social Media Sharing (LinkedIn, Twitter, Copy Link)"
```

- [ ] **Step 6: Tag**

```bash
git tag phase24-c2-complete-2026-08-11
```

- [ ] **Step 7: Write closeout document**

Create `docs/superpowers/plans/2026-08-11-phase24-c2-closeout.md`

- [ ] **Step 8: Commit closeout**

```bash
git add docs/superpowers/plans/2026-08-11-phase24-c2-closeout.md
git commit -m "docs: Phase 24 C2 closeout"
```
