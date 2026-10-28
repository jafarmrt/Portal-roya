import { randomBytes } from 'crypto';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentJalaliYear, todayJalali, toPersianDigits } from '../../shared/jalali.js';
import { WISH_DESIGNS, WISH_OCCASIONS, WISH_REACTIONS, yearsSince } from '../../shared/celebrations.js';
import { audit, fromTo } from '../audit.js';
import { can, type Employee, hashPassword, isAdmin, requirePermission, type SessionUser } from '../auth.js';
import { db } from '../db/index.js';
import { addDepartments, departmentList, requireDepartment, requireLocation } from '../departments.js';
import { checkRows, type ImportRow, importRowsSchema, type ImportUpdate, MAX_IMPORT_ROWS, newDepartments, rowsToRecords } from '../employeeImport.js';
import { birthdayWishes, colleagueWishes, employees, newColleagues, roles } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { canListDirectory, DIRECTORY_PASSWORD_MESSAGE, DirectoryUnavailableError, isDirectoryEnabled, listDirectoryUsers } from '../ldap.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName, serializeEmployee, serializeForGuest } from '../serializers.js';
import { guestSettings } from '../settings.js';
import { readSpreadsheet, SpreadsheetError } from '../spreadsheet.js';
import { accountRules, roleExists } from '../roles.js';
import { ADMIN_ROLE_ID, DEFAULT_ROLE_ID } from '../../shared/permissions.js';
import { assetUrl, assetUrlValue, jalaliDateValue, optionalJalaliDate, optionalText, password, requiredText, textValue, username } from '../validation.js';

export const employeesRouter = Router();

/** Readable temporary password, shown once to the manager who created or reset the account. */
function temporaryPassword() {
  return randomBytes(6).toString('base64url');
}

const MAX_NAMES = 20;
const names = (people: Employee[]) =>
  people.slice(0, MAX_NAMES).map(fullName).join('، ') + (people.length > MAX_NAMES ? ` و ${toPersianDigits(people.length - MAX_NAMES)} نفر دیگر` : '');

async function roleName(id: string) {
  const [role] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, id));
  return role?.name ?? id;
}

async function personName(id: string | null) {
  if (!id) return '';
  const [emp] = await db.select().from(employees).where(eq(employees.id, id));
  return emp ? fullName(emp) : '';
}

/** What a manager changed on someone's record, in words, for the change history. */
async function recordChanges(before: Employee, after: Employee) {
  const parts: string[] = [];
  const pair = (label: string, was: string, now: string) => {
    if (was !== now) parts.push(`${label}: ${fromTo(was, now)}`);
  };
  pair('نام', fullName(before), fullName(after));
  pair('سمت', before.position, after.position);
  pair('واحد', before.department, after.department);
  pair('محل کار', before.location, after.location);
  if (before.role !== after.role) parts.push(`نقش: ${fromTo(await roleName(before.role), await roleName(after.role))}`);
  if (before.isActive !== after.isActive) parts.push(after.isActive ? 'دوباره فعال شد' : 'غیرفعال شد');
  if (before.directManagerId !== after.directManagerId) {
    parts.push(`مدیر مستقیم: ${fromTo(await personName(before.directManagerId), await personName(after.directManagerId))}`);
  }
  if (before.hireDate !== after.hireDate) parts.push('تاریخ استخدام');
  const profile = (['email', 'mobile', 'extension', 'bio', 'avatarUrl', 'birthDate', 'hideBirthday', 'hideAnniversary'] as const).some((k) => before[k] !== after[k]);
  if (profile) parts.push('اطلاعات تماس و پروفایل');
  return parts.join('، ');
}

async function loadEmployee(id: string) {
  const [emp] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!emp) throw new HttpError(404, 'همکار یافت نشد.');
  return emp;
}

function assertSelfOrUserManager(viewer: SessionUser, targetId: string) {
  if (viewer.id !== targetId && !can(viewer, 'users.manage')) {
    throw new HttpError(403, 'فقط خود همکار یا مدیر کاربران می‌تواند این تغییر را انجام دهد.');
  }
}

/** Only an admin may hand out the admin role or change an admin's account; otherwise users.manage could escalate itself. */
/**
 * Only an admin touches an admin's account or gives the admin role. Anyone else who manages staff may
 * not change their own role, may give only roles whose every permission they hold, and, for a change
 * of role, password or access, may not touch someone who holds a permission they lack (coversRole).
 */
async function assertMayManageAccount(
  viewer: SessionUser,
  target: Pick<Employee, 'id' | 'role'> | null,
  { role, access = false }: { role?: string; access?: boolean } = {},
) {
  const touchesAdmin = target?.role === ADMIN_ROLE_ID || role === ADMIN_ROLE_ID;
  if (touchesAdmin && !isAdmin(viewer)) {
    throw new HttpError(403, 'فقط ادمین برنامه می‌تواند حساب ادمین‌ها را تغییر دهد یا نقش ادمین بدهد.');
  }
  if (isAdmin(viewer)) return;
  const rules = await accountRules(viewer);
  const changesRole = role !== undefined && role !== target?.role;
  if (changesRole && target?.id === viewer.id) {
    throw new HttpError(403, 'نقش خودتان را نمی‌توانید تغییر دهید؛ این کار با ادمین برنامه است.');
  }
  if ((access || changesRole) && target && target.id !== viewer.id && !rules.covers(target.role)) {
    throw new HttpError(403, 'این همکار دسترسی‌هایی دارد که شما ندارید؛ تغییر نقش، رمز یا دسترسی او با ادمین برنامه است.');
  }
  if (changesRole && !rules.covers(role)) {
    throw new HttpError(403, `نقش «${await roleName(role)}» دسترسی‌هایی دارد که خودتان ندارید؛ فقط ادمین برنامه می‌تواند آن را بدهد.`);
  }
}

