# Admin Network Filtering Spec

**Date:** 2026-08-19
**Status:** PROPOSED
**Scope:** Filter NFT credentials by network in admin UI
**Risk:** LOW — additive change, no schema migration needed

---

## Problem Statement

The admin UI components that display NFT credentials (`AdminCertificates`, `NFTBadge`, `BadgeGallery`) query and display all rows from the `nft_credentials` table regardless of the `network` column value.

The `nft_credentials` table has a `network` column with values `'public'` or `'testnet'`. After the testnet mint, there is now 1 testnet credential row that would appear alongside production credentials in admin views.

As testnet usage continues (for testing, QA, integration verification), the number of testnet rows will grow. Without filtering, admin users will see a mix of production and testnet credentials with no way to distinguish them.

---

## Current State

### Database Schema

The `nft_credentials` table already has the `network` column:

```sql
network TEXT NOT NULL DEFAULT 'public'
```

No schema migration is needed.

### Current Queries

Admin credential queries do not filter by network:

```sql
SELECT * FROM nft_credentials WHERE ...
-- No WHERE network = ? clause
```

### UI Components Affected

| Component | Location | Displays Credentials |
|---|---|---|
| `AdminCertificates` | Admin dashboard panel | All credentials (mint status, actions) |
| `NFTBadge` | Credential detail view | Single credential (metadata, Stellar link) |
| `BadgeGallery` | `/student/badges` | Student's credentials (grid view) |
| `CohortManagement` | Cohort detail | Certificate status per member |

---

## Proposed Changes

### Backend

Add an optional `network` query parameter to credential endpoints:

```
GET /credentials?network=public        # default in production
GET /credentials?network=testnet       # explicit testnet filter
GET /credentials?network=all           # admin override to see both
```

Default behavior:
- If `network` parameter is omitted, default to the server's configured network (`NFT_STELLAR_NETWORK` env var, which is `'public'` in production)
- Admin users can override with `?network=all` or `?network=testnet`

SQL change:

```sql
-- Before
SELECT * FROM nft_credentials WHERE user_id = ?

-- After
SELECT * FROM nft_credentials WHERE user_id = ? AND network = ?
-- Or for 'all':
SELECT * FROM nft_credentials WHERE user_id = ?
```

### Frontend

Add a network filter toggle in `AdminCertificates`:

```
[Public] [Testnet] [All]     (toggle buttons, default: Public)
```

The `BadgeGallery` (student view) should default to the production network without a toggle — students should not see testnet credentials unless explicitly configured.

`NFTBadge` should display a network indicator badge when viewing a testnet credential (e.g., "TESTNET" label).

---

## API Changes

| Endpoint | Change |
|---|---|
| `GET /credentials` | Add `?network=` query param |
| `GET /credentials/mine` | Add `?network=` query param (default: server network) |
| `GET /admin/credentials` | Add `?network=` query param (default: server network) |

No new endpoints required. No breaking changes — omitting the parameter preserves current behavior by defaulting to server network.

---

## Components Modified

| File | Change |
|---|---|
| Credential query functions in `database.ts` or credential routes | Add `network` WHERE clause |
| `AdminCertificates` component | Add network toggle, pass to API |
| `NFTBadge` component | Display network indicator for testnet |
| `BadgeGallery` component | Default to production network |

---

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Breaking existing queries | LOW | Default parameter matches current behavior |
| Schema migration | NONE | Column already exists |
| Production data loss | NONE | Read-only filter, no data modification |
| UI confusion | LOW | Clear labeling of network toggle |

---

## Not Blocking

This change is not a blocker for testnet verification. The current testnet credential is a single row and causes no functional issues. This should be implemented before ongoing testnet usage produces multiple testnet rows that could confuse admin users.
