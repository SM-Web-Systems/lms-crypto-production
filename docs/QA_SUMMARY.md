# Manual QA Summary — LMS-Crypto-Production

> **Purpose:** Executive summary of the full-solution manual QA package. Start here.
> **Date:** 2026-07-31
> **Live site:** https://lms.smwebsystems.com
> **Codebase:** `lms-crypto-production` (HEAD: `4e7f905`)

---

## Deliverables

| # | Document | Description |
|---|----------|-------------|
| 1 | `FEATURE_INVENTORY.md` | Scope baseline — every role, module, route, and security finding |
| 2 | `ARCHITECTURE.md` | Visual overview with Mermaid diagrams (system context, auth flow, DB schema, security layers) |
| 3 | `MANUAL_QA_ADMIN.md` | Admin role checklist — **78 items**, 18 sections |
| 4 | `MANUAL_QA_STUDENT.md` | Student role checklist (includes Pre-Flight auth pages) — **76 items**, 11 sections |
| 5 | `MANUAL_QA_LECTURER.md` | Lecturer role checklist — **33 items**, 7 sections |
| 6 | `MANUAL_QA_CROSS_CUTTING.md` | Cross-cutting concerns checklist — **49 items**, 10 sections |
| 7 | `DISCREPANCIES.md` | Code/docs mismatches and accepted gaps found during authoring |
| 8 | `QA_SUMMARY.md` | This document |

---

## Totals

| Checklist | Items | Sections | Est. Time | Security Tags |
|-----------|-------|----------|-----------|---------------|
| Admin | 78 | 18 | 40–55 min | 5 (LMS-QUIZ-001, LMS-INVITE-001, LMS-MINT-002, LMS-RATE-001, LMS-UPLOAD-001) |
| Student | 76 | 11 | 35–45 min | 4 (LMS-QUIZ-001, LMS-QUIZ-002/003, LMS-XSS-001, LMS-XSS-002) |
| Lecturer | 33 | 7 | 15–20 min | 1 (LMS-RBAC-006) |
| Cross-Cutting | 49 | 10 | 30–40 min | 5 (LMS-DB-001, LMS-DB-002, LMS-XSS-001, LMS-XSS-002, LMS-RATE-001) |
| **Grand Total** | **236** | **46** | **~2–2.5 hrs** | **10 unique findings** |

---

## Security Findings Coverage

12 findings in the regression table. 10 have manual QA steps with `🔒` tags:

| Finding | Covered | Checklist(s) |
|---------|---------|-------------|
| LMS-UPLOAD-001 | Yes | Admin §18 |
| LMS-RBAC-006 | Yes | Lecturer §4 |
| LMS-RATE-001 | Yes | Admin §17, Cross-Cutting §10 |
| LMS-QUIZ-001 | Yes | Admin §4, Student §5 |
| LMS-QUIZ-002/003 | Yes | Student §5 |
| LMS-XSS-001/002 | Yes | Student §7-8, Cross-Cutting §9 |
| LMS-INVITE-001 | Yes | Admin §7 |
| LMS-MINT-002 | Yes | Admin §9 |
| LMS-DB-001 | Yes | Cross-Cutting §8 |
| LMS-DB-002 | Yes | Cross-Cutting §8 |
| LMS-MINT-003 | No — accepted risk | See DISCREPANCIES.md |
| LMS-AUTH-001 | No — server config | See DISCREPANCIES.md |

---

## Recommended QA Order

Run checklists in this order — each builds on data created by the previous:

1. **Admin** (first) — creates courses, quizzes, students, resources that other roles depend on
2. **Student** — tests learner flows using data from Admin checklist; includes Pre-Flight auth pages (P1-P6)
3. **Lecturer** — tests instructor flows using courses and students from steps 1-2
4. **Cross-Cutting** — mobile responsiveness, error handling, SSO, session management, security spot-checks

---

## Test Account Placeholders

All checklists use consistent placeholders — replace with real test account values before starting:

| Placeholder | Role |
|-------------|------|
| `[test-admin-1]` | Admin |
| `[test-student-1]` | Student (enrolled, wallet linked) |
| `[test-student-2]` | Student (empty state — no enrollments) |
| `[test-lecturer-1]` | Lecturer |
| `[test-admin-password]` | Admin password |
| `[test-student-email]` | Student email |
| `[test-student-password]` | Student password |
| `[test-lecturer-password]` | Lecturer password |
| `[test-course-code]` | Course code for testing |

---

## Out of Scope

| Item | Reason |
|------|--------|
| **LMS-Mobile** (`LMS-Mobile/` directory) | Separate Expo React Native codebase. Not testable via browser. Recommend a separate mobile QA pass. |

---

## How to Use These Checklists

1. Read `ARCHITECTURE.md` for system context
2. Replace all `[placeholder]` values with real test credentials
3. Follow the recommended order above
4. Check off each `- [ ]` item as you verify it
5. Items marked with `🔒` are security regression checks — pay extra attention
6. If a step fails, note the step number and actual behavior for the development team
