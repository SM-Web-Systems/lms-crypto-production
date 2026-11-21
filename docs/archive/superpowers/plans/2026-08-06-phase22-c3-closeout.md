# Phase 22 C3 Closeout — Email Template Extraction

## Summary

Extracted 3 hardcoded email templates from `emailService.ts` into a database-backed
template system with admin editing, `{{var}}`/`{{{var}}}` rendering, version tracking,
and RBAC-gated admin panel.

## What Changed

### New files (6)
- **emailTemplateService.ts** (BE): listTemplates, getTemplate, updateTemplate, renderTemplate, seedEmailTemplates
- **emailTemplates.ts** (route): GET/PUT /admin/email-templates, POST preview
- **email-templates.test.ts**: 6 BE tests (ET-1 through ET-6)
- **EmailTemplatePanel.tsx** (FE): list + edit + preview panel
- **emailTemplateService.ts** (FE): API service for template CRUD
- **EmailTemplatePanel.test.tsx**: 4 FE tests (ET-F1 through ET-F4)

### Modified files (8)
- **database.ts**: email_templates table + seed data + email.manage permission
- **schema.sql**: email_templates CREATE TABLE
- **emailService.ts**: 3 send functions now call renderTemplate with fallback
- **app.ts**: mount email template routes
- **setup.ts**: call seedEmailTemplates in test setup
- **AdminDashboard.tsx**: add EmailTemplatePanel

## Template System

| Feature | Implementation |
|---------|---------------|
| Storage | `email_templates` table (slug, category, subject, body_html, variables JSON) |
| Rendering | `{{var}}` → escaped, `{{{var}}}` → unescaped (URLs) |
| Versioning | `version` column auto-incremented on update |
| Admin | RBAC `email.manage` permission, 4 API endpoints |
| UI | EmailTemplatePanel in AdminDashboard |
| Fallback | Inline HTML used if template not found |

## Seeded Templates

| Slug | Category | Variables |
|------|----------|-----------|
| `enrollment` | enrollment | studentName, courseName, lmsName, loginUrl |
| `password-reset` | auth | userName, lmsName, resetUrl |
| `course-invitation` | invitation | courseName, lmsName, signupUrl |

## Verification

| Gate | Result |
|------|--------|
| TypeScript | 0 errors |
| Backend tests | 599/599 |
| Frontend tests | 121/121 |
| Vite build | Success |

## Tags

- `pre-phase22-c3-2026-08-06` (baseline)
- `phase22-c3-complete-2026-08-06` (release)

## Commit

`252790b` — feat: email template extraction with admin panel and variable rendering
