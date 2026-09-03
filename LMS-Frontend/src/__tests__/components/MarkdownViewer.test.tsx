import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { toApprovedRawUrl, MarkdownViewer } from '../../components/MarkdownViewer';

const PINNED = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const RAW_BASE = `https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/${PINNED}`;

// ── URL approval tests ──────────────────────────────────────────────────────

describe('toApprovedRawUrl', () => {
  it('MV-1: converts GitHub blob URL to pinned raw URL', () => {
    const url = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-1-intro/content/lesson.md`);
  });

  it('MV-2: converts raw.githubusercontent.com URL to pinned raw URL', () => {
    const url = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/main/module-2-technical/content/study-guide.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-2-technical/content/study-guide.md`);
  });

  it('MV-3: returns null for non-approved org', () => {
    const url = 'https://github.com/evil-org/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBeNull();
  });

  it('MV-4: returns null for non-approved repo', () => {
    const url = 'https://github.com/SM-Web-Systems/some-other-repo/blob/main/file.md';
    expect(toApprovedRawUrl(url)).toBeNull();
  });

  it('MV-5: returns null for non-GitHub URL', () => {
    expect(toApprovedRawUrl('https://example.com/file.md')).toBeNull();
  });

  it('MV-6: returns null for empty string', () => {
    expect(toApprovedRawUrl('')).toBeNull();
  });

  it('MV-7: returns null for invalid URL', () => {
    expect(toApprovedRawUrl('not-a-url')).toBeNull();
  });

  it('MV-8: handles www.github.com prefix', () => {
    const url = 'https://www.github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/module-5-defi-nfts/content/lesson.md';
    expect(toApprovedRawUrl(url)).toBe(`${RAW_BASE}/module-5-defi-nfts/content/lesson.md`);
  });

  it('MV-9: accepts both approved repo names', () => {
    const url1 = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/file.md';
    const url2 = 'https://github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/file.md';
    expect(toApprovedRawUrl(url1)).toBe(`${RAW_BASE}/file.md`);
    expect(toApprovedRawUrl(url2)).toBe(`${RAW_BASE}/file.md`);
  });

  it('MV-10: pins raw URLs to approved commit (ignores original commit)', () => {
    const url = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/abc123/module-1-intro/content/lesson.md';
    const result = toApprovedRawUrl(url);
    expect(result).toContain(PINNED);
    expect(result).not.toContain('abc123');
  });
});

// ── Rendering tests ─────────────────────────────────────────────────────────

const APPROVED_URL = 'https://github.com/SM-Web-Systems/vibe-coding-blockchain/blob/main/module-1-intro/content/lesson.md';

function mockFetchOk(body: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, { status: 200 }),
  );
}

