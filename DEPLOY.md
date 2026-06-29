# LMS deploy and operations runbook

Single reference for health checks, environment, Docker, rate limits, and secrets hygiene.

## Health checks

| URL | Use case |
|-----|----------|
| `GET /health` | Direct to **LMS-Server** (port `3001` in dev, or `api` container internally). |
| `GET /api/v1/health` | Same JSON body; use when probes must stay under `/api/v1`. |
| `GET http://<edge>/health` | **nginx edge** (`docker/nginx.edge.conf`) proxies to the API `/health`. Prefer this for port-80 checks. |

Example response: `{"status":"ok","timestamp":"..."}`.

**Do not** point load balancers only at a data-heavy route (e.g. students list); use one of the URLs above.

## Environment variables

### LMS-Server (`LMS-Server/.env`)

- **`DATABASE_PATH`** — SQLite file (default `./data/student_ms.db` in repo layout).
- **`FRONTEND_URL`** — CORS allowlist (comma-separated origins). Docker compose sets this for the API container.
- **`TRUST_PROXY`** — Set `1` or `true` behind nginx / a load balancer so rate limits use the real client IP (`X-Forwarded-For`).
- **`API_RATE_LIMIT_MAX`** / **`AUTH_RATE_LIMIT_MAX`** — Optional overrides (requests per IP per 15 minutes). See `LMS-Server/.env.example`.
- **Clerk / JWT / DB** — As required by your auth and DB setup; **never commit** real `.env` (already in `LMS-Server/.gitignore`).

### LMS-Frontend

- Copy **`LMS-Frontend/.env.example`** → **`.env`** locally.
- **Browser-exposed** vars must be prefixed with `VITE_` only. Do **not** put `CLERK_SECRET_KEY` (or any secret) in the frontend env file; that belongs on the server.
- **`VITE_DEV_ALLOWED_HOSTS`** — Optional comma-separated extra hosts for `vite` dev/preview (e.g. tunnel domains). See `.env.example`.

### Docker Compose (repo root)

- **`LMS-final/.env`** (or `--env-file`) — Used for **build args** such as `VITE_CLERK_PUBLISHABLE_KEY`. See `.env.docker.example`.
- **`LMS-Server/.env`** — Mounted into the `api` service via `env_file`.

## Docker Compose (`docker-compose.yml`)

- **API healthcheck** — Uses `GET http://127.0.0.1:3001/health` inside the container; **`web`** waits for **`api`** to be healthy.
- **Edge nginx** — Listens on host port **80**; API is proxied under **`/api/`**; static app on **`/`**.

Typical bring-up from repo root:

```bash
docker compose up --build
```

## Git and secrets (PAT / Clerk)

- **Personal access tokens**: store in a team vault (e.g. Bitwarden, cloud secrets manager). Do not paste into shell history or committed files. **Rotate** any token that may have leaked.
- **Git remotes**: use HTTPS + PAT or SSH keys per org policy; review who has access when someone leaves.
- **Clerk**: rotate keys from the Clerk dashboard if a publishable or secret key was exposed; update server and build-time `VITE_*` values as needed.

## `node_modules` ownership (host vs container)

- The **production `web` image** is nginx serving static files; it does not run `npm` at runtime. There is no `user: 1000:1000` on that service (nginx needs to listen on port 80 in the default image).
- If you run **`npm install` inside a container** with a **bind-mounted** project directory, files may be created as **root** and break **host** `npm` commands. Fixes:
  - Run install as your UID: `docker run --user $(id -u):$(id -g) ...`, or  
  - After the fact: `sudo chown -R "$(id -u):$(id -g)" node_modules` (from the project directory).

## Rate limiting (API)

- Configured in `LMS-Server/src/app.ts`. Defaults: production **100** API requests / 15 min / IP (auth routes stricter). Development defaults are higher; override with env vars above.
- After changing **`TRUST_PROXY`**, restart the API so limits see correct client IPs.

## SQLite schema / manual DB ops

- Prefer **server scripts** in `LMS-Server/package.json` (`db:init`, migrations) when they exist.
- For **one-off** inspection or repair on the host, use the `sqlite3` CLI against the file path in **`DATABASE_PATH`**, with a **backup copy** first. Document any manual migration in team notes so the next deploy repeats the same steps.

## Vite local config

- **`LMS-Frontend/vite.config.ts`** is committed with **`server.host`**, **`preview`**, and **`allowedHosts`** (plus optional **`VITE_DEV_ALLOWED_HOSTS`**). Avoid maintaining a second, unpushed copy of this file so `git pull` stays clean.
