import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db/index.js';
import { employees } from './db/schema.js';
import { guestSettings } from './settings.js';
import { ADMIN_ROLE_ID, type Permission } from '../shared/permissions.js';
import { rolePermissions } from './roles.js';

export const SESSION_COOKIE = 'roya_session';
const BCRYPT_ROUNDS = 12;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type Employee = typeof employees.$inferSelect;

/** The signed-in user together with the permissions their role grants. */
export type SessionUser = Employee & { permissions: Permission[] };

export interface AuthedRequest extends Request {
  user?: SessionUser;
}

export function can(user: Pick<SessionUser, 'permissions'> | undefined | null, permission: Permission) {
  return Boolean(user?.permissions.includes(permission));
}

export function isAdmin(user: Pick<Employee, 'role'> | undefined | null) {
  return user?.role === ADMIN_ROLE_ID;
}

export async function withPermissions(user: Employee): Promise<SessionUser> {
  return { ...user, permissions: await rolePermissions(user.role) };
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

async function loadUserFromRequest(req: Request): Promise<SessionUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.sessionSecret) as { sub?: string };
    if (!payload.sub) return null;
    const [user] = await db.select().from(employees).where(eq(employees.id, payload.sub)).limit(1);
    if (!user || !user.isActive) return null;
    return await withPermissions(user);
  } catch {
    return null;
  }
}

/** Attaches the signed-in user when there is a valid session, without rejecting visitors. */
export async function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.user = (await loadUserFromRequest(req)) ?? undefined;
  next();
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

// Read-only endpoints a visitor may open when guest access is enabled in the settings.
const GUEST_READABLE = [
  /^\/settings$/,
  /^\/news(\/[^/]+)?$/,
  /^\/polls$/,
  /^\/trainings$/,
  /^\/calendar_events$/,
  /^\/holidays$/,
  /^\/documents$/,
  /^\/employees$/,
  /^\/new_colleagues$/,
  /^\/birthday_wishes$/,
];

/** True for any read, e.g. downloading an uploaded file. */
export const isReadRequest = (req: Request) => req.method === 'GET' || req.method === 'HEAD';

/** True for the public read-only API endpoints. */
export const isGuestReadable = (req: Request) => isReadRequest(req) && GUEST_READABLE.some((re) => re.test(req.path));

/**
 * Lets signed-in users through and admits visitors to the requests `isPublic` allows
 * while guest access is on. Everything else (any write, personal data) needs a session.
 */
export function requireUserOrGuest(isPublic: (req: Request) => boolean = isGuestReadable) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user || (isPublic(req) && (await guestSettings()).guestAccess)) {
        next();
        return;
      }
      res.status(401).json({ error: 'برای این کار ابتدا وارد حساب کاربری خود شوید.', code: 'LOGIN_REQUIRED' });
    } catch (err) {
      next(err);
    }
  };
}

export function requirePasswordChanged(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    res.status(403).json({ error: 'ابتدا رمز عبور خود را تغییر دهید.', code: 'PASSWORD_CHANGE_REQUIRED' });
    return;
  }
  next();
}

const FORBIDDEN = 'شما به این بخش دسترسی ندارید.';

/** Allows the request only when the user's role grants the permission. */
export function requirePermission(permission: Permission) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!can(req.user, permission)) {
      res.status(403).json({ error: FORBIDDEN });
      return;
    }
    next();
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isAdmin(req.user)) {
    res.status(403).json({ error: 'این عملیات فقط برای ادمین برنامه مجاز است.' });
    return;
  }
  next();
}
