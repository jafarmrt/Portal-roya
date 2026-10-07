import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const polls = pgTable('polls', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  department: text('department').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  expiryDate: text('expiry_date').notNull(),
  type: text('type').notNull(), // 'multiple_choice' or 'free_text'
  totalVotes: integer('total_votes').default(0),
  isActive: boolean('is_active').default(true),
});

export const pollOptions = pgTable('poll_options', {
  id: text('id').primaryKey(),
  pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  votesCount: integer('votes_count').default(0),
});

export const pollVotes = pgTable('poll_votes', {
  id: serial('id').primaryKey(),
  pollId: text('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  optionId: text('option_id').references(() => pollOptions.id),
  freeText: text('free_text'),
  submittedAt: timestamp('submitted_at').defaultNow(),
});


export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text('role').notNull(),
  position: text('position').notNull(),
  department: text('department').notNull(),
  avatarUrl: text('avatar_url'),
  birthDate: text('birth_date'),
  hireDate: text('hire_date'),
  skills: text('skills').array(),
  workExperiences: jsonb('work_experiences'), // or jsonb
  customHolidays: jsonb('custom_holidays'), // jsonb
  coverImage: text('cover_image'),
  quote: text('quote'),
  hobbies: text('hobbies').array(),
  education: text('education'),
  email: text('email'),
  phone: text('phone'),
});

export const news = pgTable('news', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  author: text('author').notNull(),
  authorRole: text('author_role').notNull(),
  date: text('date').notNull(),
  image: text('image').notNull(),
  isPinned: boolean('is_pinned').default(false),
  tags: text('tags').array(),
  likesCount: integer('likes_count').default(0),
  likedBy: text('liked_by').array(),
  commentsCount: integer('comments_count').default(0),
});

export const moods = pgTable('moods', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(),
  mood: text('mood').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow(),
});

export const trainings = pgTable('trainings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  instructor: text('instructor').notNull(),
  instructorRole: text('instructor_role').notNull(),
  date: text('date').notNull(),
  time: text('time').notNull(),
  duration: text('duration').notNull(),
  location: text('location').notNull(),
  capacity: integer('capacity').notNull(),
  enrolledUserIds: text('enrolled_user_ids').array(),
  description: text('description').notNull(),
  coverImage: text('cover_image').notNull(),
  category: text('category').notNull(),
  prerequisites: text('prerequisites').notNull(),
});

export const newColleagues = pgTable('new_colleagues', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  welcomeMessage: text('welcome_message').notNull(),
  joinDate: text('join_date').notNull(),
  department: text('department').notNull(),
  position: text('position').notNull(),
  likes: integer('likes').default(0),
  wishes: jsonb('wishes'), // jsonb
});

export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  time: text('time'),
  location: text('location'),
  badgeColor: text('badge_color'),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey(), // We'll just have one row, e.g. id = 'global'
  departments: text('departments').array().notNull().default(['طراحی و توسعه محصول', 'فروش و امور مشتریان', 'منابع انسانی', 'فناوری اطلاعات (IT)', 'بازرگانی و تامین', 'انبار و زنجیره تامین']),
  newsCategories: text('news_categories').array().notNull().default(['اخبار سازمان', 'اطلاعیه هام', 'بخشنامه', 'رویداد و جشن']),
  trainingCategories: text('training_categories').array().notNull().default(['نرم‌افزار', 'مهارتهای نرم', 'استانداردها', 'مدیریت و فروش']),
  systems: jsonb('systems').$type<any[]>()
});
