import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { eq, lt, sql } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees, notifications, roles } from './db/schema.js';
import { createNotifications } from './notify.js';
import { buildInfo } from './version.js';
import { ADMIN_ROLE_ID } from '../shared/permissions.js';

// Housekeeping for a server with little disk: nightly backups, removal of uploads nothing uses
// any more, and a warning to admins before the disk fills up.

/** Uploaded files younger than this are kept even if unused: a form may still be open with them. */
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** Admins are warned when the disk has less free space than this. */
export const LOW_DISK_BYTES = 500 * 1024 * 1024;
/**
 * New uploads are refused when they would leave less free space than this. The database lives on the
 * same disk, and PostgreSQL stops when the disk is full, which would take the whole portal down.
 */
export const UPLOAD_RESERVE_BYTES = 200 * 1024 * 1024;
export const KEEP_NIGHTLY_DB = 7;
export const KEEP_WEEKLY_UPLOADS = 2;
/** Backups start at this hour (server local time), when nobody is working. */
export const BACKUP_HOUR = 2;

const NIGHTLY_DB = /^nightly-db-(\d{4}-\d{2}-\d{2})\.sql\.gz$/;
const WEEKLY_UPLOADS = /^weekly-uploads-(\d{4}-\d{2}-\d{2})\.tar\.gz$/;

interface CleanupResult {
  at: string;
  removed: number;
  freedBytes: number;
}

const state: {
  lastCleanup: CleanupResult | null;
  lastCleanupDay: string | null;
  lastBackupError: { at: string; message: string } | null;
  lastBackupErrorDay: string | null;
  lastDiskAlertDay: string | null;
  lastRunAt: number;
} = { lastCleanup: null, lastCleanupDay: null, lastBackupError: null, lastBackupErrorDay: null, lastDiskAlertDay: null, lastRunAt: 0 };

/** The server's local calendar day, e.g. '2026-10-27'. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function diskSpace(dir: string) {
  try {
    const s = await fs.statfs(dir);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

async function folderSize(dir: string) {
  let count = 0;
  let bytes = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null);
      if (!stat) continue;
      count++;
      bytes += stat.size;
    }
  } catch {
    // A missing folder is simply empty.
  }
  return { count, bytes };
}

/**
 * Every file name under /uploads/ that the database still mentions, in any table and column
 * (images, attachments, avatars, logos, text). Reading whole rows keeps this correct when new
 * fields that hold uploads are added later.
 */
export async function referencedUploads() {
  const { rows: tables } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = new Set<string>();
  for (const { tablename } of tables) {
    const { rows } = await db.execute<{ row: string }>(sql.raw(`select t::text as row from "${tablename}" t where t::text like '%/uploads/%'`));
    for (const { row } of rows) {
      for (const match of row.matchAll(/\/uploads\/([\w-]+\.[a-z0-9]+)/gi)) names.add(match[1]);
    }
  }
  return names;
}

/** Deletes uploaded files that nothing refers to any more and that are older than the grace period. */
export async function cleanOrphanUploads(uploadDir = config.uploadDir, now = new Date()): Promise<CleanupResult> {
  const referenced = await referencedUploads();
  let removed = 0;
  let freedBytes = 0;
  const entries = await fs.readdir(uploadDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || referenced.has(entry.name)) continue;
    const file = path.join(uploadDir, entry.name);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || now.getTime() - stat.mtimeMs < ORPHAN_GRACE_MS) continue;
    await fs.unlink(file).catch(() => undefined);
    removed++;
    freedBytes += stat.size;
  }
  state.lastCleanup = { at: now.toISOString(), removed, freedBytes };
  state.lastCleanupDay = dayKey(now);
  if (removed > 0) console.log(`Removed ${removed} unused uploaded files (${Math.round(freedBytes / 1024)} KB).`);
  return state.lastCleanup;
}

/** Notifications older than this are deleted; the bell shows only the newest 100 anyway. */
export const KEEP_NOTIFICATIONS_DAYS = 180;

/** Keeps the notifications table from growing for ever (about 100 rows per news item) on a small disk. */
export async function pruneNotifications(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_NOTIFICATIONS_DAYS * 24 * 60 * 60 * 1000);
  const removed = await db.delete(notifications).where(lt(notifications.createdAt, cutoff)).returning({ id: notifications.id });
  if (removed.length > 0) console.log(`Removed ${removed.length} notifications older than ${KEEP_NOTIFICATIONS_DAYS} days.`);
  return removed.length;
}

