import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

// Resolve the implementation Express actually uses, rather than a test-only copy.
const require = createRequire(import.meta.url);
const proxyaddr = require(require.resolve('proxy-addr', {
  paths: [require.resolve('express')],
})) as { compile(subnets: string[]): (address: string) => boolean };

describe('patched runtime dependency boundaries', () => {
  it('does not turn a short IPv4-mapped IPv6 subnet into trust for all IPv4 clients', () => {
    const trust = proxyaddr.compile(['::ffff:10.0.0.0/8']);
    expect(trust('203.0.113.10')).toBe(false);
    expect(trust('::ffff:203.0.113.10')).toBe(false);
    const privateSubnet = proxyaddr.compile(['::ffff:10.0.0.0/104']);
    expect(privateSubnet('10.1.2.3')).toBe(true);
    expect(privateSubnet('203.0.113.10')).toBe(false);
  });

  it('keeps course Markdown readable while removing active HTML and unsafe URLs', () => {
    const html = renderMarkdownToSafeHtml([
      '# Lesson',
      '**Read this** [reference](https://example.test/lesson)',
      '<img src="lesson.png" onerror="alert(1)">',
      '<a href="javascript:alert(1)" onclick="alert(1)">unsafe link</a>',
      '<script>alert(1)</script><iframe src="https://example.test"></iframe>',
      '<svg><a href="javascript:alert(1)">svg link</a></svg>',
    ].join('\n\n'));
    expect(html).toContain('<h1>Lesson</h1>');
    expect(html).toContain('<strong>Read this</strong>');
    expect(html).toContain('href="https://example.test/lesson"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('src="lesson.png"');
    expect(html).not.toMatch(/<script|<iframe|<svg|onerror=|onclick=|javascript:/i);
  });

  it('composes a real email with the new Nodemailer without contacting SMTP', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    try {
      const result = await transport.sendMail({
        from: 'LMS <no-reply@example.test>',
        to: 'Student <student@example.test>',
        subject: 'Your course invitation — welcome',
        html: '<p>Open your <a href="https://example.test/invite">invitation</a>.</p>',
      });
      expect(result.envelope).toEqual({
        from: 'no-reply@example.test', to: ['student@example.test'],
      });
      const message = JSON.parse(result.message);
      expect(message.subject).toBe('Your course invitation — welcome');
      expect(message.html).toContain('https://example.test/invite');
      expect(result.messageId).toBeTruthy();
    } finally {
      transport.close();
    }
  });
});
