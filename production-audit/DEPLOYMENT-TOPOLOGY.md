# LMS Deployment Topology

**Date:** 2026-09-02
**Status:** Verified against running infrastructure

---

## 1. Overview

Two independent LMS deployments serve two domains from the same server. They share no database, no auth system, and no codebase branch.

| Domain | Purpose | Auth system | Codebase | Database |
|---|---|---|---|---|
| `lms.smwebsystems.com` | Production LMS with AmmaWallet integration | AmmaWallet SSO (custom) | `LMS-AmmaWallet/` | Docker volume `lms-ammawallet_lms-data` |
| `saplingx.com` | Original/legacy LMS | Clerk (Google One Tap) | `LMS-Server/` (stale copy) | Host bind `/html/LMS-Server/data/` |

---

## 2. Compose Files

Four Compose files exist. Only two control production containers:

| File | Purpose | Production? |
|---|---|---|
| `/home/webadmin/web-stack/docker-compose.yml` | Main web stack (nginx, saplingx LMS, CRM, mail, etc.) | **YES** |
| `/home/webadmin/web-stack/html/LMS-AmmaWallet/docker-compose.yml` | LMS-AmmaWallet (lms.smwebsystems.com) | **YES** |
| `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server/docker-compose.yml` | Local dev only (app + nginx on port 80) | No |
| `/home/webadmin/web-stack/html/LMS-Server/docker-compose.yml` | Local dev only (identical to above) | No |

---

## 3. Container Topology

| Domain | Compose file | Service name | Container name | Build context | Image | Has amma-login | Database |
|---|---|---|---|---|---|---|---|
| lms.smwebsystems.com | `LMS-AmmaWallet/docker-compose.yml` | `api` | `lms-api` | `./LMS-Server` (→ `LMS-AmmaWallet/LMS-Server/`) | `lms-ammawallet-api` | **YES** | Named volume `lms-ammawallet_lms-data` |
| lms.smwebsystems.com | `LMS-AmmaWallet/docker-compose.yml` | `web` | `lms-web` | `./LMS-Frontend` (→ `LMS-AmmaWallet/LMS-Frontend/`) | `lms-ammawallet-web` | YES (frontend links) | — |
| saplingx.com | `web-stack/docker-compose.yml` | `lms-server` | `lms_server` | `./html/LMS-Server` (→ stale copy) | `web-stack-lms-server` | **NO** | Bind `/html/LMS-Server/data/` |
| saplingx.com | `web-stack/docker-compose.yml` | `lms-frontend` | `lms_frontend` | `./html/LMS-Frontend` (→ stale copy) | `web-stack-lms-frontend` | NO (uses Clerk) | — |

---

## 4. Nginx Routing

Both domains are served by the same nginx container (`web-stack/docker-compose.yml`):

| Domain | Frontend upstream | API upstream | Config location |
|---|---|---|---|
| `lms.smwebsystems.com` | `lms-web:80` | `lms-api:3001` | `default.conf:139-215` |
| `saplingx.com` | `lms_frontend:80` | `lms_server:3001` | `default.conf:258-293` |

The nginx config comment at line 218 reads: *"Server blocks for saplingx.com (LMS — migrated from lms.smwebsystems.com)"*

---

## 5. Database Separation

| Deployment | DB path | Users | Size |
|---|---|---|---|
| lms.smwebsystems.com (lms-api) | Docker volume `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` | 1 admin + 12 students = 13 | 5.5 MB |
| saplingx.com (lms_server) | Host bind `/home/webadmin/web-stack/html/LMS-Server/data/student_ms.db` | 6 admins + 18 students = 24 | 356 KB |

These are **completely separate databases** with different user sets. No data sharing.

---

## 6. Environment Differences

