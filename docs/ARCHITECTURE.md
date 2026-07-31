# LMS-Crypto-Production — Architecture Overview

> **Purpose:** Visual overview of the full LMS solution for QA reviewers. Read this before starting any checklist.
> **Date:** 2026-07-31
> **Updated for:** Full-solution manual QA (supersedes Wave 2 architecture doc)

---

## 1. System Context

```mermaid
graph TB
    subgraph External
        AW[AmmaWallet<br/>ammawallet.com]
        ST[Stellar Mainnet<br/>Soroban Contract]
        SMTP[Stalwart SMTP<br/>smwebsystems.com]
    end

    subgraph LMS["LMS Platform — lms.smwebsystems.com"]
        FE[React Frontend<br/>Vite + TypeScript]
        API[Express API<br/>Node.js + SQLite]
        DB[(SQLite DB<br/>student_ms.db)]
        UP[Upload Storage<br/>UUID-named files]
    end

    User -->|Browser| FE
    FE -->|/api/v1/*| API
    API --> DB
    API --> UP
    API -->|SSO verify + wallet ops| AW
    API -->|NFT mint| ST
    API -->|Password reset emails| SMTP
    AW -->|SSO callback| FE
```

---

## 2. Role → Module Map

```mermaid
mindmap
  root((LMS Platform))
    Admin
      A1 Dashboard
        Pending submissions
        Announcements
        Daily tips
      A2 Students
        CRUD
        CSV import
        Enrollment
      A3 Submissions
        Review workflow
        Approve/Reject
        Feedback
      A4 Course Builder
        Weeks/Sections/Items
        Quiz linking
        Requirements config
      A5 Quizzes
        CRUD
        Answer keys
        Passing scores
      A6 Resources
        Upload
        Categories
        Course assignment
      A7 Certificates
        Applications
        NFT Minting
        Remint
        CSV export
      A8 Sponsor Portal
        Enrollment analytics
        NFT analytics
      A9 Forum moderation
      A10 Messages bulk
      A11 Course Members
      A12 Profile
      A13 User/Role Mgmt
        Invite system
        Role changes
    Student
      S1 Dashboard
        Course cards
        Wallet status
        NFT badges
        Cert status
      S2 Progress
        Lesson %
        Quiz scores
        Cert eligibility
      S3 Submissions
        File upload
        Status tracking
      S4 Course Viewer
        Lesson completion
        Embedded viewer
      S5 Quizzes
        Attempt
        Score display
      S6 Resources
      S7 Forum
      S8 Messages
      S9 Course Members
      S10 Profile
    Lecturer
      L1 Dashboard
        Assigned courses
      L2 Course Students
        Progress view
        Recommendations
      L3 Messages
      L4 Profile
    Auth and Public
      P1 Landing
      P2 Login SSO + fallback
      P3 Sign Up
      P4 Forgot Password
      P5 Reset Password
      P6 SSO Callback
```

---

## 3. Certificate / NFT Pipeline (Cross-Role Flow)

This is the most complex cross-role flow. It touches Student, Lecturer, and Admin roles plus external AmmaWallet and Stellar integrations.

```mermaid
flowchart LR
    subgraph Student
        S_PROGRESS[Complete lessons<br/>+ quizzes]
        S_APPLY[Apply for<br/>certificate]
        S_VIEW[View NFT badge<br/>on dashboard]
    end

    subgraph Lecturer
        L_REC[Add recommendation<br/>approved / not_ready]
    end

    subgraph Admin
        A_REVIEW[Review application]
        A_APPROVE[Approve]
        A_REJECT[Reject]
        A_MINT[Mint NFT<br/>confirmation modal]
        A_REMINT[Remint<br/>audit-logged]
    end

    subgraph External
        SOROBAN[Soroban Contract<br/>Stellar Mainnet]
        AMMA[AmmaWallet<br/>Credentials Page]
    end

    S_PROGRESS -->|meets requirements| S_APPLY
    S_APPLY -->|status: pending| L_REC
    L_REC --> A_REVIEW
    S_APPLY -->|or directly| A_REVIEW
    A_REVIEW --> A_APPROVE
    A_REVIEW --> A_REJECT
    A_APPROVE --> A_MINT
    A_MINT -->|mint tx| SOROBAN
    SOROBAN -->|tx_hash + token_id| A_MINT
    A_MINT -->|status: minted| S_VIEW
    S_VIEW -->|wallet lookup| AMMA
    A_REMINT -->|supersedes old| SOROBAN
    A_REJECT -->|can re-apply| S_APPLY
```

### Certificate States

| State | Meaning | Who Sets It |
|-------|---------|-------------|
| `not_eligible` | Requirements not met (lessons, quizzes, submissions) | System (auto-calculated) |
| `eligible` | All requirements met, can apply | System (auto-calculated) |
| `pending` | Application submitted, awaiting review | Student applies |
| `approved` | Admin approved, ready to mint | Admin |
| `rejected` | Admin rejected (student can re-apply) | Admin |
| `minted` | NFT minted on Stellar mainnet | Admin (mint action) |

---

## 4. Authentication Flow

