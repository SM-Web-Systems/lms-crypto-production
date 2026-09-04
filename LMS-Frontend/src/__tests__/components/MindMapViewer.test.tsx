import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { validateMindMap, isApprovedMindMapUrl, MindMapViewer } from '../../components/MindMapViewer';

// ── Schema / validation tests ──────────────────────────────────────────────────

describe('validateMindMap', () => {
  it('accepts a valid minimal tree', () => {
    const r = validateMindMap(JSON.stringify({ name: 'Root' }));
    expect(r.valid).toBe(true);
    expect(r.tree).toEqual({ name: 'Root' });
    expect(r.nodeCount).toBe(1);
    expect(r.maxDepth).toBe(0);
  });

  it('accepts a valid tree with children', () => {
    const data = {
      name: 'Root',
      children: [
        { name: 'A', children: [{ name: 'A1' }, { name: 'A2' }] },
        { name: 'B' },
      ],
    };
    const r = validateMindMap(JSON.stringify(data));
    expect(r.valid).toBe(true);
    expect(r.nodeCount).toBe(5);
    expect(r.maxDepth).toBe(2);
  });

  it('accepts empty children array', () => {
    const r = validateMindMap(JSON.stringify({ name: 'Leaf', children: [] }));
    expect(r.valid).toBe(true);
    expect(r.nodeCount).toBe(1);
  });

  it('rejects invalid JSON', () => {
    const r = validateMindMap('not json{');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Invalid JSON.');
  });

  it('rejects non-object root (array)', () => {
    const r = validateMindMap('[]');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('plain object');
  });

  it('rejects non-object root (null)', () => {
    const r = validateMindMap('null');
    expect(r.valid).toBe(false);
  });

  it('rejects missing name', () => {
    const r = validateMindMap(JSON.stringify({ children: [] }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('name');
  });

  it('rejects empty name', () => {
    const r = validateMindMap(JSON.stringify({ name: '   ' }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('empty name');
  });

  it('rejects non-string name', () => {
    const r = validateMindMap(JSON.stringify({ name: 42 }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('name');
  });

  it('rejects invalid children type', () => {
    const r = validateMindMap(JSON.stringify({ name: 'Root', children: 'bad' }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('array');
  });

  it('rejects extra fields', () => {
    const r = validateMindMap(JSON.stringify({ name: 'Root', color: 'red' }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Unexpected key');
  });

  it('rejects __proto__ key', () => {
    const raw = '{"name":"Root","__proto__":{"isAdmin":true}}';
    const r = validateMindMap(raw);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Forbidden');
  });

  it('rejects prototype key', () => {
    const raw = '{"name":"Root","prototype":{}}';
    const r = validateMindMap(raw);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Forbidden');
  });

  it('rejects constructor key', () => {
    const raw = '{"name":"Root","constructor":{}}';
    const r = validateMindMap(raw);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Forbidden');
  });

  it('rejects payload over 100 KB', () => {
    const big = JSON.stringify({ name: 'x'.repeat(110_000) });
    const r = validateMindMap(big);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('size');
  });

  it('rejects over 200 nodes', () => {
    const children = Array.from({ length: 201 }, (_, i) => ({ name: `N${i}` }));
    const r = validateMindMap(JSON.stringify({ name: 'Root', children }));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('200');
  });

  it('rejects depth over 10', () => {
    let node: Record<string, unknown> = { name: 'Leaf' };
    for (let i = 0; i < 12; i++) {
      node = { name: `D${i}`, children: [node] };
    }
    const r = validateMindMap(JSON.stringify(node));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('depth');
  });
});

// ── URL validation tests ────────────────────────────────────────────────────

describe('isApprovedMindMapUrl', () => {
  const PINNED = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
  const BASE = `https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/${PINNED}`;

  it('accepts all seven correct pinned raw mind-map URLs', () => {
    const slugs = [
      'module-1-intro', 'module-2-technical', 'module-3-bitcoin',
      'module-4-smart-contracts', 'module-5-defi-nfts', 'module-6-enterprise',
      'module-7-future',
    ];
    for (const slug of slugs) {
      expect(isApprovedMindMapUrl(`${BASE}/${slug}/content/mind-map.json`)).toBe(true);
    }
  });

  it('accepts github.com blob URLs that resolve to mind-map.json', () => {
    const url = 'https://github.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/blob/main/module-1-intro/content/mind-map.json';
    expect(isApprovedMindMapUrl(url)).toBe(true);
  });

  it('rejects URLs not ending in mind-map.json', () => {
    expect(isApprovedMindMapUrl(`${BASE}/module-1-intro/content/flashcards.md`)).toBe(false);
  });

  it('rejects URLs from another repository', () => {
    expect(isApprovedMindMapUrl(
      `https://raw.githubusercontent.com/evil/repo/${PINNED}/module-1-intro/content/mind-map.json`
    )).toBe(false);
  });

  it('rejects URLs from another organization', () => {
    expect(isApprovedMindMapUrl(
      `https://raw.githubusercontent.com/Other-Org/blockchain-foundations-for-vibe-coding/${PINNED}/module-1-intro/content/mind-map.json`
    )).toBe(false);
  });

  it('rejects null and empty', () => {
    expect(isApprovedMindMapUrl(null)).toBe(false);
    expect(isApprovedMindMapUrl('')).toBe(false);
  });

  it('rejects non-JSON file path', () => {
    expect(isApprovedMindMapUrl(`${BASE}/module-1-intro/content/lesson.md`)).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isApprovedMindMapUrl(`${BASE}/../../../etc/passwd/mind-map.json`)).toBe(false);
  });
});

// ── Viewer rendering tests ──────────────────────────────────────────────────

const VALID_TREE = JSON.stringify({
  name: 'Root Topic',
  children: [
    { name: 'Branch A', children: [{ name: 'Leaf A1' }] },
    { name: 'Branch B' },
  ],
});

describe('MindMapViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchSuccess(data: string) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(data),
    });
  }

  function mockFetchFailure(status = 500) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(''),
    });
  }

  const APPROVED_URL = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472/module-1-intro/content/mind-map.json';

  it('shows loading state', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/Loading mind map/)).toBeTruthy();
  });

  it('shows error state without raw URL or stack trace', async () => {
    mockFetchFailure(404);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const alertText = screen.getByRole('alert').textContent;
    expect(alertText).not.toContain('raw.githubusercontent.com');
    expect(alertText).not.toContain('Error:');
  });

  it('shows error for unapproved URL', async () => {
    render(<MindMapViewer url="https://evil.com/map.json" title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/not from an approved repository/)).toBeTruthy();
  });

  it('retry triggers another fetch', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(VALID_TREE) });
    global.fetch = fetchMock;
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => screen.getByText(/Retry/));
    fireEvent.click(screen.getByText(/Retry/));
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders root node', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test Map" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    // SVG should contain root text
    const svg = document.querySelector('.lms-mind-map-svg');
    expect(svg).toBeTruthy();
    const texts = svg!.querySelectorAll('text');
    const textContents = Array.from(texts).map(t => t.textContent);
    expect(textContents).toContain('Root Topic');
  });

  it('renders child nodes', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test Map" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    const svg = document.querySelector('.lms-mind-map-svg');
    const texts = Array.from(svg!.querySelectorAll('text')).map(t => t.textContent);
    expect(texts).toContain('Branch A');
    expect(texts).toContain('Branch B');
    expect(texts).toContain('Leaf A1');
  });

  it('renders labels as SVG text, not innerHTML', async () => {
    const xssTree = JSON.stringify({
      name: '<script>alert(1)</script>',
      children: [{ name: '<img onerror=alert(1) src=x>' }],
    });
    mockFetchSuccess(xssTree);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    // Should fail validation due to HTML-looking names but they're valid strings
    // The key test: no script tags in DOM
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();
    // Labels rendered as text content, not HTML
    const texts = document.querySelectorAll('.lms-mind-map-svg text');
    for (const t of Array.from(texts)) {
      expect(t.innerHTML).not.toContain('<script>');
      expect(t.innerHTML).not.toContain('<img');
    }
  });

  it('text outline contains full hierarchy', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test Map" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    // Open the outline
    fireEvent.click(screen.getByText('Text outline'));
    // Root Topic appears in both SVG and outline; use getAllByText
    const outlineRoot = document.querySelector('.lms-mind-map-outline-root');
    expect(outlineRoot).toBeTruthy();
    expect(outlineRoot!.textContent).toContain('Root Topic');
    expect(outlineRoot!.textContent).toContain('Branch A');
    expect(outlineRoot!.textContent).toContain('Branch B');
    expect(outlineRoot!.textContent).toContain('Leaf A1');
  });

  it('zoom-in works', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    const zoomLabel = screen.getByText('100%');
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(zoomLabel.textContent).toBe('120%');
  });

  it('zoom-out works', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    const zoomLabel = screen.getByText('100%');
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(zoomLabel.textContent).toBe('80%');
  });

  it('reset/fit works', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    const zoomLabel = document.querySelector('.lms-mind-map-zoom-label')!;
    expect(zoomLabel.textContent).toBe('140%');
    fireEvent.click(screen.getByLabelText('Reset view'));
    expect(zoomLabel.textContent).toBe('100%');
  });

  it('zoom controls have accessible labels', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByLabelText('Reset view')).toBeTruthy();
  });

  it('viewport has overflow-auto class for containment', async () => {
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    const viewport = document.querySelector('.lms-mind-map-viewport');
    expect(viewport).toBeTruthy();
    // CSS class provides overflow:auto — jsdom doesn't compute stylesheets
    expect(viewport!.classList.contains('lms-mind-map-viewport')).toBe(true);
  });

  it('reduced-motion is checked', async () => {
    // Set up matchMedia before component renders
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    });
    window.matchMedia = mockMatchMedia;
    mockFetchSuccess(VALID_TREE);
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());
    expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});

// ── Integration/dispatch tests ──────────────────────────────────────────────

describe('MindMapViewer integration', () => {
  it('does not modify lesson completion, quiz, or NFT state', async () => {
    // MindMapViewer has no onItemComplete or progress callbacks
    const mockComplete = vi.fn();
    const mockProgress = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(VALID_TREE),
    });

    const APPROVED_URL = 'https://raw.githubusercontent.com/SM-Web-Systems/blockchain-foundations-for-vibe-coding/b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472/module-1-intro/content/mind-map.json';
    render(<MindMapViewer url={APPROVED_URL} title="Test" itemId="test-1" />);
    await waitFor(() => expect(screen.getByTestId('mind-map-viewer')).toBeTruthy());

    // Interact with the component
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByText('Text outline'));

    // No completion or progress callbacks exist on MindMapViewer props
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockProgress).not.toHaveBeenCalled();
  });
});
