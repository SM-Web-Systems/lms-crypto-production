# AUTH-07: Production Deployment Task Checklist

**Date:** 2026-10-19
**Operator:** Claude (automated)

---

## Phase 0: Deployment Infrastructure Assessment
- [x] Read and analyze `scripts/deploy.sh` (277 lines)
- [x] Read and analyze `scripts/rollback.sh` (66 lines)
- [x] Read and analyze `scripts/smoke-test.sh` (127 lines)
- [x] Read and analyze `scripts/smoke-test-verify.sh` (137 lines)
- [x] Read and analyze `scripts/measure-bundle-sizes.sh` (71 lines)
- [x] Read and analyze `docker-compose.yml` (86 lines)
- [x] Read and analyze `LMS-Server/Dockerfile` (25 lines)
- [x] Read and analyze `LMS-Frontend/Dockerfile` (22 lines)
- [x] Read and analyze `LMS-Server/docker-entrypoint.sh` (13 lines)
- [x] Read and analyze `.github/workflows/ci.yml` (108 lines)
- [x] Read and analyze `DEPLOY.md` (143 lines)
- [x] Read and analyze `.gitignore` (50 lines)
- [x] Verify 7 flagged issues (V-1 through V-7)
- [x] Produce findings across 12 assessment areas
- [x] Write `AUTH-07-deployment-assessment-prompt.md`
- [x] Write `AUTH-07-deployment-assessment-findings.md`

## Phase 1: Change Impact Analysis
- [x] Enumerate all commits between production and main HEAD (19 commits)
- [x] Classify all 18 changed files by type (production/test/e2e/docs)
- [x] Identify 4 production code files (+311/-22 lines)
- [x] Verify zero dependency/schema/CI/Docker/config changes
- [x] Analyze runtime impact and risk
- [x] Write `AUTH-07-change-impact-analysis.md`

## Phase 2: Architecture Diagrams
- [x] Create deployment flow diagram (`auth07-deployment-flow.mmd`)
- [x] Create rollback flow diagram (`auth07-rollback-flow.mmd`)
- [x] Create container architecture diagram (`auth07-container-architecture.mmd`)
- [x] Create network topology diagram (`auth07-network-topology.mmd`)
- [x] Create authorization data flow diagram (`auth07-data-flow.mmd`)

## Phase 3: Developer Specification
- [x] Write deployment procedure
- [x] Write rollback procedure
- [x] Write monitoring guidance
- [x] Write success criteria
- [x] Create `AUTH-07-production-deployment-spec.md`

## Phase 4: Task Checklist
- [x] Create this checklist document

## Phase 5: Deployment Script Hardening
- [ ] Fix DEF-01: Guard state-saving with DRY_RUN check (`deploy.sh:163-184`)
- [ ] Fix DEF-02: Fail on empty data verification (`deploy.sh:95-97`)
- [ ] Fix DEF-03: Use localhost for deploy health wait (`deploy.sh:202`)
- [ ] Fix DEF-06: Add `.deploy-state/` to `.gitignore`
- [ ] Fix DEF-04: Escalate SHA mismatch to error (`deploy.sh:264`)
- [ ] Fix DEF-07: Replace python3 JSON parsing with node (`deploy.sh:101-103`)
- [ ] Verify all fixes with dry run

## Phase 6: Pre-Deployment Validation
- [ ] Run full backend test suite (vitest)
- [ ] Run full frontend test suite (vitest)
- [ ] Run frontend build (vite build)
- [ ] Run TypeScript checks (tsc --noEmit for backend and e2e)
- [ ] Run E2E test suite (playwright)
- [ ] Create `AUTH-07-test-evidence.md`

## Phase 7: Security and Deployment Review
- [ ] Review all production code changes for security issues
- [ ] Review deployment script hardening changes
- [ ] Verify no secrets in committed code
- [ ] Verify rollback path is clean
- [ ] Confirm authorization bypass paths are tested

## Phase 8: Pre-Deployment Dry Run
- [ ] Run `DEPLOY_DRY_RUN=1 scripts/deploy.sh`
- [ ] Verify output shows correct SHA
- [ ] Verify no ERRORs in dry run output
- [ ] Confirm all DRY RUN commands look correct

## Phase 9: Production Deployment
- [ ] Final `git status` — clean working tree
- [ ] Final `git log -1` — correct SHA
- [ ] Containers healthy pre-deploy
- [ ] Execute `scripts/deploy.sh`
- [ ] Deploy completes with SUCCESS
- [ ] Capture deploy log

## Phase 10: Post-Deployment Verification
- [ ] Health endpoint returns 200 with status=ok
- [ ] Build SHA matches in health response
- [ ] Both containers show healthy
- [ ] Smoke tests pass (5/5)
- [ ] Data integrity verified (row counts)
- [ ] Admin can access all cohorts
- [ ] No unexpected errors in container logs

## Phase 11: Monitoring
- [ ] Check error rate in logs (baseline comparison)
- [ ] Verify no unexpected 403s on admin endpoints
- [ ] Container uptime stable

## Phase 12: Final Documentation
- [ ] Create `AUTH-07-production-deployment-report.md`
- [ ] Record all evidence: SHAs, timestamps, test results, deploy output
- [ ] Document any issues encountered and resolutions
