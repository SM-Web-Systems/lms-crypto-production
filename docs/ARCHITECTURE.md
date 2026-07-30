# LMS-AmmaWallet — Architecture Reference

**Date:** 2026-07-30
**Updated for:** Wave 2 Security Remediation

---

## 1. System Overview

**LMS-AmmaWallet** is a learner management system with blockchain credential minting:

- **Frontend:** React/Vite/TypeScript SPA
- **Backend:** Node.js/Express/TypeScript REST API
- **Database:** SQLite (better-sqlite3, synchronous)
- **Blockchain:** Stellar/Soroban for NFT credential minting
- **Auth:** JWT (local) + AmmaWallet SSO (external IdP)
- **Deploy:** Docker Compose (lms-api + lms-web containers)

---

## 2. Mint / Blockchain Flow

```mermaid
sequenceDiagram
    participant S as Student
    participant L as Lecturer
    participant A as Admin
    participant API as LMS API
    participant DB as SQLite
    participant SC as Soroban Contract

    S->>API: POST /nft-applications (apply for credential)
    API->>DB: Insert course_nft_application (status=pending)

    L->>API: PATCH /nft-applications/:id/recommend
    API->>DB: Update lecturer_rec = approved|not_ready

    A->>API: PATCH /nft-applications/:id/approve
    API->>DB: Update status = approved

    A->>API: POST /nft-applications/:id/mint
    Note over API: LMS-MINT-J2-003: Validate wallet address (StrKey)
    Note over API: LMS-MINT-J2-001: Re-check eligibility (getCourseProgress)
    Note over API: LMS-AUTH-009: Check remint cooldown (1hr)

    API->>DB: BEGIN TRANSACTION (LMS-MINT-J2-004)
    API->>DB: Insert nft_credential (status=pending)
    API->>DB: Update application status=minted
    API->>DB: COMMIT

    API->>SC: mint(recipient, metadata)
    SC-->>API: tx_hash + soroban_token_id

    API->>DB: Update nft_credential (status=minted, tx_hash)
    Note over API: LMS-ADM-001: auditLog(REMINT_CREDENTIAL)

    Note over API: LMS-MINT-005: Stale pending mints<br/>auto-expired after 30 min
```

---

## 3. DB Schema Relationships

```mermaid
erDiagram
    users ||--o{ students : "user_id"
    users ||--o{ user_course_codes : "user_id"
    users ||--o{ nft_credentials : "user_id"
    users ||--o{ course_nft_applications : "user_id"
    users ||--o{ forum_topics : "author_id"
    users ||--o{ forum_posts : "author_id"
    users ||--o{ conversations : "user1_id / user2_id"
    users ||--o{ lesson_completions : "user_id"
    users ||--o{ quiz_completions : "user_id"

    courses ||--o{ quizzes : "course_id [FK added Wave 2 - LMS-DB-001]"
    courses ||--o{ course_nft_applications : "course_id"
    courses ||--o{ nft_credentials : "course_id"
    courses ||--o{ course_lecturers : "course_id"
    courses ||--o{ course_enrollments : "course_id"
    courses ||--o{ lesson_completions : "course_id"
    courses ||--o{ course_completion_requirements : "course_id"

    course_nft_applications ||--o{ nft_credentials : "application_id [FK added Wave 2 - LMS-DB-002]"

    quizzes ||--o{ quiz_completions : "quiz_id"
    quizzes ||--o{ nft_credentials : "quiz_id"

    students ||--o{ submissions : "student_id"

    forum_topics ||--o{ forum_posts : "topic_id"
    conversations ||--o{ conversation_messages : "conversation_id"

    audit_log {
        integer id PK "autoincrement"
        text action "REMINT_CREDENTIAL | CHANGE_ROLE"
        text actor_id "FK users.id (logical)"
        text target_id "optional"
        text details "optional"
        text created_at
    }

    users {
        text id PK
        text email UK
        text role "student | lecturer | admin"
        text walletAddress UK
        text wallet_linking_status
    }

    courses {
        text id PK
        text course_code UK
        text title
        text sections "JSON array"
    }

    quizzes {
        text id PK
        text course_id "FK courses.id [Wave 2]"
        integer passing_score
        text questions "JSON array"
    }

    nft_credentials {
        text id PK
        text user_id "FK users.id"
        text quiz_id "FK quizzes.id"
        text course_id "FK courses.id"
        text application_id "FK applications.id [Wave 2]"
        text mint_status "pending | minted | failed"
        text tx_hash
        integer soroban_token_id
        integer is_superseded
    }
```

---

## 4. Security Layers

| Layer | Mechanism | Wave 2 Finding |
|-------|-----------|----------------|
| Authentication | JWT with mandatory secret (no fallback) | LMS-AUTH-001 |
| SSO | AmmaWallet IdP, separate state secret | LMS-SSO-002 |
| RBAC | Role-based middleware (admin/lecturer/student) | LMS-USER-001, LMS-J1-001 |
| Rate limiting | Global (60/min), read (120/min), auth (per-endpoint) | LMS-RATE-002/003 |
| Input validation | Email RFC 5322, name/body length limits, JSON 1MB | LMS-INPUT-* |
| Output encoding | HTML-escape in announcements and emails | LMS-XSS-003, LMS-EMAIL-001 |
| SQL safety | Parameterized queries, column allowlist | LMS-SQLI-002 |
| Error handling | Sanitized responses (no SQLite internals), sanitized logs | LMS-ERR-* |
| FK constraints | quizzes→courses, credentials→applications | LMS-DB-001/002 |
| Mint safety | Eligibility re-check, wallet validation, TOCTOU guard, cooldown | LMS-MINT-* |
| Audit trail | audit_log table for admin mutations | LMS-ADM-001/006 |
| File safety | Content-Disposition sanitization | LMS-INPUT-005 |
