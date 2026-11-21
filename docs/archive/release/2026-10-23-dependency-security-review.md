# API and web dependency security review

Date: 2026-10-23. Based on `9697390` / draft #80, on separate branch `codex/api-web-dependency-security`. This is a dependency follow-up to AUTH-13, not a production verification or deployment record. Wallet, mobile, database schema and application login/registration flows are unchanged.

Status: implementation and local validation complete; draft review only. API dependency/test changes are commit `7a56dca`; web dependency/browser-target changes are commit `08eb640`; CI gates and this handoff are a separate follow-up commit. No merge, deployment, server access, real SMTP/provider calls or issue closure was performed.

## Scope and advisory evidence

`npm audit --json` was refreshed against the npm registry before changes. Counts are vulnerable package entries (including parent packages affected through dependencies), not separate exploits or proof that an application path is exploitable.

| Graph | Before | After |
| --- | --- | --- |
| API, including development dependencies | 22: 2 critical, 11 high, 9 moderate | 0; audit exit 0 |
| Web, including development dependencies | 19: 1 critical, 12 high, 5 moderate, 1 low | 7: 5 high, 2 moderate; full high-threshold audit exit 1 |
| API/web production dependencies | No separate production-only baseline recorded | 0 in each; both production audit exits 0 |

The raw local npm reports are ignored `.auth13-dependency-*.json` files. The table and package dispositions below preserve the review evidence without publishing local runtime files.

## Runtime changes and reachability

