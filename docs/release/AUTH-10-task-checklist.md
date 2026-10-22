# AUTH-10: Task Checklist

**Date:** 2026-10-22
**Operator:** Claude (automated)

---

## Phase 0 — Assessment
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 0.1 | Write assessment prompt | — | Covers 10 infrastructure areas | PASS | `AUTH-10-assessment-prompt.md` |
| 0.2 | Execute assessment | 0.1 | Findings for all 10 areas | PASS | `AUTH-10-assessment-findings.md` |

## Phase 1 — AUTH-09 Closure
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 1.1 | Verify production SHA | — | Health endpoint confirms 0dd2385 | PASS | curl /api/v1/health |
| 1.2 | Verify UTC/SAST conversions | — | All 7 timestamps correct | PASS | Python verification |
| 1.3 | Verify 24h window exceeded | — | 59.1h > 24h | PASS | Time calculation |
| 1.4 | Verify metrics coverage | — | docker logs cover full period | PASS | grep on docker logs |
| 1.5 | Disclose observation gap | — | 48.2h gap documented in §19 | PASS | Report §19 updated |
| 1.6 | Verify no unexpected restarts | — | RestartCount=0 | PASS | docker inspect |
| 1.7 | Verify cron not durable | — | No AUTH-09 cron entry in crontab | PASS | crontab -l |
| 1.8 | Document deferred script validation | — | §18 item 2 PENDING | PASS | Report §18 updated |
| 1.9 | Independent review | 1.1-1.8 | APPROVE verdict | PASS | Subagent review |
| 1.10 | Commit and push | 1.9 | Pushed to origin/main | PASS | `acb39fa` |

## Phase 2 — Infrastructure Security Analysis
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 2.1 | Analyze Dockerfile | — | UID/USER/build stages documented | PASS | Impact analysis §2 |
| 2.2 | Analyze container runtime | — | uid, gid, ReadonlyRootfs, caps | PASS | docker inspect/exec |
| 2.3 | Analyze volumes and ownership | — | Mount paths, ownership, WAL/SHM | PASS | Impact analysis §2.3-2.4 |
| 2.4 | Analyze entrypoint | — | Root requirements mapped | PASS | Impact analysis §2.5 |
| 2.5 | Classify proposed changes | — | Risk matrix complete | PASS | Impact analysis §3, §7 |
| 2.6 | Create impact analysis doc | 2.1-2.5 | All dimensions classified | PASS | `AUTH-10-infrastructure-impact-analysis.md` |

## Phase 3 — Mermaid Diagrams
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 3.1 | Production architecture | — | Valid Mermaid syntax | PASS | `auth10-production-architecture.mmd` |
| 3.2 | Non-root architecture | — | Valid Mermaid syntax | PASS | `auth10-nonroot-container-architecture.mmd` |
| 3.3 | Filesystem permissions | — | Valid Mermaid syntax | PASS | `auth10-filesystem-permissions.mmd` |
| 3.4 | Health monitoring escalation | — | Valid Mermaid syntax | PASS | `auth10-health-monitoring-escalation.mmd` |
| 3.5 | Secret delivery | — | Valid Mermaid syntax | PASS | `auth10-secret-delivery-architecture.mmd` |
| 3.6 | Testing workflow | — | Valid Mermaid syntax | PASS | `auth10-infrastructure-testing-workflow.mmd` |
| 3.7 | Rollout/rollback decision tree | — | Valid Mermaid syntax | PASS | `auth10-rollout-rollback-decision-tree.mmd` |

## Phase 4 — Developer Specification
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 4.1 | Create hardening spec | 2.6 | All 14 sections complete | PASS | `AUTH-10-infrastructure-hardening-spec.md` |

## Phase 5 — Task Checklist
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 5.1 | Create this checklist | 0-4 | All phases tracked | PASS | This document |

## Phase 6 — Non-Root API Container
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 6.1 | Create feature branch | — | Branch exists | TODO | |
| 6.2 | Write container startup tests | 6.1 | Tests fail (TDD red) | TODO | |
| 6.3 | Modify Dockerfile (USER node) | 6.2 | Tests pass (TDD green) | TODO | |
| 6.4 | Test SQLite access | 6.3 | DB read/write works | TODO | |
| 6.5 | Test WAL/SHM creation | 6.3 | WAL/SHM files created by node | TODO | |
| 6.6 | Test upload writes | 6.3 | Upload to all subdirs works | TODO | |
| 6.7 | Test entrypoint (clean start) | 6.3 | initDb works as node | TODO | |
| 6.8 | Test health checks | 6.3 | Health endpoint ok | TODO | |
| 6.9 | Test container restart | 6.3 | Container recovers | TODO | |

## Phase 7 — Read-Only Root Filesystem
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 7.1 | Write filesystem tests | 6.3 | Tests verify read-only behavior | TODO | |
| 7.2 | Add read_only + tmpfs to compose | 7.1 | Tests pass | TODO | |
| 7.3 | Verify volume writes work | 7.2 | DB and uploads writable | TODO | |
| 7.4 | Verify tmpfs writes work | 7.2 | /tmp writable | TODO | |
| 7.5 | Verify overlay reads blocked | 7.2 | Write to /app/dist fails | TODO | |

## Phase 8 — Durable Monitoring
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 8.1 | Design monitoring script | — | Covers all OR-* requirements | TODO | |
| 8.2 | Implement lms-health-monitor.sh | 8.1 | Script passes syntax + tests | TODO | |
| 8.3 | Implement dead-man check | 8.2 | Heartbeat age detection works | TODO | |
| 8.4 | Write monitoring tests | 8.2 | All T-18 through T-22 pass | TODO | |
| 8.5 | Document production install | 8.4 | Cron entry + config documented | TODO | |

## Phase 9 — Regression Testing
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 9.1 | Backend test suite | 6.3, 7.2 | All tests pass | TODO | |
| 9.2 | Frontend test suite | — | All tests pass | TODO | |
| 9.3 | E2E test suite | 6.3 | All tests pass | TODO | |
| 9.4 | Backend typecheck | — | tsc --noEmit clean | TODO | |
| 9.5 | E2E typecheck | — | tsc --noEmit clean | TODO | |
| 9.6 | Frontend build | — | vite build succeeds | TODO | |
| 9.7 | Script validation | 8.2 | All script tests pass | TODO | |
| 9.8 | Infrastructure tests | 6.3, 7.2, 8.2 | All T-01 through T-22 pass | TODO | |

## Phase 10 — Independent Review
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 10.1 | Code review | 9.1-9.8 | APPROVE verdict | TODO | |
| 10.2 | Security review | 9.1-9.8 | APPROVE verdict | TODO | |

## Phase 11 — PR Creation and Merging
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 11.1 | PR: AUTH-09 closure + AUTH-10 docs | 1.10 | CI passes, merged | PASS | Pushed to main (acb39fa) |
| 11.2 | PR: Non-root + read-only hardening | 10.1, 10.2 | CI passes, merged | TODO | |
| 11.3 | PR: Monitoring infrastructure | 10.1, 10.2 | CI passes, merged | TODO | |

## Phase 12 — Final Report
| ID | Task | Dependencies | Acceptance Criteria | Status | Evidence |
|----|------|-------------|---------------------|--------|----------|
| 12.1 | Create stability report | 11.1-11.3 | All sections complete | TODO | |
| 12.2 | Commit documentation | 12.1 | Pushed to main | TODO | |
