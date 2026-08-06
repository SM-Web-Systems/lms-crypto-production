/**
 * emailTemplates — Phase 22 C3: admin endpoints for email template management.
 */

import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';
import {
  listTemplates,
  getTemplate,
  updateTemplate,
  renderTemplate,
} from '../services/emailTemplateService.js';

const router = Router();

// GET /admin/email-templates — list all templates
router.get('/admin/email-templates', authenticate, requirePermission('email.manage'), (req: AuthRequest, res: Response): void => {
  const category = req.query.category as string | undefined;
  const templates = listTemplates(category);
  res.json({ success: true, data: { templates } });
});

// GET /admin/email-templates/:slug — get single template
router.get('/admin/email-templates/:slug', authenticate, requirePermission('email.manage'), (req: AuthRequest, res: Response): void => {
  const template = getTemplate(req.params.slug);
  if (!template) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Template not found' } });
    return;
  }
  res.json({ success: true, data: template });
});

// PUT /admin/email-templates/:slug — update template
router.put('/admin/email-templates/:slug', authenticate, requirePermission('email.manage'), (req: AuthRequest, res: Response): void => {
  const { subject, bodyHtml } = req.body;
  if (!subject || !bodyHtml) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'subject and bodyHtml are required' } });
    return;
  }

  const updated = updateTemplate(req.params.slug, { subject, bodyHtml }, req.user!.userId);
  if (!updated) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Template not found' } });
    return;
  }
  res.json({ success: true, data: updated });
});

// POST /admin/email-templates/:slug/preview — render with sample data
router.post('/admin/email-templates/:slug/preview', authenticate, requirePermission('email.manage'), (req: AuthRequest, res: Response): void => {
  const template = getTemplate(req.params.slug);
  if (!template) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Template not found' } });
    return;
  }

  // Build sample variables from the template's variable list
  const sampleVars: Record<string, string> = {};
  for (const v of template.variables) {
    if (v.toLowerCase().includes('url')) {
      sampleVars[v] = 'https://example.com/sample-link';
    } else if (v.toLowerCase().includes('name')) {
      sampleVars[v] = 'Jane Doe';
    } else {
      sampleVars[v] = `[${v}]`;
    }
  }

  const rendered = renderTemplate(req.params.slug, sampleVars);
  if (!rendered) {
    res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Render failed' } });
    return;
  }
  res.json({ success: true, data: { subject: rendered.subject, html: rendered.html } });
});

export default router;
