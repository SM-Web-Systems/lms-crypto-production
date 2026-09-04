import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';

// ── Approved GitHub content source ──────────────────────────────────────────

const APPROVED_ORG = 'SM-Web-Systems';
const PINNED_COMMIT = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const APPROVED_REPOS = [
  'blockchain-foundations-for-vibe-coding',
  'vibe-coding-blockchain',
];
const RAW_HOST = 'https://raw.githubusercontent.com';
const APPROVED_RAW_BASE = `${RAW_HOST}/${APPROVED_ORG}/blockchain-foundations-for-vibe-coding/${PINNED_COMMIT}`;

// Force new-tab links to have noopener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convert a GitHub blob/raw URL to an approved pinned raw URL.
 * Returns null if the URL is not from the approved org/repos.
 */
export function toApprovedRawUrl(url: string): string | null {
  const s = url.trim();
  if (!s) return null;

  try {
    const u = new URL(s);

    // Already a raw URL from an approved repo
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      // /org/repo/commit/path...
      if (parts[0] === APPROVED_ORG && APPROVED_REPOS.includes(parts[1])) {
        // Extract path after org/repo/commit
        const contentPath = parts.slice(3).join('/');
        return `${APPROVED_RAW_BASE}/${contentPath}`;
      }
      return null;
    }

    // GitHub blob URL: github.com/org/repo/blob/branch/path...
    if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === APPROVED_ORG && APPROVED_REPOS.includes(parts[1]) && parts[2] === 'blob') {
        // Extract path after org/repo/blob/branch
        const contentPath = parts.slice(4).join('/');
        return `${APPROVED_RAW_BASE}/${contentPath}`;
      }
      return null;
    }
  } catch {
    // Invalid URL
  }

  return null;
}

/**
 * Sanitize rendered HTML from markdown.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i',
      'code', 'pre', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'br', 'hr', 'span', 'div', 'dl', 'dt', 'dd',
      'sup', 'sub', 'del', 's',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'align'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** Approved alignment class allowlist */
const ALIGN_CLASSES: Record<string, string> = {
  left: 'lms-md-align-left',
  center: 'lms-md-align-center',
  right: 'lms-md-align-right',
};

/**
 * Post-process sanitized HTML to add accessible table wrappers,
 * scope attributes, and safe alignment classes.
 * Operates on already-sanitized content only.
 */
function enhanceTablesInDom(container: HTMLElement): void {
  const tables = container.querySelectorAll('table');
  tables.forEach((table) => {
    // Convert align attributes to approved class names on th and td
    table.querySelectorAll('th, td').forEach((cell) => {
      const align = cell.getAttribute('align');
      if (align && ALIGN_CLASSES[align]) {
        cell.classList.add(ALIGN_CLASSES[align]);
      }
      // Remove raw align attribute regardless
      cell.removeAttribute('align');
    });

    // Add scope="col" to header cells
    table.querySelectorAll('thead th').forEach((th) => {
      th.setAttribute('scope', 'col');
    });

    // Wrap table in accessible scroll container
    const wrapper = document.createElement('div');
    wrapper.className = 'lms-markdown-table-wrap';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Data table');
    wrapper.setAttribute('tabindex', '0');
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);

    // Track scroll position to hide/show right-edge gradient
    const updateScrollEnd = () => {
      const atEnd = wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 2;
      const noOverflow = wrapper.scrollWidth <= wrapper.clientWidth;
      wrapper.setAttribute('data-scrolled-end', String(atEnd || noOverflow));
    };
    wrapper.addEventListener('scroll', updateScrollEnd, { passive: true });
    // Initial check after layout
    requestAnimationFrame(updateScrollEnd);
  });
}

/**
 * Post-process sanitized HTML to add copy buttons to fenced code blocks.
 * Operates on already-sanitized content only.
 */
function enhanceCodeBlocksInDom(container: HTMLElement): void {
  const preBlocks = container.querySelectorAll('pre');
  preBlocks.forEach((pre) => {
    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    // Create wrapper for relative positioning
    const wrapper = document.createElement('div');
    wrapper.className = 'lms-markdown-code-wrap';
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Create copy button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lms-markdown-copy-btn';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
      '<span class="lms-markdown-copy-label">Copy</span>';

    btn.addEventListener('click', () => {
      const text = codeEl.textContent || '';
      try {
        navigator.clipboard.writeText(text).then(
          () => {
            btn.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
              '<span class="lms-markdown-copy-label">Copied</span>';
            btn.classList.add('lms-markdown-copy-btn--success');
            setTimeout(() => {
              btn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
                '<span class="lms-markdown-copy-label">Copy</span>';
              btn.classList.remove('lms-markdown-copy-btn--success');
            }, 2000);
          },
          () => { /* clipboard denied — button stays as-is */ },
        );
      } catch {
        /* clipboard API unavailable — button stays as-is */
      }
    });

    wrapper.appendChild(btn);
  });
}

interface MarkdownViewerProps {
  /** GitHub blob or raw URL to fetch markdown from */
  url: string;
  /** Item title for context */
  title: string;
  /** Optional download URL for a clean button */
  downloadUrl?: string;
  /** Download button label */
  downloadLabel?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  url,
  title,
  downloadUrl,
  downloadLabel = 'Download',
}) => {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const loadContent = () => {
    setLoading(true);
    setError(null);
    setHtml(null);

    const rawUrl = toApprovedRawUrl(url);
    if (!rawUrl) {
      setError('Content source is not from an approved repository.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`Failed to load content (${res.status})`);
        const md = await res.text();
        if (cancelled) return;
        const rendered = marked.parse(md, { breaks: true, gfm: true, async: false }) as string;
        setHtml(sanitizeHtml(rendered));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadContent, [url]);

  // Post-process DOM to wrap tables and enhance code blocks after HTML is set
  useEffect(() => {
    if (html && contentRef.current) {
      enhanceTablesInDom(contentRef.current);
      enhanceCodeBlocksInDom(contentRef.current);
    }
  }, [html]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-accent-teal" aria-hidden />
        <p className="text-sm text-neutral-500">Loading content&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 px-4" role="alert">
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadContent}
            className="inline-flex items-center gap-2 text-sm text-accent-teal font-medium hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Retry
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-accent-teal font-medium hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open source file
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8" aria-label={title}>
      {html && (
        <div
          ref={contentRef}
          className="lms-markdown-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {downloadUrl && (
        <div className="mt-8 pt-6 border-t border-neutral-200/80 flex justify-center">
          <a
            href={downloadUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            {downloadLabel}
          </a>
        </div>
      )}
    </div>
  );
};