/**
 * Puts a colleague on the dashboard's "new colleagues" wall. `announce` is false for bulk imports,
 * which send one combined notification instead of one per person.
 */
async function introduceColleague(emp: Employee, message: string, joinDate: string, announce = true) {
  const name = fullName(emp);
  await db.insert(newColleagues).values({
    id: newId('nc'),
    userId: emp.id,
    welcomeMessage: message || `خوش‌آمدگویی گرم به ${name} که به عنوان ${emp.position} به تیم ما پیوسته است.`,
    joinDate: joinDate || emp.hireDate || todayJalali(),
  });
  if (announce) {
    await createNotifications(await audienceIds([], emp.id), {
      title: 'معرفی همکار جدید 👋',
      message: `${name} به عنوان ${emp.position} به سازمان ملحق شد.`,
      type: 'welcome',
      linkTab: 'dashboard',
    });
  }
}

async function assertRoleExists(roleId: string) {
  if (!(await roleExists(roleId))) throw new HttpError(400, 'نقش انتخاب‌شده وجود ندارد.');
}

/** Account columns of someone listed only in the phone book. */
const NO_ACCOUNT = {
  hasAccount: false,
  username: null,
  passwordHash: '',
  authSource: 'local',
  mustChangePassword: true,
  role: DEFAULT_ROLE_ID,
};

/**
 * Checks the username, role and sign-in method of a new portal account and returns its columns.
 * A portal-password account gets a one-time temporary password; an AD account none, since it signs
 * in with the Windows password and is linked on its first sign-in.
 */
async function prepareAccount(
  viewer: SessionUser,
  target: Employee | null,
  input: { username: string; role: string; signIn: 'local' | 'ldap'; password?: string },
) {
  await assertRoleExists(input.role);
  await assertMayManageAccount(viewer, target, { role: input.role });
  const name = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(name)) {
    throw new HttpError(400, 'نام کاربری معتبر وارد کنید (حروف انگلیسی، عدد و . _ -).');
  }
  const [existing] = await db.select({ id: employees.id }).from(employees).where(eq(employees.username, name));
  if (existing && existing.id !== target?.id) throw new HttpError(409, `نام کاربری «${name}» قبلاً استفاده شده است.`);
  if (input.signIn === 'ldap' && !isDirectoryEnabled()) {
    throw new HttpError(400, 'ورود با اکتیو دایرکتوری روی این سرور فعال نیست؛ رمز موقت بسازید.');
  }
  const base = { hasAccount: true, username: name, role: input.role };
  if (input.signIn === 'ldap') {
    return { values: { ...base, passwordHash: '', authSource: 'ldap', mustChangePassword: false }, temporaryPassword: null };
  }
  const temporary = input.password || temporaryPassword();
  return {
    values: { ...base, passwordHash: await hashPassword(temporary), authSource: 'local', mustChangePassword: true },
    temporaryPassword: temporary,
  };
}

async function activeAdminCount(excludeId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.role, ADMIN_ROLE_ID), eq(employees.isActive, true), eq(employees.hasAccount, true), ne(employees.id, excludeId)));
  return row.count;
}

employeesRouter.get(
  '/employees',
  route(async (req, res) => {
    const viewer = viewerOf(req);
    if (!viewer && !(await guestSettings()).guestDirectory) {
      res.json([]);
      return;
    }
    const rows = await db.select().from(employees).orderBy(employees.firstName, employees.lastName);
    const byId = new Map(rows.map((e) => [e.id, e]));
    if (!viewer) {
      res.json(rows.filter((e) => e.isActive).map((e) => serializeForGuest(e, byId)));
      return;
    }
    const visible = can(viewer, 'users.manage') ? rows : rows.filter((e) => e.isActive);
    res.json(visible.map((e) => serializeEmployee(e, viewer, byId)));
  }),
);

const contactFields = {
  email: optionalText(200),
  mobile: optionalText(30),
  extension: optionalText(20),
  bio: optionalText(2000),
  location: optionalText(200),
  avatar: assetUrl,
  birthDate: optionalJalaliDate,
  hideBirthday: z.boolean().default(false),
};

// How a colleague with portal access signs in: a portal password, or their Active Directory password.
const signInSchema = z.enum(['local', 'ldap']).default('local');

const createSchema = z.object({
  ...contactFields,
  // Off for people listed only in the phone book; they get no username, password or role.
  hasAccount: z.boolean().default(true),
  signIn: signInSchema,
  username: username.optional(),
  password: password.optional(),
  firstName: requiredText(100),
  lastName: requiredText(100),
  position: requiredText(100),
  department: requiredText(100),
  role: z.string().trim().min(1).max(100).default(DEFAULT_ROLE_ID),
  hireDate: optionalJalaliDate,
  directManagerId: z.string().max(100).nullable().optional(),
  isNewColleague: z.boolean().default(false),
  newColleagueMessage: optionalText(1000),
});

