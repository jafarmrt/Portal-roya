import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Dates that are only meaningful on the Jalali calendar (birthdays, calendar
// days) are stored as 'YYYY/MM/DD' Jalali strings. Moments in time (creation,
// publish, expiry) are stored as timestamps and formatted on the client.

export interface SkillRecord {
  id: string;
  name: string;
  category: string;
  endorsedBy: string[];
}

export interface WorkExperienceRecord {
  id: string;
  company: string;
  role: string;
  startYear: string;
  endYear: string;
  description: string;
}

export interface AttachmentRecord {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface ExternalSystemRecord {
  id: string;
  name: string;
  description: string;
  iconName: string;
  /** Optional logo uploaded to this server; shown instead of the icon when set. */
  imageUrl?: string;
  url: string;
  bgColor: string;
  textColor: string;
}

export const roles = pgTable('roles', {
  id: text('id').primaryKey(), // 'admin' | 'manager' | 'employee' | 'role-<uuid>' for roles added by an admin
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  permissions: text('permissions').array().notNull().default([]),
  // Built-in roles cannot be deleted; the admin role's permissions cannot be changed.
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // 'local' accounts sign in with the portal password; 'ldap' accounts with their Active Directory password.
  authSource: text('auth_source').notNull().default('local'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  role: text('role')
    .notNull()
    .default('employee')
    .references(() => roles.id, { onUpdate: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  position: text('position').notNull(),
  department: text('department').notNull(),
  email: text('email').notNull().default(''),
  mobile: text('mobile').notNull().default(''),
  extension: text('extension').notNull().default(''),
  bio: text('bio').notNull().default(''),
  location: text('location').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  birthDate: text('birth_date').notNull().default(''),
  // The colleague asked not to show their birthday to others (cards, calendar, profile).
  hideBirthday: boolean('hide_birthday').notNull().default(false),
  hireDate: text('hire_date').notNull().default(''),
  directManagerId: text('direct_manager_id'),
  skills: jsonb('skills').$type<SkillRecord[]>().notNull().default([]),
  workExperiences: jsonb('work_experiences').$type<WorkExperienceRecord[]>().notNull().default([]),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const news = pgTable(
  'news',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull(),
    authorId: text('author_id').notNull().references(() => employees.id),
    image: text('image').notNull().default(''),
    isPinned: boolean('is_pinned').notNull().default(false),
    isUrgent: boolean('is_urgent').notNull().default(false),
    requiresAck: boolean('requires_ack').notNull().default(false),
    tags: text('tags').array().notNull().default([]),
    // Empty array means the whole organization.
    targetDepartments: text('target_departments').array().notNull().default([]),
    attachments: jsonb('attachments').$type<AttachmentRecord[]>().notNull().default([]),
    publishAt: timestamp('publish_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Set once notifications for the item have been sent (immediately or by the scheduler).
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('news_publish_at_idx').on(t.publishAt)],
);

export const newsLikes = pgTable(
  'news_likes',
  {
    newsId: text('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.userId] })],
);

export const newsReads = pgTable(
  'news_reads',
  {
    newsId: text('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.userId] })],
);

export const polls = pgTable('polls', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  department: text('department').notNull().default('all'),
  createdById: text('created_by_id').notNull().references(() => employees.id),
  type: text('type').notNull(), // 'multiple_choice' | 'free_text'
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptions = pgTable('poll_options', {
  id: text('id').primaryKey(),
  pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  position: integer('position').notNull().default(0),
});

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: serial('id').primaryKey(),
    pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    optionId: text('option_id').references(() => pollOptions.id, { onDelete: 'cascade' }),
    freeText: text('free_text'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('poll_votes_poll_user_uq').on(t.pollId, t.userId)],
);

export const moods = pgTable(
  'moods',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // Jalali YYYY/MM/DD
    mood: text('mood').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('moods_user_date_uq').on(t.userId, t.date)],
);

export const trainings = pgTable('trainings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  instructor: text('instructor').notNull(),
  instructorRole: text('instructor_role').notNull().default(''),
  date: text('date').notNull(), // Jalali YYYY/MM/DD
  time: text('time').notNull().default(''),
  duration: text('duration').notNull().default(''),
  location: text('location').notNull().default(''),
  capacity: integer('capacity').notNull(),
  description: text('description').notNull(),
  coverImage: text('cover_image').notNull().default(''),
  category: text('category').notNull(),
  prerequisites: text('prerequisites').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingEnrollments = pgTable(
  'training_enrollments',
  {
    trainingId: text('training_id').notNull().references(() => trainings.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trainingId, t.userId] })],
);

export const newColleagues = pgTable('new_colleagues', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  welcomeMessage: text('welcome_message').notNull(),
  joinDate: text('join_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const colleagueWishes = pgTable('colleague_wishes', {
  id: serial('id').primaryKey(),
  newColleagueId: text('new_colleague_id').notNull().references(() => newColleagues.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const birthdayWishes = pgTable('birthday_wishes', {
  id: serial('id').primaryKey(),
  targetUserId: text('target_user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  jalaliYear: integer('jalali_year').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per colleague and Jalali year once the birthday notification has gone out.
export const birthdayAnnouncements = pgTable(
  'birthday_announcements',
  {
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    jalaliYear: integer('jalali_year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.jalaliYear] })],
);

export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(), // Jalali YYYY/MM/DD
  type: text('type').notNull(),
  description: text('description').notNull().default(''),
  time: text('time'),
  location: text('location'),
  badgeColor: text('badge_color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Organization-specific overrides of the built-in holiday table, keyed by 'YYYY-MM-DD' (Jalali).
export const customHolidays = pgTable('custom_holidays', {
  date: text('date').primaryKey(),
  title: text('title').notNull(),
  isHoliday: boolean('is_holiday').notNull().default(true),
});

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull(),
    linkTab: text('link_tab'),
    linkId: text('link_id'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  uploadedById: text('uploaded_by_id').notNull().references(() => employees.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey(), // single row: 'global'
  departments: text('departments').array().notNull().default([]),
  newsCategories: text('news_categories').array().notNull().default([]),
  trainingCategories: text('training_categories').array().notNull().default([]),
  documentCategories: text('document_categories').array().notNull().default([]),
  systems: jsonb('systems').$type<ExternalSystemRecord[]>().notNull().default([]),
  // Visitors who are not signed in may read public content; the staff directory is opt-in separately.
  guestAccess: boolean('guest_access').notNull().default(true),
  guestDirectory: boolean('guest_directory').notNull().default(false),
});
