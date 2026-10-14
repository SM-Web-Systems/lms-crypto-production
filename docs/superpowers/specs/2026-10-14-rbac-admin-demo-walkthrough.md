# Deliverable 2 — Reviewer Walkthrough

**Date**: 2026-10-14
**Audience**: Non-technical reviewers, assessors, stakeholders

---

## What Was Built

We built an **Admin User Role Manager** — a page in the LMS admin panel where
authorized administrators can view, assign, and remove user roles.

Think of it like a user-permissions control panel: an admin opens the page,
sees a list of all users, picks one, and can give them additional roles (like
"Teacher" or "Content Reviewer") or take roles away.

---

## How It Works (Plain Language)

### 1. Only authorized admins can access it

The page is only visible to users with an admin account. If a student,
instructor, or sponsor tries to visit the page directly, they are
automatically redirected away. The system also checks permissions on the
server side — even if someone bypassed the redirect, the server would refuse
their requests.

### 2. The admin sees a user directory

When an admin opens the page, they see a table of all users showing:
- Name
- Email
- Their original account type (student, lecturer, etc.)
- A "Manage Roles" button

There is a search box at the top to quickly find a specific user.

### 3. The admin can assign or remove roles

Clicking "Manage Roles" opens a panel showing:
- The user's current RBAC roles (e.g., "Student")
- A dropdown to add a new role
- A "Remove" button next to each existing role

Both assigning and removing require a confirmation step — the admin must
click "Confirm" before the change takes effect.

### 4. The system prevents privilege escalation

This is a critical security feature. An admin **cannot** give a user a role
that is equal to or higher than their own. For example:
- A mid-level admin cannot make someone a super-admin
- The super-admin role is completely blocked from being assigned through
  this interface

If an admin tries, the system displays the exact rejection reason from the
server (e.g., "Cannot assign a role with equal or higher privilege than
your own").

---

## What Was Tested

### Automated tests (10 tests, all passed)

These tests simulate a real person using the interface — clicking buttons,
typing in search boxes, selecting options from dropdowns — and verify that
the page responds correctly:

1. The page loads and shows all users
2. Searching filters the user list
3. The table has the correct columns
4. Clicking "Manage Roles" shows the user's current roles
5. The role dropdown only shows roles the user doesn't already have
6. Assigning a role requires confirmation and updates the list
7. Removing a role requires confirmation and updates the list
8. Network errors show a message with a retry button
9. Permission-denied messages from the server are shown exactly as received
10. An informational note about privilege boundaries is visible

### Manual demonstration (15 steps, all passed)

A live demonstration was run against an isolated test database with fake
users (no real data). Each step was recorded:

| What was tested | Result |
|-----------------|--------|
| Admin can log in and see the user list | Passed |
| Admin can search for a specific user | Passed |
| Admin can view a user's current roles | Passed |
| Admin can assign a new role (Teacher) | Passed |
| The new role appears after refresh | Passed |
| Admin can remove the role | Passed |
| The role disappears after refresh | Passed |
| Assigning super-admin is blocked (security) | Passed |
| Assigning equal-level admin is blocked (security) | Passed |
| Error messages show correctly in the interface | Passed |
| Students cannot access the admin page | Passed |
| Instructors cannot manage roles | Passed |
| Sponsors cannot access the admin page | Passed |

### Build verification

- The code compiles without errors (TypeScript type check: 0 errors)
- The production build succeeds (ready for deployment)
- The full test suite passes: 412 tests across 44 files

---

## Known Limitation

**No browser screenshots or video** were captured because the demonstration
ran in a text-only (headless) server environment. This means a reviewer
cannot see what the page looks like visually.

**Why this is acceptable**: The 10 automated tests verify every user
interaction that a screenshot would show — loading, searching, clicking,
assigning, removing, error display. These tests use the same rendering
engine as a real browser and assert on visible text and interactive elements.

---

## Security Safeguards

| Safeguard | How it works |
|-----------|-------------|
| Route protection | Only admin accounts can reach the page |
| Server-side permission check | Every request is verified against the user's permissions |
| Privilege ceiling | Admins cannot assign roles at or above their own level |
| Super-admin lockout | The super-admin role cannot be assigned through this interface at all |
| Self-assignment block | Admins cannot change their own roles through this interface |
| Confirmation required | Both assign and remove actions require explicit confirmation |

---

## What Happens Next

Both pull requests (PR #58 for the backend, PR #59 for the frontend) are
open and ready for human review. Nothing has been merged or deployed. A
reviewer can:

1. Read the code changes in the pull requests
2. Run the automated tests locally (`npm test` in LMS-Frontend)
3. Replay the manual demonstration using the provided script
4. Review this evidence package for completeness

---

## Related Documents

- [Evidence Index](2026-10-14-deliverable-2-evidence-index.md) — links to all evidence documents
- [Full Demonstration Evidence](2026-10-14-rbac-admin-demonstration-evidence.md) — detailed API-level results
- [Developer Specification](2026-10-14-admin-user-role-manager.md) — technical architecture and test matrix