employeesRouter.post(
  '/employees',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const body = parse(createSchema, req.body);
    body.department = await requireDepartment(body.department);
    body.location = await requireLocation(body.location);
    const account = body.hasAccount
      ? await prepareAccount(currentUser(req), null, {
          username: body.username || (body.email ? body.email.split('@')[0].toLowerCase() : ''),
          role: body.role,
          signIn: body.signIn,
          password: body.password,
        })
      : null;
    const [emp] = await db
      .insert(employees)
      .values({
        id: newId('emp'),
        ...(account?.values ?? NO_ACCOUNT),
        firstName: body.firstName,
        lastName: body.lastName,
        position: body.position,
        department: body.department,
        email: body.email,
        mobile: body.mobile,
        extension: body.extension,
        bio: body.bio,
        location: body.location,
        avatarUrl: body.avatar,
        birthDate: body.birthDate,
        hideBirthday: body.hideBirthday,
        hireDate: body.hireDate || todayJalali(),
        directManagerId: body.directManagerId || null,
      })
      .returning();

    await audit(currentUser(req), {
      action: 'create',
      entity: 'employee',
      id: emp.id,
      title: fullName(emp),
      detail: `${emp.position}، ${emp.department}؛ ${emp.hasAccount ? `با دسترسی پرتال و نقش ${await roleName(emp.role)}` : 'فقط در دفتر تلفن'}`,
    });
    if (body.isNewColleague) {
      await introduceColleague(emp, body.newColleagueMessage, emp.hireDate);
      broadcastChange('new_colleagues');
    }

    broadcastChange('employees');
    res.status(201).json({
      employee: serializeEmployee(emp, currentUser(req)),
      // Returned once so the manager can hand it to the new colleague; null for AD sign-in or no account.
      temporaryPassword: account?.temporaryPassword ?? null,
    });
  }),
);

const accountSchema = z.object({
  username,
  role: z.string().trim().min(1).max(100).default(DEFAULT_ROLE_ID),
  signIn: signInSchema,
});

/** Gives portal access to someone who so far was only in the phone book. */
employeesRouter.post(
  '/employees/:id/account',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const body = parse(accountSchema, req.body);
    const target = await loadEmployee(req.params.id);
    if (target.hasAccount) throw new HttpError(409, 'این همکار از قبل دسترسی پورتال دارد.');
    if (!target.isActive) throw new HttpError(400, 'ابتدا این همکار را فعال کنید.');
    const account = await prepareAccount(currentUser(req), target, body);
    const [updated] = await db
      .update(employees)
      .set({ ...account.values, failedLogins: 0, lockedUntil: null })
      .where(eq(employees.id, target.id))
      .returning();
    await audit(currentUser(req), {
      action: 'update',
      entity: 'employee',
      id: updated.id,
      title: fullName(updated),
      detail: `دسترسی پرتال داده شد، نقش ${await roleName(updated.role)}`,
    });
    broadcastChange('employees');
    res.json({ employee: serializeEmployee(updated, currentUser(req)), temporaryPassword: account.temporaryPassword });
  }),
);

