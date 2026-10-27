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
  /** The department that runs the system, so it shows on that department's page. */
  department?: string;
}

export interface BannerRecord {
  text: string;
  level: 'info' | 'warning';
  expiresAt: string; // ISO time
  updatedById: string;
  updatedAt: string; // ISO time
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
  // Colleagues without a portal account (e.g. workshop staff listed only in the phone book) have no username.
  username: text('username').unique(),
  passwordHash: text('password_hash').notNull(),
  // False for people who appear in the phone book, org chart and birthday cards but cannot sign in.
  hasAccount: boolean('has_account').notNull().default(true),
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
    // Who the item is for. All empty means the whole organization. The department, location and role
    // lists narrow each other (e.g. sales staff in the Shiraz branch); targetUserIds adds people on top.
    targetDepartments: text('target_departments').array().notNull().default([]),
    targetLocations: text('target_locations').array().notNull().default([]),
    targetRoles: text('target_roles').array().notNull().default([]),
    targetUserIds: text('target_user_ids').array().notNull().default([]),
    // 'html' for text written in the editor (sanitized when saved); older items are plain 'text'.
    contentFormat: text('content_format').notNull().default('text'),
    // Circulars: acknowledge by the end of this day. Reminder and overdue report are sent once each.
    ackDeadline: timestamp('ack_deadline', { withTimezone: true }),
    ackRemindedAt: timestamp('ack_reminded_at', { withTimezone: true }),
    ackAutoRemindedAt: timestamp('ack_auto_reminded_at', { withTimezone: true }),
    ackReportedAt: timestamp('ack_reported_at', { withTimezone: true }),
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

/** Who may see a poll's results besides its creator and poll managers (who always may). */
export type PollResultsVisibility = 'managers' | 'after_answer' | 'after_close';

export const polls = pgTable('polls', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdById: text('created_by_id').notNull().references(() => employees.id),
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Anonymous polls never show who answered what, not even to their creator. */
  anonymous: boolean('anonymous').notNull().default(true),
  resultsVisibility: text('results_visibility').$type<PollResultsVisibility>().notNull().default('after_answer'),
  /** Written answers are shown to those who see the results; otherwise only to the creator and poll managers. */
  showTextAnswers: boolean('show_text_answers').notNull().default(false),
  targetDepartments: text('target_departments').array().notNull().default([]),
  targetLocations: text('target_locations').array().notNull().default([]),
  targetRoles: text('target_roles').array().notNull().default([]),
  targetUserIds: text('target_user_ids').array().notNull().default([]),
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  autoRemindedAt: timestamp('auto_reminded_at', { withTimezone: true }),
});

export type PollQuestionType = 'single' | 'multiple' | 'rating' | 'text';

export const pollQuestions = pgTable('poll_questions', {
  id: text('id').primaryKey(),
  pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  type: text('type').$type<PollQuestionType>().notNull(),
  /** Empty only for polls from before multi-question polls, whose title is the question. */
  text: text('text').notNull(),
  required: boolean('required').notNull().default(true),
});

export const pollOptions = pgTable('poll_options', {
  id: text('id').primaryKey(),
  pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => pollQuestions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  position: integer('position').notNull().default(0),
});

/** One person's filled-in poll; a person answers a poll once. */
export const pollResponses = pgTable(
  'poll_responses',
  {
    id: serial('id').primaryKey(),
    pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('poll_responses_poll_user_uq').on(t.pollId, t.userId)],
);

