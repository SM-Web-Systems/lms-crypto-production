# Seed Account Verification Checklist (CFG-01)

**Created:** 2026-10-15
**Finding:** CFG-01 from security-and-integration-audit.md
**Severity:** Medium (High if unchanged in production)
**Status:** Requires human verification on production

---

## Background

The seed scripts (`LMS-Server/src/scripts/seedUsers.ts` and `LMS-Server/src/scripts/seedStudentsWithCourses.ts`) create test accounts with well-known default credentials. If these accounts exist in production with unchanged passwords, any user aware of these defaults can gain unauthorized access.

This checklist documents the accounts, verification steps, and remediation options. **No passwords, hashes, or credentials are included in this document.**

---

## Accounts to Verify

| # | Email | Seeded Role | Risk |
|---|---|---|---|
| 1 | `admin@test.com` | admin | **Critical** — full admin access |
| 2 | `student@test.com` | student | Low — limited student access |

---

## Verification Steps

**IMPORTANT:** These steps must be executed by an authorized human operator. Do not run these automatically.

### Step 1: Check if the accounts exist

Run the following **read-only** query against the production database:

```sql
SELECT id, email, role, created_at
FROM users
WHERE email IN ('admin@test.com', 'student@test.com');
```

**Expected outcomes:**
- **No rows returned:** Accounts do not exist in production. CFG-01 is resolved. No further action needed.
- **Rows returned:** Proceed to Step 2.

### Step 2: Assess account state

If accounts exist, check whether they have been used:

```sql
SELECT u.id, u.email, u.role, u.created_at,
       (SELECT COUNT(*) FROM active_sessions WHERE user_id = u.id) AS active_sessions
FROM users u
WHERE u.email IN ('admin@test.com', 'student@test.com');
```

---

## Remediation Options

Choose one of the following, ordered by preference:

### Option A: Delete the accounts (recommended if unused)

```sql
-- Only if the accounts are confirmed unused and no dependent data exists
DELETE FROM users WHERE email IN ('admin@test.com', 'student@test.com');
```

**Note:** Check for foreign key references in `payments`, `course_nft_applications`, `user_roles`, etc., before deleting.

### Option B: Change the passwords

If the accounts are in use (e.g., for internal testing), change their passwords through the application's password reset flow or via a direct hash update:

1. Use the application's "Forgot Password" flow to send a reset email
2. Or update the password hash directly (requires generating a new bcrypt hash)

### Option C: Disable the accounts

```sql
UPDATE users SET is_active = 0 WHERE email IN ('admin@test.com', 'student@test.com');
```

**Note:** Only if the `is_active` column exists and is enforced by the authentication middleware.

---

## Prevention

To prevent this issue from recurring:

1. **Seed scripts should not run in production.** Verify that `seedUsers.ts` and `seedStudentsWithCourses.ts` are only executed in development/test environments.
2. **If seed scripts must create accounts**, they should generate random passwords and log them to stdout (never to a file), or require the operator to set passwords interactively.

---

## Approval

| Step | Operator | Date | Result |
|---|---|---|---|
| Verification query executed | | | Pending |
| Accounts found? | | | Pending |
| Remediation applied | | | Pending |
| Verified remediation | | | Pending |

---

## Confirmations

- No passwords, password hashes, tokens, or credentials are included in this document
- No production queries were executed during the creation of this checklist
- Verification and remediation require explicit human authorization
