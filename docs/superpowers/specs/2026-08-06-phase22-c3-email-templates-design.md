# Phase 22 C3 — Email Template Extraction Design

## Goal

Extract the 3 hardcoded email templates from `emailService.ts` into a database-backed
template system with admin editing, variable rendering, and version tracking.

## Current State

- **emailService.ts** contains 3 functions with inline HTML:
  - `sendEnrollmentEmail()` — subject + body with `${name}`, `${courseName}`, `${LMS_NAME}`, `${FRONTEND_URL}`
  - `sendPasswordResetEmail()` — subject + body with `${name}`, `${LMS_NAME}`, `${resetUrl}`
  - `sendCourseInviteEmail()` — subject + body with `${courseName}`, `${LMS_NAME}`, `${signupUrl}`
- `escapeHtml()` sanitizes user-supplied values before interpolation
- Nodemailer + Stalwart SMTP (port 587 STARTTLS), fire-and-forget pattern
- No template database, no template engine, no versioning

## Architecture

### Database: `email_templates` table

```sql
CREATE TABLE IF NOT EXISTS email_templates (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL CHECK (category IN ('enrollment','auth','invitation','payment','cohort','certificate','admin')),
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  variables  TEXT NOT NULL DEFAULT '[]',  -- JSON array of variable names
  version    INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Service: `emailTemplateService.ts`

Single-responsibility service with 5 functions:

- `listTemplates(category?)` — return all templates, optionally filtered
- `getTemplate(slug)` — return single template by slug
- `updateTemplate(slug, { subject, bodyHtml }, updatedBy)` — update template, bump version
- `renderTemplate(slug, variables)` — fetch template, replace `{{varName}}` with escaped values, return `{ subject, html }`
- `seedEmailTemplates()` — insert the 3 default templates if not present (called from database.ts init)

### Variable Rendering

Simple `{{variableName}}` syntax replaced via regex:
```typescript
text.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ''))
```

URLs are passed as variables but NOT escaped (they contain `://` which would break).
Solution: URL variables use a `{{{varName}}}` triple-brace syntax (unescaped), matching
Mustache convention. The renderer handles both:
- `{{var}}` → escaped
- `{{{var}}}` → unescaped (for URLs only)

### Seed Templates

3 templates seeded on database init:

| slug | category | variables |
|------|----------|-----------|
| `enrollment` | enrollment | studentName, courseName, lmsName, loginUrl |
| `password-reset` | auth | userName, lmsName, resetUrl |
| `course-invitation` | invitation | courseName, lmsName, signupUrl |

### emailService.ts Changes

Each `send*Email()` function is updated to:
1. Call `renderTemplate(slug, vars)` to get rendered subject + HTML
2. Pass rendered content to `transporter.sendMail()`
3. If template not found (edge case), fall back to inline HTML (safety net)

### Admin API Endpoints

Added to existing admin routes:

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/email-templates` | `email.manage` | List all templates |
| GET | `/admin/email-templates/:slug` | `email.manage` | Get single template |
| PUT | `/admin/email-templates/:slug` | `email.manage` | Update subject + body |
| POST | `/admin/email-templates/:slug/preview` | `email.manage` | Render with sample data |

### RBAC Permission

Add `email.manage` permission to the permissions table seed. Assign to `super_admin` and `admin` roles.

### Frontend: EmailTemplatePanel

Embedded in AdminDashboard (new tab). Features:
- Template list with category badges
- Click to expand/edit subject + body (textarea)
- Preview button renders with sample variables
- Save button calls PUT endpoint
- Shows version number and last updated timestamp

### Frontend Service: `emailTemplateService.ts`

```typescript
listTemplates(): Promise<EmailTemplate[]>
getTemplate(slug: string): Promise<EmailTemplate>
updateTemplate(slug: string, data: { subject: string; bodyHtml: string }): Promise<EmailTemplate>
previewTemplate(slug: string): Promise<{ subject: string; html: string }>
```

## Test Plan

### Backend (6 tests)

| ID | Description |
|----|-------------|
| ET-1 | `seedEmailTemplates()` creates 3 default templates |
| ET-2 | `renderTemplate()` replaces `{{var}}` with escaped values |
| ET-3 | `renderTemplate()` replaces `{{{var}}}` with unescaped values (URLs) |
| ET-4 | `updateTemplate()` bumps version number |
| ET-5 | `GET /admin/email-templates` returns template list |
| ET-6 | `PUT /admin/email-templates/:slug` updates template |

### Frontend (4 tests)

| ID | Description |
|----|-------------|
| ET-F1 | EmailTemplatePanel renders template list |
| ET-F2 | Clicking template shows edit form |
| ET-F3 | Save calls updateTemplate with correct payload |
| ET-F4 | Preview button shows rendered HTML |

## Files Changed

### New files (~4)
- `LMS-Server/src/services/emailTemplateService.ts`
- `LMS-Server/src/routes/emailTemplates.ts`
- `LMS-Server/src/__tests__/email-templates.test.ts`
- `LMS-Frontend/src/components/EmailTemplatePanel.tsx`

### Modified files (~6)
- `LMS-Server/src/config/database.ts` — add table + seed
- `LMS-Server/database/schema.sql` — add table definition
- `LMS-Server/src/services/emailService.ts` — use renderTemplate
- `LMS-Server/src/app.ts` — mount email template routes
- `LMS-Frontend/src/pages/AdminDashboard.tsx` — add EmailTemplatePanel tab
- `LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx` — no change (reference only)
- `LMS-Frontend/src/services/emailTemplateService.ts` — new FE service
- `LMS-Frontend/src/__tests__/components/EmailTemplatePanel.test.tsx` — new FE test

## Out of Scope

- New email types (payment receipts, cohort notifications, certificate emails) — future phases
- Template layout/partial inheritance
- Multi-language / i18n
- Email send history / audit trail
- WYSIWYG HTML editor (plain textarea sufficient)
- Template rollback to previous version (version tracking only, no rollback UI)

## Expected Test Growth

- Backend: 593 → 599 (+6)
- Frontend: 117 → 121 (+4)
- E2E: 12 (unchanged)
- Total: 720 (+10)
