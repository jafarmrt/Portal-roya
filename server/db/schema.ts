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
import type { AboutMe } from '../../shared/aboutMe.js';
import type { AuditAction, AuditEntity } from '../../shared/audit.js';
import type { FeatureLaunch, FeatureState } from '../../shared/features.js';
import type { KudosEmoji } from '../../shared/kudos.js';
import type { MonthlySummary } from '../../shared/reports.js';
import type { EntryKind, EventPhase, EventStatus, EventTheme, Format, IdeaKind, RankBy, ScheduleItem, Scoring, ScreenState, StagePolicy, TieRule } from '../../shared/specialEvents.js';
import type { SuggestionBoxNames } from '../../shared/suggestions.js';
import type { TaskStatus } from '../../shared/tasks.js';
import type { TodoRemind, TodoRepeat, TodoStep } from '../../shared/todos.js';

export type { AuditAction, AuditEntity };

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
  /** Address used inside the company network ('#' or '' = not set). */
  url: string;
  /** Address used from the internet; see shared/systemLinks.ts for the fallbacks. */
  externalUrl?: string;
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
  /** Answers to the light «دربارهٔ من» questions (shared/aboutMe.ts); only the colleague edits them. */
  aboutMe: jsonb('about_me').$type<AboutMe>().notNull().default({}),
  location: text('location').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  birthDate: text('birth_date').notNull().default(''),
  // The colleague asked not to show their birthday to others (cards, calendar, profile).
  hideBirthday: boolean('hide_birthday').notNull().default(false),
  hireDate: text('hire_date').notNull().default(''),
  // The colleague asked not to be congratulated on their work anniversary in front of others.
  hideAnniversary: boolean('hide_anniversary').notNull().default(false),
  directManagerId: text('direct_manager_id'),
  skills: jsonb('skills').$type<SkillRecord[]>().notNull().default([]),
  workExperiences: jsonb('work_experiences').$type<WorkExperienceRecord[]>().notNull().default([]),
  failedLogins: integer('failed_logins').notNull().default(0),
  /** Raised to end every open session (password change or reset, «خروج از همهٔ دستگاه‌ها»). */
  sessionVersion: integer('session_version').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  /** The last time the colleague used the portal (signing in or any page), kept to within a few minutes. */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  /** Newly introduced parts of the portal the colleague has opened or whose introduction they closed. */
  seenFeatures: text('seen_features').array().notNull().default([]),
  /** The colleague wants the once-a-day effect of Nowruz, the seasons and the feasts on their dashboard. */
  occasionEffects: boolean('occasion_effects').notNull().default(true),
  /** The colleague's own order of the dashboard cards ([] = the default order). */
  dashboardOrder: text('dashboard_order').array().notNull().default([]),
  /** The colleague appears in «همکاران آنلاین»; turning it off also hides the list from them. */
  showOnline: boolean('show_online').notNull().default(true),
  /** Colleagues may send them a ready-made emoji. */
  acceptKudos: boolean('accept_kudos').notNull().default(true),
  /** Steps of «هفتهٔ اول من» the colleague ticked (and 'closed' once they closed the list). */
  firstWeekDone: text('first_week_done').array().notNull().default([]),
  /** Kinds of notification (shared/push.ts) the colleague does not want on their phone or computer; [] = all of them. */
  pushMuted: text('push_muted').array().notNull().default([]),
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
    // A draft is seen only by the people who publish news and is announced when it is published.
    isDraft: boolean('is_draft').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('news_publish_at_idx').on(t.publishAt)],
);

/** What an item looked like before an edit, for its edit history. */
export interface NewsSnapshot {
  title: string;
  summary: string;
  content: string;
  contentFormat: string;
  category: string;
  image: string;
  isPinned: boolean;
  isUrgent: boolean;
  requiresAck: boolean;
  tags: string[];
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  targetUserIds: string[];
  attachments: AttachmentRecord[];
  publishAt: string;
  expiresAt: string | null;
  ackDeadline: string | null;
}