/** An answer to one question: a chosen option (one row per option for multi-select), a rating or a text. */
export const pollAnswers = pgTable(
  'poll_answers',
  {
    id: serial('id').primaryKey(),
    responseId: integer('response_id').notNull().references(() => pollResponses.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull().references(() => pollQuestions.id, { onDelete: 'cascade' }),
    optionId: text('option_id').references(() => pollOptions.id, { onDelete: 'cascade' }),
    rating: integer('rating'),
    text: text('text'),
  },
  (t) => [index('poll_answers_question_idx').on(t.questionId)],
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
  // Set for the calendar entry of a training, so it follows the training when it is edited or deleted.
  trainingId: text('training_id').references(() => trainings.id, { onDelete: 'cascade' }),
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
  // The file above is the current version. A new version replaces it under the same document (so
  // links to the document keep working) and the earlier file moves to document_versions.
  version: integer('version').notNull().default(1),
  versionNote: text('version_note').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Rules colleagues must read and confirm, like a circular. Confirmations of ackVersion or later
  // count; a new version that everyone must read again moves ackVersion to it.
  requiresAck: boolean('requires_ack').notNull().default(false),
  ackVersion: integer('ack_version').notNull().default(1),
  ackRemindedAt: timestamp('ack_reminded_at', { withTimezone: true }),
  // Who keeps the document current, and when they are reminded to look at it again (once per date).
  ownerId: text('owner_id').references(() => employees.id, { onDelete: 'set null' }),
  reviewAt: timestamp('review_at', { withTimezone: true }),
  reviewRemindedAt: timestamp('review_reminded_at', { withTimezone: true }),
  // Who the document is for, with the same rules as news (see shared/audience.ts). Empty: everyone.
  targetDepartments: text('target_departments').array().notNull().default([]),
  targetLocations: text('target_locations').array().notNull().default([]),
  targetRoles: text('target_roles').array().notNull().default([]),
  targetUserIds: text('target_user_ids').array().notNull().default([]),
  // Words of the current file (PDF, Word, Excel, PowerPoint, text) for search, normalized like the
  // search box (see server/textExtract.ts). Null until read; empty when nothing could be read.
  contentText: text('content_text'),
});

// Earlier files of a document, kept so its history can be opened and old links still download.
export const documentVersions = pgTable(
  'document_versions',
  {
    id: serial('id').primaryKey(),
    documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    note: text('note').notNull().default(''),
    uploadedById: text('uploaded_by_id').notNull().references(() => employees.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('document_versions_doc_version_uq').on(t.documentId, t.version)],
);

// "I have read this and will follow it", for the version that was current at the time.
export const documentAcks = pgTable(
  'document_acks',
  {
    documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] })],
);

// Short "how do I...?" pages, e.g. requesting petty cash or leave, linking to the system or form to use.
export const guides = pgTable('guides', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  summary: text('summary').notNull().default(''),
  // HTML from the editor, sanitized when saved (server/richText.ts).
  content: text('content').notNull(),
  // The department the guide belongs to, shown on that department's page ('' for none).
  department: text('department').notNull().default(''),
  ownerId: text('owner_id').references(() => employees.id, { onDelete: 'set null' }),
  reviewAt: timestamp('review_at', { withTimezone: true }),
  reviewRemindedAt: timestamp('review_reminded_at', { withTimezone: true }),
  createdById: text('created_by_id').notNull().references(() => employees.id),
  updatedById: text('updated_by_id').notNull().references(() => employees.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// "Was this guide helpful?", one answer per colleague (the latest counts).
export const guideFeedback = pgTable(
  'guide_feedback',
  {
    guideId: text('guide_id').notNull().references(() => guides.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    helpful: boolean('helpful').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.userId] })],
);

// A department's own page: who leads it and what colleagues can come to it for.
export const departmentPages = pgTable('department_pages', {
  department: text('department').primaryKey(),
  headId: text('head_id').references(() => employees.id, { onDelete: 'set null' }),
  // "What to come to us for", HTML from the editor, sanitized when saved.
  about: text('about').notNull().default(''),
  updatedById: text('updated_by_id').references(() => employees.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Searches that found nothing, so the people who write guides see what is missing.
export const searchMisses = pgTable('search_misses', {
  query: text('query').primaryKey(),
  count: integer('count').notNull().default(1),
  lastAt: timestamp('last_at', { withTimezone: true }).notNull().defaultNow(),
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
  // Short message shown above every page until it expires (e.g. "the internet is down until noon").
  banner: jsonb('banner').$type<BannerRecord | null>(),
  // Where colleagues work (branches, warehouse, floors); a managed list like departments.
  locations: text('locations').array().notNull().default([]),
  // Dashboard cards an admin switched off, e.g. { mood: false }. Missing keys are shown.
  dashboardCards: jsonb('dashboard_cards').$type<Record<string, boolean>>().notNull().default({}),
  // Company logo shown in the header and on the sign-in page ('' = the built-in ROYA wordmark).
  logoUrl: text('logo_url').notNull().default(''),
});
