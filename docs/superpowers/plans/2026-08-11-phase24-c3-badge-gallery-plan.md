# Phase 24 C3: Badge Gallery Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Badge Gallery page at `/student/badges` with responsive grid layout, course filter, date sort, and empty state. Enhance `/credentials/mine` to return `sorobanTokenId` and `contractId`.

**Architecture:** Backend: enhance existing GET endpoint (2 extra columns in SELECT). Frontend: new page component with grid of NFTBadge components, filter dropdown, sort toggle. Route registered in App.tsx, nav link in Layout.tsx.

**Tech Stack:** React, TypeScript, Tailwind CSS, better-sqlite3, vitest, @testing-library/react, supertest

## Global Constraints

- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- Backend tests: `cd LMS-Server && npx vitest run`
- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- JWT auth pattern: `jwt.sign({ userId, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })`

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase24-c3-badge-gallery
git tag pre-phase24-c3-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase24-c3-badge-gallery-design.md \
        docs/superpowers/plans/2026-08-11-phase24-c3-badge-gallery-plan.md
git commit -m "docs: Phase 24 C3 badge gallery spec + plan"
```

---

### Task 1: Backend — Enhance /credentials/mine (TDD)

**Files:**
- Modify: `LMS-Server/src/routes/publicCredentials.ts`
- Modify: `LMS-Server/src/__tests__/nft-badges.test.ts`

- [ ] **Step 1: Write 4 failing backend tests**

Append to `LMS-Server/src/__tests__/nft-badges.test.ts`, add new describe block after the existing PDF tests:

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('GET /credentials/mine', () => {
  let token: string;

  beforeEach(() => {
    token = jwt.sign({ userId, role: 'student' }, JWT_SECRET, { expiresIn: '1h' });
  });

  it('GALLERY-BE-1: returns sorobanTokenId for minted credential', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/mine`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.credentials.length).toBeGreaterThanOrEqual(1);
    const cred = res.body.data.credentials[0];
    expect(cred).toHaveProperty('sorobanTokenId');
    expect(cred.sorobanTokenId).toBe(42);
  });

  it('GALLERY-BE-2: returns contractId for minted credential', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/mine`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const cred = res.body.data.credentials[0];
    expect(cred).toHaveProperty('contractId');
    expect(cred.contractId).toBe('CDPKSOOE4UZF');
  });

  it('GALLERY-BE-3: returns empty array for user with no credentials', async () => {
    const noCredUserId = uuidv4();
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'No Creds', ?, 'hash', 'student')`,
    ).run(noCredUserId, `nocreds-${noCredUserId}@test.com`);
    const noCredToken = jwt.sign({ userId: noCredUserId, role: 'student' }, JWT_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get(`${BASE}/credentials/mine`)
      .set('Authorization', `Bearer ${noCredToken}`)
      .expect(200);

    expect(res.body.data.credentials).toEqual([]);
  });

  it('GALLERY-BE-4: excludes non-minted credentials', async () => {
    const res = await request(app)
      .get(`${BASE}/credentials/mine`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Should only have 1 minted non-superseded credential (superseded ones are still minted but filtered by is_superseded in verify, NOT in mine)
    // Actually /mine does NOT filter is_superseded — it returns ALL minted credentials
    const ids = res.body.data.credentials.map((c: { credentialId: string }) => c.credentialId);
    expect(ids).not.toContain(pendingCredId);
  });
});
```

- [ ] **Step 2: Run tests — expect GALLERY-BE-1/2 to fail (fields missing)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Add sorobanTokenId and contractId to /credentials/mine**

In `publicCredentials.ts`, update the query type and SELECT:

Add `soroban_token_id` and `contract_id` to the type parameter and SQL SELECT. Add mapping to the response.

- [ ] **Step 4: Run tests — all 12 pass**

```bash
npx vitest run src/__tests__/nft-badges.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Run full backend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  637 passed`

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/routes/publicCredentials.ts LMS-Server/src/__tests__/nft-badges.test.ts
git commit -m "feat(api): add sorobanTokenId and contractId to /credentials/mine (Phase 24 C3)"
```

---

### Task 2: Frontend — BadgeGallery Page + Route + Nav (TDD)

**Files:**
- Create: `LMS-Frontend/src/pages/BadgeGallery.tsx`
- Create: `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx`
- Modify: `LMS-Frontend/src/App.tsx`
- Modify: `LMS-Frontend/src/components/Layout.tsx`
- Modify: `LMS-Frontend/src/types/api.ts`

- [ ] **Step 1: Update MyCredential type**

Add `sorobanTokenId` and `contractId` to the interface in `types/api.ts`.

- [ ] **Step 2: Write 4 failing frontend tests**

Create `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx`.

- [ ] **Step 3: Create BadgeGallery page**

- [ ] **Step 4: Add route to App.tsx**

- [ ] **Step 5: Add nav link to Layout.tsx**

- [ ] **Step 6: Run tests — all pass**

- [ ] **Step 7: Run full frontend suite**

Expected: `Tests  148 passed`

- [ ] **Step 8: Commit**

---

### Task 3: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend + frontend)**
- [ ] **Step 2: Full backend tests (637/637)**
- [ ] **Step 3: Full frontend tests (148/148)**
- [ ] **Step 4: Vite production build**
- [ ] **Step 5: Merge to main**
- [ ] **Step 6: Tag phase24-c3-complete-2026-08-11**
- [ ] **Step 7: Write closeout document**
