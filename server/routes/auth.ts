import { and, eq, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  burnPasswordCheck,
  clearSession,
  guestAllowed,
  hashPassword,
  issueSession,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  requireAuth,
  type Employee,
  verifyPassword,
  withPermissions,
} from '../auth.js';
import { cleanDepartmentName } from '../../shared/departments.js';
import { ADMIN_ROLE_ID, DEFAULT_ROLE_ID } from '../../shared/permissions.js';
import { isPersian, needsProfile } from '../../shared/profile.js';
import { systemLink } from '../../shared/systemLinks.js';
import { audit } from '../audit.js';
import { claimPhoneBookEntry, phoneBookMatches } from '../claim.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { employees } from '../db/schema.js';
import { ensureDepartment } from '../departments.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route } from '../http.js';
import {
  authenticateWithDirectory,
  DIRECTORY_PASSWORD_MESSAGE,
  DirectoryUnavailableError,
  type DirectoryUser,
  isDirectoryEnabled,
  normalizeLoginName,
} from '../ldap.js';
import { fullName, serializeMe } from '../serializers.js';
import { fromCompanyNetwork } from '../network.js';
import { ensureSettings, logoFile } from '../settings.js';
import { ensureRoles } from '../roles.js';
import { jalaliDateValue, optionalText, password, requiredText, username } from '../validation.js';

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
  route(async (req, res) => {
    const isSetupComplete = await hasAnyEmployee();
    const logo = isSetupComplete ? await logoFile() : null;
    res.json({
      isSetupComplete,
      guestAccess: isSetupComplete && (await guestAllowed(req)),
      // Guests may only read from inside the company network; from the internet everyone signs in.
      companyNetwork: fromCompanyNetwork(req),
      directoryLogin: isDirectoryEnabled(),
      logoUrl: logo ? `/uploads/${logo}` : '',
    });
  }),
);

/**
 * The company logo, also for visitors who are not signed in (the sign-in page shows it even when
 * guest access is off and /uploads is closed to them). Clients add ?v=<file> so a new logo is fetched at once.
 */
authRouter.get(
  '/system/logo',
  route(async (_req, res) => {
    const file = await logoFile();
    if (!file) throw new HttpError(404, 'لوگویی بارگذاری نشده است.');
    res.sendFile(file, { root: config.uploadDir, dotfiles: 'deny', maxAge: '1d' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'فایل لوگو پیدا نشد.' });
    });
  }),
);

/**
 * The organisation's app links for visitors who are not signed in, shown on the sign-in page. They follow
 * the guest-access switch but, unlike news and files, also reach visitors from the internet; each link is
 * the address that works where the visitor is (see shared/systemLinks.ts), and apps with none are left out.
 */
authRouter.get(
  '/system/apps',
  route(async (req, res) => {
    const row = (await hasAnyEmployee()) ? await ensureSettings() : null;
    if (!row?.guestAccess) {
      res.json([]);
      return;
    }
    const inside = fromCompanyNetwork(req);
    const apps = row.systems
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        iconName: s.iconName,
        // /uploads is closed to visitors from the internet, so logos come through /api/system/apps/:id/logo.
        imageUrl: s.imageUrl ? `/api/system/apps/${encodeURIComponent(s.id)}/logo?v=${encodeURIComponent(s.imageUrl.replace(/^\/uploads\//, ''))}` : '',
        bgColor: s.bgColor,
        textColor: s.textColor,
        url: systemLink(s, inside),
      }))
      .filter((s) => s.url);
    res.json(apps);
  }),
);

authRouter.get(
  '/system/apps/:id/logo',
  route(async (req, res) => {
    const row = await ensureSettings();
    const file = row.guestAccess ? row.systems.find((s) => s.id === req.params.id)?.imageUrl?.replace(/^\/uploads\//, '') : undefined;
    if (!file) throw new HttpError(404, 'تصویری برای این سامانه نیست.');
    res.sendFile(file, { root: config.uploadDir, dotfiles: 'deny', maxAge: '1d' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'فایل تصویر پیدا نشد.' });
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
    await ensureRoles();
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
          role: ADMIN_ROLE_ID,
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
    // The first admin's department joins the department list (or takes its spelling there).
    const department = await ensureDepartment(created.department);
    const [admin] = department === created.department
      ? [created]
      : await db.update(employees).set({ department }).where(eq(employees.id, created.id)).returning();
    issueSession(res, admin.id);
    res.json({ user: serializeMe(await withPermissions(admin)) });
  }),
);

const loginSchema = z.object({
  // Long enough for DOMAIN\\user and user@domain forms, which are reduced to the plain username.
  username: z.string().trim().min(1).max(200).transform(normalizeLoginName),
  password: z.string().min(1).max(128),
});

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

async function otherActiveAdmins(excludeId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.role, ADMIN_ROLE_ID), eq(employees.isActive, true), eq(employees.hasAccount, true), ne(employees.id, excludeId)));
  return row.count;
}

/**
 * Whether an AD value replaces the portal's. AD often holds text in English while the portal is in
 * Persian, so an English value never replaces a Persian one (other than the placeholder «نامشخص»).
 */
