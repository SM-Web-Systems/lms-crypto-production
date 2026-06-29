# How to promote a user to admin

This document explains how admin access works in this LMS and how we promoted **liampatrickmcm@gmail.com** to admin, so you can apply the same ideas in another application.

## Concept (any app)

1. **Authoritative role lives in your own datastore**  
   Do not rely only on the identity provider (e.g. Clerk, Auth0) for application roles unless you have explicitly modeled roles there. Here, **`users.role`** in SQLite is the source of truth (`'student'` or `'admin'`).

2. **Every authenticated request resolves the user from that store**  
   After Clerk verifies the JWT, the backend loads (or creates) a row in **`users`** and reads **`role`**. That value is what gates admin-only routes (`authorize('admin')`).

3. **Changing role in the DB is not enough for active sessions**  
   Existing tokens/sessions may still carry the old role until they expire or the user signs in again. Ask the user to **sign out and sign in** (or refresh the session) after you change their role.

4. **The user row must exist first**  
   For Clerk-first sign-up, the first login creates **`users`** (default **`student`**) plus a **`students`** profile. You can only promote someone who already has a row (or you insert one yourself).

## What we did in this LMS

### Database

- Table: **`users`**
- Column: **`role`** — `CHECK (role IN ('student', 'admin'))`
- Email is stored lowercase for matching; Clerk’s primary email is normalized the same way in `src/auth/clerkUser.ts`.

### Promotion for a specific email

We ran a small script that:

1. Normalizes the email (trim + lowercase).
2. Looks up **`SELECT id, name, role FROM users WHERE email = ?`**
3. If no row: print an error — user must sign in once so a row exists.
4. If row exists and role is not already admin:  
   **`UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?`**

In SQLite, use **`datetime('now')`** with **single quotes**. Double quotes (`"now"`) are treated as an identifier, not a string literal, and the update will fail.

### Command in this repo

From **`LMS-Server`**:

```bash
npm run db:promote-admin -- user@example.com
```

Implementation: **`src/scripts/promoteUserToAdmin.ts`**  
NPM script: **`db:promote-admin`** in **`package.json`**.

The database file path comes from **`DATABASE_PATH`** in **`.env`** (default **`./data/student_ms.db`**).

### After promotion

Tell the user to **log out and log back in** so the backend issues a fresh session context with **`role: 'admin'`** and the frontend redirects to **`/admin`** instead of **`/student`**.

---

## Applying this to a separate application

Use this checklist:

| Step | What to decide |
|------|----------------|
| 1 | Where is **role** stored? (SQL column, NoSQL document, IdP custom claims, etc.) |
| 2 | On each request, where is **role** read? (middleware, JWT claims populated from DB, etc.) |
| 3 | How do you **update** that field safely? (migration, admin UI, one-off script, REPL) |
| 4 | After an update, how do **sessions** pick up the change? (TTL, forced logout, token refresh) |
| 5 | **Production**: avoid a public HTTP endpoint like `POST /make-me-admin`. Prefer DB access, a protected internal tool, or IdP role mapping with strict policies. |

### Minimal SQL pattern (relational DB)

```sql
-- Inspect
SELECT id, email, role FROM users WHERE email = 'user@example.com';

-- Promote (adjust table/column names)
UPDATE users
SET role = 'admin', updated_at = NOW()  -- or datetime('now') for SQLite
WHERE email = 'user@example.com';
```

### If you use Clerk (or similar) only for identity

- Keep **app roles in your database** (as this LMS does), **or** use Clerk’s [roles / public metadata](https://clerk.com/docs/guides/organizations/manage-roles) if that fits your product — but then your API must **trust and read** those claims consistently.
- First-time user: create local user with default role → later **UPDATE** to admin when trusted.

### Security notes

- Restrict who can change roles (DBA, scripted deploy, internal admin with MFA).
- Consider an audit log (who promoted whom, when).
- Re-test that admin-only routes return **403** for non-admins after your change.

---

## Files in this repo that relate to admin access

| Area | File |
|------|------|
| Promote-by-email script | `src/scripts/promoteUserToAdmin.ts` |
| Clerk → DB user + default student | `src/auth/clerkUser.ts` |
| Admin-only routes | `src/routes/*.ts` using `authorize('admin')` |
| User schema | `database/schema.sql` (`users.role`) |

This is enough to reproduce the same **“update role in DB + re-authenticate”** flow in another codebase with your own table names and auth middleware.
