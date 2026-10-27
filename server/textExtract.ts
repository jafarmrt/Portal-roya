import fs from 'fs/promises';
import path from 'path';
import { and, eq, isNull } from 'drizzle-orm';
import { normalizeForSearch } from '../shared/search.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { documents } from './db/schema.js';
import { decodeXml, unzip } from './spreadsheet.js';

// Reads the words of uploaded documents so search can look inside them. Everything runs on this
// server (PDF through pdf.js, Office files are zip archives of XML); old binary .doc/.xls/.ppt
// files and scanned PDFs without a text layer give no text.

/** Enough for a long rulebook; the rest of a very large file is not searched. */
const MAX_CHARS = 300_000;

const ARABIC_SCRIPT = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-z]/g;

interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Puts a page's pieces of text in reading order. PDF writers differ: some store each letter on its
 * own, in the order it is drawn (left to right, so a Persian line comes out backwards). Pieces are
 * grouped into lines by height on the page and read right to left on lines that are mostly Persian.
 */
export function pageText(items: PdfItem[]): string {
  const lines: { y: number; items: PdfItem[] }[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= Math.max(2, item.height * 0.4));
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .map(({ items: parts }) => {
      const joined = parts.map((p) => p.str).join('');
      const rtl = (joined.match(ARABIC_SCRIPT)?.length ?? 0) > (joined.match(LATIN)?.length ?? 0);
      const ordered = [...parts].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
      let text = '';
      ordered.forEach((part, i) => {
        const prev = ordered[i - 1];
        // Writers that store whole words leave a gap instead of a space character.
        const gap = prev ? (rtl ? prev.x - (part.x + part.width) : part.x - (prev.x + prev.width)) : 0;
        if (prev && gap > Math.max(part.height, prev.height) * 0.2 && !/\s$/.test(text) && !/^\s/.test(part.str)) text += ' ';
        text += part.str;
      });
      return text;
    })
    .join('\n');
}

async function pdfText(file: Buffer) {
  // Loaded only when a PDF is read: pdf.js is large.
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(file), { verbosity: 0 });
  try {
    const pages: string[] = [];
    let length = 0;
    for (let n = 1; n <= pdf.numPages && length < MAX_CHARS; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) =>
        'str' in item && item.str ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }] : [],
      );
      const text = pageText(items).normalize('NFKC');
      pages.push(text);
      length += text.length;
    }
    return pages.join('\n');
  } finally {
    await pdf.cleanup();
  }
}

/** Paragraph text of Office XML parts: one line per paragraph, tags dropped. */
function officeXmlText(xml: string, paragraphEnd: RegExp) {
  return decodeXml(xml.replace(paragraphEnd, '\n').replace(/<w:tab\/>|<w:br\/>|<a:br\/>/g, ' ').replace(/<[^>]+>/g, ''));
}

function officeText(file: Buffer, parts: RegExp, paragraphEnd: RegExp) {
  const files = unzip(file, (name) => parts.test(name));
  return [...files.keys()]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((name) => officeXmlText(files.get(name)!, paragraphEnd))
    .join('\n');
}

/** The words of a file, or '' when its kind cannot be read. */
export async function extractText(file: Buffer, mimeType: string, fileName = ''): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  let text = '';
  if (mimeType === 'application/pdf' || ext === '.pdf') text = await pdfText(file);
  else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
    text = officeText(file, /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/, /<\/w:p>/g);
  } else if (ext === '.xlsx' || mimeType.includes('spreadsheetml')) {
    text = officeText(file, /^xl\/sharedStrings\.xml$/, /<\/si>/g);
  } else if (ext === '.pptx' || mimeType.includes('presentationml')) {
    text = officeText(file, /^ppt\/slides\/slide\d+\.xml$/, /<\/a:p>/g);
  } else if (mimeType === 'text/plain' || ext === '.txt') text = file.toString('utf8');
  return text.replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, MAX_CHARS);
}

/** Reads a document's current file and stores its words for search. Failures leave it empty. */
export async function indexDocumentText(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return;
  let text = '';
  if (doc.fileUrl.startsWith('/uploads/')) {
    try {
      const file = await fs.readFile(path.join(config.uploadDir, path.basename(doc.fileUrl)));
      text = normalizeForSearch(await extractText(file, doc.mimeType, doc.fileName));
    } catch (err) {
      console.warn(`Could not read the text of document ${doc.id} (${doc.fileName}):`, err instanceof Error ? err.message : err);
    }
  }
  // A newer version uploaded meanwhile is read by its own call.
  await db.update(documents).set({ contentText: text }).where(and(eq(documents.id, doc.id), eq(documents.fileUrl, doc.fileUrl)));
}

/** Reads the documents uploaded before search looked inside files, one at a time. */
export async function indexMissingDocumentTexts() {
  const missing = await db.select({ id: documents.id }).from(documents).where(isNull(documents.contentText));
  for (const { id } of missing) await indexDocumentText(id);
  if (missing.length > 0) console.log(`Read the text of ${missing.length} documents for search.`);
}
