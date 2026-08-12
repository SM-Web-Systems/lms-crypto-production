# Phase Dependency Diagram

## Build Phases — Dependency Graph

```mermaid
flowchart TD
    A0["Phase A0: CI Invariant Test<br/>(parent-only wallet write)"]
    A1["Phase A1: Supporter→Super-Student Rename"]
    A2["Phase A2: New Permissions Seed (76 total)"]
    A3["Phase A3: user_links + user_groups Tables"]
    A4["Phase A4: login_history Table"]
    A5["Phase A5: course_approval_workflow Table"]
    A6["Phase A6: rewards + perks Tables"]
    A7["Phase A7: AmmaWallet Escrow Discovery<br/>⛔ HARD GATE"]
    A8["Phase A8: Tenant Settings<br/>(super-student threshold config)"]

    B1["Phase B1: Sponsor Dashboard Access"]
    B2["Phase B2: Sponsor Frontend"]
    B3["Phase B3: Sponsor Impact Report"]
    B4["Phase B4: Sponsor Billing View"]
    B5["Phase B5: Employer Dashboard + Teams"]
    B6["Phase B6: Invite-as-Role Flow"]
    BR["Phase B-R: Sponsor Rewards"]

    C1["Phase C1: Parent Dashboard + Family Groups"]
    C2["Phase C2: Parent Creates Student Accounts"]
    C3["Phase C3: Parent Wallet Management"]
    C4["Phase C4: Parent Billing"]
    CR["Phase C-R: Parent Rewards"]
    C5["Phase C5: Teacher Dashboard + Classes"]
    C6["Phase C6: Teacher Enrollment"]
    CTR["Phase C-TR: Teacher Rewards"]

    D1["Phase D1: Course Approval Workflow"]
    D2["Phase D2: TA Assignment System"]
    D3["Phase D3: TA Dashboard + Grading"]
    D4["Phase D4: Grade Approval<br/>(always explicit, no auto-publish)"]

    E1["Phase E1: Admin Tier Enforcement<br/>(middleware-level blocks)"]
    E2["Phase E2: Admin-2 UI Differentiation"]
    E3["Phase E3: Super-Admin System Config"]
    E4["Phase E4: Super-Student Auto-Unlock<br/>(tenant-configurable threshold)"]
    E5["Phase E5: Perks Marketplace"]

    F1["Phase F1: Login History API"]
    F2["Phase F2: Session Management"]
    F3["Phase F3: GDPR Data Export"]
    F4["Phase F4: Dispute/Refund Workflow"]
    F5["Phase F5: Messaging Rate Limiting"]
    F6["Phase F6: Notification Preferences Per Role"]

    %% Phase A dependencies (all foundation)
    A0 --> A2
    A1 --> A2
    A2 --> A3
    A2 --> A4
    A2 --> A5
    A2 --> A6
    A2 --> A8

    %% Escrow gate — blocks ALL reward-related work
    A7 -->|"⛔ HARD GATE<br/>Escrow resolved → platform-managed"| BR
    A7 -->|"⛔ HARD GATE"| CR
    A7 -->|"⛔ HARD GATE"| CTR

    %% Phase B dependencies (sponsor + employer)
    A3 --> B1
    A2 --> B1
    B1 --> B2
    B2 --> B3
    B2 --> B4
    A3 --> B5
    B2 --> B6
    B5 --> B6

    %% Phase C dependencies (parent + teacher) — PARALLEL with B
    A3 --> C1
    A2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    A3 --> C5
    C5 --> C6

    %% Phase D depends on A5 (course approval table)
    A5 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4

    %% Phase E depends on A2 (permissions) + A8 (tenant config)
    A2 --> E1
    A8 --> E4
    E1 --> E2
    E1 --> E3
    E4 --> E5

    %% Phase F depends on A4 (login_history)
    A4 --> F1
    F1 --> F2
    F2 --> F3
    F3 --> F4
    A2 --> F5
    F4 --> F6

    %% Styling
    style A7 fill:#dc2626,color:#fff,stroke:#991b1b,stroke-width:3px
    style A0 fill:#16a34a,color:#fff
    style BR fill:#fbbf24,color:#000,stroke:#dc2626,stroke-width:2px,stroke-dasharray:5
    style CR fill:#fbbf24,color:#000,stroke:#dc2626,stroke-width:2px,stroke-dasharray:5
    style CTR fill:#fbbf24,color:#000,stroke:#dc2626,stroke-width:2px,stroke-dasharray:5
    style E1 fill:#ea580c,color:#fff
    style D4 fill:#7c3aed,color:#fff
    style E4 fill:#2563eb,color:#fff
```

## Key

| Symbol | Meaning |
|---|---|
| ⛔ HARD GATE | AmmaWallet escrow discovery blocks all reward-funding work. **RESOLVED:** No escrow exists — rewards use platform-managed balances. |
| Red border (dashed) | Reward-related nodes — blocked until escrow gate resolved |
| Green (A0) | CI invariant test — already written and passing (12/12) |
| Orange (E1) | Admin tier enforcement — middleware-level, not UI-only (Decision #5) |
| Purple (D4) | TA grade approval — always explicit, never auto-publish (Decision #4) |
| Blue (E4) | Super-student auto-unlock — tenant-configurable threshold (Decision #2) |

## Parallel Execution

Phases B and C run in **parallel** (Decision #1). Both depend on Phase A foundation work completing first.

```
Phase A (foundation) ──┬──► Phase B (sponsor + employer)  ──┐
                       │                                      ├──► Phase D ──► Phase E ──► Phase F
                       └──► Phase C (parent + teacher)    ──┘
```
