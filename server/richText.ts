import sanitizeHtml from 'sanitize-html';

// Text written in the news editor is stored as HTML. Only the formatting the editor offers is kept
// (headings, lists, links, tables, images uploaded to this server); scripts, styles and event
// handlers are removed, so what is shown to colleagues can never run code.

const UPLOADED_IMAGE = /^\/uploads\/[\w-]+\.(jpe?g|png|webp|gif)$/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'code',
    'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    img: ['src', 'alt'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  // Images must be files uploaded to the portal: no tracking pixels or pictures from outside.
  exclusiveFilter: (frame) => frame.tag === 'img' && !UPLOADED_IMAGE.test(frame.attribs.src ?? ''),
  transformTags: {
    // Outside links open in a new tab; links inside the portal (#news/..., /uploads/...) stay.
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const kept: sanitizeHtml.Attributes = href ? { href } : {};
      if (/^https?:/i.test(href)) Object.assign(kept, { target: '_blank', rel: 'noopener noreferrer' });
      return { tagName, attribs: kept };
    },
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** The words of a rich text, e.g. to check that it is not empty. */
export function richTextToPlain(html: string): string {
  return sanitizeHtml(html.replace(/<\/(p|h\d|li|tr|blockquote)>|<br\s*\/?>/gi, '$&\n'), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
