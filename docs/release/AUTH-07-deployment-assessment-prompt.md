# AUTH-07 Phase 0: Deployment Infrastructure Assessment Prompt

**Date:** 2026-10-19
**Assessor:** Claude (automated)
**Main HEAD:** `cad179a57831543054e595a64b097dfc69754bb3`
**Production SHA:** `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847`

---

## Purpose

This document defines a systematic assessment of the LMS production deployment infrastructure. The assessment evaluates every script, configuration, and workflow file that participates in the deployment lifecycle — from build through rollback — and produces findings with severity, location, and recommended remediation.

## Scope

### Files Under Assessment

| File | Purpose | Lines |
|------|---------|-------|
| `scripts/deploy.sh` | Primary deployment orchestrator | 277 |
| `scripts/rollback.sh` | Image-based rollback | 66 |
| `scripts/smoke-test.sh` | Post-deploy health checks | 127 |
| `scripts/smoke-test-verify.sh` | Smoke test self-verification | 137 |
| `scripts/measure-bundle-sizes.sh` | Frontend bundle reporting | 71 |
| `docker-compose.yml` | Service definitions, volumes, networks | 86 |
| `LMS-Server/Dockerfile` | API container image | 25 |
| `LMS-Frontend/Dockerfile` | Frontend (nginx) container image | 22 |
| `LMS-Server/docker-entrypoint.sh` | API container entrypoint | 13 |
| `.github/workflows/ci.yml` | CI pipeline (3 jobs) | 108 |
| `DEPLOY.md` | Operations runbook | 143 |
| `.gitignore` | Repository ignore rules | 50 |

### Assessment Areas (12 Required)

1. **Deployment process and dependencies** — Script flow, ordering, prerequisites
2. **Current production architecture** — Containers, networks, volumes, proxies
3. **Database backup and restore procedures** — Backup safety, verification, restore path
4. **Health check mechanisms** — Container-level, script-level, external
5. **Rollback capabilities** — Image preservation, rollback script, limitations
6. **Environment variable management** — Secrets, build args, env file handling
7. **Docker Compose configuration** — Service defs, healthchecks, volumes, networks
8. **CI/CD pipeline integration** — Test stages, deploy trigger, artifact handling
9. **Monitoring and alerting** — Log aggregation, error detection, metrics
10. **Security posture of deployment** — Credential handling, permissions, attack surface
11. **Known defects and technical debt** — Existing issues, workarounds, missing features
12. **Documentation completeness** — Runbook accuracy, gap analysis

### Specific Issues to Verify

The following potential issues were flagged for verification against actual source:

| ID | Claim | File | Lines |
|----|-------|------|-------|
| V-1 | Missing production DB returns WARNING + `return 0` instead of failing | `deploy.sh` | 45-47 |
| V-2 | Failed data query returns WARNING + `return 0` instead of failing | `deploy.sh` | 95-97 |
| V-3 | Build SHA mismatch produces WARNING not failure | `deploy.sh` | 264 |
| V-4 | `docker image prune -f --filter "until=24h"` could delete rollback images | `deploy.sh` | 274 |
| V-5 | Health check uses external URL that may be unreachable from host | `deploy.sh` | 202 |
| V-6 | DRY_RUN still creates `.deploy-state/` directory and writes state files | `deploy.sh` | 122-123 |
| V-7 | `docker compose build` rebuilds ALL services even when deploying one | `deploy.sh` | 188 |

## Assessment Method

For each area:
1. Read and trace the relevant code paths
2. Identify defects, risks, and gaps
3. Classify severity: **CRITICAL** (blocks deployment or risks data), **HIGH** (significant risk, should fix before deploy), **MEDIUM** (should fix soon), **LOW** (improvement), **INFO** (observation)
4. Provide specific line references and remediation recommendations

---

## Findings

*Applied immediately below — see AUTH-07-deployment-assessment-findings section.*