/** Takes portal access away but keeps the person in the phone book, unlike deactivating them. */
employeesRouter.delete(
  '/employees/:id/account',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const viewer = currentUser(req);
    const target = await loadEmployee(req.params.id);
    if (target.id === viewer.id) throw new HttpError(400, 'نمی‌توانید دسترسی پورتال خودتان را بردارید.');
    if (!target.hasAccount) throw new HttpError(409, 'این همکار دسترسی پورتال ندارد.');
    await assertMayManageAccount(viewer, target, { access: true });
    if (target.role === ADMIN_ROLE_ID && (await activeAdminCount(target.id)) === 0) {
      throw new HttpError(400, 'پرتال باید حداقل یک ادمین فعال داشته باشد.');
    }
    const [updated] = await db
      .update(employees)
      // The username stays so access can be given back later under the same name.
      .set({ ...NO_ACCOUNT, username: target.username, failedLogins: 0, lockedUntil: null, sessionVersion: target.sessionVersion + 1 })
      .where(eq(employees.id, target.id))
      .returning();
    await audit(viewer, { action: 'update', entity: 'employee', id: updated.id, title: fullName(updated), detail: 'دسترسی پرتال برداشته شد' });
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

// Update fields have no defaults: a PATCH changes only the fields it sends.
// Fields colleagues may change on their own profile.
const contactUpdateFields = {
  firstName: requiredText(100),
  lastName: requiredText(100),
  email: textValue(200),
  mobile: textValue(30),
  extension: textValue(20),
  bio: textValue(2000),
  location: textValue(200),
  avatar: assetUrlValue,
  birthDate: jalaliDateValue,
  hideBirthday: z.boolean(),
  hideAnniversary: z.boolean(),
};
const managerOnlyFields = {
  position: requiredText(100),
  department: requiredText(100),
  role: z.string().trim().min(1).max(100),
  hireDate: jalaliDateValue,
  directManagerId: z.string().max(100).nullable(),
  isActive: z.boolean(),
};
const updateSchema = z.object({ ...contactUpdateFields, ...managerOnlyFields }).partial();

employeesRouter.patch(
  '/employees/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrUserManager(viewer, req.params.id);
    const target = await loadEmployee(req.params.id);
    const body = parse(updateSchema, req.body);

    const changesAccount = Object.keys(managerOnlyFields).some((key) => key in body);
    if (changesAccount) {
      if (!can(viewer, 'users.manage')) {
        throw new HttpError(403, 'تغییر سمت، واحد و نقش فقط توسط مدیر کاربران ممکن است.');
      }
      if (body.role !== undefined && body.role !== target.role) {
        if (!target.hasAccount) throw new HttpError(400, 'نقش فقط برای همکارانی که دسترسی پورتال دارند معنا دارد.');
        await assertRoleExists(body.role);
      }
      const changesActive = body.isActive !== undefined && body.isActive !== target.isActive;
      await assertMayManageAccount(viewer, target, { role: body.role, access: changesActive });
    }
    const losesAdminAccess =
      target.role === ADMIN_ROLE_ID && ((body.role !== undefined && body.role !== ADMIN_ROLE_ID) || body.isActive === false);
    if (losesAdminAccess && (await activeAdminCount(target.id)) === 0) {
      throw new HttpError(400, 'پرتال باید حداقل یک ادمین فعال داشته باشد.');
    }
    if (body.department !== undefined && body.department !== target.department) body.department = await requireDepartment(body.department);
    if (body.location !== undefined && body.location !== target.location) body.location = await requireLocation(body.location);
    if (body.directManagerId === target.id) {
      throw new HttpError(400, 'همکار نمی‌تواند مدیر مستقیم خودش باشد.');
    }

    const { avatar, ...rest } = body;
    const [updated] = await db
      .update(employees)
      .set({ ...rest, ...(avatar !== undefined ? { avatarUrl: avatar } : {}) })
      .where(eq(employees.id, target.id))
      .returning();
    // Colleagues keeping their own contact details current is not a management change; a new name is noted.
    const renamed = updated.firstName !== target.firstName || updated.lastName !== target.lastName;
    if (changesAccount || renamed || viewer.id !== target.id) {
      const detail = await recordChanges(target, updated);
      if (detail) await audit(viewer, { action: 'update', entity: 'employee', id: updated.id, title: fullName(updated), detail });
    }
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

employeesRouter.post(
  '/employees/:id/reset-password',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const target = await loadEmployee(req.params.id);
    if (!target.hasAccount) throw new HttpError(400, 'این همکار دسترسی پورتال ندارد؛ ابتدا به او دسترسی بدهید.');
    if (target.authSource === 'ldap' && isDirectoryEnabled()) throw new HttpError(400, DIRECTORY_PASSWORD_MESSAGE);
    await assertMayManageAccount(currentUser(req), target, { access: true });
    const temp = temporaryPassword();
    await db
      .update(employees)
      // With AD sign-in switched off, a reset turns an AD account back into a portal account. Wherever
      // the colleague is still signed in with the old password is signed out.
      .set({
        passwordHash: await hashPassword(temp),
        authSource: 'local',
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        sessionVersion: target.sessionVersion + 1,
      })
      .where(eq(employees.id, target.id));
    await audit(currentUser(req), { action: 'update', entity: 'employee', id: target.id, title: fullName(target), detail: 'رمز عبور بازنشانی شد' });
    res.json({ temporaryPassword: temp });
  }),
);

/** Read-modify-write of a profile's JSON columns inside a row lock. */
async function mutateProfile(id: string, mutate: (emp: Employee) => Partial<Employee>) {
  return db.transaction(async (tx) => {
    const [emp] = await tx.select().from(employees).where(eq(employees.id, id)).for('update');
    if (!emp) throw new HttpError(404, 'همکار یافت نشد.');
    const [updated] = await tx.update(employees).set(mutate(emp)).where(eq(employees.id, id)).returning();
    return updated;
  });
}

const experienceSchema = z.object({
  company: requiredText(200),
  role: requiredText(200),
  startYear: optionalText(20),
  endYear: optionalText(20),
  description: optionalText(1000),
});

