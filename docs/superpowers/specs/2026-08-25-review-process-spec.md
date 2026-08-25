# Review Process Specification

**Status:** Draft
**Date:** 2026-08-25

---

## Authorization Boundary

```
No production migration is authorized by this workflow.
No enhanced-provider activation is authorized by this workflow.
No blockchain operation is part of this workflow.
```

---

## Problem

The review process for code changes is not formalized. There is no standard for who reviews what, how severity is classified, or how review findings are tracked to resolution. This leads to inconsistent review depth, missed issues in production, and no audit trail of review decisions.

## Goals

1. Define three review roles (self-review, task review, broad review) with clear responsibilities and when each applies.
2. Establish the independence requirement — who is qualified to perform each review role.
3. Define a severity classification system (Critical, Important, Minor, Info) with actionable criteria for each level.
4. Specify disposition tracking — how findings are recorded, resolved, or accepted.
5. Integrate the review process with the subagent-driven-development skill workflow.
6. Define the standard review file format for documenting findings.

## Non-Goals

- Implementing automated code review tooling (linters, static analysis).
- Defining CI pipeline gates based on review status.
- Creating a review dashboard or tracking UI.
- Changing git branch protection rules.

## Scope

### Review Roles

#### 1. Self-Review

- **Who:** The author of the change.
- **When:** Before every commit. Non-negotiable.
- **Checklist:**
  - All tests pass (full suite for affected project).
  - No debug code, console.log, or TODO left unintentionally.
  - No secrets, credentials, or environment-specific values in committed code.
  - Diff reviewed line-by-line for unintended changes.
  - Commit message follows project conventions.

#### 2. Task Review

- **Who:** A reviewer who did not author the change. In subagent workflows, this is the review workstream agent.
- **When:** After every implementation phase or batch completion, before deployment.
- **Scope:** Focused on the specific changes in the phase. Reviews the diff, test coverage, and alignment with the specification.
- **Independence requirement:** The task reviewer must not have written the code under review. In single-developer workflows with subagent-driven-development, the review workstream provides this independence by operating from a separate worktree with read-only access to implementation files.

#### 3. Broad Review

- **Who:** A reviewer examining the system holistically, not just the recent diff.
- **When:** At major milestones (security audits, release candidates, architecture changes).
- **Scope:** Cross-cutting concerns — security, performance, consistency, architectural alignment.
- **Independence requirement:** Same as task review. The broad reviewer should not have authored the majority of the code under review.

### Severity Classification

| Severity | Criteria | Required Action | SLA |
|----------|----------|-----------------|-----|
| **Critical** | Security vulnerability, data loss risk, production breakage, incorrect financial/blockchain operations | Must fix before deployment. Blocks release. | Immediate |
| **Important** | Functional bug, missing error handling, test gap for critical path, performance regression | Must fix before deployment or document accepted risk with justification. | Before next deploy |
| **Minor** | Code style inconsistency, suboptimal implementation, missing edge-case test, documentation gap | Should fix. Can be deferred to next phase with tracking. | Next phase |
| **Info** | Suggestions, alternative approaches, knowledge sharing, future improvement ideas | No action required. Recorded for reference. | None |

### Disposition Tracking

Every finding must have one of the following dispositions:

| Disposition | Meaning |
|-------------|---------|
| **Fixed** | The issue was resolved in a subsequent commit. Reference the commit hash. |
| **Accepted** | The issue is acknowledged but will not be fixed. Must include justification. |
| **Deferred** | The issue will be fixed in a future phase. Must include a tracking reference (phase number or backlog item). |
| **Disputed** | The author disagrees with the finding. Must include reasoning. Escalate to broad review if unresolved. |

### Review File Format

Review findings are documented in markdown files at:

```
docs/superpowers/reviews/YYYY-MM-DD-<phase-or-scope>-review.md
```

Standard format:

```markdown
# Review: <Phase or Scope Name>

**Reviewer:** <role/identity>
**Date:** YYYY-MM-DD
**Scope:** <what was reviewed>
**Commit range:** <start-hash>..<end-hash>

## Summary

<1-3 sentence overview of review findings>

## Findings

### <ID>: <Short title>

- **Severity:** Critical | Important | Minor | Info
- **File:** <path>
- **Line(s):** <line range>
- **Description:** <what the issue is>
- **Recommendation:** <suggested fix>
- **Disposition:** Fixed (commit) | Accepted (justification) | Deferred (tracking ref) | Disputed (reasoning)

## Statistics

| Severity | Count | Fixed | Accepted | Deferred | Disputed |
|----------|-------|-------|----------|----------|----------|
| Critical | 0     | 0     | 0        | 0        | 0        |
| Important| 0     | 0     | 0        | 0        | 0        |
| Minor    | 0     | 0     | 0        | 0        | 0        |
| Info     | 0     | 0     | 0        | 0        | 0        |
```

### Integration with Subagent-Driven-Development

In the subagent-driven-development workflow:

1. The **Review workstream** operates in its own worktree (see worktree-strategy-spec).
2. It performs task review after each implementation phase completes.
3. It reads implementation files but does not modify them — findings are written to review files only.
4. Critical and Important findings block the next implementation phase until resolved.
5. Minor and Info findings are batched and addressed in dedicated cleanup phases.
6. The review workstream maintains a running review log across phases, enabling broad review at milestones without re-reading all code.

### Review Triggers

| Event | Review Type | Required |
|-------|------------|----------|
| Pre-commit | Self-review | Always |
| Phase completion | Task review | Always |
| Security-sensitive change | Task review + broad review | Always |
| Release candidate | Broad review | Always |
| Schema migration | Task review | Always |
| Dependency update | Task review | Always |

## Acceptance Criteria

1. Three review roles (self, task, broad) are defined with clear responsibilities, triggers, and independence requirements.
2. Severity classification includes four levels (Critical, Important, Minor, Info) with criteria, required actions, and SLAs.
3. Disposition tracking defines four outcomes (Fixed, Accepted, Deferred, Disputed) with documentation requirements for each.
4. The review file format is fully specified with a template that includes findings, severity, file references, recommendations, and dispositions.
5. Integration with subagent-driven-development is documented, including how the review workstream operates, what blocks progress, and how findings flow back to implementation.
6. Review triggers are enumerated, mapping events to required review types.
