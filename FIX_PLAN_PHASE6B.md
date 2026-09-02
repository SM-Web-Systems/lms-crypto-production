# Phase 6B — Fix Plan: Client-Side HD Derivation

> Branch: `fix/phase6b-client-hd` | Base: `main` @ `b0797ae`
> TDD mandatory. One commit per logical task group.

---

## Task 1: Create `hd-wallet.ts` + unit tests

**Files:**
- Create: `packages/web-app/src/lib/hd-wallet.ts`
- Create: `packages/web-app/src/lib/hd-wallet.test.ts`

**Steps:**
- [x] Write tests with known BIP39/SEP-0005 test vectors
- [x] Run tests, confirm FAIL
- [x] Implement `deriveHDKeypair()` and `isValidMnemonic()`
- [x] Run tests, confirm PASS
- [x] Commit

---

## Task 2: Update `wallet.ts` — replace server calls with local derivation

**Files:**
- Modify: `packages/web-app/src/store/wallet.ts` (lines 5, 242-243, 297-303)

**Steps:**
- [x] Write source-assertion test verifying no `keypairApi.fromMnemonic` or `keypairApi.validateMnemonic` calls
- [x] Run test, confirm FAIL
- [x] Replace 3 API calls with local `deriveHDKeypair()` / `isValidMnemonic()`
- [x] Update import: add `deriveHDKeypair, isValidMnemonic` from `../lib/hd-wallet`
- [x] Remove `keypairApi` from import if no longer used
- [x] Run test, confirm PASS
- [x] TypeScript check: `npx tsc --noEmit`
- [x] Commit

---

## Task 3: Remove backend mnemonic endpoints + cleanup `api.ts`

**Files:**
- Modify: `packages/backend/src/server.ts` (remove from-mnemonic + validate-mnemonic handlers)
- Modify: `packages/web-app/src/lib/api.ts` (remove fromMnemonic + validateMnemonic methods)
- Create: `packages/backend/src/routes/keypair-mnemonic-removed.test.ts`

**Steps:**
- [x] Write source-assertion test verifying endpoints removed from server.ts
- [x] Run test, confirm FAIL
- [x] Remove both endpoint handlers from server.ts
- [x] Remove `fromMnemonic` and `validateMnemonic` from `keypairApi` in api.ts
- [x] Run test, confirm PASS
- [x] Run full backend test suite
- [x] Commit

---

## Task 4: P2-4-F2 bonus — crash on empty secrets in production

**Files:**
- Modify: `packages/backend/src/config/index.ts`
- Create: `packages/backend/src/config/secret-validation.test.ts`

**Steps:**
- [x] Write test verifying startup crash on empty PLATFORM_SECRET
- [x] Run test, confirm FAIL
- [x] Add guard in config
- [x] Run test, confirm PASS
- [x] Commit

---

## Task 5: Final verification + FINDINGS.md update

**Steps:**
- [x] Full backend test suite: `npx vitest run`
- [x] Frontend TypeScript: `npx tsc --noEmit`
- [x] Frontend build: `npm run build`
- [x] Update FINDINGS.md: mark P0-3-F2 and P2-4-F2 as FIXED
- [x] Commit

---

## Post-Fix Checklist
- [x] All new tests pass
- [x] Full backend suite passing
- [x] Frontend builds clean
- [x] FINDINGS.md updated
- [x] Branch NOT merged to main (pending review)
