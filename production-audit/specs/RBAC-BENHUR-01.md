# RBAC-BENHUR-01: Benhur Access Specification

**Date:** 2026-09-02
**Status:** RESOLVED — No change required

## Context

Benhur Mwamba (`benhur.mwamba@smwebsystems.com`) is a senior team member, lecturer, and course creator/manager. The request was to assign the lowest appropriate admin level.

## Finding

Benhur already has `admin` in the production system. The production LMS uses a binary role model (`admin`/`student`) with no granular tiers. The RBAC system with 12 roles and 76+ permissions exists in the codebase but is not deployed.

## Account Details

- **ID:** `4821ddfc-b0eb-4144-8b6a-9e857960c45e`
- **Current role:** `admin`
- **Tenant scope:** N/A (no tenants table in production)
- **Course scope:** All courses (no ownership scoping in production)

## Admin Capabilities (Production)

| Capability | Available |
|---|---|
| Create courses | Yes |
| Edit any course | Yes |
| Delete any course | Yes |
| Manage quizzes | Yes |
| Manage students | Yes |
| Manage documents | Yes |
| Manage announcements | Yes |
| Review submissions | Yes |
| View analytics | Yes |
| Manage invitations | Yes |
| Access wallet/payment admin | No (separate system) |
| Assign roles | No (no endpoint) |
| Manage system config | No (no endpoint) |

## Intentionally Not Granted

- `super-admin` equivalent — does not exist in production
- Wallet/payment administration — handled by AmmaWallet separately
- Role assignment — no mechanism exists in production

## Verification

```
RBAC-BENHUR-001 — Account uniquely resolved: PASS (1 match)
RBAC-BENHUR-002 — Role already correct: PASS (admin)
RBAC-BENHUR-003 — No escalation needed: PASS
```
