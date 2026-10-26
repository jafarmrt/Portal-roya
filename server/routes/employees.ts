import { randomBytes } from 'crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentJalaliYear, todayJalali } from '../../shared/jalali.js';
import { type Employee, hashPassword, requireManager } from '../auth.js';
import { db } from '../db/index.js';
import { checkRows, type ImportRow, importRowsSchema, MAX_IMPORT_ROWS, rowsToRecords } from '../employeeImport.js';
import { birthdayWishes, colleagueWishes, employees, newColleagues } from '../db/schema.js';
import { broadcastChange } from '../events.js';
import { currentUser, HttpError, newId, parse, route, viewerOf } from '../http.js';
import { audienceIds, createNotifications } from '../notify.js';
import { fullName, serializeEmployee, serializeForGuest } from '../serializers.js';
import { guestSettings } from '../settings.js';
import { readSpreadsheet, SpreadsheetError } from '../spreadsheet.js';
import { assetUrl, assetUrlValue, jalaliDateValue, optionalJalaliDate, optionalText, password, requiredText, textValue, username } from '../validation.js';

export const employeesRouter = Router();

/** Readable temporary password, shown once to the manager who created or reset the account. */
function temporaryPassword() {
  return randomBytes(6).toString('base64url');
}

async function loadEmployee(id: string) {
  const [emp] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!emp) throw new HttpError(404, 'همکار یافت نشد.');
  return emp;
}

function assertSelfOrManager(viewer: Employee, targetId: string) {
  if (viewer.id !== targetId && viewer.role !== 'manager') {
    throw new HttpError(403, 'فقط خود همکار یا مدیر می‌تواند این تغییر را انجام دهد.');
  }
}

async function activeManagerCount(excludeId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.role, 'manager'), eq(employees.isActive, true), ne(employees.id, excludeId)));
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
    const visible = viewer.role === 'manager' ? rows : rows.filter((e) => e.isActive);
    res.json(visible.map((e) => serializeEmployee(e, viewer.id, byId)));
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
};

const createSchema = z.object({
  ...contactFields,
  username: username.optional(),
  password: password.optional(),
  firstName: requiredText(100),
  lastName: requiredText(100),
  position: requiredText(100),
  department: requiredText(100),
  role: z.enum(['employee', 'manager']).default('employee'),
  hireDate: optionalJalaliDate,
  directManagerId: z.string().max(100).nullable().optional(),
  isNewColleague: z.boolean().default(false),
  newColleagueMessage: optionalText(1000),
});

employeesRouter.post(
  '/employees',
  requireManager,
  route(async (req, res) => {
    const body = parse(createSchema, req.body);
    const username = body.username || (body.email ? body.email.split('@')[0].toLowerCase() : '');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new HttpError(400, 'نام کاربری معتبر وارد کنید (حروف انگلیسی، عدد و . _ -).');
    }
    const [existing] = await db.select({ id: employees.id }).from(employees).where(eq(employees.username, username));
    if (existing) throw new HttpError(409, `نام کاربری «${username}» قبلاً استفاده شده است.`);

    const initialPassword = body.password || temporaryPassword();
    const [emp] = await db
      .insert(employees)
      .values({
        id: newId('emp'),
        username,
        passwordHash: await hashPassword(initialPassword),
        mustChangePassword: true,
        role: body.role,
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
        hireDate: body.hireDate || todayJalali(),
        directManagerId: body.directManagerId || null,
      })
      .returning();

    if (body.isNewColleague) {
      const name = fullName(emp);
      await db.insert(newColleagues).values({
        id: newId('nc'),
        userId: emp.id,
        welcomeMessage:
          body.newColleagueMessage || `خوش‌آمدگویی گرم به ${name} که به عنوان ${emp.position} به تیم ما پیوسته است.`,
        joinDate: emp.hireDate,
      });
      await createNotifications(await audienceIds([], emp.id), {
        title: 'معرفی همکار جدید 👋',
        message: `${name} به عنوان ${emp.position} به سازمان ملحق شد.`,
        type: 'welcome',
        linkTab: 'dashboard',
      });
      broadcastChange('new_colleagues');
    }

    broadcastChange('employees');
    res.status(201).json({
      employee: serializeEmployee(emp, currentUser(req).id),
      // Returned once so the manager can hand it to the new colleague.
      temporaryPassword: initialPassword,
    });
  }),
);

