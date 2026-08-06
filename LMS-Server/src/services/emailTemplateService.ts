/**
 * emailTemplateService — Phase 22 C3: database-backed email template management.
 *
 * Templates use {{var}} for HTML-escaped variables and {{{var}}} for unescaped
 * (URLs). Seed data matches the 3 original hardcoded templates from emailService.ts.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';

export interface EmailTemplate {
  id: string;
  slug: string;
  category: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
  version: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  slug: string;
  category: string;
  name: string;
  subject: string;
  body_html: string;
  variables: string;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: TemplateRow): EmailTemplate {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    variables: JSON.parse(row.variables),
    version: row.version,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function listTemplates(category?: string): EmailTemplate[] {
  const sql = category
    ? 'SELECT * FROM email_templates WHERE category = ? ORDER BY name'
    : 'SELECT * FROM email_templates ORDER BY name';
  const rows = (category
    ? db.prepare(sql).all(category)
    : db.prepare(sql).all()) as TemplateRow[];
  return rows.map(rowToTemplate);
}

export function getTemplate(slug: string): EmailTemplate | undefined {
  const row = db.prepare('SELECT * FROM email_templates WHERE slug = ?').get(slug) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : undefined;
}

export function updateTemplate(
  slug: string,
  data: { subject: string; bodyHtml: string },
  updatedBy: string,
): EmailTemplate | undefined {
  const existing = db.prepare('SELECT id FROM email_templates WHERE slug = ?').get(slug) as { id: string } | undefined;
  if (!existing) return undefined;

  db.prepare(
    `UPDATE email_templates
     SET subject = ?, body_html = ?, version = version + 1, updated_by = ?, updated_at = datetime('now')
     WHERE slug = ?`,
  ).run(data.subject, data.bodyHtml, updatedBy, slug);

  return getTemplate(slug);
}

/**
 * Render a template by slug with the given variables.
 * {{var}} → HTML-escaped, {{{var}}} → unescaped (for URLs).
 */
export function renderTemplate(
  slug: string,
  vars: Record<string, string>,
): { subject: string; html: string } | null {
  const tpl = getTemplate(slug);
  if (!tpl) return null;

  const replace = (text: string): string => {
    // Triple-brace first (unescaped) — order matters
    let result = text.replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => vars[key] ?? '');
    // Double-brace (escaped)
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ''));
    return result;
  };

  return {
    subject: replace(tpl.subject),
    html: replace(tpl.bodyHtml),
  };
}

// ─── Seed ────────────────────────────────────────────────────────────────────

export function seedEmailTemplates(): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO email_templates (id, slug, category, name, subject, body_html, variables, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
  );

  const seeds: Array<[string, string, string, string, string, string]> = [
    ['enrollment', 'enrollment', 'Course Enrollment',
     "You've been enrolled in {{courseName}}",
     `<p>Hi {{studentName}},</p>\n<p>You have been enrolled in <strong>{{courseName}}</strong> on <strong>{{lmsName}}</strong>.</p>\n<p><a href="{{{loginUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to access your course</a></p>\n<p>If you have questions, contact your administrator.</p>`,
     '["studentName","courseName","lmsName","loginUrl"]'],
    ['password-reset', 'auth', 'Password Reset',
     'Reset your {{lmsName}} password',
     `<p>Hi {{userName}},</p>\n<p>We received a request to reset the password for your <strong>{{lmsName}}</strong> account.</p>\n<p><a href="{{{resetUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>\n<p>Or copy this link into your browser:</p>\n<p><code style="word-break:break-all;">{{{resetUrl}}}</code></p>\n<p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>`,
     '["userName","lmsName","resetUrl"]'],
    ['course-invitation', 'invitation', 'Course Invitation',
     "You've been invited to {{courseName}}",
     `<p>Hi,</p>\n<p>You have been invited to join <strong>{{courseName}}</strong> on <strong>{{lmsName}}</strong>.</p>\n<p>Click the button below to create your account and access the course immediately:</p>\n<p><a href="{{{signupUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation &amp; sign up</a></p>\n<p>Or copy this link: <code>{{{signupUrl}}}</code></p>\n<p>This invitation link can be used once.</p>`,
     '["courseName","lmsName","signupUrl"]'],
    ['cohort-payment-reminder', 'payment', 'Cohort Payment Reminder',
     'Payment reminder for {{courseName}}',
     `<p>Hi {{studentName}},</p>\n<p>This is a reminder that payment is pending for <strong>{{courseName}}</strong> (cohort: {{cohortName}}) on <strong>{{lmsName}}</strong>.</p>\n<p><a href="{{{loginUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to complete payment</a></p>\n<p>If you have questions, contact your administrator.</p>`,
     '["studentName","courseName","cohortName","lmsName","loginUrl"]'],
  ];

  for (const [slug, category, name, subject, bodyHtml, variables] of seeds) {
    insert.run(uuidv4(), slug, category, name, subject, bodyHtml, variables);
  }
}

