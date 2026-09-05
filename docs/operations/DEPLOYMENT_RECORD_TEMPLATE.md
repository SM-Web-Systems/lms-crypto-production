# Deployment Record Template

Use this template to record each production deployment. Copy and fill in for each release.

## SHA Separation

These identifiers are independent and must be recorded separately when applicable:

| SHA Type | Description |
|----------|-------------|
| **Source SHA** | Git commit used to build the images (`git rev-parse HEAD`). |
| **API build SHA** | `BUILD_SHA` embedded in the API image at build time. Exposed via `/api/v1/health` `buildSha` field. |
| **Web build SHA** | `BUILD_SHA` embedded in the frontend image at build time. Visible in Admin Dashboard system info. |
| **Content SHA** | Separate commit identifier for versioned course content, if applicable. |
| **Migration SHA** | Exact revision of migration scripts used for a data change, if applicable. |

Never assume these are automatically identical. An API-only deploy will have a different web build SHA than the API build SHA if the web image was not rebuilt.

---

## Record

```
Deployment timestamp:
Environment:            production
Operator:
Repository:             SM-Web-Systems/lms-crypto-production
Branch:                 main
Source SHA:
API build SHA:
Web build SHA:
Content repository:     (if applicable)
Content SHA:            (if applicable)
Migration script path:  (if applicable)
Migration script SHA:   (if applicable)
Services rebuilt:
Services deployed:
Services not restarted:
API health status:
API buildSha:
Frontend admin build SHA:
Database migration:     yes/no
Course/data migration:  yes/no
Rollback reference:     (last known-good image SHA or source revision)
Post-deployment verification:
```