// Update fields have no defaults: a PATCH changes only the fields it sends.
const contactUpdateFields = {
  email: textValue(200),
  mobile: textValue(30),
  extension: textValue(20),
  bio: textValue(2000),
  location: textValue(200),
  avatar: assetUrlValue,
  birthDate: jalaliDateValue,
};
const managerOnlyFields = {
  firstName: requiredText(100),
  lastName: requiredText(100),
  position: requiredText(100),
  department: requiredText(100),
  role: z.enum(['employee', 'manager']),
  hireDate: jalaliDateValue,
  directManagerId: z.string().max(100).nullable(),
  isActive: z.boolean(),
};
const updateSchema = z.object({ ...contactUpdateFields, ...managerOnlyFields }).partial();

employeesRouter.patch(
  '/employees/:id',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrManager(viewer, req.params.id);
    const target = await loadEmployee(req.params.id);
    const body = parse(updateSchema, req.body);

    if (viewer.role !== 'manager') {
      for (const key of Object.keys(managerOnlyFields)) {
        if (key in body) throw new HttpError(403, 'تغییر نام، سمت، واحد و نقش فقط توسط مدیر ممکن است.');
      }
    }
    const losesManagerAccess =
      target.role === 'manager' && (body.role === 'employee' || body.isActive === false);
    if (losesManagerAccess && (await activeManagerCount(target.id)) === 0) {
      throw new HttpError(400, 'پرتال باید حداقل یک مدیر فعال داشته باشد.');
    }
    if (body.directManagerId === target.id) {
      throw new HttpError(400, 'همکار نمی‌تواند مدیر مستقیم خودش باشد.');
    }

    const { avatar, ...rest } = body;
    const [updated] = await db
      .update(employees)
      .set({ ...rest, ...(avatar !== undefined ? { avatarUrl: avatar } : {}) })
      .where(eq(employees.id, target.id))
      .returning();
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer.id));
  }),
);

employeesRouter.post(
  '/employees/:id/reset-password',
  requireManager,
  route(async (req, res) => {
    const target = await loadEmployee(req.params.id);
    const temp = temporaryPassword();
    await db
      .update(employees)
      .set({ passwordHash: await hashPassword(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null })
      .where(eq(employees.id, target.id));
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
    assertSelfOrManager(viewer, req.params.id);
    const exp = parse(experienceSchema, req.body);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      workExperiences: [{ id: newId('we'), ...exp }, ...emp.workExperiences],
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer.id));
  }),
);

employeesRouter.delete(
  '/employees/:id/experiences/:expId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrManager(viewer, req.params.id);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      workExperiences: emp.workExperiences.filter((w) => w.id !== req.params.expId),
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer.id));
  }),
);

const skillSchema = z.object({ name: requiredText(100), category: optionalText(100) });

employeesRouter.post(
  '/employees/:id/skills',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrManager(viewer, req.params.id);
    const skill = parse(skillSchema, req.body);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      skills: [...emp.skills, { id: newId('sk'), name: skill.name, category: skill.category || 'تخصصی', endorsedBy: [] }],
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer.id));
  }),
);

employeesRouter.delete(
  '/employees/:id/skills/:skillId',
  route(async (req, res) => {
    const viewer = currentUser(req);
    assertSelfOrManager(viewer, req.params.id);
    const updated = await mutateProfile(req.params.id, (emp) => ({
      skills: emp.skills.filter((s) => s.id !== req.params.skillId),
    }));
    broadcastChange('employees');
    res.json(serializeEmployee(updated, viewer.id));
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
    res.json(serializeEmployee(updated, viewer.id));
  }),
);