employeesRouter.post(
  '/employees/:id/experiences',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrUserManager(viewer, req.params.id);
    const exp = parse(experienceSchema, req.body);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      workExperiences: [{ id: newId('we'), ...exp }, ...emp.workExperiences],
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

employeesRouter.delete(
  '/employees/:id/experiences/:expId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrUserManager(viewer, req.params.id);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      workExperiences: emp.workExperiences.filter((w) => w.id !== req.params.expId),
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

const skillSchema = z.object({ name: requiredText(100), category: optionalText(100) });

employeesRouter.post(
  '/employees/:id/skills',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrUserManager(viewer, req.params.id);
    const skill = parse(skillSchema, req.body);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      skills: [...emp.skills, { id: newId('sk'), name: skill.name, category: skill.category || 'تخصصی', endorsedBy: [] }],
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

employeesRouter.delete(
  '/employees/:id/skills/:skillId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrUserManager(viewer, req.params.id);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      skills: emp.skills.filter((s) => s.id !== req.params.skillId),
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

employeesRouter.post(
  '/employees/:id/skills/:skillId/endorse',
  route(async (req, res) => {
    const viewer = currentUser(req);
    if (viewer.id === req.params.id) throw new HttpError(400, 'نمی‌توانید مهارت خودتان را تأیید کنید.');
    const updated = await mutateProfile(req.params.id, (emp) => ({
      skills: emp.skills.map((s) => {
        if (s.id !== req.params.skillId) return s;
        const endorsed = s.endorsedBy.includes(viewer.id);
        return { ...s, endorsedBy: endorsed ? s.endorsedBy.filter((u) => u !== viewer.id) : [...s.endorsedBy, viewer.id] };
      }),
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer));
  }),
);

// --- New colleagues & birthday wishes ---

const introduceSchema = z.object({ message: optionalText(1000), joinDate: optionalJalaliDate });

/** Introduces an existing account, e.g. one that came from the Excel import or Active Directory. */
employeesRouter.post(
  '/employees/:id/introduce',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const body = parse(introduceSchema, req.body);
    const target = await loadEmployee(req.params.id);
    if (!target.isActive) throw new HttpError(400, 'حساب این همکار غیرفعال است.');
    const [existing] = await db.select({ id: newColleagues.id }).from(newColleagues).where(eq(newColleagues.userId, target.id)).limit(1);
    if (existing) throw new HttpError(409, 'این همکار قبلاً معرفی شده است؛ کارت معرفی او را ویرایش کنید.');
    await introduceColleague(target, body.message, body.joinDate);
    broadcastChange('new_colleagues');
    res.status(201).json({ success: true });
  }),
);

const introductionUpdateSchema = z.object({ welcomeMessage: requiredText(1000), joinDate: jalaliDateValue }).partial();

employeesRouter.patch(
  '/new_colleagues/:id',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const body = parse(introductionUpdateSchema, req.body);
    const [updated] = await db.update(newColleagues).set(body).where(eq(newColleagues.id, req.params.id)).returning({ id: newColleagues.id });
    if (!updated) throw new HttpError(404, 'کارت معرفی یافت نشد.');
    broadcastChange('new_colleagues');
    res.json({ success: true });
  }),
);

employeesRouter.delete(
  '/new_colleagues/:id',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const deleted = await db.delete(newColleagues).where(eq(newColleagues.id, req.params.id)).returning({ id: newColleagues.id });
    if (deleted.length === 0) throw new HttpError(404, 'کارت معرفی یافت نشد.');
    broadcastChange('new_colleagues');
    res.status(204).end();
  }),
);

employeesRouter.get(
  '/new_colleagues',
  route(async (req, res) => {
    if (!viewerOf(req) && !(await guestSettings()).guestDirectory) {
      res.json([]);
      return;
    }
    const cards = await db.select().from(newColleagues).orderBy(desc(newColleagues.createdAt)).limit(20);
    const wishes = await db
      .select({
        id: colleagueWishes.id,
        newColleagueId: colleagueWishes.newColleagueId,
        senderId: colleagueWishes.senderId,
        message: colleagueWishes.message,
        createdAt: colleagueWishes.createdAt,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(colleagueWishes)
      .innerJoin(employees, eq(employees.id, colleagueWishes.senderId))
      .orderBy(colleagueWishes.createdAt);
    res.json(
      cards.map((c) => ({
        id: c.id,
        userId: c.userId,
        welcomeMessage: c.welcomeMessage,
        joinDate: c.joinDate,
        createdAt: c.createdAt.toISOString(),
        wishes: wishes
          .filter((w) => w.newColleagueId === c.id)
          .map((w) => ({ id: String(w.id), senderId: w.senderId, userName: fullName(w), message: w.message, time: w.createdAt.toISOString() })),
      })),
    );
  }),
);

const wishSchema = z.object({ message: requiredText(500) });

employeesRouter.post(
  '/new_colleagues/:id/wishes',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { message } = parse(wishSchema, req.body);
    const [card] = await db.select().from(newColleagues).where(eq(newColleagues.id, req.params.id));
    if (!card) throw new HttpError(404, 'کارت خوش‌آمدگویی یافت نشد.');
    await db.insert(colleagueWishes).values({ newColleagueId: card.id, senderId: viewer.id, message });
    if (card.userId !== viewer.id) {
      await createNotifications([card.userId], {
        title: 'پیام خوش‌آمدگویی دریافت کردید 🌷',
        message: `${fullName(viewer)}: «${message}»`,
        type: 'welcome',
        linkTab: 'dashboard',
      });
    }
    broadcastChange('new_colleagues');
    res.status(201).json({ success: true });
  }),
);

employeesRouter.get(
  '/birthday_wishes',
  route(async (req, res) => {
    // Birthdays are never shown to guests, even with the directory open to them.
    const viewer = viewerOf(req);
    if (!viewer) {
      res.json({});
      return;
    }
    const rows = await db
      .select({
        id: birthdayWishes.id,
        targetUserId: birthdayWishes.targetUserId,
        senderId: birthdayWishes.senderId,
        text: birthdayWishes.text,
        occasion: birthdayWishes.occasion,
        design: birthdayWishes.design,
        isPrivate: birthdayWishes.isPrivate,
        reaction: birthdayWishes.reaction,
        createdAt: birthdayWishes.createdAt,
        firstName: employees.firstName,
        lastName: employees.lastName,
        avatarUrl: employees.avatarUrl,
      })
      .from(birthdayWishes)
      .innerJoin(employees, eq(employees.id, birthdayWishes.senderId))
      .where(
        and(
          eq(birthdayWishes.jalaliYear, currentJalaliYear()),
          // A private card is only for the colleague it was written to (and its sender).
          or(eq(birthdayWishes.isPrivate, false), eq(birthdayWishes.targetUserId, viewer.id), eq(birthdayWishes.senderId, viewer.id)),
        ),
      )
      .orderBy(birthdayWishes.createdAt);
    const grouped: Record<string, ReturnType<typeof serializeWish>[]> = {};
    for (const r of rows) (grouped[r.targetUserId] ??= []).push(serializeWish(r));
    res.json(grouped);
  }),
);

