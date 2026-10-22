# AUTH-10: Infrastructure Impact Analysis

**Date:** 2026-10-22
**Method:** Repository-level dependency mapping with container runtime verification
**Production SHA:** `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4`

---

## 1. Current Production Architecture

| Component | Image | Runtime Identity | Networks |
|-----------|-------|-----------------|----------|
| lms-api | node:22-bookworm-slim | root (uid=0) | default, web-stack_default, stalwart_bridge |
| lms-web | nginx:alpine (multi-stage) | nginx (uid=101) | default, web-stack_default |
| nginx_server | nginx:latest | External reverse proxy | web-stack_default |

## 2. Container Runtime Analysis — lms-api

### 2.1 Runtime Identity

| Property | Value | Evidence |
|----------|-------|----------|
| UID/GID | 0/0 (root) | `docker exec lms-api id` |
| Dockerfile USER directive | None | `LMS-Server/Dockerfile` |
| ReadonlyRootfs | false | `docker inspect` |
| SecurityOpt | [] (none) | `docker inspect` |
| CapAdd | [] (none) | `docker inspect` |
| CapDrop | [] (none) | `docker inspect` |

### 2.2 Available Non-Root User

The base image `node:22-bookworm-slim` provides:
```
node:x:1000:1000::/home/node:/bin/bash
```

### 2.3 Volume Mounts

| Volume | Container Path | Mode | Current Owner | Purpose |
|--------|---------------|------|---------------|---------|
| lms-ammawallet_lms-data | /app/data | rw | root:root | SQLite DB + backups |
| lms-ammawallet_lms-uploads | /app/uploads | rw | root:root | User files (avatars, documents, imports, submissions) |

### 2.4 SQLite Configuration

| Property | Value | Impact |
|----------|-------|--------|
| Journal mode | **WAL** | WAL and SHM files are created at runtime |
| Database file | `/app/data/student_ms.db` (16.7MB) | Needs read/write |
| WAL file | `/app/data/student_ms.db-wal` (4.1MB) | Created by SQLite, needs read/write |
| SHM file | `/app/data/student_ms.db-shm` (32KB) | Created by SQLite, needs read/write |

**Critical:** The WAL and SHM files are created and managed by SQLite at runtime. The non-root user must be able to create and write these files in `/app/data/`.

### 2.5 Entrypoint Behavior

`docker-entrypoint.sh`:
1. Checks if `$DATABASE_PATH` (default: `./data/student_ms.db`) exists and is non-empty.
2. If missing: runs `npx tsx src/scripts/initDb.ts` (creates DB + schema).
3. Calls `exec "$@"` → `node dist/server.js`.

**Root requirement analysis:**
- DB initialization needs write to `/app/data/` — can run as non-root if directory is owned by that user.
- `exec node dist/server.js` — no root requirement.
- No port binding below 1024 (uses 3001).

### 2.6 Runtime Write Paths

| Path | Type | Required? | Notes |
|------|------|-----------|-------|
| /app/data/ | Volume | YES | SQLite DB + WAL + SHM |
| /app/uploads/ | Volume | YES | avatars, documents, imports, submissions |
| /tmp/ | Container FS | YES | node-compile-cache, transient files |
| /root/.npm/_logs/ | Container FS | NO | npm debug log from build/startup — can be avoided |
| /app/dist/ | Container FS | NO | Build artifacts — read-only at runtime |
| /app/node_modules/ | Container FS | NO | Dependencies — read-only at runtime |

### 2.7 Data Directory Contents

`/app/data/` contains multiple old DB backups (pre-deployment, pre-migration). All owned by root:root. The non-root user needs write access only to the active database and its WAL/SHM files, but `chown` must cover the entire directory since new WAL/SHM files may be created.

## 3. Proposed Changes — Impact Classification

### 3.1 SEC-INFRA-01: Non-Root Container User

**Change:** Add `USER node` to `LMS-Server/Dockerfile` after build steps.

| Dimension | Assessment |
|-----------|-----------|
| **Security benefit** | HIGH — mitigates container escape privilege escalation |
| **Runtime compatibility risk** | MEDIUM — volume ownership must match new UID |
| **Operational complexity** | MEDIUM — production volumes need one-time `chown` |
| **Testing requirements** | HIGH — DB access, WAL/SHM creation, uploads, entrypoint |
| **Deployment requirements** | Requires volume ownership migration before or at first start |
| **Rollback difficulty** | LOW — revert Dockerfile USER line, volumes remain accessible |

**Dockerfile changes required:**
```dockerfile
# After build steps, before ENTRYPOINT:
RUN chown -R node:node /app/data /app/uploads /home/node
USER node
```

**Production migration:**
```bash
# Before first deployment with non-root user:
docker exec lms-api chown -R 1000:1000 /app/data /app/uploads
```

**Risk: `/home/node` directory.** When running as `node`, npm may attempt to write to `/home/node/.npm/`. The Dockerfile should ensure this directory exists and is owned by node.

