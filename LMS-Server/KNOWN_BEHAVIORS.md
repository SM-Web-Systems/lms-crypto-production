# Known Behaviors

Accepted behaviors that are documented rather than fixed. Each entry records
the decision rationale and conditions under which the behavior should be
revisited.

---

## KB-01: JWT `role` claim may be stale after role changes

**Decision date:** 2026-10-13
**Finding:** D-03 (RBAC assessment)
**Status:** Accepted policy

### Behavior

The JWT `role` claim carries the value of `users.role` at token-issuance time.
When an administrator changes a user's legacy role (via `PATCH /users/:id/role`)
or assigns/revokes RBAC roles (via `/admin/users/:id/roles`), the JWT `role`
claim is **not** refreshed until the user's next login or token renewal.

### Security impact: NONE

Backend authorization decisions are **not** based on the JWT `role` claim.
The RBAC middleware (`requirePermission`, `requireCourseScope`) queries the
`user_roles` and `role_permissions` tables on every request, using a per-request
cache (`req._permissions`). Permission changes therefore take effect immediately
for all subsequent requests, regardless of the JWT `role` value.

### What the JWT `role` claim IS used for

- **Frontend routing** — determines which dashboard view to show (student vs.
  lecturer vs. admin). This is a presentation concern, not an authorization
  decision.
- **Legacy middleware** (`requireCourseAccess` — deprecated) — checked
  `req.user.role` directly. This middleware is replaced by `requireCourseScope`
  in Phase 1 (WI-01). Remaining usages are documented as technical debt.

### Authorization decision chain (per request)

```
HTTP request
  -> authenticate()        [verifies JWT signature, expiry, session revocation]
  -> req.user = JWTPayload [role claim is set here — may be stale]
  -> requirePermission()   [queries DB: user_roles -> role_permissions -> permissions]
  -> req._permissions      [per-request cache of CURRENT permissions]
  -> controller logic      [uses req._permissions, NOT req.user.role]
```

### Why not fix it

| Option | Cost | Benefit |
|--------|------|---------|
| Force re-login on role change | Session disruption for user; complexity in session management | Frontend shows correct role immediately |
| Token refresh endpoint | New endpoint + frontend integration + token rotation logic | Same as above |
| Short-lived tokens (e.g., 5min) | Adds refresh-token infrastructure; latency on every expired request | Reduces staleness window but does not eliminate it |

None of these options improve backend security (which is already authoritative).
The UX cost outweighs the presentation benefit.

### Revisit conditions

- If a frontend feature makes authorization decisions based on the JWT `role`
  claim (it must not — check for this in code review)
- If a session invalidation / `roles_changed_at` mechanism is implemented for
  other reasons (piggyback on it for role refresh)
- If regulatory or compliance requirements mandate immediate role-change
  visibility in the client

### Related files

- `src/config/jwt.ts` — token generation
- `src/middleware/auth.ts` — `authenticate()` populates `req.user`
- `src/middleware/rbac.ts` — `requirePermission()` queries DB per request
- `src/controllers/usersController.ts` — `patchUserRole()` changes legacy role
- `src/routes/rbac.ts` — RBAC role assignment endpoints