function serializeWish(r: {
  id: number;
  senderId: string;
  text: string;
  occasion: string;
  design: string;
  isPrivate: boolean;
  reaction: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}) {
  return {
    id: String(r.id),
    senderId: r.senderId,
    senderName: fullName(r),
    senderAvatar: r.avatarUrl,
    text: r.text,
    occasion: r.occasion,
    design: r.design,
    isPrivate: r.isPrivate,
    reaction: r.reaction,
    time: r.createdAt.toISOString(),
  };
}

const greetingCardSchema = z.object({
  message: requiredText(500),
  occasion: z.enum(WISH_OCCASIONS).default('birthday'),
  design: z.enum(WISH_DESIGNS).default('confetti'),
  isPrivate: z.boolean().default(false),
});

employeesRouter.post(
  '/employees/:id/birthday_wishes',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { message, occasion, design, isPrivate } = parse(greetingCardSchema, req.body);
    const target = await loadEmployee(req.params.id);
    if (target.id !== viewer.id) {
      if (occasion === 'birthday' && target.hideBirthday) throw new HttpError(403, 'این همکار تاریخ تولدش را نمایش نمی‌دهد.');
      if (occasion === 'anniversary' && (target.hideAnniversary || yearsSince(target.hireDate) < 1)) {
        throw new HttpError(403, 'برای این همکار سالگرد همکاری ثبت نشده است.');
      }
    }
    await db.insert(birthdayWishes).values({
      targetUserId: target.id,
      senderId: viewer.id,
      jalaliYear: currentJalaliYear(),
      text: message,
      occasion,
      design,
      isPrivate,
    });
    if (target.id !== viewer.id) {
      await createNotifications([target.id], {
        title: occasion === 'birthday' ? 'کارت تبریک تولد دریافت کردید 💌' : 'کارت تبریک سالگرد همکاری دریافت کردید 💌',
        message: `${fullName(viewer)}: «${message}»`,
        type: 'birthday',
        linkTab: 'dashboard',
      });
    }
    broadcastChange('birthday_wishes');
    res.status(201).json({ success: true });
  }),
);

const reactionSchema = z.object({ reaction: z.union([z.enum(WISH_REACTIONS), z.literal('')]) });

/** The colleague a card was written to answers it with a reaction (or takes it back with ''). */
employeesRouter.put(
  '/birthday_wishes/:id/reaction',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { reaction } = parse(reactionSchema, req.body);
    const id = wishIdParam(req.params.id);
    const [wish] = await db.select().from(birthdayWishes).where(eq(birthdayWishes.id, id));
    if (!wish) throw new HttpError(404, 'پیام یافت نشد.');
    if (wish.targetUserId !== viewer.id) throw new HttpError(403, 'فقط کسی که کارت برایش فرستاده شده می‌تواند به آن واکنش نشان دهد.');
    await db.update(birthdayWishes).set({ reaction }).where(eq(birthdayWishes.id, id));
    // The sender hears about the first reaction only, so changing one's mind does not send a stream of notices.
    if (reaction && !wish.reaction && wish.senderId !== viewer.id) {
      await createNotifications([wish.senderId], {
        title: `${fullName(viewer)} به کارت تبریک شما واکنش نشان داد ${reaction}`,
        message: `«${wish.text}»`,
        type: 'birthday',
        linkTab: 'dashboard',
      });
    }
    broadcastChange('birthday_wishes');
    res.json({ success: true });
  }),
);

// Bulk import: the manager uploads an Excel/CSV file, checks the preview, then confirms the valid rows.
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

employeesRouter.post(
  '/employees/import/preview',
  requirePermission('users.manage'),
  (req, res, next) => {
    importUpload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') next(new HttpError(400, 'حجم فایل نباید بیشتر از ۲ مگابایت باشد.'));
      else next(err);
    });
  },
  route(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'فایلی انتخاب نشده است.');
    let sheet: string[][];
    try {
      sheet = readSpreadsheet(req.file.buffer, req.file.originalname);
    } catch (err) {
      if (err instanceof SpreadsheetError) throw new HttpError(400, err.message);
      throw err;
    }
    const { records, missing } = rowsToRecords(sheet);
    if (missing.length > 0) throw new HttpError(400, `ستون‌های لازم در ردیف اول فایل پیدا نشد: ${missing.join('، ')}`);
    if (records.length === 0) throw new HttpError(400, 'فایل هیچ ردیفی برای ورود ندارد.');
    if (records.length > MAX_IMPORT_ROWS) throw new HttpError(400, `هر بار حداکثر ${MAX_IMPORT_ROWS} نفر را می‌توان وارد کرد.`);
    // The preview words new access the way the chosen sign-in method will give it.
    const signIn = req.body?.signIn === 'ldap' && isDirectoryEnabled() ? 'ldap' : 'local';
    const rows = await checkRows(records, { rules: await accountRules(currentUser(req)), signIn });
    res.json({
      rows: rows.map(({ row, data, errors, warnings, action, target, changes }) => ({ row, data, errors, warnings, action, target, changes })),
      newDepartments: newDepartments(rows, await departmentList()),
    });
  }),
);

