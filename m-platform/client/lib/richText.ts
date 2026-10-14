import DOMPurify from 'isomorphic-dompurify';
const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'BR',
  'P',
  'DIV',
  'SPAN',
  'UL',
  'OL',
  'LI',
  'A',
]);

/** Removes a node but keeps its children (unwraps). */
function unwrap(node: Element): void {
  const parent = node.parentNode;
  if (!parent) {
    node.remove();
    return;
  }
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
}

/**
 * Whitelist sanitizer for HTML produced by the RichTextEditor. Strips scripts,
 * event handlers and disallowed tags while keeping basic formatting. Falls back
 * to escaping when DOMParser is unavailable (SSR).
 */
export function sanitizeRichTextHtml(value: string): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: Array.from(ALLOWED_TAGS),
    KEEP_CONTENT: false
  });
}

const MANUALS_WORD_TAGS = new Set([
  ...Array.from(ALLOWED_TAGS),
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TH',
  'TD',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'IMG',
  'FIGURE',
  'FIGCAPTION',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'HR',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'COLGROUP',
  'COL',
]);

/**
 * Sanitize Word→HTML preview for Manuals (broader allowlist than rich text;
 * still strips scripts/handlers).
 */
export function sanitizeManualsWordHtml(value: string): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: Array.from(MANUALS_WORD_TAGS),
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'srcdoc'],
    KEEP_CONTENT: false
  });
}

/** Converts RichTextEditor HTML to readable plain text (for exports / previews). */
export function richTextToPlainText(value: string): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (!/[<&]/.test(raw)) return raw.trim();
  let html = raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\u2022 ');
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const doc = new window.DOMParser().parseFromString(html, 'text/html');
    html = doc.body?.textContent ?? '';
  } else {
    html = html.replace(/<[^>]*>/g, '');
  }
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** True when the rich-text value has no visible content. */
export function isRichTextEmpty(value: string): boolean {
  return richTextToPlainText(value).length === 0;
}