| Variable | lms.smwebsystems.com | saplingx.com |
|---|---|---|
| `AMMA_WALLET_URL` | Set (ammawallet.com) | Not set |
| `AMMA_WALLET_API_KEY` | Set | Not set |
| `AMMA_SSO_STATE_SECRET` | Set | Not set |
| `VITE_AMMA_WALLET_URL` | Set (build arg) | Not set |
| `VITE_API_BASE_URL` | `/api/v1` (relative) | `https://saplingx.com/api/v1` |
| `FRONTEND_URL` | `https://lms.smwebsystems.com` | `https://lms.smwebsystems.com` (stale) |
| Auth routes | amma-login, amma-callback, login, register | login, google, logout |

---

## 7. Why Two Deployments Exist

**Source:** Handoff notes at `notes/lms-ammawallet-handoff-2026-07-10.md` and `notes/lms-handoff-2026-07-13.md`

The LMS was originally deployed as `saplingx.com` using Clerk (Google OAuth) for authentication. When AmmaWallet SSO integration was built, a new deployment was created at `lms.smwebsystems.com` with a separate database and codebase (`LMS-AmmaWallet/`). The original saplingx.com deployment was intentionally left running and explicitly marked "DO NOT TOUCH" in handoff documentation.

Relevant quotes:
- *"saplingx.com is untouched — still served by the old lms_server/lms_frontend containers"* (2026-07-10)
- *"saplingx.com → lms_server / lms_frontend ← DO NOT TOUCH"* (2026-07-13)

---

## 8. Codebase Divergence

The two backend codebases have diverged significantly:

| Feature | `LMS-AmmaWallet/LMS-Server/` | `LMS-Server/` (stale copy) |
|---|---|---|
| Auth routes | amma-login, amma-callback, login, register, forgot-password, reset-password | login, google, logout |
| RBAC | Full system (12 roles, 76 permissions) | Not present |
| Rate limiters | authLimiter (with GET skip), writeLimiter, readLimiter (scoped) | authLimiter (with GET skip*), writeLimiter, readLimiter |
| Forum/Messaging | Full implementation | Basic (fewer routes) |
| Health endpoint | Rich (DB latency, memory, AmmaWallet status) | Minimal (status only) |
| Tests | 1256 backend | Unknown |

*The GET skip was manually applied to the stale copy during the rate-limit fix.

---

## Rebuild Rule for Shared LMS Fixes

Any fix merged into `LMS-AmmaWallet/LMS-Server` that touches shared middleware, authentication, rate limiting, or core routes MUST be deployed to BOTH:

1. **lms-api** (lms.smwebsystems.com) — rebuild with:
   ```bash
   cd /home/webadmin/web-stack/html/LMS-AmmaWallet
   BUILD_SHA=$(git rev-parse HEAD) docker compose build --no-cache api
   docker compose up -d --no-deps api
   ```

2. **lms_server** (saplingx.com) — rebuild with:
   ```bash
   cd /home/webadmin/web-stack
   docker compose build --no-cache lms-server
   docker compose up -d --no-deps lms-server
   ```

Do not consider a shared LMS fix "deployed" until BOTH containers have been rebuilt and their BUILD_SHA verified against origin/main (see post-deploy verification below).

**Exception:** Fixes specific to a route or feature that verifiably does not exist in the other deployment (e.g., amma-login on saplingx.com) do not require rebuilding that deployment.

---

## Post-Deploy Verification

After any rebuild, confirm the running container matches the intended commit:

```bash
# Primary check (requires Phase 4 BUILD_SHA implementation)
curl -fsS https://lms.smwebsystems.com/health | jq -r .buildSha
git -C /home/webadmin/web-stack/html/LMS-AmmaWallet rev-parse HEAD

# Fallback: file-based
docker exec lms-api cat /app/BUILD_SHA 2>/dev/null || echo "unknown"
docker exec lms_server cat /app/BUILD_SHA 2>/dev/null || echo "unknown"
```

The two values must match. If they differ, the deployment is stale — rebuild before considering any related incident closed.