employeesRouter.post(
  '/employees/import',
  requirePermission('users.manage'),
  route(async (req, res) => {
    const body = parse(importRowsSchema, req.body);
    const viaDirectory = body.signIn === 'ldap';
    if (viaDirectory && !isDirectoryEnabled()) throw new HttpError(400, 'ورود با اکتیو دایرکتوری روی این سرور فعال نیست؛ رمز موقت بسازید.');
    const checked = await checkRows(body.rows.map((data, i) => ({ row: i + 1, data })), {
      rules: await accountRules(currentUser(req)),
      departments: body.departments,
      signIn: body.signIn,
    });
    const valid = checked.filter((r) => r.value);

    // Departments the manager chose to create join the list before anyone is put in them.
    const added = await addDepartments([...new Set(checked.flatMap((r) => (r.newDepartment ? [r.newDepartment] : [])))]);
    for (const r of checked) {
      if (r.value && added.has(r.value.department)) r.value.department = added.get(r.value.department)!;
      if (r.update?.set.department && added.has(r.update.set.department)) r.update.set.department = added.get(r.update.set.department)!;
    }

    // Rows with a username get an account, the rest join the phone book only. A portal-password account
    // gets a temporary password; an AD account none, since it signs in with the Windows password.
    const password = async (login: string | undefined) => {
      const temporary = login && !viaDirectory ? temporaryPassword() : null;
      return { temporary, hash: temporary ? await hashPassword(temporary) : '' };
    };
    const signInColumns = viaDirectory ? { authSource: 'ldap', mustChangePassword: false } : { authSource: 'local', mustChangePassword: true };
    const prepared: { row: number; value: ImportRow; temporary: string | null; hash: string }[] = [];
    for (const r of valid) prepared.push({ row: r.row, value: r.value!, ...(await password(r.value!.username)) });

    // Updates that give someone a portal account sign in the same way.
    const updates: { row: number; update: ImportUpdate; changes: string[]; temporary: string | null; hash: string }[] = [];
    for (const r of checked.filter((c) => c.update)) {
      updates.push({ row: r.row, update: r.update!, changes: r.changes ?? [], ...(await password(r.update!.username)) });
    }

    const { created, updated } = await db.transaction(async (tx) => {
      const updated = [];
      for (const { row, update, changes, temporary, hash } of updates) {
        const account = update.username
          ? { hasAccount: true, username: update.username, passwordHash: hash, ...signInColumns, failedLogins: 0, lockedUntil: null }
          : {};
        const [emp] = await tx
          .update(employees)
          .set({ ...update.set, ...account })
          // Access given in the meantime is not overwritten.
          .where(update.username ? and(eq(employees.id, update.id), eq(employees.hasAccount, false)) : eq(employees.id, update.id))
          .returning();
        if (emp) updated.push({ row, emp, changes, temporary });
      }
      const out = [];
      for (const { row, value, temporary, hash } of prepared) {
        const [emp] = await tx
          .insert(employees)
          .values({
            id: newId('emp'),
            ...value,
            username: value.username ?? null,
            hasAccount: Boolean(value.username),
            passwordHash: hash,
            ...(value.username ? signInColumns : { mustChangePassword: true }),
          })
          // A username taken since the check is skipped rather than overwritten.
          .onConflictDoNothing({ target: employees.username })
          .returning();
        if (emp) out.push({ row, emp, temporary });
      }
      return { created: out, updated };
    });

    const doneRows = new Set([...created, ...updated].map((c) => c.row));
    const skipped = checked
      .filter((r) => !doneRows.has(r.row) && r.action !== 'unchanged')
      .map((r) => ({ row: r.row, username: r.data.username ?? '', errors: r.errors.length ? r.errors : ['این ردیف هم‌زمان در جای دیگری تغییر کرد.'] }));

    if (created.length > 0 || updated.length > 0) {
      await audit(currentUser(req), {
        action: 'import',
        entity: 'employee',
        title: 'ورود همکاران از فایل اکسل',
        detail: [
          created.length > 0 ? `${toPersianDigits(created.length)} نفر جدید: ${names(created.map((c) => c.emp))}` : '',
          updated.length > 0 ? `${toPersianDigits(updated.length)} نفر به‌روز شد: ${names(updated.map((u) => u.emp))}` : '',
        ].filter(Boolean).join('؛ '),
      });
      broadcastChange('employees');
    }
    if (body.introduce && created.length > 0) {
      for (const { emp } of created) await introduceColleague(emp, '', emp.hireDate, false);
      const createdIds = new Set(created.map((c) => c.emp.id));
      const names = created.slice(0, 3).map((c) => fullName(c.emp)).join('، ');
      await createNotifications((await audienceIds()).filter((id) => !createdIds.has(id)), {
        title: 'معرفی همکاران جدید 👋',
        message: created.length > 3 ? `${names} و ${created.length - 3} همکار دیگر به سازمان ملحق شدند.` : `${names} به سازمان ملحق شدند.`,
        type: 'welcome',
        linkTab: 'dashboard',
      });
      broadcastChange('new_colleagues');
    }
    const summary = (emp: Employee, temporary: string | null) => ({
      id: emp.id,
      username: emp.username ?? '',
      hasAccount: emp.hasAccount,
      firstName: emp.firstName,
      lastName: emp.lastName,
      position: emp.position,
      department: emp.department,
      authSource: emp.authSource,
      // Shown once so the manager can print or hand them out; null for AD accounts and when no account was made.
      temporaryPassword: temporary,
    });
    res.status(201).json({
      created: created.map(({ emp, temporary }) => summary(emp, temporary)),
      updated: updated.map(({ emp, temporary, changes }) => ({ ...summary(emp, temporary), changes })),
      unchanged: checked.filter((r) => r.action === 'unchanged').length,
      skipped,
    });
  }),
);

