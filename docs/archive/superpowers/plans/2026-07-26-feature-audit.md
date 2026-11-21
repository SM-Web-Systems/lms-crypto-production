# Feature Audit — Admin Console + LMS Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce developer specs, Mermaid diagrams, manual test matrix, and a go/no-go verdict for 7 features shipped 2026-07-25/26.

**Architecture:** Documentation-only. Read source files, write `.mmd` diagram files, write a single comprehensive audit `.md` file.

**Tech Stack:** Mermaid, Markdown.

## Global Constraints

- Diagram files → `docs/diagrams/*.mmd` (AmmaWallet repo)
- Audit document → `docs/superpowers/plans/2026-07-26-audit-report.md` (AmmaWallet repo)
- No code edits. No test runs.
- Mermaid syntax: flowchart TD or sequenceDiagram only. No subgraph unless needed for clarity.

---

### Task 1: LMS skeleton loading diagram

**Files:**
- Create: `docs/diagrams/lms-dashboard-skeleton-loading-flow.mmd`

- [ ] Write diagram covering: submissionsLoading → DashboardPageSkeleton; coursesLoading → CertEligibilitySkeleton; error fallback; normal render path.

---

### Task 2: LMS mint confirmation modal diagram

**Files:**
- Create: `docs/diagrams/lms-mint-confirmation-flow.mmd`

- [ ] Write diagram covering: Admin clicks Mint NFT on approved app → mintModal state set → modal renders → cancel clears modal → confirm calls submitMint → optimistic UI update → error path.

---

### Task 3: AmmaWallet tenant breadcrumb data flow diagram

**Files:**
- Create: `docs/diagrams/aw-admin-tenant-breadcrumb-data-flow.mmd`

- [ ] Write diagram covering: DB SELECT name+slug → service return → Fastify schema → TenantBilling interface → breadcrumb fallback chain.

---

### Task 4: Comprehensive audit report

**Files:**
- Create: `docs/superpowers/plans/2026-07-26-audit-report.md`

- [ ] Write full audit report per the output spec: executive summary, todo lists, feature specs, diagram inventory, test matrix, risks/fix list, go/no-go verdict.