function mockFetchFail(status = 404) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response('Not found', { status }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MarkdownViewer — rendering', () => {
  it('MV-RENDER-1: renders headings with correct semantic tags', async () => {
    mockFetchOk('# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull());
    expect(container.querySelector('h1')!.textContent).toBe('Heading 1');
    expect(container.querySelector('h2')!.textContent).toBe('Heading 2');
    expect(container.querySelector('h3')!.textContent).toBe('Heading 3');
    expect(container.querySelector('h4')!.textContent).toBe('Heading 4');
  });

  it('MV-RENDER-2: renders table with thead, tbody, th, and td', async () => {
    mockFetchOk('| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('table')).not.toBeNull());
    expect(container.querySelector('thead')).not.toBeNull();
    expect(container.querySelector('tbody')).not.toBeNull();
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('td').length).toBe(4);
  });

  it('MV-RENDER-3: wraps table in accessible scrolling container', async () => {
    mockFetchOk('| Col |\n|-----|\n| val |');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('table')).not.toBeNull());
    // DOM post-processing adds wrapper via useEffect
    await waitFor(() => expect(container.querySelector('.lms-markdown-table-wrap')).not.toBeNull());
    const wrap = container.querySelector('.lms-markdown-table-wrap')!;
    expect(wrap.getAttribute('role')).toBe('region');
    expect(wrap.getAttribute('tabindex')).toBe('0');
    expect(wrap.getAttribute('aria-label')).toBe('Data table');
  });

  it('MV-RENDER-4: table wrapper contains the table element', async () => {
    mockFetchOk('| H1 | H2 |\n|----|----|\n| a | b |');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('.lms-markdown-table-wrap')).not.toBeNull());
    const wrap = container.querySelector('.lms-markdown-table-wrap')!;
    expect(wrap.tagName).toBe('DIV');
    // Table structure intact inside wrapper
    expect(wrap.querySelector('thead th')).not.toBeNull();
    expect(wrap.querySelector('tbody td')).not.toBeNull();
  });

  it('MV-RENDER-5: table header cells have scope="col"', async () => {
    mockFetchOk('| Term | Definition |\n|------|------------|\n| Block | Data container |');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('.lms-markdown-table-wrap')).not.toBeNull());
    const ths = container.querySelectorAll('th');
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach(th => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('MV-RENDER-6: renders ordered and unordered lists', async () => {
    mockFetchOk('- Item A\n- Item B\n\n1. First\n2. Second');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('ul')).not.toBeNull());
    expect(container.querySelector('ol')).not.toBeNull();
    expect(container.querySelectorAll('li').length).toBe(4);
  });

  it('MV-RENDER-7: renders blockquote', async () => {
    mockFetchOk('> This is a quote');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('blockquote')).not.toBeNull());
    expect(container.querySelector('blockquote')!.textContent).toContain('This is a quote');
  });

  it('MV-RENDER-8: renders inline code and fenced code blocks safely', async () => {
    mockFetchOk('Use `inline code` here.\n\n```\nconst x = 1;\n```');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('code')).not.toBeNull());
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.querySelector('pre code')).not.toBeNull();
    expect(container.querySelector('pre')!.textContent).toContain('const x = 1;');
  });

  it('MV-RENDER-9: code blocks do not execute content', async () => {
    mockFetchOk('```\n<script>alert("xss")</script>\n```');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('pre')).not.toBeNull());
    expect(container.querySelector('script')).toBeNull();
  });

  it('MV-RENDER-10: links retain rel="noopener noreferrer" and target="_blank"', async () => {
    mockFetchOk('[Example](https://example.com)');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull());
    const link = container.querySelector('a[href="https://example.com"]')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('MV-RENDER-11: dangerous javascript: URLs are stripped', async () => {
    mockFetchOk('[Click](javascript:alert(1))');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('.lms-markdown-content')).not.toBeNull());
    // DOMPurify strips javascript: href — either no link or href is removed
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      expect(href).not.toMatch(/^javascript:/i);
    });
  });

  it('MV-RENDER-12: images constrained with alt text preserved', async () => {
    mockFetchOk('![Diagram](https://example.com/image.png)');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('Diagram');
  });

  it('MV-RENDER-13: renders horizontal rule', async () => {
    mockFetchOk('Above\n\n---\n\nBelow');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('hr')).not.toBeNull());
  });

  it('MV-RENDER-14: uses scoped lms-markdown-content class', async () => {
    mockFetchOk('# Hello');
    const { container } = render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(container.querySelector('.lms-markdown-content')).not.toBeNull());
  });
});

describe('MarkdownViewer — loading and error states', () => {
  it('MV-STATE-1: shows loading state', () => {
    mockFetchOk('# test');
    render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Loading content/)).toBeInTheDocument();
  });

  it('MV-STATE-2: shows error without raw URLs or stack traces', async () => {
    mockFetchFail(500);
    render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alertEl = screen.getByRole('alert');
    expect(alertEl.textContent).not.toContain('raw.githubusercontent.com');
    expect(alertEl.textContent).not.toContain(PINNED);
  });

  it('MV-STATE-3: error state shows retry button', async () => {
    mockFetchFail(500);
    render(<MarkdownViewer url={APPROVED_URL} title="Test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('MV-STATE-4: non-approved URL shows error immediately', async () => {
    render(<MarkdownViewer url="https://evil.com/file.md" title="Test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/not from an approved repository/)).toBeInTheDocument();
  });
});