/** One entry of an item's edit history: a draft published, or a published item edited (with its earlier state). */
export const newsRevisions = pgTable(
  'news_revisions',
  {
    id: serial('id').primaryKey(),
    newsId: text('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
    editorId: text('editor_id').references(() => employees.id, { onDelete: 'set null' }),
    action: text('action').$type<'publish' | 'edit'>().notNull(),
    /** Keys of NewsSnapshot that this edit changed. */
    changed: text('changed').array().notNull().default([]),
    snapshot: jsonb('snapshot').$type<NewsSnapshot>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('news_revisions_news_idx').on(t.newsId)],
);

/**
 * A colleague's question to the publisher of an item. Private between the two (and news managers)
 * unless the answer is shared, which adds it to the item's questions and answers without the name.
 */
export const newsQuestions = pgTable(
  'news_questions',
  {
    id: text('id').primaryKey(),
    newsId: text('news_id').notNull().references(() => news.id, { onDelete: 'cascade' }),
    askerId: text('asker_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer'),
    answeredById: text('answered_by_id').references(() => employees.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    isPublic: boolean('is_public').notNull().default(false),
    /** The question as shown to everyone, when the publisher reworded it (e.g. to leave out personal details). */
    publicQuestion: text('public_question'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('news_questions_news_idx').on(t.newsId)],
);

/** Ready-made texts for recurring announcements; [جای خالی] marks what the publisher fills in. */
export const newsTemplates = pgTable('news_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  content: text('content').notNull().default(''),
  category: text('category').notNull().default(''),
  isUrgent: boolean('is_urgent').notNull().default(false),
  requiresAck: boolean('requires_ack').notNull().default(false),
  tags: text('tags').array().notNull().default([]),
  createdById: text('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  /** The instructor's portal account, when they have one: they take attendance and see the feedback. */
  instructorId: text('instructor_id').references(() => employees.id, { onDelete: 'set null' }),
  /** Handouts and slides, for the people who took the course. */
  materials: jsonb('materials').$type<AttachmentRecord[]>().notNull().default([]),
  /** The day-before reminder was sent. */
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  /** Participants were asked for their feedback after the course. */
  feedbackRequestedAt: timestamp('feedback_requested_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trainingEnrollments = pgTable(
  'training_enrollments',
  {
    trainingId: text('training_id').notNull().references(() => trainings.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    /** 'enrolled', or 'waitlist' when the course was full; the waitlist is served in order of createdAt. */
    status: text('status').$type<'enrolled' | 'waitlist'>().notNull().default('enrolled'),
    /** Taken by the instructor: present, absent, or not recorded yet. */
    attended: boolean('attended'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trainingId, t.userId] })],
);

/** The short survey after a course: two 1–5 ratings and an optional comment, shown without names. */
export const trainingFeedback = pgTable(
  'training_feedback',
  {
    trainingId: text('training_id').notNull().references(() => trainings.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    satisfaction: integer('satisfaction').notNull(),
    usefulness: integer('usefulness').notNull(),
    comment: text('comment').notNull().default(''),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
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
  // 'birthday' or 'anniversary' (work anniversary); see shared/celebrations.ts.
  occasion: text('occasion').notNull().default('birthday'),
  // The card's look, one of WISH_DESIGNS.
  design: text('design').notNull().default('confetti'),
  // Private cards are seen only by the sender and the colleague they are for.
  isPrivate: boolean('is_private').notNull().default(false),
  // The colleague's reaction to the card ('' = none yet), one of WISH_REACTIONS.
  reaction: text('reaction').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Colleagues' emoji reactions to a new colleague's introduction ('intro'), to a welcome message under
// it ('welcome', only the new colleague) and to a greeting card that is not private ('greeting'). One
// reaction per person and thing; target_id is the id of that introduction, message or card.
export const reactions = pgTable(
  'reactions',
  {
    id: serial('id').primaryKey(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reactions_one_per_person').on(t.targetType, t.targetId, t.userId)],
);

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

// Work anniversaries and the company's founding day, announced once per Jalali year.
export const occasionAnnouncements = pgTable(
  'occasion_announcements',
  {
    kind: text('kind').notNull(), // 'anniversary' | 'founding'
    subjectId: text('subject_id').notNull(), // the colleague's id, or 'company'
    jalaliYear: integer('jalali_year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.subjectId, t.jalaliYear] })],
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
  endTime: text('end_time'),
  // Set for the calendar entry of a training, so it follows the training when it is edited or deleted.
  trainingId: text('training_id').references(() => trainings.id, { onDelete: 'cascade' }),
  // Who sees the event, with the rules of news (shared/audience.ts); empty lists mean everyone.
  targetDepartments: text('target_departments').array().notNull().default([]),
  targetLocations: text('target_locations').array().notNull().default([]),
  targetRoles: text('target_roles').array().notNull().default([]),
  targetUserIds: text('target_user_ids').array().notNull().default([]),
  /** The audience is told when it is added, moved or cancelled, and reminded the day before. */
  notify: boolean('notify').notNull().default(true),
  /** Colleagues are asked "attending or not" and the answers are counted. */
  rsvp: boolean('rsvp').notNull().default(false),
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  createdById: text('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** "Attending or not" answers to an event that asks for them; one per person, changeable until the day. */
export const calendarRsvps = pgTable(
  'calendar_rsvps',
  {
    eventId: text('event_id').notNull().references(() => calendarEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    attending: boolean('attending').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

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

/** A phone or computer browser that shows the colleague's notifications outside the portal (Web Push). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    // The browser's push address is unique to that browser; signing in as someone else moves it to them.
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // A short device name for the colleague's list, e.g. «Chrome روی اندروید».
    device: text('device').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
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
  // The company's founding day (Jalali YYYY/MM/DD, '' = not set); every year on that day everyone is congratulated.
  foundingDate: text('founding_date').notNull().default(''),
  // The founding-day message ('' = the built-in one).
  foundingMessage: text('founding_message').notNull().default(''),
  // Parts of the portal switched off or in preview until they are introduced, e.g. { suggestions: 'preview' }.
  // Missing keys use the part's default (see shared/features.ts).
  features: jsonb('features').$type<Partial<Record<string, FeatureState>>>().notNull().default({}),
  // How each part was introduced when it was last switched on for everyone.
  featureLaunches: jsonb('feature_launches').$type<Partial<Record<string, FeatureLaunch>>>().notNull().default({}),
  // Who sees parts in preview besides the administrator: whole roles and named colleagues.
  pilotRoles: text('pilot_roles').array().notNull().default([]),
  pilotUserIds: text('pilot_user_ids').array().notNull().default([]),
  // The names an administrator gave the suggestion boxes, e.g. { management: { label: 'صندوق مدیرعامل', to: 'مدیرعامل' } }.
  suggestionBoxNames: jsonb('suggestion_box_names').$type<SuggestionBoxNames>().notNull().default({}),
  // The order of the dashboard cards for everyone who has not arranged their own ([] = the built-in order).
  dashboardDefaultOrder: text('dashboard_default_order').array().notNull().default([]),
  // The emoji colleagues can send each other ([] = the built-in six, see shared/kudos.ts).
  kudosEmojis: jsonb('kudos_emojis').$type<KudosEmoji[]>().notNull().default([]),
  // Steps the administrator adds to every new colleague's «هفتهٔ اول من» list.
  firstWeekSteps: text('first_week_steps').array().notNull().default([]),
  // The portal's own key pair for notifications on phones and computers (Web Push, VAPID); made on first start.
  vapidPublicKey: text('vapid_public_key').notNull().default(''),
  vapidPrivateKey: text('vapid_private_key').notNull().default(''),
});

/** Who created, changed or deleted what in the portal's content, accounts and settings, for the admin. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    actorId: text('actor_id').references(() => employees.id, { onDelete: 'set null' }),
    /** The actor's name at the time, so the entry reads the same later. */
    actorName: text('actor_name').notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    entity: text('entity').$type<AuditEntity>().notNull(),
    entityId: text('entity_id'),
    /** What it was about: the item's title, the colleague's name, the settings section. */
    title: text('title').notNull(),
    /** What changed, in words. */
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt), index('audit_log_entity_idx').on(t.entity, t.entityId)],
);

/** The reports' summary of a Jalali month, made once at the start of the next month. */
export const reportSummaries = pgTable('report_summaries', {
  month: text('month').primaryKey(), // Jalali YYYY/MM
  data: jsonb('data').$type<MonthlySummary>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Messages to the suggestions & complaints boxes. An anonymous message keeps no trace of its sender:
 * sender_id stays empty, created_at holds only the day, and the sender follows the answer with a
 * tracking code of which only a hash is stored.
 */
export const suggestions = pgTable(
  'suggestions',
  {
    id: text('id').primaryKey(),
    box: text('box').notNull(),
    kind: text('kind').notNull().default('suggestion'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    senderId: text('sender_id').references(() => employees.id, { onDelete: 'set null' }),
    trackingHash: text('tracking_hash'),
    reply: text('reply'),
    repliedById: text('replied_by_id').references(() => employees.id, { onDelete: 'set null' }),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    isClosed: boolean('is_closed').notNull().default(false),
    // Anonymous messages wait here until the daily release, so readers never learn when one was sent.
    released: boolean('released').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('suggestions_box_idx').on(t.box), index('suggestions_sender_idx').on(t.senderId), uniqueIndex('suggestions_tracking_idx').on(t.trackingHash)],
);

/**
 * Each person's own to-do notes: private to them (nobody else, not even an administrator, reads them
 * through the portal) and never assigned to anyone else. A note may point back at the news item,
 * event, course or document it was added from.
 */
export const personalTodos = pgTable(
  'personal_todos',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    dueDate: text('due_date'), // Jalali YYYY/MM/DD
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    // Done notes stay on the page until the person archives them (or the server does, 60 days after
    // they were done); then they are only in «آرشیو».
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // When the person last brought it back from «آرشیو»; the automatic archiving counts from here too.
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    // The Jalali day the morning reminder went out, so it is sent once.
    remindedOn: text('reminded_on'),
    // The same for the reminder the morning before, when the person asked for it.
    remindedBeforeOn: text('reminded_before_on'),
    // 'day' (the morning of the due date), 'both' (the morning before too) or 'none'.
    remind: text('remind').$type<TodoRemind>().notNull().default('day'),
    // Starred notes come first in their group.
    important: boolean('important').notNull().default(false),
    // Ticking off a repeating note writes the next one ('daily' | 'weekly' | 'monthly').
    repeat: text('repeat').$type<TodoRepeat>(),
    // The day of the month a monthly note keeps, so one for the 31st is back on the 31st after a 30-day month.
    repeatDay: integer('repeat_day'),
    // The repeating note this one was written after; un-ticking that one takes this one back.
    previousId: text('previous_id'),
    steps: jsonb('steps').$type<TodoStep[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('personal_todos_user_idx').on(t.userId)],
);

/**
 * «کارهای ارجاعی»: work one colleague hands to another. One row per person it went to; a task sent to
 * several colleagues at once shares a group id. Only the two people on a row ever read it.
 */
export const assignedTasks = pgTable(
  'assigned_tasks',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id').notNull(),
    assignerId: text('assigner_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    assigneeId: text('assignee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    dueDate: text('due_date').notNull(), // Jalali YYYY/MM/DD
    status: text('status').$type<TaskStatus>().notNull().default('new'),
    // The short answer that came with the last status (why it was declined, what was done).
    reply: text('reply').notNull().default(''),
    statusAt: timestamp('status_at', { withTimezone: true }),
    // The Jalali day the due-date reminder went out, so it is sent once.
    remindedOn: text('reminded_on'),
    // The Jalali day the «overdue» reminder (the morning after the due date) went out to both sides.
    overdueRemindedOn: text('overdue_reminded_on'),
    // A declined copy the person who handed it over passed on to someone else: the new copy's id.
    reassignedTo: text('reassigned_to'),
    // Each side takes a finished task off its own list; the row goes once both have.
    assignerHiddenAt: timestamp('assigner_hidden_at', { withTimezone: true }),
    assigneeHiddenAt: timestamp('assignee_hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assigned_tasks_assignee_idx').on(t.assigneeId), index('assigned_tasks_assigner_idx').on(t.assignerId)],
);

/** Ready-made emoji colleagues sent each other from «همکاران آنلاین». */
export const kudos = pgTable(
  'kudos',
  {
    id: serial('id').primaryKey(),
    fromId: text('from_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    toId: text('to_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    // The emoji and its label at the time, so a later change of the list does not rewrite it.
    emoji: text('emoji').notNull(),
    label: text('label').notNull(),
    // The emoji this one answers; an answer cannot itself be answered.
    replyToId: integer('reply_to_id'),
    // The receiver closed its banner (or answered it); until then it waits on their pages for a day.
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('kudos_to_idx').on(t.toId, t.createdAt), index('kudos_from_idx').on(t.fromId, t.createdAt), uniqueIndex('kudos_reply_idx').on(t.replyToId)],
);

/**
 * «تابلوی اعلانات»: a short notice (not a news item) shown in full on the dashboard of its audience
 * between its first and last day. It never appears in the news list.
 */
export const notices = pgTable(
  'notices',
  {
    id: text('id').primaryKey(),
    text: text('text').notNull(),
    // Who it is from, as shown under the text (e.g. «واحد اداری»); empty shows nothing.
    sender: text('sender').notNull().default(''),
    // Shown first and highlighted.
    important: boolean('important').notNull().default(false),
    // Same audience rules as news (shared/audience.ts); all empty is everyone.
    targetDepartments: text('target_departments').array().notNull().default([]),
    targetLocations: text('target_locations').array().notNull().default([]),
    targetRoles: text('target_roles').array().notNull().default([]),
    targetUserIds: text('target_user_ids').array().notNull().default([]),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // The publisher asked for a bell notification; it goes out once, when the notice starts.
    notify: boolean('notify').notNull().default(false),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    // Set once open pages were told the notice started, so a scheduled one shows on time.
    startedAt: timestamp('started_at', { withTimezone: true }),
    createdById: text('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notices_ends_at_idx').on(t.endsAt)],
);

/** A colleague pressed «دیدم» on a notice; it folds away on their dashboard. */
export const noticeDismissals = pgTable(
  'notice_dismissals',
  {
    noticeId: text('notice_id').notNull().references(() => notices.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.employeeId] })],
);

/**
 * «رویداد ویژه» (e.g. Yalda night): one page a year with competitions, a jury and a big screen.
 * Nobody but its organizers sees a draft; the administrator switches it on («فعال کن») when it should open.
 */
export const specialEvents = pgTable('special_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  theme: text('theme').$type<EventTheme>().notNull().default('yalda'),
  intro: text('intro').notNull().default(''),
  status: text('status').$type<EventStatus>().notNull().default('draft'),
  programDate: text('program_date').notNull(), // Jalali YYYY/MM/DD
  programTime: text('program_time').notNull().default('15:00'),
  programPlace: text('program_place').notNull().default(''),
  signupEnd: text('signup_end').notNull(), // Jalali, last day of signup
  showUntil: text('show_until').notNull(), // Jalali, last day in the menu
  // While a draft, organizers may look at the page as it will be in another phase (the rehearsal).
  testPhase: text('test_phase').$type<EventPhase>(),
  organizerIds: text('organizer_ids').array().notNull().default([]),
  // The jury of every competition: 3 or 5 colleagues, one of them its head. Jurors take part in nothing.
  juryIds: text('jury_ids').array().notNull().default([]),
  juryHeadId: text('jury_head_id'),
  // A photo chosen for a juror instead of their profile photo.
  juryPhotos: jsonb('jury_photos').$type<Record<string, string>>().notNull().default({}),
  screen: jsonb('screen').$type<ScreenState>(),
  // Reminders that went out once («signup», «program»), so they are not sent again.
  sentReminders: text('sent_reminders').array().notNull().default([]),
  // «انتخاب‌های یلدا»: when the shortlists were made, shown to everyone, and the jury's votes closed.
  awardsShortlistedAt: timestamp('awards_shortlisted_at', { withTimezone: true }),
  awardsPublishedAt: timestamp('awards_published_at', { withTimezone: true }),
  awardsClosedAt: timestamp('awards_closed_at', { withTimezone: true }),
  // «چند دانه؟»: a number everyone guesses before the program (empty question = no game); the answer is
  // written only when it is opened on stage.
  guessQuestion: text('guess_question').notNull().default(''),
  guessAnswer: integer('guess_answer'),
  guessRevealedAt: timestamp('guess_revealed_at', { withTimezone: true }),
  // «برنامهٔ امشب»: what happens when on the night, shown on the page and the big screen.
  schedule: jsonb('schedule').$type<ScheduleItem[]>().notNull().default([]),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdById: text('created_by_id').references(() => employees.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One competition of an event (FIFA, pantomime…), built from a form; release 1 plays them as a knockout. */
export const eventCompetitions = pgTable(
  'event_competitions',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    icon: text('icon').notNull().default('🏆'),
    rules: text('rules').notNull().default(''),
    kind: text('kind').$type<EntryKind>().notNull().default('individual'),
    teamMin: integer('team_min').notNull().default(1),
    teamMax: integer('team_max').notNull().default(1),
    // Entries (people or teams) that play; more go on the waiting list.
    capacity: integer('capacity').notNull().default(8),
    scoring: text('scoring').$type<Scoring>().notNull().default('points'),
    tieRule: text('tie_rule').$type<TieRule>().notNull().default('organizer'),
    thirdPlace: boolean('third_place').notNull().default(false),
    stagePolicy: text('stage_policy').$type<StagePolicy>().notNull().default('final'),
    // Knockout, a points table (everyone plays everyone) or a ranking (each performs alone).
    format: text('format').$type<Format>().notNull().default('knockout'),
    rankBy: text('rank_by').$type<RankBy>().notNull().default('high'),
    // When first place of a table or ranking is shared, the one the organizers or jury picked.
    championPickId: text('champion_pick_id'),
    // The pantomime's words (only organizers and jurors see them), and those already shown.
    words: text('words').array().notNull().default([]),
    usedWords: text('used_words').array().notNull().default([]),
    // Where and from when daytime matches are played, and how long each takes.
    dayPlace: text('day_place').notNull().default(''),
    dayStart: text('day_start').notNull().default('10:00'),
    slotMinutes: integer('slot_minutes').notNull().default(20),
    sortOrder: integer('sort_order').notNull().default(0),
    drawnAt: timestamp('drawn_at', { withTimezone: true }),
    // Everyone sees the bracket from here on (before it, only organizers and the jury).
    publishedAt: timestamp('published_at', { withTimezone: true }),
    championAnnouncedAt: timestamp('champion_announced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_competitions_event_idx').on(t.eventId)],
);

/** A person or a team signed up for a competition. Over capacity, it waits («waitlist») in order of signing up. */
export const eventEntries = pgTable(
  'event_entries',
  {
    id: text('id').primaryKey(),
    competitionId: text('competition_id').notNull().references(() => eventCompetitions.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    // A ready-made badge («emoji:🍉») or an uploaded picture.
    image: text('image').notNull().default(''),
    captainId: text('captain_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    status: text('status').$type<'in' | 'waitlist'>().notNull().default('in'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_entries_competition_idx').on(t.competitionId)],
);

/** Who is in an entry; one place per person in each competition. */
export const eventEntryMembers = pgTable(
  'event_entry_members',
  {
    competitionId: text('competition_id').notNull().references(() => eventCompetitions.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull().references(() => eventEntries.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.employeeId] }), index('event_entry_members_entry_idx').on(t.entryId)],
);

/** A match of a knockout bracket; later rounds are filled in as winners go through (shared/specialEvents.ts). */
export const eventMatches = pgTable(
  'event_matches',
  {
    id: text('id').primaryKey(),
    competitionId: text('competition_id').notNull().references(() => eventCompetitions.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    slot: integer('slot').notNull(),
    third: boolean('third').notNull().default(false),
    entryA: text('entry_a').references(() => eventEntries.id, { onDelete: 'set null' }),
    entryB: text('entry_b').references(() => eventEntries.id, { onDelete: 'set null' }),
    scoreA: integer('score_a'),
    scoreB: integer('score_b'),
    // Penalties (or another tie-break) when the scores were level.
    tieA: integer('tie_a'),
    tieB: integer('tie_b'),
    winnerId: text('winner_id'),
    bye: boolean('bye').notNull().default(false),
    // A result is in (a draw of a points table has no winner; a ranking's value is scoreA).
    done: boolean('done').notNull().default(false),
    // Won because the other side did not come («برد فنی»).
    walkover: boolean('walkover').notNull().default(false),
    // Being played on stage now; the remote moves the score.
    live: boolean('live').notNull().default(false),
    onStage: boolean('on_stage').notNull().default(false),
    day: text('day').notNull().default(''), // Jalali
    time: text('time').notNull().default(''), // HH:MM
    place: text('place').notNull().default(''),
    resultById: text('result_by_id'),
    resultAt: timestamp('result_at', { withTimezone: true }),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    overdueRemindedAt: timestamp('overdue_reminded_at', { withTimezone: true }),
    // The pair the players were last told about, so «حریف شما» goes once per pairing.
    announcedPair: text('announced_pair'),
  },
  (t) => [index('event_matches_competition_idx').on(t.competitionId)],
);

/** «اعتراض به نتیجه»: a player asks the jury to look at a result again. */
export const eventObjections = pgTable(
  'event_objections',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    matchId: text('match_id').notNull().references(() => eventMatches.id, { onDelete: 'cascade' }),
    byId: text('by_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    status: text('status').$type<'open' | 'accepted' | 'rejected'>().notNull().default('open'),
    decidedById: text('decided_by_id'),
    decision: text('decision').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('event_objections_event_idx').on(t.eventId)],
);

/** What organizers and jurors changed (results, corrections, draws), with the reason they gave. */
export const eventLog = pgTable(
  'event_log',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    matchId: text('match_id'),
    byId: text('by_id'),
    action: text('action').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_log_event_idx').on(t.eventId)],
);

/**
 * A big screen in the hall. It has no account: it shows a 4-digit code, an organizer types the code on
 * their phone, and from then on the screen only displays the event (it can change nothing).
 */
export const eventScreens = pgTable('event_screens', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  code: text('code').notNull(),
  eventId: text('event_id').references(() => specialEvents.id, { onDelete: 'cascade' }),
  pairedById: text('paired_by_id'),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A category of «انتخاب‌های یلدا» (خوش‌تیپ‌ترین…): colleagues nominate, the jury chooses. */
export const eventAwards = pgTable(
  'event_awards',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    icon: text('icon').notNull().default('🏅'),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    // Worked out when the votes close; nobody sees it until it is opened on stage (revealedAt).
    winnerId: text('winner_id').references(() => employees.id, { onDelete: 'set null' }),
    // A tie the head of the jury has to settle, and the head's pick.
    tieIds: text('tie_ids').array().notNull().default([]),
    pickedId: text('picked_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    revealedAt: timestamp('revealed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_awards_event_idx').on(t.eventId)],
);

/** One colleague's nomination in a category (one per category, changeable); who nominated is never shown. */
export const eventNominations = pgTable(
  'event_nominations',
  {
    id: text('id').primaryKey(),
    awardId: text('award_id').notNull().references(() => eventAwards.id, { onDelete: 'cascade' }),
    nominatorId: text('nominator_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    nomineeId: text('nominee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    // A line for the jury only; the jury hides one that is not kind.
    reason: text('reason').notNull().default(''),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_nominations_award_nominator_idx').on(t.awardId, t.nominatorId), index('event_nominations_nominee_idx').on(t.awardId, t.nomineeId)],
);

/** The shortlist of a category: the most nominated, or added by the jury; kept when removed or stepped down. */
export const eventNominees = pgTable(
  'event_nominees',
  {
    awardId: text('award_id').notNull().references(() => eventAwards.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    source: text('source').$type<'auto' | 'jury'>().notNull().default('auto'),
    rank: integer('rank').notNull().default(0),
    addedById: text('added_by_id'),
    note: text('note').notNull().default(''),
    // Stepped down (or asked to be left out of nominations), or taken off by the jury with a reason.
    withdrawn: boolean('withdrawn').notNull().default(false),
    removedById: text('removed_by_id'),
    removedReason: text('removed_reason').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.awardId, t.employeeId] })],
);

/** A juror's secret vote in a category (changeable until the votes close). */
export const eventAwardVotes = pgTable(
  'event_award_votes',
  {
    awardId: text('award_id').notNull().references(() => eventAwards.id, { onDelete: 'cascade' }),
    jurorId: text('juror_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    nomineeId: text('nominee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.awardId, t.jurorId] })],
);

/** Colleagues who asked not to be put in any category of an event. */
export const eventAwardOptOuts = pgTable(
  'event_award_opt_outs',
  {
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.employeeId] })],
);

/** A song suggested for the night; others vote «من هم». The same song twice is caught by `key`. */
export const eventSongs = pgTable(
  'event_songs',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    artist: text('artist').notNull().default(''),
    note: text('note').notNull().default(''),
    key: text('key').notNull(),
    byId: text('by_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    // Shown without the name of whoever suggested it.
    anonymous: boolean('anonymous').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    playedAt: timestamp('played_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('event_songs_key_idx').on(t.eventId, t.key)],
);

export const eventSongVotes = pgTable(
  'event_song_votes',
  {
    songId: text('song_id').notNull().references(() => eventSongs.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.songId, t.employeeId] })],
);

/** «امسال چه کنیم؟»: an idea for the program, liked by others, answered by the organizers. */
export const eventIdeas = pgTable(
  'event_ideas',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<IdeaKind>().notNull().default('other'),
    text: text('text').notNull(),
    byId: text('by_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    anonymous: boolean('anonymous').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    // «انجام می‌دهیم», with an optional line from the organizers.
    doing: boolean('doing').notNull().default(false),
    reply: text('reply').notNull().default(''),
    repliedById: text('replied_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_ideas_event_idx').on(t.eventId)],
);

export const eventIdeaLikes = pgTable(
  'event_idea_likes',
  {
    ideaId: text('idea_id').notNull().references(() => eventIdeas.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ideaId, t.employeeId] })],
);

/** «پیش‌بینی برنده»: who a colleague thinks wins a match (an entry, or «draw» in a points table). */
export const eventPredictions = pgTable(
  'event_predictions',
  {
    matchId: text('match_id').notNull().references(() => eventMatches.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    pick: text('pick').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.employeeId] })],
);

/** One colleague's guess for the event's «چند دانه؟» game; changeable until the program starts. */
export const eventGuesses = pgTable(
  'event_guesses',
  {
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    // The last change: of two equally close guesses, the earlier one wins.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.employeeId] })],
);

/** «فال حافظ»: the one verse each colleague drew on an event (one fal a night). */
export const eventFals = pgTable(
  'event_fals',
  {
    eventId: text('event_id').notNull().references(() => specialEvents.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    verse: integer('verse').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.employeeId] })],
);
