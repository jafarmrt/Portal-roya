import { htmlToText, matches } from './search';

/**
 * A department page's text is editor HTML that can be long (headings, lists, a table).
 * These helpers pull out the short parts the department list and search need, without a DOM.
 */

const inline = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

/** One short paragraph for the department card: the first real paragraph, not a greeting or a title. */
export function aboutSummary(html: string, max = 220): string {
  if (!html) return '';
  for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    // Paragraphs inside lists and tables are items, not the introduction.
    const before = html.slice(0, m.index);
    const open = (tag: string) => (before.match(new RegExp(`<${tag}[\\s>]`, 'gi'))?.length ?? 0) > (before.match(new RegExp(`</${tag}>`, 'gi'))?.length ?? 0);
    if (open('li') || open('td') || open('th')) continue;
    const text = inline(m[1]);
    if (text.length >= 40) return clip(text, max);
  }
  return clip(inline(html), max);
}

function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

/** The topics the page is split into: its small headings, or its big ones when it has no small ones. */
export function aboutTopics(html: string): string[] {
  const of = (level: 2 | 3) => [...html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'gi'))].map((m) => inline(m[1])).filter(Boolean);
  const small = of(3);
  return small.length > 0 ? small : of(2);
}

export interface AboutHit {
  /** The list item (or paragraph) that matched. */
  text: string;
  /** The heading it sits under, if any. */
  topic?: string;
}

/** List items and paragraphs of the page that match a search, each with the heading above it. */
export function aboutHits(html: string, query: string, limit = 3): AboutHit[] {
  if (!html || query.trim().length < 2) return [];
  const hits: AboutHit[] = [];
  let topic: string | undefined;
  for (const m of html.matchAll(/<(h2|h3|li|p|td)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = inline(m[2]);
    if (!text) continue;
    const tag = m[1].toLowerCase();
    if (tag === 'h2' || tag === 'h3') {
      topic = text;
      continue;
    }
    if (hits.some((h) => h.text === text || h.text.includes(text))) continue;
    if (matches(query, text)) {
      hits.push({ text: clip(text, 140), topic });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
