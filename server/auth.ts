import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees } from './db/schema.js';

export const SESSION_COOKIE = 'roya_session';
const BCRYPT_ROUNDS = 12;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type Employee = typeof employees.$inferSelect;

export interface AuthedRequest extends Request {
  user?: Employee;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | null = null;
/** Compares against a throwaway hash so failed lookups take as long as real ones. */
export async function burnPasswordCheck(password: string) {
  dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  await bcrypt.compare(password, dummyHash);
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.sessionSecret, {
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

async function loadUserFromRequest(req: Request): Promise<Employee | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.sessionSecret) as { sub?: string };
    if (!payload.sub) return null;
    const [user] = await db.select().from(employees).where(eq(employees.id, payload.sub)).limit(1);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

/** Requires a valid session. Users who must change their password can only reach the auth routes. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = await loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'لطفاً وارد حساب کاربری خود شوید.' });
    return;
  }
  req.user = user;
  next();
}

export function requirePasswordChanged(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    res.status(403).json({ error: 'ابتدا رمز عبور خود را تغییر دهید.', code: 'PASSWORD_CHANGE_REQUIRED' });
    return;
  }
  next();
}

export function requireManager(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'manager') {
    res.status(403).json({ error: 'این عملیات فقط برای مدیران مجاز است.' });
    return;
  }
  next();
}
