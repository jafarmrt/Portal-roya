import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  burnPasswordCheck,
  clearSession,
  hashPassword,
  issueSession,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  requireAuth,
  verifyPassword,
} from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { employees } from '../db/schema.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
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
    res.json({ isSetupComplete, guestAccess: isSetupComplete && (await guestSettings()).guestAccess });
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
  username: z.string().trim().toLowerCase().min(1).max(40),
  password: z.string().min(1).max(128),
});

authRouter.post(
  '/auth/login',
  loginLimiter,
  route(async (req, res) => {
    const { username: name, password: pass } = parse(loginSchema, req.body);
    const [user] = await db.select().from(employees).where(eq(employees.username, name)).limit(1);
    const invalid = new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است.');

    if (!user || !user.isActive) {
      await burnPasswordCheck(pass);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(429, `حساب به دلیل تلاش‌های ناموفق تا ${LOCK_MINUTES} دقیقه قفل است.`);
    }

    if (!(await verifyPassword(pass, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      await db
        .update(employees)
        .set({
          failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        })
        .where(eq(employees.id, user.id));
      throw invalid;
    }

    await db.update(employees).set({ failedLogins: 0, lockedUntil: null }).where(eq(employees.id, user.id));
    issueSession(res, user.id);
    res.json({ user: serializeMe(user) });
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