// Active AD users who are not in the portal yet, as rows for the Excel import, plus the mismatches
// a manager should know about before AD sign-in creates accounts on its own.
employeesRouter.get(
  '/employees/directory',
  requirePermission('users.manage'),
  route(async (_req, res) => {
    if (!isDirectoryEnabled()) throw new HttpError(400, 'ورود با اکتیو دایرکتوری روی این سرور فعال نیست.');
    if (!canListDirectory()) {
      throw new HttpError(400, 'برای فهرست کاربران اکتیو دایرکتوری، حساب سرویس (LDAP_BIND_DN و LDAP_BIND_PASSWORD) باید در تنظیمات سرور باشد.');
    }
    let users;
    try {
      users = await listDirectoryUsers();
    } catch (err) {
      if (!(err instanceof DirectoryUnavailableError)) throw err;
      console.error(err.message);
      throw new HttpError(503, 'ارتباط با سرور اکتیو دایرکتوری برقرار نشد. کمی بعد دوباره تلاش کنید یا به واحد فناوری اطلاعات اطلاع دهید.');
    }
    const portal = await db.select().from(employees);
    const known = new Set(portal.flatMap((e) => (e.username ? [e.username] : [])));
    const inDirectory = new Set(users.map((u) => u.username));
    // Accounts without a first or last name, such as Administrator or a scanner's account, are rarely people.
    const people = users.filter((u) => u.firstName || u.lastName);
    const byName = (a: string, b: string) => a.localeCompare(b, 'fa');
    res.json({
      newUsers: people
        .filter((u) => !known.has(u.username))
        .map((u) => ({
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          // The import needs a position and department; «نامشخص» is what AD sign-in uses too.
          position: u.position || 'نامشخص',
          department: u.department || 'نامشخص',
          email: u.email,
          mobile: u.mobile,
          extension: u.extension,
        }))
        .sort((a, b) => byName(a.department, b.department) || byName(a.lastName, b.lastName) || byName(a.firstName, b.firstName)),
      inPortal: people.filter((u) => known.has(u.username)).length,
      unnamed: users.filter((u) => !u.firstName && !u.lastName).map((u) => u.username).sort(byName),
      // These cannot sign in with AD: a local account, a username that differs from Windows, or someone who left.
      notInDirectory: portal
        .filter((e) => e.isActive && e.hasAccount && e.username && !inDirectory.has(e.username))
        .map((e) => ({ username: e.username!, name: fullName(e) }))
        .sort((a, b) => byName(a.username, b.username)),
    });
  }),
);

// --- Moderation: the sender or anyone with comments.moderate may remove a message ---

function wishIdParam(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'پیام یافت نشد.');
  return id;
}

/** A moderator removing someone else's message is kept in the change history, with what it said. */
async function auditRemovedMessage(viewer: SessionUser, kind: string, senderId: string, text: string) {
  await audit(viewer, { action: 'delete', entity: 'message', title: `پیام ${kind} از ${await personName(senderId)}`, detail: text });
}

function assertMayRemoveWish(viewer: SessionUser, senderId: string) {
  if (senderId !== viewer.id && !can(viewer, 'comments.moderate')) {
    throw new HttpError(403, 'فقط فرستنده یا مدیر پیام‌ها می‌تواند این پیام را حذف کند.');
  }
}

employeesRouter.delete(
  '/colleague_wishes/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const id = wishIdParam(req.params.id);
    const [wish] = await db.select().from(colleagueWishes).where(eq(colleagueWishes.id, id));
    if (!wish) throw new HttpError(404, 'پیام یافت نشد.');
    assertMayRemoveWish(viewer, wish.senderId);
    await db.delete(colleagueWishes).where(eq(colleagueWishes.id, id));
    if (wish.senderId !== viewer.id) {
      const [card] = await db.select({ userId: newColleagues.userId }).from(newColleagues).where(eq(newColleagues.id, wish.newColleagueId));
      await auditRemovedMessage(viewer, `خوش‌آمد به ${await personName(card?.userId ?? null)}`, wish.senderId, wish.message);
    }
    broadcastChange('new_colleagues');
    res.json({ success: true });
  }),
);

employeesRouter.delete(
  '/birthday_wishes/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const id = wishIdParam(req.params.id);
    const [wish] = await db.select().from(birthdayWishes).where(eq(birthdayWishes.id, id));
    if (!wish) throw new HttpError(404, 'پیام یافت نشد.');
    assertMayRemoveWish(viewer, wish.senderId);
    await db.delete(birthdayWishes).where(eq(birthdayWishes.id, id));
    if (wish.senderId !== viewer.id) await auditRemovedMessage(viewer, `تبریک تولد به ${await personName(wish.targetUserId)}`, wish.senderId, wish.text);
    broadcastChange('birthday_wishes');
    res.json({ success: true });
  }),
);
