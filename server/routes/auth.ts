import { and, eq, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { todayJalali } from '../../shared/jalali.js';
import {
  burnPasswordCheck,
  clearSession,
  hashPassword,
  issueSession,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  requireAuth,
  type Employee,
  verifyPassword,
} from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { employees } from '../db/schema.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import {
  authenticateWithDirectory,
  DIRECTORY_PASSWORD_MESSAGE,
  DirectoryUnavailableError,
  type DirectoryUser,
  isDirectoryEnabled,
  normalizeLoginName,
} from '../ldap.js';
import { serializeMe } from '../serializers.js';
import { ensureSettings, guestSettings } from '../settings.js';
import { optionalText, password, requiredText, username } from '../validation.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'تعداد تلاش‌های ورود زیاد است. چند دقیقه دیگر دوباره امتحان کنید.' },
});

async function hasAnyEmployee() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(employees);
  return row.count > 0;
}

authRouter.get(
  '/system/status',
  route(async (_req, res) => {
    const isSetupComplete = await hasAnyEmployee();
    res.json({
      isSetupComplete,
      guestAccess: isSetupComplete && (await guestSettings()).guestAccess,
      directoryLogin: isDirectoryEnabled(),
    });
  }),
);

const setupSchema = z.object({
  username,
  password,
  firstName: requiredText(100),
  lastName: requiredText(100),
  position: requiredText(100),
  department: requiredText(100),
  email: optionalText(200),
  mobile: optionalText(30),
  setupToken: z.string().optional(),
});

