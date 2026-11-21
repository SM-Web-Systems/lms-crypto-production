import { toApprovedRawUrl } from './approvedContentUrl';

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