function run(command: string, args: string[], output?: NodeJS.WritableStream) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', output ? 'pipe' : 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (err: NodeJS.ErrnoException) =>
      reject(new Error(err.code === 'ENOENT' ? `برنامهٔ ${command} روی سرور نصب نیست.` : err.message)),
    );
    const done = output ? pipeline(child.stdout!, createGzip(), output) : Promise.resolve();
    child.on('close', (code) => {
      done.then(() => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} با خطا تمام شد (کد ${code}).`))), reject);
    });
  });
}

async function prune(dir: string, pattern: RegExp, keep: number) {
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => pattern.test(f)).sort().reverse();
  for (const old of files.slice(keep)) await fs.unlink(path.join(dir, old)).catch(() => undefined);
}

/** Writes today's compressed database dump, unless it exists already. Returns the file name. */
export async function backupDatabase(backupDir = config.backupDir, now = new Date()) {
  await fs.mkdir(backupDir, { recursive: true });
  const name = `nightly-db-${dayKey(now)}.sql.gz`;
  const target = path.join(backupDir, name);
  if (await fs.stat(target).catch(() => null)) return name;
  const partial = `${target}.partial`;
  try {
    await run('pg_dump', ['--no-owner', '--no-privileges', '--clean', '--if-exists', config.databaseUrl], createWriteStream(partial));
    await fs.rename(partial, target);
  } catch (err) {
    await fs.unlink(partial).catch(() => undefined);
    throw err;
  }
  await prune(backupDir, NIGHTLY_DB, KEEP_NIGHTLY_DB);
  return name;
}

/** Archives the uploads folder once a week (Friday night), when there is room for it. */
export async function backupUploads(backupDir = config.backupDir, uploadDir = config.uploadDir, now = new Date()) {
  await fs.mkdir(backupDir, { recursive: true });
  const name = `weekly-uploads-${dayKey(now)}.tar.gz`;
  const target = path.join(backupDir, name);
  if (await fs.stat(target).catch(() => null)) return name;
  const size = await folderSize(uploadDir);
  const disk = await diskSpace(backupDir);
  if (disk && disk.free < size.bytes + LOW_DISK_BYTES) {
    throw new Error('فضای خالی دیسک برای پشتیبان فایل‌ها کافی نیست.');
  }
  const partial = `${target}.partial`;
  try {
    await run('tar', ['-czf', partial, '-C', path.dirname(uploadDir), path.basename(uploadDir)]);
    await fs.rename(partial, target);
  } catch (err) {
    await fs.unlink(partial).catch(() => undefined);
    throw err;
  }
  await prune(backupDir, WEEKLY_UPLOADS, KEEP_WEEKLY_UPLOADS);
  return name;
}

async function notifyAdmins(title: string, message: string) {
  const admins = await db
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(roles, eq(roles.id, employees.role))
    .where(sql`${employees.isActive} and (${roles.id} = ${ADMIN_ROLE_ID} or 'settings.manage' = any(${roles.permissions}))`);
  await createNotifications(admins.map((a) => a.id), { title, message, type: 'system', linkTab: 'admin' });
}

/** Warns admins once a day when the disk is nearly full. */
export async function checkDiskSpace(now = new Date()) {
  const disk = await diskSpace(config.uploadDir);
  if (!disk || disk.free >= LOW_DISK_BYTES || state.lastDiskAlertDay === dayKey(now)) return false;
  state.lastDiskAlertDay = dayKey(now);
  await notifyAdmins(
    'فضای دیسک سرور رو به پایان است ⚠️',
    `فقط ${Math.round(disk.free / 1024 / 1024)} مگابایت فضای خالی روی سرور پرتال مانده است. وضعیت سرور را در تنظیمات پرتال ببینید.`,
  );
  return true;
}

/**
 * The nightly jobs. Safe to call every minute: it does work at most once an hour, and each job
 * runs once per day (a failed backup is tried again an hour later).
 */
export async function runNightlyMaintenance(now = new Date()) {
  if (now.getHours() < BACKUP_HOUR || now.getTime() - state.lastRunAt < 60 * 60 * 1000) return;
  state.lastRunAt = now.getTime();
  if (state.lastCleanupDay !== dayKey(now)) {
    await cleanOrphanUploads(config.uploadDir, now).catch((err) => console.error('Upload cleanup failed:', err));
    await pruneNotifications(now).catch((err) => console.error('Notification cleanup failed:', err));
  }
  try {
    await backupDatabase(config.backupDir, now);
    if (now.getDay() === 5) await backupUploads(config.backupDir, config.uploadDir, now);
    state.lastBackupError = null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const firstToday = state.lastBackupErrorDay !== dayKey(now);
    state.lastBackupError = { at: now.toISOString(), message };
    state.lastBackupErrorDay = dayKey(now);
    if (firstToday) {
      console.error('Backup failed:', message);
      await notifyAdmins('پشتیبان‌گیری شبانهٔ پرتال انجام نشد', message).catch(() => undefined);
    }
  }
  await checkDiskSpace(now).catch(() => undefined);
}

async function latest(dir: string, pattern: RegExp) {
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => pattern.test(f)).sort().reverse();
  if (files.length === 0) return null;
  const stat = await fs.stat(path.join(dir, files[0])).catch(() => null);
  return stat ? { name: files[0], at: stat.mtime.toISOString(), size: stat.size, count: files.length } : null;
}

/** What the "server status" card in the settings shows. */
export async function serverStatus() {
  const [disk, uploads, database, uploadsBackup] = await Promise.all([
    diskSpace(config.uploadDir),
    folderSize(config.uploadDir),
    latest(config.backupDir, NIGHTLY_DB),
    latest(config.backupDir, WEEKLY_UPLOADS),
  ]);
  return {
    ...buildInfo(),
    disk,
    lowDiskBytes: LOW_DISK_BYTES,
    uploads,
    backups: {
      dir: config.backupDir,
      database,
      uploads: uploadsBackup,
      lastError: state.lastBackupError,
    },
    cleanup: state.lastCleanup,
  };
}
