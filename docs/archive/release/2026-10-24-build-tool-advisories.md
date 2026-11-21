# Frontend build-tool advisory follow-up

Laptop-only development against main `840d8c7541384114f2c38bd50abe924d8c9c2c1a` on 2026-10-24. The server owns PR merges and deployment. No release workflow, server, customer data or provider was accessed.

## Assessment and choice

The initial `npm audit --json` returned three moderate findings, on `postcss-selector-parser`, `postcss-nested` and `tailwindcss`. They trace to the same selector-parser advisory, [GHSA-rj75-hqrm-r3gf](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf). The maintainer lists both 6.1.5 and 7.1.6 as patched and describes trusted-source build use as unaffected. This lockfile already resolved 6.1.5, while npm's current audit range still reported every version below 7.1.6. This is not evidence of three separate exploitable application flaws.

Use an explicit npm override to resolve `postcss-selector-parser` to 7.1.6 for Tailwind and postcss-nested, retaining Tailwind 3 and the existing theme, plugins, styles and application source. This deliberately crosses the parents' requested parser major version, so audit success alone is insufficient compatibility evidence. Validate a clean install, production build, generated CSS equality, bundle limits and full web tests. Do not use `npm audit fix --force` or migrate to Tailwind 4 merely to silence the report. [npm override semantics](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides) and the [parser changelog](https://github.com/postcss/postcss-selector-parser/blob/main/CHANGELOG.md) inform this scoped choice.

The lock update changes only that parser's version, tarball URL and integrity digest. Frontend CI now audits the complete dependency graph at `--audit-level=moderate`, replacing its former critical-only allowance for build tooling. Registry/audit errors remain failures. Production dependencies retain their separate audit step.

## Verification record

The initial audit is the failing security gate: three moderate findings / nonzero exit. `npm install --package-lock-only --ignore-scripts` with the override returned zero vulnerabilities. Final executed checks:

- `npm ci --no-audit` completed from the changed lockfile. `npm ls postcss-selector-parser` confirms both Tailwind and postcss-nested use 7.1.6.
- `npm run build` (TypeScript plus Vite production build), `npm run size` and full `npm test` passed: **515 tests / 55 files**, 104.46 seconds. Existing jsdom network-error diagnostics did not fail the suite.
- Fresh `npm audit --json` returned **zero vulnerabilities at every severity**, including development dependencies. No findings are suppressed.
- Generated CSS SHA256 remained exactly `fe46562cfc1987c74efdf4bfff776441be20a59248ed8ef24c2375fac28a75ba`, byte-for-byte identical to the previous reviewed build. `git diff fe99116 840d8c7 -- LMS-Frontend` confirmed the baseline frontend inputs were identical. This comparison checks this application's actual generated styles rather than assuming major parser compatibility from an audit result.

Exact-head independent review and GitHub CI results are recorded in the follow-up PR description; neither is implied by local checks.

The existing reviewed baseline frontend build produced CSS SHA256 `fe46562cfc1987c74efdf4bfff776441be20a59248ed8ef24c2375fac28a75ba`. Its application/style sources and baseline lock match this branch before the parser override. Generated artifacts and test/audit logs remain local; no generated frontend assets are committed.

Future Tailwind upgrades must independently revalidate parser compatibility and audit results before changing/removing this override. Browser visual/device acceptance and production behavior are separate from local dependency verification.
