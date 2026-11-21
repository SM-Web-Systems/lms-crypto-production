# Phase 24 C3: Badge Gallery Page — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 24 C3
**Baseline:** 777 tests (633 BE + 144 FE)

---

## 1. Problem Statement

Students with multiple blockchain-verified certificates can only see them as a stacked list in the StudentDashboard's `LmsCertificatesSection`. There is no dedicated page to browse, filter, or sort all earned badges. The `/credentials/mine` endpoint also lacks `sorobanTokenId` and `contractId` fields needed for full NFTBadge rendering.

## 2. Goals

1. Create a dedicated Badge Gallery page at `/student/badges` with responsive grid layout
2. Add filter-by-course and sort-by-date controls
3. Show empty state with encouragement when no badges earned
4. Add "Badges" link to student sidebar navigation
5. Enhance `/credentials/mine` to include `sorobanTokenId` and `contractId`

## 3. Non-Goals

- Bulk PDF download (unnecessary complexity, individual PDF links exist on each badge)
- Badge trading or transfer
- Custom badge ordering/pinning
- Public gallery page (authenticated only)
- Search by keyword (course filter is sufficient)

## 4. Architecture

### 4.1 Backend Change

Enhance the existing `GET /credentials/mine` endpoint to include `sorobanTokenId` and `contractId` in the SELECT query. No new endpoint needed.

### 4.2 New Files

| File | Purpose |
|------|---------|
| `LMS-Frontend/src/pages/BadgeGallery.tsx` | Gallery page with grid, filter, sort, empty state |
| `LMS-Frontend/src/__tests__/pages/BadgeGallery.test.tsx` | Frontend tests |

### 4.3 Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/routes/publicCredentials.ts` | Add `sorobanTokenId`, `contractId` to `/credentials/mine` SELECT |
| `LMS-Server/src/__tests__/nft-badges.test.ts` | Add tests for enhanced fields |
| `LMS-Frontend/src/App.tsx` | Add `/student/badges` route |
| `LMS-Frontend/src/components/Layout.tsx` | Add "Badges" to student sidebar nav |
| `LMS-Frontend/src/types/api.ts` | Add `sorobanTokenId`, `contractId` to `MyCredential` interface |
| `LMS-Frontend/src/services/courseCompletionService.ts` | Map new fields in response |

## 5. Detailed Design

### 5.1 Backend: Enhanced /credentials/mine

Add `nc.soroban_token_id` and `nc.contract_id` to the existing SELECT query:

```sql
SELECT nc.id, nc.wallet_address, nc.tx_hash,
       nc.course_id, c.title AS course_title, c.course_code,
       nc.quiz_id, q.title AS quiz_title,
       nc.network, nc.created_at,
       nc.soroban_token_id, nc.contract_id
FROM nft_credentials nc
LEFT JOIN courses c ON c.id = nc.course_id
LEFT JOIN quizzes q ON q.id = nc.quiz_id
WHERE nc.user_id = ? AND nc.mint_status = 'minted'
ORDER BY nc.created_at DESC
```

Response adds two fields:
```typescript
sorobanTokenId: row.soroban_token_id ?? null,
contractId: row.contract_id ?? '',
```

### 5.2 Frontend: BadgeGallery Page

**State:**
- `credentials: MyCredential[]` — all minted credentials
- `filter: string` — selected course title (empty = all)
- `sortOrder: 'newest' | 'oldest'` — date sort direction
- `loading: boolean`
- `error: string | null`

**Layout:**
```
┌─────────────────────────────────────────────┐
│ My Badges                        [Sort ▼]   │
│ [Filter by course ▼]                        │
├─────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ NFTBadge│ │ NFTBadge│ │ NFTBadge│        │
│ └─────────┘ └─────────┘ └─────────┘        │
│ ┌─────────┐ ┌─────────┐                    │
│ │ NFTBadge│ │ NFTBadge│                    │
│ └─────────┘ └─────────┘                    │
└─────────────────────────────────────────────┘
```

Grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`

**Filter:** Dropdown built from unique `courseTitle` values in credentials. "All Courses" default.

**Sort:** Toggle button: "Newest First" (default) / "Oldest First". Reverses credential array.

**Empty state:** Award icon + "No badges yet" + "Complete courses to earn blockchain-verified certificates."

### 5.3 Route + Navigation

Route in App.tsx (inside student ProtectedRoute + Layout):
```tsx
<Route path="/student/badges" element={<BadgeGallery />} />
```

Nav item in Layout.tsx student section:
```tsx
{ name: 'Badges', path: '/student/badges', icon: Award }
```

## 6. Security

- `/credentials/mine` requires authentication (existing middleware)
- `/student/badges` route is inside ProtectedRoute (student role)
- No new endpoints exposed publicly

## 7. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| GALLERY-BE-1 | GET /credentials/mine returns sorobanTokenId for minted credential | Response includes `sorobanTokenId` field |
| GALLERY-BE-2 | GET /credentials/mine returns contractId for minted credential | Response includes `contractId` field |
| GALLERY-BE-3 | GET /credentials/mine returns empty array for user with no credentials | `[]` response |
| GALLERY-BE-4 | GET /credentials/mine excludes non-minted credentials | Only `minted` status returned |

### Frontend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| GALLERY-FE-1 | BadgeGallery renders grid of NFTBadge components | NFTBadge components in DOM |
| GALLERY-FE-2 | BadgeGallery filter dropdown shows unique course titles | Filter options match credential courses |
| GALLERY-FE-3 | BadgeGallery sort toggle reverses order | Credentials reorder on sort change |
| GALLERY-FE-4 | BadgeGallery shows empty state when no credentials | "No badges yet" message |

### Target counts:
- Backend: 633 → 637 (+4)
- Frontend: 144 → 148 (+4)

## 8. Rollback

- Revert the merge commit or `git reset --hard pre-phase24-c3-2026-08-11`
- No new dependencies
- No schema changes — clean rollback
