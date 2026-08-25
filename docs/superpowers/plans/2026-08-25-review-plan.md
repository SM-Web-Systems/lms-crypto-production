# Development Workflow — Review Plan

**Date:** 2026-08-25

---

## Review Phases

### Phase 1: Self-Review (Implementer)
- Implementer checks own code against spec before submission
- Verifies tests pass
- Verifies no secrets in output
- Built into subagent-driven-development implementer prompt

### Phase 2: Task Review (Per Task)
- Dispatched after each task reaches GREEN
- Reviewer subagent receives: spec, plan task, diff
- Checks: spec compliance, code quality, test coverage, security
- Severity: Critical (blocks) / Important (fix before merge) / Minor (defer OK) / Info
- Critical findings → fix subagent → re-review (max 2 cycles)

### Phase 3: Broad Review (End of Plan)
- Dispatched after all tasks complete
- Reviewer subagent receives: full branch diff, spec, plan
- Checks: cross-task consistency, architectural coherence, missing edge cases
- Uses `requesting-code-review` skill / code-reviewer prompt

### Phase 4: Independent Review (This Session)
- For documentation-only changes: coordinator reviews all artifacts
- For code changes: separate subagent that did not implement

---

## Review Record Format

```markdown
## Review: [scope]
- **Reviewer:** [who]
- **Independent:** yes/no
- **Date:** YYYY-MM-DD
- **Scope:** [what was reviewed]

### Findings
| ID | Severity | File/Section | Finding | Disposition |
|----|----------|--------------|---------|-------------|
| F-1 | Critical | ... | ... | Fixed / Deferred / Accepted |

### Recommendation
[APPROVE / APPROVE WITH CONDITIONS / REJECT]

### Outstanding Concerns
[Any unresolved items]
```

---

## Review for This Workflow Session

### Scope
All artifacts created in this session:
- 5 specification files
- 8 plan/TODO files
- 7 Mermaid diagram files

### Review Criteria
1. Authorization boundaries stated in every spec
2. All TODO items have required metadata (ID, priority, classification, status)
3. Mermaid syntax is valid
4. Approval gates cover all production-affecting actions
5. Decision log records rationale for selected approach
6. No secrets in any artifact
7. Production state untouched
