# AUTH-08: Post-Deployment Verification Specification

**Date:** 2026-10-19
**Status:** ACTIVE

---

## 1. Purpose and Scope

Verify the AUTH-07 production deployment, audit deployment modifications, reconcile Git history, and establish production stability confidence.

**In scope:** Verification, auditing, documentation, Git synchronization.
**Out of scope:** Redeployment, production restarts, credential rotation.

## 2. Architecture

See Mermaid diagrams:
- `docs/diagrams/auth08-production-architecture.mmd`
- `docs/diagrams/auth08-authorization-architecture.mmd`

Production: Docker Compose (`lms-ammawallet`) on single host. API (node:22) + Web (nginx:alpine). SQLite database on Docker volume. External nginx reverse proxy.

## 3. Existing Implementation

- **Deployed:** `0dd2385` — AUTH-02 billing scoping + AUTH-03 cohort ownership + deploy hardening + docs
- **Local HEAD:** `535ac1a` — adds deployment report (doc only)
- **Remote main:** `cad179a` — 3 commits behind local
- **Unpushed:** `5465237` (infra), `0dd2385` (docs), `535ac1a` (docs)

## 4. Functional Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| F-01 | Production reports deployed SHA | `curl health \| jq .buildSha` = `0dd2385` |
| F-02 | Sponsor billing scoped to owned cohorts | AUTH-02 unit tests (26) pass |
| F-03 | Sponsor cohort ownership enforced | AUTH-03 unit tests (26) pass |
| F-04 | Admin access unrestricted | AUTH-04 integration tests (14) pass |
| F-05 | Deploy script hardening applied | `bash -n deploy.sh` passes |
| F-06 | Documentation matches deployment | Assessment findings review |

## 5. Non-Functional Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| NF-01 | API responds within 5s | Health endpoint response time |
| NF-02 | Container uptime stable | `docker ps` shows no restarts |
| NF-03 | Memory usage normal | Health endpoint memory < 200MB RSS |
| NF-04 | No error-level log entries | `docker logs` grep for errors |

## 6. Security Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| S-01 | No secrets in Git commits | `git diff` credential scan |
| S-02 | `.env` files gitignored | `git check-ignore` |
| S-03 | `.env` permissions ≤ 600 | `stat -c '%a'` |
| S-04 | No secrets in deploy logs | Grep deploy output |
| S-05 | Rollback artifacts intact | Check `previous-images.txt` |

## 7. Configuration Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| C-01 | `COMPOSE_PROJECT_NAME=lms-ammawallet` | `docker inspect` label check |
| C-02 | Docker volumes match expected names | `docker volume ls` |
| C-03 | Both containers on correct networks | `docker inspect` network check |

## 8. Git Synchronization Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| G-01 | Local main is fast-forward of remote | `git merge-base --is-ancestor` |
| G-02 | Commit chain is linear | Parent verification |
| G-03 | No secrets in push payload | Independent audit |
| G-04 | Remote HEAD equals local HEAD after push | `git ls-remote` comparison |

## 9. Database Preservation Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| D-01 | DB volume exists and is populated | `sudo test -f` on volume path |
| D-02 | Uploads volume exists and has content | `sudo ls` on volume path |
| D-03 | Pre-deploy backup exists | `ls` backup path |
| D-04 | Backup size matches pre-deploy DB | Size comparison |

## 10. Deployment Verification Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| V-01 | Health endpoint returns 200 | `curl` status code |
| V-02 | `status: "ok"` in response | JSON parse |
| V-03 | `db.status: "ok"` in response | JSON parse |
| V-04 | `buildSha` matches deployed commit | JSON parse comparison |
| V-05 | Both containers healthy | `docker ps` status |

## 11. Test Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| T-01 | Backend suite passes (1,597 tests) | `npx vitest run` exit 0 |
| T-02 | Frontend suite passes (450 tests) | `npx vitest run` exit 0 |
| T-03 | Backend TypeScript compiles | `tsc --noEmit` exit 0 |
| T-04 | E2E TypeScript compiles | `tsc --noEmit` exit 0 |
| T-05 | Frontend builds | `npx vite build` exit 0 |
| T-06 | Deploy script syntax valid | `bash -n` exit 0 |

## 12. Rollback Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| R-01 | Previous image IDs saved | File exists with content |
| R-02 | `rollback.sh` is executable | File permission check |
| R-03 | Pre-deploy backup accessible | File exists with expected size |
| R-04 | Git revert commands documented | Present in AUTH-07 report |

## 13. Monitoring Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| M-01 | Zero 5xx errors since deploy | Log grep |
| M-02 | Zero unexpected 403 errors | Log grep |
| M-03 | Zero container restarts | Docker inspect RestartCount |
| M-04 | Health endpoint continuously available | Periodic check |

## 14. Acceptance Criteria

All requirements in sections 4-13 pass. No CRITICAL or HIGH severity findings unresolved. Git synchronization complete.

## 15. Known Risks and Limitations

| Risk | Mitigation |
|------|-----------|
| `rollback.sh` uses unreachable localhost:3001 | Pre-existing; rollback still works via container restart |
| API container runs as root | Pre-existing; documented for future hardening |
| 24h stability window not yet complete | Monitoring ongoing |
| E2E sponsor tests require CI secrets | Validated in CI, not locally |
