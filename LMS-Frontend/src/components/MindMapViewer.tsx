import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2, ChevronRight, ChevronDown } from 'lucide-react';
import { toApprovedRawUrl } from './MarkdownViewer';

// ── Schema ────────────────────────────────────────────────────────────────────

export interface MindMapNode {
  name: string;
  children?: MindMapNode[];
}

// ── Validation ────────────────────────────────────────────────────────────────

const MAX_NODES = 200;
const MAX_DEPTH = 10;
const MAX_PAYLOAD_BYTES = 100 * 1024; // 100 KB
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ALLOWED_KEYS = new Set(['name', 'children']);

export interface ValidationResult {
  valid: boolean;
  tree: MindMapNode | null;
  nodeCount: number;
  maxDepth: number;
  error?: string;
}

function validateNode(
  node: unknown,
  depth: number,
  counter: { count: number },
): string | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return 'Invalid node: must be a plain object.';
  }

  const obj = node as Record<string, unknown>;

  // Check for forbidden/extra keys
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return `Forbidden key "${key}" detected.`;
    }
    if (!ALLOWED_KEYS.has(key)) {
      return `Unexpected key "${key}" in node.`;
    }
  }

  // Validate name
  if (typeof obj.name !== 'string') {
    return 'Node missing required "name" string field.';
  }
  if (obj.name.trim().length === 0) {
    return 'Node has empty name.';
  }

  counter.count++;
  if (counter.count > MAX_NODES) {
    return `Exceeded maximum node count of ${MAX_NODES}.`;
  }
  if (depth > MAX_DEPTH) {
    return `Exceeded maximum depth of ${MAX_DEPTH}.`;
  }

  // Validate children
  if ('children' in obj) {
    if (!Array.isArray(obj.children)) {
      return 'Node "children" must be an array.';
    }
    for (const child of obj.children) {
      const err = validateNode(child, depth + 1, counter);
      if (err) return err;
    }
  }

  return null;
}

export function validateMindMap(raw: string): ValidationResult {
  if (new Blob([raw]).size > MAX_PAYLOAD_BYTES) {
    return { valid: false, tree: null, nodeCount: 0, maxDepth: 0, error: 'Payload exceeds maximum size.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, tree: null, nodeCount: 0, maxDepth: 0, error: 'Invalid JSON.' };
  }

  const counter = { count: 0 };
  const err = validateNode(parsed, 0, counter);
  if (err) {
    return { valid: false, tree: null, nodeCount: counter.count, maxDepth: 0, error: err };
  }

  // Compute max depth
  function computeDepth(node: MindMapNode): number {
    if (!node.children || node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(computeDepth));
  }

  const tree = parsed as MindMapNode;
  const maxDepth = computeDepth(tree);

  return { valid: true, tree, nodeCount: counter.count, maxDepth };
}

// ── URL validation ────────────────────────────────────────────────────────────

/** Check if a URL is an approved BVC mind-map JSON source. */
export function isApprovedMindMapUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.pathname.endsWith('/mind-map.json') && toApprovedRawUrl(url) !== null;
  } catch {
    return false;
  }
}

// ── Tree layout ───────────────────────────────────────────────────────────────

interface LayoutNode {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
  depth: number;
}

const NODE_HEIGHT = 36;
const NODE_V_GAP = 10;
const NODE_H_GAP = 60;
const NODE_PADDING_X = 14;
const CHAR_WIDTH = 7.2;
const MAX_LABEL_CHARS = 40;

function truncateLabel(name: string): string {
  if (name.length <= MAX_LABEL_CHARS) return name;
  return name.slice(0, MAX_LABEL_CHARS - 1) + '\u2026';
}

function computeNodeWidth(name: string): number {
  const label = truncateLabel(name);
  return Math.max(80, label.length * CHAR_WIDTH + NODE_PADDING_X * 2);
}

