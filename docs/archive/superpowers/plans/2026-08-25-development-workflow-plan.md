# Development Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a repeatable, spec-driven, test-backed development loop across SM-Web-Systems repos.

**Architecture:** Skill-driven workflow using the existing 15 superpowers skills, with a `/loop` mechanism that processes TODO items through TDD cycles, dispatches reviewers, and stops at approval gates.

**Tech Stack:** Claude Code skills, git worktrees, vitest, Playwright, Mermaid, Docker (read-only inspection)

## Global Constraints

- No production migration
- No enhanced-provider activation
- No blockchain operation
- No service restart without approval
- No commit/push without approval
- All skills must be invoked before their relevant phase

---

## Task 1: Repository Assessment

**Priority:** P0
**Classification:** Read-only
**Preconditions:** None
**Owner:** Coordinator

- [ ] Run `git status`, `git branch`, `git log` on LMS and AmmaWallet repos
- [ ] Run `docker ps`, `docker volume inspect` (read-only)
- [ ] Inspect backup scripts and cron schedules
- [ ] Verify database targets (Docker volume vs bind mount)
- [ ] Verify WAL mode on production databases
- [ ] Record baseline in decision log

**Expected Evidence:** Git status output, Docker state, backup schedule, database paths confirmed
**Failure Handling:** If repo is dirty, document untracked files and proceed
**Approval Required:** No

---

## Task 2: Brainstorm Workflow Design

**Priority:** P0
**Classification:** Read-only
**Preconditions:** Task 1
**Owner:** Coordinator

- [ ] Invoke `brainstorming` skill
- [ ] Compare Option A (spec-first), Option B (ad-hoc), Option C (subagent-driven)
- [ ] Select Option A + C hybrid
- [ ] Document decision rationale
- [ ] Record rejected alternatives

**Expected Evidence:** Decision log entry with rationale
**Failure Handling:** If brainstorming reveals blockers, document and STOP
**Approval Required:** No

---

## Task 3: Create Specifications

**Priority:** P0
**Classification:** Mutating (docs only)
**Preconditions:** Task 2
**Owner:** Documentation workstream

- [ ] Create workflow spec
- [ ] Create loop design spec
- [ ] Create test strategy spec
- [ ] Create review process spec
- [ ] Create worktree strategy spec

**Expected Evidence:** 5 spec files in `docs/superpowers/specs/`
**Failure Handling:** N/A — documentation only
**Approval Required:** No

---

## Task 4: Create Plans and TODOs

**Priority:** P0
**Classification:** Mutating (docs only)
**Preconditions:** Task 3
**Owner:** Documentation workstream

- [ ] Create this implementation plan
- [ ] Create TODO list with full metadata
- [ ] Create test matrix
- [ ] Create review plan
- [ ] Create decision log
- [ ] Create approval gates document

**Expected Evidence:** 6+ plan files in `docs/superpowers/plans/`
**Failure Handling:** N/A — documentation only
**Approval Required:** No

---

## Task 5: Create Mermaid Diagrams

**Priority:** P1
**Classification:** Mutating (docs only)
**Preconditions:** Task 3
**Owner:** Documentation workstream

- [ ] Create workflow discovery diagram
- [ ] Create loop flow diagram
- [ ] Create test strategy diagram
- [ ] Create review flow diagram
- [ ] Create worktree strategy diagram
- [ ] Create approval gates diagram
- [ ] Create workflow loop diagram

**Expected Evidence:** 7 diagram files in `docs/superpowers/diagrams/`
**Failure Handling:** N/A — documentation only
**Approval Required:** No

---

## Task 6: Define Loop Mechanism

**Priority:** P1
**Classification:** Mutating (docs only)
**Preconditions:** Task 4
**Owner:** Implementation workstream

- [ ] Define `/loop` entry point syntax
- [ ] Define loop cycle (TDD + review per task)
- [ ] Define stop conditions (12 named constants)
- [ ] Define allowed vs blocked actions
- [ ] Define resumption protocol
- [ ] Document in loop plan

**Expected Evidence:** Loop plan file with complete specification
**Failure Handling:** N/A — documentation only
**Approval Required:** No

---

## Task 7: Independent Review

**Priority:** P1
**Classification:** Read-only
**Preconditions:** Tasks 3-6
**Owner:** Review workstream

- [ ] Review all specifications for completeness
- [ ] Review all plans for actionability
- [ ] Review diagrams for accuracy
- [ ] Verify authorization boundaries are stated
- [ ] Record findings with severity and disposition

**Expected Evidence:** Review report with findings
**Failure Handling:** Critical findings must be addressed before completion
**Approval Required:** No

---

## Task 8: Verification Before Completion

**Priority:** P0
**Classification:** Read-only
**Preconditions:** Task 7
**Owner:** Coordinator

- [ ] Verify all specs created
- [ ] Verify all plans created
- [ ] Verify all diagrams created
- [ ] Verify production untouched
- [ ] Verify no secrets leaked
- [ ] Verify git status clean (except new docs)
- [ ] Present approval matrix
- [ ] STOP — await approval

**Expected Evidence:** Verification report with all items classified
**Failure Handling:** Any BLOCKED item prevents completion
**Approval Required:** Yes — for commit/push