**Risk: entrypoint `npx tsx`.** The `npx` command may need write access to npm cache. In practice, `tsx` is already installed in `node_modules` so no download occurs, but this should be verified.

### 3.2 SEC-INFRA-02: Read-Only Root Filesystem

**Change:** Add `read_only: true` to api service in `docker-compose.yml`, with tmpfs mount.

| Dimension | Assessment |
|-----------|-----------|
| **Security benefit** | MEDIUM — prevents container filesystem tampering |
| **Runtime compatibility risk** | LOW — all writes go to volumes or tmpfs |
| **Operational complexity** | LOW — compose-only change |
| **Testing requirements** | MEDIUM — verify no unexpected write paths |
| **Deployment requirements** | Compose restart (included in normal deploy) |
| **Rollback difficulty** | LOW — remove `read_only: true` line |

**docker-compose.yml changes required:**
```yaml
services:
  api:
    read_only: true
    tmpfs:
      - /tmp
      - /home/node/.npm
```

**Verified writes to volumes (will continue working):**
- `/app/data/` → volume mount
- `/app/uploads/` → volume mount

**Writes redirected to tmpfs:**
- `/tmp/` → node-compile-cache, transient files
- `/home/node/.npm/` → npm cache/logs (if running as non-root)

### 3.3 SEC-INFRA-03: Secret Delivery — No Change

**Disposition:** ACCEPTED RISK (unchanged from AUTH-09).

| Dimension | Assessment |
|-----------|-----------|
| **Security benefit** | N/A — no change |
| **Current mitigation** | .env file at 600 permissions, gitignored |
| **Revisit condition** | Orchestrated deployment, new operators, compliance change |

## 4. Dependency Chains Affected

### 4.1 Non-Root User Impact Chain

```
Dockerfile USER node
  → Container starts as uid=1000
    → docker-entrypoint.sh runs as node
      → npx tsx initDb.ts needs /app/data write → volume must be chown'd
      → node dist/server.js needs:
        → /app/data/ write (SQLite DB + WAL + SHM)
        → /app/uploads/ write (file upload endpoint)
        → /tmp/ write (Node.js transient files)
        → stdout/stderr (logging — no file writes)
```

### 4.2 Read-Only Filesystem Impact Chain

```
docker-compose.yml read_only: true
  → Container overlay filesystem becomes read-only
    → /app/dist/ read-only OK (no runtime writes)
    → /app/node_modules/ read-only OK
    → /app/BUILD_SHA read-only OK
    → /docker-entrypoint.sh read-only OK
    → /app/data/ volume mount (writable, unaffected by read_only)
    → /app/uploads/ volume mount (writable, unaffected by read_only)
    → /tmp/ tmpfs mount (writable)
    → /home/node/.npm/ tmpfs mount (writable, transient)
```

### 4.3 Combined Change Ordering

**SEC-INFRA-01 (non-root) MUST be applied before SEC-INFRA-02 (read-only).**

Reason: The tmpfs paths for read-only filesystem (`/home/node/.npm`) depend on the non-root user being configured. Applying read-only first without the correct tmpfs paths could break the application.

**Recommended order:**
1. Non-root user (Dockerfile + volume chown)
2. Read-only filesystem (compose + tmpfs)
3. Both can be in the same PR if tested together

## 5. Monitoring Impact

**Current monitoring gap:** No durable external health monitoring exists. AUTH-10 must design monitoring that survives session boundaries.

**Existing durable mechanisms:**
| Mechanism | Interval | Coverage |
|-----------|----------|----------|
| Docker healthcheck | 15s | Container liveness only (internal) |
| `lms-data-check.sh` | 6h | Health endpoint + DB row counts |
| `disk_alert.sh` | 1h | Disk at 75% threshold, email alert |
| `backup_lms_db.sh` | Daily 03:00 | SQLite .backup with SHA256 |
| `backup-media.sh` | Daily 03:45 | Upload directory backup |

**Missing:**
- External API monitoring (< 6h interval)
- 5xx response detection
- Container restart alerting
- Memory utilization alerting
- Dead-man / missed-check detection

## 6. Deployment Script Validation Status

| Script | Fix | Merged | Production-Tested |
|--------|-----|--------|-------------------|
| rollback.sh | HEALTH_URL configurable, public proxy default | PR #75 (`cf99ba4`) | **NO** — next rollback |
| deploy.sh | SHA mismatch → exit 1 | PR #75 (`cf99ba4`) | **NO** — next deploy |

These script fixes take effect on the **next production deployment**. They cannot be validated until then. This is a known and documented gap.

## 7. Risk Matrix

| Change | Security | Compatibility | Complexity | Priority |
|--------|----------|---------------|------------|----------|
| Non-root user | HIGH | MEDIUM | MEDIUM | 1 |
| Read-only FS | MEDIUM | LOW | LOW | 2 |
| Monitoring | HIGH (operational) | N/A | MEDIUM | 3 |
| Secret delivery | HIGH | HIGH | HIGH | DEFERRED |