/** Count leaf descendants (including self if leaf). */
function countLeaves(node: MindMapNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

/** Build layout tree with computed positions. */
function layoutTree(root: MindMapNode): { layout: LayoutNode; totalWidth: number; totalHeight: number } {
  // Horizontal tree: root on left, expanding right.
  // X = depth * (maxNodeWidth + gap), Y = leaf-based vertical allocation.

  // First pass: compute widths per depth level
  const depthMaxWidths: number[] = [];
  function collectWidths(node: MindMapNode, depth: number) {
    const w = computeNodeWidth(node.name);
    depthMaxWidths[depth] = Math.max(depthMaxWidths[depth] || 0, w);
    node.children?.forEach(c => collectWidths(c, depth + 1));
  }
  collectWidths(root, 0);

  // Compute cumulative X offsets per depth
  const depthX: number[] = [];
  let cumX = 0;
  for (let d = 0; d < depthMaxWidths.length; d++) {
    depthX[d] = cumX;
    cumX += depthMaxWidths[d] + NODE_H_GAP;
  }

  // Second pass: assign positions using leaf counting
  let leafCounter = 0;

  function buildLayout(node: MindMapNode, depth: number): LayoutNode {
    const w = depthMaxWidths[depth];
    const x = depthX[depth];

    const children: LayoutNode[] = (node.children || []).map(c => buildLayout(c, depth + 1));

    let y: number;
    if (children.length === 0) {
      y = leafCounter * (NODE_HEIGHT + NODE_V_GAP);
      leafCounter++;
    } else {
      // Center parent among its children
      const firstChildY = children[0].y;
      const lastChildY = children[children.length - 1].y;
      y = (firstChildY + lastChildY) / 2;
    }

    return { name: node.name, x, y, width: w, height: NODE_HEIGHT, children, depth };
  }

  const layout = buildLayout(root, 0);
  const totalLeaves = countLeaves(root);
  const totalHeight = totalLeaves * (NODE_HEIGHT + NODE_V_GAP) - NODE_V_GAP;
  const totalWidth = cumX - NODE_H_GAP;

  return { layout, totalWidth, totalHeight };
}

// ── SVG rendering ─────────────────────────────────────────────────────────────

const DEPTH_COLORS = [
  { bg: 'var(--c-mind-map-root-bg, #1b3a4b)', text: 'var(--c-mind-map-root-text, #ffffff)' },
  { bg: 'var(--c-mind-map-d1-bg, #2d5a6b)', text: 'var(--c-mind-map-d1-text, #ffffff)' },
  { bg: 'var(--c-mind-map-d2-bg, #e0f0f5)', text: 'var(--c-mind-map-d2-text, #1b3a4b)' },
  { bg: 'var(--c-mind-map-d3-bg, #f0f7fa)', text: 'var(--c-mind-map-d3-text, #2d5a6b)' },
];

function renderEdges(node: LayoutNode, edges: React.ReactElement[]) {
  for (const child of node.children) {
    const x1 = node.x + node.width;
    const y1 = node.y + node.height / 2;
    const x2 = child.x;
    const y2 = child.y + child.height / 2;
    const midX = (x1 + x2) / 2;
    edges.push(
      <path
        key={`e-${node.x}-${node.y}-${child.x}-${child.y}`}
        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
        className="lms-mind-map-edge"
        fill="none"
      />
    );
    renderEdges(child, edges);
  }
}

function renderNodes(node: LayoutNode, nodes: React.ReactElement[]) {
  const colors = DEPTH_COLORS[Math.min(node.depth, DEPTH_COLORS.length - 1)];
  const label = truncateLabel(node.name);
  const rx = node.depth === 0 ? 8 : 6;

  nodes.push(
    <g key={`n-${node.x}-${node.y}`}>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={rx}
        ry={rx}
        fill={colors.bg}
        className="lms-mind-map-node"
      />
      <text
        x={node.x + node.width / 2}
        y={node.y + node.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={colors.text}
        className="lms-mind-map-label"
        fontSize={node.depth === 0 ? 13 : 11.5}
        fontWeight={node.depth === 0 ? 700 : node.depth === 1 ? 600 : 400}
      >
        {label}
        {label !== node.name && <title>{node.name}</title>}
      </text>
      {label !== node.name && <title>{node.name}</title>}
    </g>
  );

  for (const child of node.children) {
    renderNodes(child, nodes);
  }
}

// ── Text outline ──────────────────────────────────────────────────────────────

function OutlineNode({ node }: { node: MindMapNode }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li className="lms-mind-map-outline-item">
      <span className="lms-mind-map-outline-row">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="lms-mind-map-outline-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              : <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            }
          </button>
        ) : (
          <span className="lms-mind-map-outline-bullet" aria-hidden />
        )}
        <span>{node.name}</span>
      </span>
      {hasChildren && expanded && (
        <ul className="lms-mind-map-outline-children">
          {node.children!.map((child, i) => (
            <OutlineNode key={i} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MindMapViewerProps {
  url: string;
  title: string;
  itemId: string;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.2;
const SVG_PADDING = 40;

export const MindMapViewer: React.FC<MindMapViewerProps> = ({ url, title, itemId: _itemId }) => {
  const [tree, setTree] = useState<MindMapNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [outlineOpen, setOutlineOpen] = useState(false);

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  const loadContent = useCallback(() => {
    setLoading(true);
    setError(null);
    setTree(null);

    const rawUrl = toApprovedRawUrl(url);
    if (!rawUrl) {
      setError('Content source is not from an approved repository.');
      setLoading(false);
      return;
    }

    // Validate it's a mind-map.json URL
    try {
      const u = new URL(rawUrl);
      if (!u.pathname.endsWith('/mind-map.json')) {
        setError('Content source is not a recognized mind map file.');
        setLoading(false);
        return;
      }
    } catch {
      setError('Invalid content URL.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`Failed to load mind map (${res.status})`);
        const text = await res.text();
        if (cancelled) return;

        const result = validateMindMap(text);
        if (!result.valid || !result.tree) {
          setError('Unable to display this mind map. The content format is not supported.');
          return;
        }

        setTree(result.tree);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load mind map');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  useEffect(loadContent, [loadContent]);

  // Compute layout
  const layoutData = tree ? layoutTree(tree) : null;

  // Reset view
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(1)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(1)));
  }, []);

  // Pointer drag pan
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // left button only
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom if Ctrl/Cmd is held to avoid hijacking scroll
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(1))));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-accent-teal" aria-hidden />
        <p className="text-sm text-neutral-500">Loading mind map&hellip;</p>
      </div>
    );
  }

  if (error || !tree || !layoutData) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="alert">
        <p className="text-sm text-red-600 font-medium">{error || 'Unable to display this mind map.'}</p>
        <button
          type="button"
          onClick={loadContent}
          className="inline-flex items-center gap-2 text-sm text-accent-teal font-medium hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  const { layout, totalWidth, totalHeight } = layoutData;
  const svgW = totalWidth + SVG_PADDING * 2;
  const svgH = totalHeight + SVG_PADDING * 2;

  const edges: React.ReactElement[] = [];
  renderEdges(layout, edges);
  const nodes: React.ReactElement[] = [];
  renderNodes(layout, nodes);

  return (
    <div className="lms-mind-map-container" data-testid="mind-map-viewer">
      {/* Toolbar */}
      <div className="lms-mind-map-toolbar" role="toolbar" aria-label="Mind map controls">
        <button type="button" onClick={zoomIn} className="lms-mind-map-btn" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={zoomOut} className="lms-mind-map-btn" aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={resetView} className="lms-mind-map-btn" aria-label="Reset view">
          <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
        <span className="lms-mind-map-zoom-label" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* SVG viewport */}
      <div
        ref={svgContainerRef}
        className="lms-mind-map-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label={`Mind map: ${title}. Use the text outline below for an accessible version.`}
        tabIndex={-1}
      >
        <svg
          width={svgW * zoom}
          height={svgH * zoom}
          viewBox={`${-SVG_PADDING - pan.x / zoom} ${-SVG_PADDING - pan.y / zoom} ${svgW} ${svgH}`}
          className="lms-mind-map-svg"
          aria-hidden="true"
        >
          <g>{edges}</g>
          <g>{nodes}</g>
        </svg>
      </div>

      {/* Accessible text outline */}
      <div className="lms-mind-map-outline">
        <button
          type="button"
          onClick={() => setOutlineOpen(!outlineOpen)}
          className="lms-mind-map-outline-header"
          aria-expanded={outlineOpen}
        >
          {outlineOpen
            ? <ChevronDown className="h-4 w-4" aria-hidden />
            : <ChevronRight className="h-4 w-4" aria-hidden />
          }
          <span>Text outline</span>
        </button>
        {outlineOpen && (
          <ul className="lms-mind-map-outline-root" role="tree" aria-label={`${title} outline`}>
            <OutlineNode node={tree} />
          </ul>
        )}
      </div>
    </div>
  );
};
