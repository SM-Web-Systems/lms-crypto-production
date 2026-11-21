import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * The web image's nginx (nginx.docker.conf) is the only place the SPA's CSP and Permissions-Policy are set.
 * nginx drops every server-level add_header in a location that has an add_header of its own, so each such
 * location must repeat them (or have none).
 */
const conf = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../nginx.docker.conf'), 'utf8')
  .split(/\r?\n/).map(line => line.replace(/#.*$/, '')).join('\n');

const locations = [...conf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)].map(m => ({ name: m[1].trim(), body: m[2] }));
const serverLevel = conf.replace(/location\s+[^{]+\{[^}]*\}/g, '');
const headerNames = (block: string) => [...block.matchAll(/add_header\s+(\S+)/g)].map(m => m[1]);
const headerValue = (name: string) => serverLevel.match(new RegExp(`add_header\\s+${name}\\s+"([^"]+)"\\s+always;`))?.[1];

describe('nginx.docker.conf security headers', () => {
  it('sends the CSP in Report-Only mode (rollout stage 1) and does not enforce it yet', () => {
    expect(headerNames(serverLevel)).toContain('Content-Security-Policy-Report-Only');
    expect(headerNames(serverLevel)).not.toContain('Content-Security-Policy');
  });

  it('keeps scripts to the same origin and reports violations to the API', () => {
    const csp = headerValue('Content-Security-Policy-Report-Only') ?? '';
    const directive = (name: string) => csp.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `));
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
    // Markdown lessons, flashcards and mind maps are fetched from GitHub raw files (MarkdownViewer).
    expect(directive('connect-src')).toBe("connect-src 'self' https://raw.githubusercontent.com");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive('report-uri')).toBe('report-uri /api/v1/csp-report');
  });

  it('turns off browser features the LMS never uses', () => {
    const policy = headerValue('Permissions-Policy') ?? '';
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) expect(policy).toContain(`${feature}=()`);
  });

  it.each(locations.map(l => [l.name, l.body] as const))('location %s does not drop the server-level security headers', (_name, body) => {
    const own = headerNames(body);
    if (own.length === 0) return; // inherits the server-level headers
    expect(own).toEqual(expect.arrayContaining(['Content-Security-Policy-Report-Only', 'Permissions-Policy']));
  });
});
