import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Configure marked for safe output (no mangle/headerIds to keep output clean)
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert raw markdown to sanitized HTML safe for storage and rendering.
 * Uses DOMPurify to strip XSS vectors (scripts, event handlers, iframes, etc.).
 */
export function renderMarkdownToSafeHtml(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i',
      'code', 'pre', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'br', 'hr', 'span', 'div', 'dl', 'dt', 'dd',
      'sup', 'sub', 'del', 's',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'title',
      'class',
    ],
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  });
}