```mermaid
flowchart TD
    START[User visits lms.smwebsystems.com] --> LANDING[Landing Page]
    LANDING --> LOGIN[Login Page]

    LOGIN -->|Primary| SSO[Click AmmaWallet SSO]
    LOGIN -->|Fallback| EMAIL[Expand email/password form]

    SSO --> AW_LOGIN[Redirect to ammawallet.com/sso/login]
    AW_LOGIN --> AW_AUTH[User authenticates on AmmaWallet]
    AW_AUTH --> CALLBACK[/sso-callback with JWT hash]
    CALLBACK --> STORE[Store JWT in localStorage]

    EMAIL --> API_LOGIN[POST /api/v1/auth/login]
    API_LOGIN --> STORE

    STORE --> ROLE{Check user.role}
    ROLE -->|student| STUDENT_DASH[/student]
    ROLE -->|lecturer| LECTURER_DASH[/lecturer]
    ROLE -->|admin| ADMIN_DASH[/admin]

    STORE --> HYDRATE[GET /api/v1/auth/me on app boot]
    HYDRATE --> ROLE
```

---

## 5. DB Schema Relationships

```mermaid
erDiagram
    users ||--o{ user_course_codes : "user_id"
    users ||--o{ nft_credentials : "user_id"
    users ||--o{ course_nft_applications : "user_id"
    users ||--o{ forum_topics : "author_id"
    users ||--o{ forum_posts : "author_id"
    users ||--o{ conversations : "participant"
    users ||--o{ lesson_completions : "user_id"
    users ||--o{ quiz_completions : "user_id"
    users ||--o{ submissions : "student_id"
    users ||--o{ user_profiles : "user_id"

    courses ||--o{ quizzes : "course_id FK"
    courses ||--o{ course_nft_applications : "course_id"
    courses ||--o{ nft_credentials : "course_id"
    courses ||--o{ course_lecturers : "course_id"
    courses ||--o{ lesson_completions : "course_id"
    courses ||--o{ course_completion_requirements : "course_id"
    courses ||--o{ course_documents : "course_ids JSON"
    courses ||--o{ course_invites : "course_id"
    courses ||--o{ forum_topics : "course_id"

    course_nft_applications ||--o| nft_credentials : "application_id FK"

    quizzes ||--o{ quiz_completions : "quiz_id"
    quizzes ||--o{ nft_credentials : "quiz_id"

    forum_topics ||--o{ forum_posts : "topic_id"
    conversations ||--o{ messages : "conversation_id"
    conversations ||--o{ conversation_reads : "conversation_id"

    users {
        text id PK
        text email UK
        text role "student | lecturer | admin"
        text walletAddress UK
        text wallet_linking_status
        text password_changed_at
    }

    courses {
        text id PK
        text course_code UK
        text title
        text sections "JSON array"
        text sponsor_label
    }

    quizzes {
        text id PK
        text course_id "FK courses.id"
        integer passing_score
        text questions "JSON array"
    }

    nft_credentials {
        text id PK
        text user_id "FK users.id"
        text application_id "FK applications.id"
        text mint_status "pending | minted | failed"
        text tx_hash
        integer soroban_token_id
        integer is_superseded
    }

    audit_log {
        integer id PK
        text action
        text actor_id
        text target_id
        text details
        text created_at
    }
```

---

## 6. Security Layers

```mermaid
flowchart TD
    REQ[Incoming Request] --> CORS[CORS Check<br/>FRONTEND_URL allowlist]
    CORS --> RATE[Rate Limiter<br/>auth: 60/15min<br/>write: 300/15min<br/>read: 120/15min]
    RATE --> AUTH[JWT Authentication<br/>password_changed_at check]
    AUTH --> RBAC[Role Authorization<br/>authorize...roles]
    RBAC --> COURSE[Course Access Check<br/>requireCourseAccess]
    COURSE --> VALIDATE[Input Validation<br/>Zod schemas + length limits]
    VALIDATE --> HANDLER[Route Handler]
    HANDLER --> XSS[XSS Escape<br/>forum/messages]
    HANDLER --> PATH[Path Validation<br/>uploads traversal guard]
    HANDLER --> DB[SQLite<br/>parameterized queries]
```

| Layer | Mechanism | Related Finding |
|-------|-----------|----------------|
| Authentication | JWT with mandatory secret (no fallback) | LMS-AUTH-001 |
| SSO | AmmaWallet IdP, separate state secret | — |
| RBAC | Role-based middleware (admin/lecturer/student) | LMS-RBAC-006 |
| Rate limiting | Auth (60/15min), write (300/15min), read (120/15min), diag (20/15min) | LMS-RATE-001 |
| Input validation | Email RFC 5322, name/body length limits, JSON 1MB | — |
| Output encoding | HTML-escape in forum/messages | LMS-XSS-001/002 |
| SQL safety | Parameterized queries via better-sqlite3 | — |
| Error handling | Sanitized responses (no SQLite internals in production) | LMS-ERR-001 |
| FK constraints | quizzes→courses, credentials→applications | LMS-DB-001/002 |
| Mint safety | Eligibility re-check, wallet validation, TOCTOU guard, cooldown | LMS-MINT-002 |
| Audit trail | audit_log table for admin mutations | — |
| File safety | MIME whitelist, UUID names, path traversal guard | LMS-UPLOAD-001 |

---

## 7. Legend

- **Solid arrows:** Data/request flow
- **Subgraph borders:** System boundaries
- **🔒 in checklists:** Tied to a fixed security finding (see FEATURE_INVENTORY.md regression table)
- **Recommended QA order:** Admin → Student → Lecturer → Cross-cutting
