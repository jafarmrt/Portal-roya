import { inflateRawSync } from 'zlib';

// Minimal readers for the two formats Excel saves: .xlsx (the first sheet only) and .csv.
// Kept dependency-free on purpose; formulas, styles and dates stored as numbers are not interpreted.

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

export class SpreadsheetError extends Error {}

/** Reads a spreadsheet into rows of trimmed cell text. */
export function readSpreadsheet(buffer: Buffer, filename: string): string[][] {
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (isZip) return readXlsx(buffer);
  if (/\.xls$/i.test(filename)) {
    throw new SpreadsheetError('فرمت قدیمی xls پشتیبانی نمی‌شود؛ فایل را در اکسل با فرمت xlsx یا CSV ذخیره کنید.');
  }
  return parseCsv(decodeText(buffer));
}

function decodeText(buffer: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    // Excel's plain "CSV" on Persian Windows is saved as Windows-1256.
    return new TextDecoder('windows-1256').decode(buffer);
  }
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

/** Extracts the files of a zip archive that `wanted` accepts. */
export function unzip(buffer: Buffer, wanted: (name: string) => boolean): Map<string, string> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError('فایل اکسل خراب است یا قابل خواندن نیست.');
  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, string>();
  for (let n = 0; n < count && pos + 46 <= buffer.length; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name) || localOffset + 30 > buffer.length) continue;

    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    let content: Buffer;
    if (method === 0) content = data;
    else if (method === 8) {
      try {
        content = inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch {
        throw new SpreadsheetError('فایل اکسل خراب است یا بیش از حد بزرگ است.');
      }
    } else throw new SpreadsheetError('فشرده‌سازی این فایل اکسل پشتیبانی نمی‌شود.');
    files.set(name, content.toString('utf8'));
  }
  return files;
}

export function decodeXml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, entity: string) => {
    const e = entity.toLowerCase();
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? '';
  });
}

/** Text of every <t> run inside a fragment (rich text is split into several runs). */
function textRuns(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

function columnIndex(ref: string) {
  let index = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function readXlsx(buffer: Buffer): string[][] {
  const files = unzip(buffer, (name) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name));
  const workbook = files.get('xl/workbook.xml');
  if (!workbook) throw new SpreadsheetError('این فایل، فایل اکسل (xlsx) معتبری نیست.');

  // The first sheet in workbook order, resolved through the relationships file.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const firstSheetRel = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = files.get('xl/_rels/workbook.xml.rels') ?? '';
  for (const rel of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (rel[0].includes(`Id="${firstSheetRel}"`)) {
      const target = /Target="([^"]+)"/.exec(rel[0])?.[1] ?? '';
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    }
  }
  const sheet = files.get(sheetPath);
  if (!sheet) throw new SpreadsheetError('برگهٔ اول فایل اکسل پیدا نشد.');

  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && raw !== undefined) value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textRuns(body);
      else if (raw !== undefined) value = decodeXml(raw);
      cells[ref ? columnIndex(ref) : cells.length] = value.trim();
    }
    rows[rowNumber - 1] = Array.from(cells, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}
