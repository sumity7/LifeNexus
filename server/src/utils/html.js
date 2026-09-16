import sanitizeHtml from 'sanitize-html';

const NOTE_HTML_OPTIONS = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'u', 'mark', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'hr', 'label', 'input', 'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    input: ['type', 'checked', 'disabled'],
    code: ['class'],
    pre: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    input: (tagName, attribs) =>
      attribs.type === 'checkbox'
        ? { tagName, attribs: { type: 'checkbox', ...(attribs.checked !== undefined && { checked: 'checked' }) } }
        : { tagName: 'span', attribs: {} },
  },
};

export const sanitizeNoteHtml = (html = '') => sanitizeHtml(html, NOTE_HTML_OPTIONS);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function htmlToText(html = '') {
  const spaced = html.replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>|<br\s*\/?>/gi, '$& ');
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}
