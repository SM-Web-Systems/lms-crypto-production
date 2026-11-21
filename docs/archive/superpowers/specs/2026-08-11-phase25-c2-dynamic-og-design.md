# Phase 25 C2: Dynamic OG Tags — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 25 C2
**Baseline:** 792 tests (641 BE + 151 FE)

---

## 1. Problem Statement

When a certificate verification link (`/verify/:credentialId`) is shared on LinkedIn, Twitter, or WhatsApp, all certificates show identical generic previews ("Blockchain-Verified Certificate") because the OG meta tags in `index.html` are static. Students sharing their achievements get no personalized social preview — no course name, no student name, no distinct branding per certificate.

## 2. Goals

1. Serve dynamic OG tags for `/verify/:credentialId` pages (og:title, og:description, og:url)
2. Social previews show course name and student name (e.g., "Alice's Blockchain 101 Certificate")
3. Express serves a standalone HTML verification page with dynamic OG tags and inline-styled certificate display
4. Host nginx routes `/verify/` to Express so crawlers get the dynamic tags on first request

## 3. Non-Goals

- Dynamic og:image generation (platform logo is sufficient; server-side image rendering is high effort)
- Modifying CertificateVerification.tsx (SPA route still works for in-app navigation)
- SSR or pre-rendering the full SPA
- Shared Docker volumes between api and web containers

## 4. Architecture

### 4.1 Request Flow

```
Social crawler / browser hits /verify/abc-123
  → Host nginx (location ~ ^/verify/)
    → lms-api:3001 (Express)
      → GET /verify/:credentialId route
        → Query credential from DB
        → Render HTML with dynamic OG tags + certificate display
        → Return HTML response
```

For in-app navigation (user clicks verify link inside the SPA), React Router handles it client-side. Express is never hit.

### 4.2 New Files

| File | Purpose |
|------|---------|
| `LMS-Server/src/routes/ogPages.ts` | Express route serving HTML with dynamic OG tags |
| `LMS-Server/src/__tests__/og-pages.test.ts` | 4 BE tests |

### 4.3 Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/app.ts` | Register ogPages route |

### 4.4 Infrastructure Change (Deploy Step)

Host nginx config (`/home/webadmin/web-stack/nginx/conf/default.conf`): Add `location ~ ^/verify/` block before the catch-all `location /`, routing to `lms-api:3001`.

### 4.5 No Frontend Changes

The SPA CertificateVerification.tsx is unchanged. It continues to work for in-app navigation via React Router.

## 5. Detailed Design

### 5.1 OG Tags

For a credential with student "Alice" and course "Blockchain 101":

```html
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SM Web Systems Blockchain Academy" />
<meta property="og:title" content="Alice's Blockchain 101 Certificate" />
<meta property="og:description" content="Blockchain-verified NFT certificate issued by SM Web Systems Blockchain Academy. Verified on the Stellar network." />
<meta property="og:url" content="https://lms.smwebsystems.com/verify/abc-123" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Alice's Blockchain 101 Certificate" />
<meta name="twitter:description" content="Blockchain-verified NFT certificate on the Stellar network." />
```

### 5.2 Express Route

```typescript
router.get('/verify/:credentialId', (req, res) => {
  const { credentialId } = req.params;
  const credential = queryOne<CredentialRow>(
    `SELECT nc.id, u.name AS student_name, c.title AS course_title,
            c.course_code, nc.wallet_address, nc.tx_hash,
            nc.contract_id, nc.network, nc.created_at
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId]
  );

  if (!credential) {
    res.status(404).send(render404Page());
    return;
  }

  res.send(renderOgPage(credential, credentialId));
});
```

### 5.3 HTML Template

The Express route serves a standalone HTML page with:
- Dynamic OG meta tags in `<head>`
- Inline CSS (no external dependencies)
- Certificate display: student name, course title, course code, issue date, wallet address (truncated), network
- Verification status badge ("Blockchain Verified")
- Link to blockchain explorer (stellar.expert)
- Platform branding (SM Web Systems Blockchain Academy)

### 5.4 nginx Location Block

```nginx
# Dynamic OG tags for certificate verification pages (Phase 25 C2)
location ~ ^/verify/ {
    resolver 127.0.0.11 valid=30s;
    set $upstream http://lms-api:3001;
    proxy_pass $upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Must be placed BEFORE the catch-all `location /` block.

### 5.5 404 Page

For non-existent credentials, serve a minimal 404 HTML page with generic OG tags and a "Certificate not found" message.

## 6. Security

- Credential data is already public (same query as the existing `GET /api/v1/credentials/verify/:credentialId` endpoint)
- Student name and course title are public information on the verification page
- HTML output is escaped to prevent XSS (no user input in template except DB-sourced values, all escaped)
- No authentication required (public verification page)

## 7. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| OG-BE-1 | GET /verify/:credentialId returns HTML with og:title containing course name | `og:title` contains course title |
| OG-BE-2 | GET /verify/:credentialId returns HTML with og:title containing student name | `og:title` contains student name |
| OG-BE-3 | GET /verify/:credentialId returns correct Content-Type | `text/html` |
| OG-BE-4 | GET /verify/nonexistent returns 404 | Status 404 |

### Frontend (0 new tests — no frontend changes)

### Target counts:
- Backend: 641 → 645 (+4)
- Frontend: 151 → 151 (unchanged)
- Total: 792 → 796 (+4)

Note: deviation from expected +2 BE +2 FE split. This feature is purely backend (Express route + HTML rendering). No frontend code changes.

## 8. Deploy Steps

After merge:
1. `docker compose build api && docker compose up -d --no-deps api` — rebuild Express with new route
2. Edit `/home/webadmin/web-stack/nginx/conf/default.conf` — add `/verify/` location block
3. `docker exec nginx_server nginx -s reload` — activate nginx change

## 9. Rollback

- Revert Express code: `git reset --hard pre-phase25-c2-2026-08-11`
- Remove nginx `/verify/` location block
- Reload nginx: `docker exec nginx_server nginx -s reload`
- No schema changes — clean rollback