function takeFromDirectory(portalValue: string | undefined, directoryValue: string) {
  if (!directoryValue) return false;
  const portalIsPersian = Boolean(portalValue) && portalValue !== 'نامشخص' && isPersian(portalValue!);
  return !portalIsPersian || isPersian(directoryValue);
}

/** Creates the portal account on first AD sign-in, or refreshes it from AD on later ones. */
async function syncDirectoryUser(dir: DirectoryUser, existing: Employee | undefined): Promise<Employee> {
  // AD only overwrites a field when it has a value, so details entered in the portal survive. Names
  // never come from AD (they are in English there): colleagues enter their own on first sign-in.
  const profile = {
    ...(dir.email ? { email: dir.email } : {}),
    ...(takeFromDirectory(existing?.position, dir.position) ? { position: dir.position } : {}),
    // A department AD knows but the portal does not is added to the list, so the two stay in step.
    ...(takeFromDirectory(existing?.department, dir.department) ? { department: await ensureDepartment(dir.department) } : {}),
    ...(dir.extension ? { extension: dir.extension } : {}),
    ...(dir.mobile ? { mobile: dir.mobile } : {}),
  };
  const session = { authSource: 'ldap', mustChangePassword: false, failedLogins: 0, lockedUntil: null };

  if (existing) {
    let role = existing.role;
    if (dir.isAdmin === true) role = ADMIN_ROLE_ID;
    // Only admins are demoted (other roles are managed in the portal), and never the last active admin.
    if (dir.isAdmin === false && role === ADMIN_ROLE_ID && (await otherActiveAdmins(existing.id)) > 0) role = DEFAULT_ROLE_ID;
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
      role: dir.isAdmin ? ADMIN_ROLE_ID : DEFAULT_ROLE_ID,
      firstName: dir.username,
      lastName: '',
      position: 'نامشخص',
      department: profile.department ?? (await ensureDepartment('نامشخص')),
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

    // People listed only in the phone book cannot sign in, not even with an AD password.
    if (user && (!user.isActive || !user.hasAccount)) {
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

    // Signing in clears the failed attempts and counts as using the portal (for the reports).
    await db
      .update(employees)
      .set({ lastSeenAt: new Date(), ...(authed === user ? { failedLogins: 0, lockedUntil: null } : {}) })
      .where(eq(employees.id, authed.id));
    issueSession(res, authed.id);
    res.json({ user: serializeMe(await withPermissions(authed)) });
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

// The first-sign-in form of AD accounts (see needsProfile); names must be in Persian, since that is
// what the form asks for and why it appears.
const profileSchema = z.object({
  // Written the Persian way (ی and ک, single spaces), so the same name is spelled the same everywhere.
  firstName: requiredText(100).transform(cleanDepartmentName).refine(isPersian, 'نام را با حروف فارسی بنویسید'),
  lastName: requiredText(100).transform(cleanDepartmentName).refine(isPersian, 'نام خانوادگی را با حروف فارسی بنویسید'),
  birthDate: jalaliDateValue.refine((v) => v !== '', 'تاریخ تولد را وارد کنید'),
  hideBirthday: z.boolean().default(false),
  // The colleague's answer to "is this you?": the phone-book entry that is them, or null for none.
  claim: z.string().max(100).nullable().optional(),
});

authRouter.post(
  '/auth/profile',
  requireAuth,
  route(async (req, res) => {
    const { claim, ...profile } = parse(profileSchema, req.body);
    const user = currentUser(req);

    // On the first-sign-in form, someone already in the phone book without a username (entered by hand
    // or from Excel) is probably this colleague; they are asked before a second entry stays behind.
    if (user.authSource === 'ldap' && needsProfile(user) && claim !== null) {
      const matches = await phoneBookMatches(profile.firstName, profile.lastName);
      if (claim === undefined && matches.length > 0) {
        res.json({ matches: matches.map((e) => ({ id: e.id, name: fullName(e), position: e.position, department: e.department })) });
        return;
      }
      if (claim !== undefined) {
        const person = matches.find((e) => e.id === claim);
        if (!person) throw new HttpError(400, 'این ردیف دفتر تلفن پیدا نشد؛ دوباره تلاش کنید.');
        const joined = await withPermissions(await claimPhoneBookEntry(user, person, profile));
        issueSession(res, joined.id);
        await audit(joined, {
          action: 'update',
          entity: 'employee',
          id: joined.id,
          title: fullName(joined),
          detail: `در اولین ورود با اکتیو دایرکتوری (${joined.username}) به ردیف موجود دفتر تلفن وصل شد`,
        });
        broadcastChange('employees');
        res.json({ user: serializeMe(joined) });
        return;
      }
    }

    const [updated] = await db.update(employees).set(profile).where(eq(employees.id, user.id)).returning();
    broadcastChange('employees');
    res.json({ user: serializeMe(await withPermissions(updated)) });
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
    res.json({ user: serializeMe(await withPermissions(updated)) });
  }),
);
