import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * POST /api/v1/csp-report — browsers send Content-Security-Policy violation reports here
 * (report-uri in LMS-Frontend/nginx.docker.conf). Reports are logged so the policy can be moved
 * from Report-Only to enforcing once real traffic shows no violations. Public, small and rate-limited.
 */
const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const parser = express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' });

/** Strip query strings and fragments so tokens or personal data in URLs are not logged. */
function clean(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.split(/[?#]/)[0].slice(0, 300);
}

type LegacyReport = { 'csp-report'?: Record<string, unknown> };
type ReportingApiEntry = { type?: string; body?: Record<string, unknown> };

export function summarizeCspReports(body: unknown): Array<Record<string, string | undefined>> {
  const raw: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const entry of body as ReportingApiEntry[]) if (entry?.type === 'csp-violation' && entry.body) raw.push(entry.body);
  } else if (body && typeof body === 'object' && (body as LegacyReport)['csp-report']) {
    raw.push((body as LegacyReport)['csp-report']!);
  }
  return raw.slice(0, 20).map(r => ({
    directive: clean(r['effective-directive'] ?? r['violated-directive'] ?? r.effectiveDirective),
    blocked: clean(r['blocked-uri'] ?? r.blockedURL),
    page: clean(r['document-uri'] ?? r.documentURL),
    source: clean(r['source-file'] ?? r.sourceFile),
    disposition: clean(r.disposition),
  }));
}

router.post('/csp-report', limiter, parser, (req, res) => {
  for (const report of summarizeCspReports(req.body)) {
    logger.warn({ module: 'csp', ...report, userAgent: clean(req.get('user-agent')) }, 'CSP violation');
  }
  res.status(204).end();
});

export default router;