// --- New colleagues & birthday wishes ---

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
          .map((w) => ({ id: String(w.id), userName: fullName(w), message: w.message, time: w.createdAt.toISOString() })),
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
    if (!viewerOf(req) && !(await guestSettings()).guestDirectory) {
      res.json({});
      return;
    }
    const rows = await db
      .select({
        id: birthdayWishes.id,
        targetUserId: birthdayWishes.targetUserId,
        text: birthdayWishes.text,
        createdAt: birthdayWishes.createdAt,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(birthdayWishes)
      .innerJoin(employees, eq(employees.id, birthdayWishes.senderId))
      .where(eq(birthdayWishes.jalaliYear, currentJalaliYear()))
      .orderBy(birthdayWishes.createdAt);
    const grouped: Record<string, { id: string; senderName: string; text: string; time: string }[]> = {};
    for (const r of rows) {
      (grouped[r.targetUserId] ??= []).push({
        id: String(r.id),
        senderName: fullName(r),
        text: r.text,
        time: r.createdAt.toISOString(),
      });
    }
    res.json(grouped);
  }),
);

employeesRouter.post(
  '/employees/:id/birthday_wishes',
  route(async (req, res) => {
    const viewer = currentUser(req);
    const { message } = parse(wishSchema, req.body);
    const target = await loadEmployee(req.params.id);
    await db.insert(birthdayWishes).values({
      targetUserId: target.id,
      senderId: viewer.id,
      jalaliYear: currentJalaliYear(),
      text: message,
    });
    if (target.id !== viewer.id) {
      await createNotifications([target.id], {
        title: 'تبریک تولد دریافت شد 🎂',
        message: `${fullName(viewer)}: «${message}»`,
        type: 'birthday',
        linkTab: 'dashboard',
      });
    }
    broadcastChange('birthday_wishes');
    res.status(201).json({ success: true });
  }),
);

// Bulk import: the manager uploads an Excel/CSV file, checks the preview, then confirms the valid rows.
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

employeesRouter.post(
  '/employees/import/preview',
  requireManager,
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
    const rows = await checkRows(records);
    res.json({ rows: rows.map(({ row, data, errors }) => ({ row, data, errors })) });
  }),
);

employeesRouter.post(
  '/employees/import',
  requireManager,
  route(async (req, res) => {
    const body = parse(importRowsSchema, req.body);
    const checked = await checkRows(body.rows.map((data, i) => ({ row: i + 1, data })));
    const valid = checked.filter((r) => r.value);

    const prepared: { value: ImportRow; temporary: string; hash: string }[] = [];
    for (const r of valid) {
      const temporary = temporaryPassword();
      prepared.push({ value: r.value!, temporary, hash: await hashPassword(temporary) });
    }

    const created = await db.transaction(async (tx) => {
      const out = [];
      for (const { value, temporary, hash } of prepared) {
        const [emp] = await tx
          .insert(employees)
          .values({
            id: newId('emp'),
            ...value,
            passwordHash: hash,
            mustChangePassword: true,
            hireDate: value.hireDate || todayJalali(),
          })
          // A username taken since the check is skipped rather than overwritten.
          .onConflictDoNothing({ target: employees.username })
          .returning();
        if (emp) out.push({ emp, temporary });
      }
      return out;
    });

    const createdNames = new Set(created.map((c) => c.emp.username));
    const skipped = checked
      .filter((r) => !r.value || !createdNames.has(r.value.username))
      .map((r) => ({ row: r.row, username: r.data.username ?? '', errors: r.errors.length ? r.errors : ['نام کاربری هم‌زمان ثبت شد.'] }));

    if (created.length > 0) broadcastChange('employees');
    res.status(201).json({
      created: created.map(({ emp, temporary }) => ({
        id: emp.id,
        username: emp.username,
        firstName: emp.firstName,
        lastName: emp.lastName,
        position: emp.position,
        department: emp.department,
        // Shown once so the manager can print or hand them out.
        temporaryPassword: temporary,
      })),
      skipped,
    });
  }),
);
