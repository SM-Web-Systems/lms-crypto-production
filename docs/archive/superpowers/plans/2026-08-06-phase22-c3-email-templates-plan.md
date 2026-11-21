# Phase 22 C3 — Email Template Extraction Plan

## Task Breakdown

### T0: Branch setup + baseline verification
- Create branch `feat/phase22-c3-email-templates` from main
- Tag `pre-phase22-c3-2026-08-06`
- Verify baseline: 593 BE + 117 FE + tsc clean

### T1: Schema — email_templates table
- Add `CREATE TABLE IF NOT EXISTS email_templates` to `database.ts`
- Add same to `database/schema.sql` (for test runner)
- Columns: id, slug (UNIQUE), category, name, subject, body_html, variables (JSON), version, updated_by, created_at, updated_at
- Add `email.manage` permission to RBAC seed

### T2: emailTemplateService.ts
- `listTemplates(category?)` — SELECT with optional WHERE
- `getTemplate(slug)` — SELECT by slug
- `updateTemplate(slug, { subject, bodyHtml }, updatedBy)` — UPDATE + bump version
- `renderTemplate(slug, vars)` — fetch + replace `{{var}}`/`{{{var}}}`
- `seedEmailTemplates()` — INSERT OR IGNORE 3 default templates
- Call `seedEmailTemplates()` from database.ts init

### T3: Migrate existing templates
- Define 3 seed templates with the exact HTML from current emailService.ts
- Convert `${var}` interpolation to `{{var}}` / `{{{var}}}` syntax in body_html
- Enrollment: vars = studentName, courseName, lmsName, loginUrl
- Password reset: vars = userName, lmsName, resetUrl
- Course invitation: vars = courseName, lmsName, signupUrl

### T4: Update emailService.ts
- Import `renderTemplate` from emailTemplateService
- Each send function: call `renderTemplate(slug, vars)`
- Map function params to template variable names
- Fallback: if renderTemplate returns null, use inline HTML (safety net)
- Keep `escapeHtml()` in emailTemplateService (moved there)

### T5: Admin routes — emailTemplates.ts
- `GET /admin/email-templates` — list all, requires `email.manage`
- `GET /admin/email-templates/:slug` — get one
- `PUT /admin/email-templates/:slug` — update subject + bodyHtml
- `POST /admin/email-templates/:slug/preview` — render with sample data
- Mount in app.ts

### T6: Frontend — EmailTemplatePanel + service
- `emailTemplateService.ts` (FE) — API calls for list/get/update/preview
- `EmailTemplatePanel.tsx` — list view + expand to edit + preview
- Add as tab in AdminDashboard.tsx

### T7: Backend tests (6)
- ET-1: seed creates 3 templates
- ET-2: renderTemplate escapes `{{var}}`
- ET-3: renderTemplate doesn't escape `{{{var}}}`
- ET-4: updateTemplate bumps version
- ET-5: GET /admin/email-templates returns list
- ET-6: PUT /admin/email-templates/:slug updates

### T8: Frontend tests (4)
- ET-F1: panel renders template list
- ET-F2: click shows edit form
- ET-F3: save calls API with payload
- ET-F4: preview shows rendered HTML

### T9: Verification gates
- tsc --noEmit (FE + BE)
- 599/599 BE tests
- 121/121 FE tests
- Vite production build

### T10: Merge + tag + closeout
- Merge to main
- Tag `phase22-c3-complete-2026-08-06`
- Write closeout doc
- Update MEMORY.md

## Dependencies

```
T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10
         T1 ─┬─ T2 (service needs table)
              └─ T3 (seed needs table)
         T2 ─── T4 (emailService needs renderTemplate)
         T5 ─── T6 (FE needs API routes)
         T7+T8 (tests after implementation)
```

## Verification Gates

After each task: tsc check. After T8: full test suite. After T9: all gates.
