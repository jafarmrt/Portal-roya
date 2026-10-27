import fs from 'fs';
import path from 'path';
import { config } from './config.js';

/** Which build is running. The release bundle carries build-info.json; a source checkout has none. */
export interface BuildInfo {
  version: string;
  /** GitHub release tag, e.g. "build-57". */
  build: string | null;
  commit: string | null;
  builtAt: string | null;
  startedAt: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

const startedAt = new Date().toISOString();
let cachedInfo: BuildInfo | null = null;
let cachedChangelog: ChangelogEntry[] | null = null;

/** The release folder the app runs from (deploy/ecosystem.config.cjs sets cwd to it). */
const releaseFile = (name: string) => path.resolve(process.cwd(), name);

export function buildInfo(): BuildInfo {
  if (cachedInfo) return cachedInfo;
  let file: Partial<BuildInfo> = {};
  try {
    file = JSON.parse(fs.readFileSync(releaseFile('build-info.json'), 'utf8'));
  } catch {
    // Not a release bundle.
  }
  cachedInfo = {
    version: config.version,
    build: typeof file.build === 'string' ? file.build : null,
    commit: typeof file.commit === 'string' ? file.commit.slice(0, 7) : null,
    builtAt: typeof file.builtAt === 'string' ? file.builtAt : null,
    startedAt,
  };
  return cachedInfo;
}

/** Reads CHANGELOG.md: "## [2.19.0] - 2026-10-27", then a "### title" line and "- item" lines. */
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^## \[([^\]]+)\](?:\s*-\s*(\S+))?/.exec(line);
    if (heading) {
      current = { version: heading[1], date: heading[2] ?? '', title: '', items: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('### ')) {
      // Older entries have several sections; their names become part of the title.
      const title = line.slice(4).trim();
      current.title = current.title ? `${current.title}، ${title}` : title;
    } else if (/^- /.test(line)) {
      current.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line) && current.items.length > 0) {
      current.items[current.items.length - 1] += ` ${line.trim().replace(/^- /, '')}`;
    }
  }
  return entries;
}

export function changelog(): ChangelogEntry[] {
  if (cachedChangelog) return cachedChangelog;
  try {
    cachedChangelog = parseChangelog(fs.readFileSync(releaseFile('CHANGELOG.md'), 'utf8'));
  } catch {
    cachedChangelog = [];
  }
  return cachedChangelog;
}
