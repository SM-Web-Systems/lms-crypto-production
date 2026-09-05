# Forum Anonymization — Access Control Diagram

**Last updated:** 2026-09-04

## 1. Identity Visibility by Role

```mermaid
graph TB
    subgraph PUBLIC["Public / Unauthenticated"]
        PV1[Forum topics: author = 'Deleted User']
        PV2[Certificate verification: issuer anonymized]
        PV3[No profile access]
    end

    subgraph STUDENT["Student / Lecturer / Teacher"]
        SV1[Forum: author = 'Deleted User']
        SV2[Messages: conversation deleted]
        SV3[Profile: 404 or 'Deleted User']
        SV4[Search: no deleted user results]
    end

    subgraph ADMIN["Regular Admin"]
        AV1[Forum: author = 'Deleted User']
        AV2[User list: sees deletion_status badge]
        AV3[Deletion requests: can view list]
        AV4[Cannot view original identity]
    end

    subgraph PRIVACY["Privacy Auditor (privacy.view_deleted_identity)"]
        PA1[Can view original identity]
        PA2[Must provide reason]
        PA3[Every access logged]
        PA4[Can place/release legal hold]
        PA5[Can view deletion request history]
    end

    style PUBLIC fill:#e8e8e8
    style STUDENT fill:#cce5ff
    style ADMIN fill:#fff3cd
    style PRIVACY fill:#f8d7da
```

## 2. API Access Matrix for Deleted Users

```mermaid
graph LR
    subgraph ENDPOINTS["Endpoint Access by deletion_status"]
        direction TB

        subgraph ACTIVE["deletion_status = NULL (active)"]
            A1[All endpoints: ALLOWED]
        end

        subgraph PENDING["deletion_status = 'pending_deletion'"]
            P1["GET /account/delete-request: ALLOWED"]
            P2["POST /account/delete-request/cancel: ALLOWED"]
            P3["GET /data-export: ALLOWED"]
            P4["POST /data-export: ALLOWED"]
            P5["All other endpoints: 403 BLOCKED"]
        end

        subgraph HOLD["deletion_status = 'legal_hold'"]
            H1["Same as pending_deletion"]
            H2["Cannot cancel deletion"]
        end

        subgraph FINAL["deletion_status = 'finalized'"]
            F1["All endpoints: 401 REJECTED"]
            F2["JWT still valid but rejected by auth gate"]
        end
    end

    style ACTIVE fill:#d4edda
    style PENDING fill:#fff3cd
    style HOLD fill:#f8d7da
    style FINAL fill:#e8e8e8
```

## 3. Data Access Boundaries

```mermaid
graph TB
    subgraph BOUNDARY["Access Boundary Enforcement"]
        direction TB

        subgraph PUBLIC_API["Public API Responses"]
            R1["users.name → 'Deleted User'"]
            R2["users.email → NULL"]
            R3["users.role → 'deleted'"]
            R4["users.walletAddress → NULL"]
            R5["ForumAuthor.isDeleted → true"]
        end

        subgraph INTERNAL_DB["Database (users table)"]
            D1["name = 'Deleted User'"]
            D2["email = 'deleted_<random>@deleted.local'"]
            D3["password_hash = NULL"]
            D4["walletAddress = NULL"]
            D5["deletion_status = 'finalized'"]
        end

        subgraph RESTRICTED["Restricted Table (deleted_user_identities)"]
            S1["original_name = 'Jane Smith'"]
            S2["original_email = 'jane@example.com'"]
            S3["original_wallet = 'GABCD...'"]
            S4["Access requires privacy.view_deleted_identity"]
            S5["Access requires X-Access-Reason header"]
            S6["Every access logged to identity_access_log"]
        end
    end

    PUBLIC_API -->|"Reads from"| INTERNAL_DB
    RESTRICTED -->|"Only via compliance endpoint"| S4

    style PUBLIC_API fill:#d4edda
    style INTERNAL_DB fill:#fff3cd
    style RESTRICTED fill:#f8d7da
```

## 4. Audit Trail Architecture

```mermaid
graph TB
    subgraph AUDIT["Audit Trail for Account Deletion"]
        direction TB

        subgraph EVENTS["audit_log Events"]
            E1["DELETION_REQUESTED — actor=user, target=user"]
            E2["DELETION_CANCELLED — actor=user, target=user"]
            E3["LEGAL_HOLD_PLACED — actor=admin, target=user"]
            E4["LEGAL_HOLD_RELEASED — actor=admin, target=user"]
            E5["ACCOUNT_FINALIZED — actor=system, target=user"]
        end

        subgraph REQUEST_LOG["deletion_requests"]
            R1["Full lifecycle: pending→cancelled/finalized"]
            R2["dry_run_result: pre-flight check JSON"]
            R3["finalization_log: purge actions JSON"]
        end

        subgraph ACCESS_LOG["identity_access_log"]
            A1["actor_id: who accessed"]
            A2["reason: why (required)"]
            A3["fields_accessed: which fields"]
            A4["outcome: viewed/exported/denied"]
        end

        subgraph SNAPSHOT["deleted_user_identities"]
            S1["Original PII preserved"]
            S2["retention_expires_at: when to purge"]
            S3["access_count: how many times accessed"]
        end
    end

    EVENTS -->|"Records lifecycle events"| E1
    REQUEST_LOG -->|"Tracks request state"| R1
    ACCESS_LOG -->|"Tracks identity access"| A1
    SNAPSHOT -->|"Stores original PII"| S1

    style EVENTS fill:#cce5ff
    style REQUEST_LOG fill:#d4edda
    style ACCESS_LOG fill:#f8d7da
    style SNAPSHOT fill:#fff3cd
```