| Area | Change | Application path and assessment |
| --- | --- | --- |
| HTML sanitization | API DOMPurify 3.4.13 → 3.4.17; web 3.4.14 → 3.4.17 | API course Markdown import and web Markdown, flashcards, embedded content and template previews sanitize content. Current string/allowlist use does not enable every affected DOM-output/hook configuration, but the installed affected versions are removed. [Upstream release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17). |
| Proxy trust | proxy-addr 2.0.7 → 2.0.8 via Express 4.22.3 | Express uses this for request IPs and rate limits. The advisory requires malformed IPv4-mapped IPv6 trust subnets; LMS currently uses numeric one-hop trust when enabled, so this is a conditional upstream vulnerability, not a reproduced current bypass. Regression covers the actual Express-resolved implementation. [Advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). |
| Request parsing/uploads | Express 4 retained; body-parser 1.20.9, qs 6.16.1, Multer 2.5.0 | Request/query and disk-upload parsers handle client input. Fixes stay within the existing Express/Multer major lines. |
| Course ZIP import | adm-zip 0.6.0 → 0.6.1 | Authenticated course import reads archive entries and calls synchronous `getData()`. Memory/decompression issues matter; generic extraction/symlink findings do not imply LMS calls `extractAllTo()`. Existing import/extension/security checks remain required. [Upstream](https://github.com/cthackers/adm-zip). |
| Stellar HTTP client | Stellar SDK 16.2.0 → 16.4.1; Axios 1.18.0 → 1.20.0 | SDK 16.2 pins vulnerable Axios exactly, so updating the transitive package alone cannot resolve it. Use the patched version 16 LTS parent instead of overriding its pin or migrating to SDK 17. Existing SDK surface, mint and Wallet tests must pass; no real chain/provider calls are part of acceptance. |
| HTTP redirects | follow-redirects 1.16.0 → 1.16.1 in both graphs | API SDK's Node HTTP path can use this; web browser Axios does not use its Node redirect adapter. Patch both locked graphs. [Advisory](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8). |
| Email | Nodemailer 9.0.5 → 10.2.1 | Address parsing and SMTP transport are used by email service/outbox worker. This is a deliberate major upgrade; Node 20+ is required, compatible with this repository's Node 22 CI/Docker. Real in-memory JSON message composition and existing email/outbox tests are required. SMTP receipt/TLS interoperability remain owner acceptance. [Breaking changes](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md#1000-2026-09-03). |
| Other transitive patches | ip-address 10.7.4, fast-uri 3.1.9, js-yaml 4.3.2, brace-expansion 5.0.12, source-map-js 1.2.2, undici 7.30.1 | Rate-limiter, OpenAPI/schema, archive and server DOM dependency paths. Patch within compatible dependency ranges; do not infer arbitrary SSRF exposure from package presence alone. |

`isomorphic-dompurify` is deliberately pinned at 3.19.0, with its DOMPurify/undici dependencies patched in the lock. Later wrapper versions increase Node requirements and move jsdom; that migration is unnecessary for these fixes. Keep locked installs (`npm ci`). Reassess the pin with future Node/sanitizer updates; do not retain it indefinitely without review.

## Development tools and remaining findings

Vitest stays on version 4, patched to 4.1.12 in both apps. Its API-side Vite dependency is patched to 8.3.5 within its supported range. Other affected development transitives (fast-copy, smol-toml, Babel, browser mapping, brace expansion, YAML, nanoid and source maps) are refreshed selectively.

Web Vite 5.4.21 has no patched release in that line for the reported findings. Upgrade the web build to Vite 7.3.7, retaining compatible React plugin 4.7.0 and Rollup configuration. Explicit browser syntax targets preserve the old Vite 5 defaults instead of silently raising browser requirements. Review used the [Vite 6 migration guide](https://v6.vite.dev/guide/migration), [Vite 7 guide](https://v7.vite.dev/guide/migration) and [Vite 5 target constants](https://github.com/vitejs/vite/blob/v5.4.21/packages/vite/src/node/constants.ts). Node 22.18.0 meets these tools' requirements. Physical older-browser/device behavior is not established by a compilation target.

The remaining web findings are in Tailwind 3's build-only dependency chain: `braces`, `chokidar`, `fast-glob`, `micromatch`, `postcss-nested`, `postcss-selector-parser` and the affected parent `tailwindcss`. [`braces` has no patched release](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); npm proposes Tailwind 4.3.3. The [selector-parser fix starts at 7.1.6](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), requiring a major dependency transition in this chain. Do not force transitive major overrides or run `npm audit fix --force` to hide these findings.

Current reachability review: `tailwind.config.js` scans repository `index.html` and `src/**/*.{js,ts,jsx,tsx}`; `postcss.config.js` runs Tailwind/autoprefixer at build time. No request-time CSS or arbitrary user-supplied glob processing was identified in this web configuration. The selector-parser advisory specifically distinguishes trusted build sources from request-time untrusted selectors. This narrows exposure but does not remove the packages or close the findings.

Follow-up acceptance for Tailwind 4: migrate the PostCSS/CSS configuration explicitly, compare generated utilities and responsive layouts, verify form/focus/dark-mode states and sponsor/admin/student views, and rerun build, size, browser and advisory checks. Treat repository content/configuration as trusted build input; do not expose development servers to untrusted traffic or process arbitrary third-party build configuration. These findings remain open, not accepted as resolved by a clean runtime audit.

CI now blocks on the full API high/critical audit, the web production high/critical audit, and the complete web graph's critical audit. The complete web audit prints the outstanding high/moderate development findings; that threshold remains open while the Tailwind migration is outstanding. All audit steps are blocking at their stated thresholds, including registry/audit errors. Required-check enforcement at repository settings level still needs maintainer verification; editing workflow steps does not establish branch protection.

## Existing dependency PR reconciliation

No existing PR is merged, closed, rebased or commented on by this work.

| Existing PR | Disposition |
| --- | --- |
| #49 DOMPurify/types | Its proposed 3.4.15 remains affected by newer advisories; this branch uses 3.4.17. Maintainer should reconcile the overlapping PR after this change is reviewed. |
| #48 isomorphic-dompurify 4 | Separate Node/jsdom major migration; current wrapper pin plus patched transitives addresses this scope. |
| #43 Vitest 5 | Separate major migration; security patch applied on 4.1.12. |
| #50 express-rate-limit / #45 cors | Optional parent/package refreshes remain separate; underlying affected IP parser is patched here. |
| #52 Supertest types, #51 React hooks ESLint, #46 TypeScript 7, #42 size-limit 13 | Separate tooling upgrades; no blanket adoption of major changes. |
| #53 tailwind-merge | Optional runtime utility upgrade; does not remove the Tailwind compiler findings. |
| #69/#70 E2E tooling | Separate browser/type upgrades; current E2E lock remains unchanged. |

## Validation

| Check | Result |
| --- | --- |
| Clean `npm ci` in API/web | Both passed; lockfiles used, no peer/dependency-tree errors (`npm ls --all` exits 0) |
| Full API tests | 1,793 passed across 178 files, including the three new boundary tests; sequential run completed in 819 seconds |
| New real dependency-boundary tests | 3 passed: Express-resolved proxy trust, application Markdown sanitizer, actual in-memory Nodemailer message composition |
| Full web tests | 515 passed across 55 files |
| API TypeScript build and BVC validator typecheck | Passed |
| Source-free compiled initialization/restart smoke | Passed, including unrelated path with spaces and no login-account creation |
| Web TypeScript/production build and size gate | Passed; entry 88.37 kB, React vendor 16.18 kB, CSS 13.68 kB (Brotli size-limit measurements) |
| E2E TypeScript and guarded local Chromium | Passed; all 73 tests, synthetic data, temporary DB and external provider HTTP blocked |
| Full/production npm audits and critical web gate | Results/exit codes above; web complete-graph critical gate exits 0 with seven findings visible |
| Workflow syntax and gate inspection | YAML parsed successfully; all three audit steps have no continue-on-error bypass |
| Linux CI / actual Docker / real SMTP / installed devices | Pending CI after push; Docker/server, SMTP and device checks remain owner acceptance |

The local web suite emits existing jsdom connection-error diagnostics from tests that do not mock every background request; the suite exits successfully. Those diagnostics are not represented as real backend/server verification. No lockfiles outside the API/web apps or application login/registration source files changed.

## Owner release handoff

Keep the review order #77 → #78 → #79 → #80 → this dependency follow-up, plus Wallet companion #2 where required. Human review, latest applicable CI and maintainer-confirmed required checks precede any separately authorized rollout. Retarget stacked PRs only after their bases merge and revalidate.

Before rollout, the owner must record:

1. Exact reviewed image/commit identities, a verified online backup and a protected current-data copy. Run the compiled read-only preflight against that copy; preserve DB/WAL/SHM/journal evidence. Do not initialize an existing database or use initialization to repair refusal.
2. Actual Docker compiled layout, Node version, nonroot UID, read-only filesystem and permitted data/upload mounts. Rebuild from locked dependencies; do not reuse an old image layer or copy laptop `node_modules` onto the server.
3. SMTP interoperability/confirmed receipt using controlled accounts, Wallet/provider configuration, and historical payment/refund reconciliation. The offline Nodemailer test proves composition, not delivery.
4. Installed Android/iOS sign-in, verified-email onboarding, role handoffs and learning completion acceptance with the previously reviewed API. No mobile dependency or application rewrite is included here.
5. Rollback compatibility, retained artifacts, mail and backup evidence, then a separate complete observation window using the AUTH-13 verifier. An audit result does not replace DB, payment, device or operational acceptance.

The prior AUTH-13 production, retention, partial-refund and AUTH-14 infrastructure gates remain open. Mobile's separate advisory backlog is unchanged.
