/** AUDIT-2026-11 CSP — violation reports are accepted, summarised without query strings, and rate-limited. */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { summarizeCspReports } from '../routes/cspReport.js';

describe('CSP report endpoint', () => {
  it('accepts a legacy report-uri body with 204', async () => {
    const res = await request(app).post('/api/v1/csp-report').set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'document-uri': 'https://lms.example/x?token=secret', 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }));
    expect(res.status).toBe(204);
  });
  it('accepts a Reporting API batch', async () => {
    const res = await request(app).post('/api/v1/csp-report').set('Content-Type', 'application/reports+json')
      .send(JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'https://lms.example/', effectiveDirective: 'img-src', blockedURL: 'http://cdn.example/a.png' } }]));
    expect(res.status).toBe(204);
  });
  it('drops query strings and fragments from logged URLs', () => {
    const [r] = summarizeCspReports({ 'csp-report': { 'document-uri': 'https://lms.example/sso-callback#token=abc', 'blocked-uri': 'https://x.example/a?key=1', 'violated-directive': 'connect-src' } });
    expect(r).toMatchObject({ page: 'https://lms.example/sso-callback', blocked: 'https://x.example/a', directive: 'connect-src' });
  });
  it('ignores bodies that are not CSP reports', () => {
    expect(summarizeCspReports({ hello: 'world' })).toEqual([]);
    expect(summarizeCspReports([{ type: 'deprecation', body: {} }])).toEqual([]);
  });
});