authRouter.post(
  '/system/setup',
  loginLimiter,
  route(async (req, res) => {
    const body = parse(setupSchema, req.body);
    const expectedToken = process.env.SETUP_TOKEN;
    if (expectedToken && body.setupToken !== expectedToken) {
      throw new HttpError(403, 'کد راه‌اندازی نادرست است.');
    }

    const passwordHash = await hashPassword(body.password);
    // The advisory lock prevents two simultaneous setup requests from both succeeding.
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(724001)`);
      const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(employees);
      if (row.count > 0) return null;
      const [user] = await tx
        .insert(employees)
        .values({
          id: newId('emp'),
          username: body.username,
          passwordHash,
          mustChangePassword: false,
          role: 'manager',
          firstName: body.firstName,
          lastName: body.lastName,
          position: body.position,
          department: body.department,
          email: body.email,
          mobile: body.mobile,
        })
        .returning();
      return user;
    });

    if (!created) throw new HttpError(409, 'پرتال قبلاً راه‌اندازی شده است.');
    await ensureSettings();
    issueSession(res, created.id);
    res.json({ user: serializeMe(created) });
  }),
);

const loginSchema = z.object({
  // Long enough for DOMAIN\\user and user@domain forms, which are reduced to the plain username.
  username: z.string().trim().min(1).max(200).transform(normalizeLoginName),
  password: z.string().min(1).max(128),
});

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

async function otherActiveManagers(excludeId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.role, 'manager'), eq(employees.isActive, true), ne(employees.id, excludeId)));
  return row.count;
}

/** Creates the portal account on first AD sign-in, or refreshes it from AD on later ones. */
async function syncDirectoryUser(dir: DirectoryUser, existing: Employee | undefined): Promise<Employee> {
  // AD only overwrites a field when it has a value, so details entered in the portal survive.
  const profile = {
    ...(dir.firstName ? { firstName: dir.firstName } : {}),
    ...(dir.lastName ? { lastName: dir.lastName } : {}),
    ...(dir.email ? { email: dir.email } : {}),
    ...(dir.position ? { position: dir.position } : {}),
    ...(dir.department ? { department: dir.department } : {}),
    ...(dir.extension ? { extension: dir.extension } : {}),
    ...(dir.mobile ? { mobile: dir.mobile } : {}),
  };
  const session = { authSource: 'ldap', mustChangePassword: false, failedLogins: 0, lockedUntil: null };

  if (existing) {
    let role = existing.role;
    if (dir.isAdmin === true) role = 'manager';
    // Never demote the last active manager, or nobody could manage the portal.
    if (dir.isAdmin === false && role === 'manager' && (await otherActiveManagers(existing.id)) > 0) role = 'employee';
    const [updated] = await db
      .update(employees)
      .set({ ...profile, ...session, role })
      .where(eq(employees.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(employees)
    .values({
      id: newId('emp'),
      username: dir.username,
      // AD accounts never use a portal password; an empty hash never matches.
      passwordHash: '',
      role: dir.isAdmin ? 'manager' : 'employee',
      firstName: dir.username,
      lastName: '',
      position: 'نامشخص',
      department: 'نامشخص',
      hireDate: todayJalali(),
      ...profile,
      ...session,
    })
    .onConflictDoNothing({ target: employees.username })
    .returning();
  if (created) return created;
  // A simultaneous first sign-in created the row; update that one instead.
  const [row] = await db.select().from(employees).where(eq(employees.username, dir.username)).limit(1);
  return syncDirectoryUser(dir, row);
}

authRouter.post(
  '/auth/login',
  loginLimiter,
  route(async (req, res) => {
    const { username: name, password: pass } = parse(loginSchema, req.body);
    const [user] = await db.select().from(employees).where(eq(employees.username, name)).limit(1);
    const invalid = new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است.');

    if (user && !user.isActive) {
      await burnPasswordCheck(pass);
      throw invalid;
    }
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, `حساب به دلیل تلاش‌های ناموفق تا ${LOCK_MINUTES} دقیقه قفل است.`);
    }

    let authed: Employee | null = null;
    if (user?.authSource === 'local' && (await verifyPassword(pass, user.passwordHash))) {
      authed = user;
    } else if (isDirectoryEnabled() && USERNAME_RE.test(name)) {
      // A local account whose AD password is accepted is linked to AD from then on.
      try {
        const dir = await authenticateWithDirectory(name, pass);
        if (dir && USERNAME_RE.test(dir.username)) authed = await syncDirectoryUser(dir, user);
      } catch (err) {
        if (!(err instanceof DirectoryUnavailableError)) throw err;
        console.error(err.message);
        // A local account with a wrong password is just a wrong password, AD or not.
        if (user?.authSource !== 'local') {
          throw new HttpError(503, 'ارتباط با سرور اکتیو دایرکتوری برقرار نشد. کمی بعد دوباره تلاش کنید یا به واحد فناوری اطلاعات اطلاع دهید.');
        }
      }
    } else if (!user) {
      await burnPasswordCheck(pass);
    }

    if (!authed) {
      if (user) {
        const failed = user.failedLogins + 1;
        await db
          .update(employees)
          .set({
            failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          })
          .where(eq(employees.id, user.id));
      }
      throw invalid;
    }

    if (authed === user) {
      await db.update(employees).set({ failedLogins: 0, lockedUntil: null }).where(eq(employees.id, user.id));
    }
    issueSession(res, authed.id);
    res.json({ user: serializeMe(authed) });
  }),
);

authRouter.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ success: true });
});

authRouter.get(
  '/auth/me',
  requireAuth,
  route(async (req, res) => {
    res.json({ user: serializeMe(currentUser(req)) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

authRouter.post(
  '/auth/change-password',
  requireAuth,
  route(async (req, res) => {
    const user = currentUser(req);
    if (user.authSource === 'ldap') throw new HttpError(400, DIRECTORY_PASSWORD_MESSAGE);
    const body = parse(changePasswordSchema, req.body);
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'رمز عبور فعلی اشتباه است.');
    }
    if (body.currentPassword === body.newPassword) {
      throw new HttpError(400, 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.');
    }
    const [updated] = await db
      .update(employees)
      .set({ passwordHash: await hashPassword(body.newPassword), mustChangePassword: false })
      .where(eq(employees.id, user.id))
      .returning();
    res.json({ user: serializeMe(updated) });
  }),
);
