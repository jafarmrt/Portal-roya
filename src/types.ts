import type { ReactionCount } from '../shared/reactions';
import type { WishDesign, WishOccasion } from '../shared/celebrations';
import type { FeatureKey } from '../shared/features';
import type { SuggestionBoxNames } from '../shared/suggestions';
import type { Permission } from '../shared/permissions';
import type { TodoRemind, TodoRepeat, TodoSourceType, TodoStep } from '../shared/todos';
import type { KudosEmoji } from '../shared/kudos';

export type { Permission };

/** A role id: 'admin', 'manager', 'employee' or a role added by an admin. */
export type UserRole = string;

export interface RoleInfo {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  isAdmin: boolean;
  memberCount: number;
}

export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  startYear: string;
  endYear: string;
  description: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  endorsements: number;
  endorsedByMe: boolean;
}

export interface UserProfile {
  id: string;
  /** '' for people without a portal account. */
  username: string;
  /** False for people listed in the phone book who cannot sign in (e.g. workshop staff). */
  hasAccount: boolean;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  role: UserRole;
  /** 'ldap' accounts sign in with their Active Directory password and have no portal password. */
  authSource: 'local' | 'ldap';
  isActive: boolean;
  extension: string;
  mobile: string;
  email: string;
  /** Full Jalali 'YYYY/MM/DD'; only sent for your own profile or to user managers, otherwise ''. */
  birthDate: string;
  /** Jalali 'MM/DD' for birthday cards and the calendar; '' when unknown or hidden. */
  birthDay: string;
  /** The colleague chose not to show their birthday to others. */
  hideBirthday: boolean;
  hireDate: string; // Jalali 'YYYY/MM/DD' or ''
  /** Sent to user managers: the hire date is the day the person was added to the portal. */
  hireDateIsEntryDay?: boolean;
  /** The colleague chose not to be congratulated on their work anniversary in front of others. */
  hideAnniversary: boolean;
  bio: string;
  avatar: string;
  location: string;
  directManagerId: string | null;
  directManager: string;
  workExperiences: WorkExperience[];
  skills: Skill[];
}

export interface CurrentUser extends UserProfile {
  mustChangePassword: boolean;
  /** An AD account that still has to give its name in Persian and its birthday (first sign-in). */
  needsProfile: boolean;
  permissions: Permission[];
}

export type PollQuestionType = 'single' | 'multiple' | 'rating' | 'text';
/** Who sees a poll's results besides its creator and poll managers. */
export type PollResultsVisibility = 'managers' | 'after_answer' | 'after_close';

export interface PollQuestionResults {
  /** People who answered this question. */
  answered: number;
  /** Votes per option id. */
  votes?: Record<string, number>;
  /** How many gave 1 to 5. */
  ratings?: number[];
  average?: number | null;
  /** Written answers; absent when they are kept for the creator and managers. */
  texts?: string[];
}

export interface PollQuestion {
  id: string;
  type: PollQuestionType;
  text: string;
  required: boolean;
  options: { id: string; text: string }[];
  /** Only when the viewer may see the results. */
  results?: PollQuestionResults;
}

export interface PollAnswer {
  optionIds: string[];
  rating: number | null;
  text: string;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  expiryDate: string; // Jalali, '' when open-ended
  isActive: boolean;
  anonymous: boolean;
  resultsVisibility: PollResultsVisibility;
  showTextAnswers: boolean;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  /** Names are only sent to the people who run the poll; targetUserCount is for everyone. */
  targetUserIds: string[];
  targetUserCount: number;
  /** In the audience, so this person may answer. */
  forMe: boolean;
  /** The creator or a poll manager: sees results, the answer sheets and may remind. */
  canManage: boolean;
  responseCount: number;
  /** How many colleagues the poll is for; only for the people who run it. */
  audienceCount?: number;
  remindedAt: string | null;
  resultsVisible: boolean;
  hasVoted: boolean;
  /** This person's answers by question id, once they answered. */
  myAnswers: Record<string, PollAnswer> | null;
  questions: PollQuestion[];
}

/** A question in the poll form; questions and options that already exist keep their id. */
export interface PollQuestionInput {
  id?: string;
  text: string;
  type: PollQuestionType;
  required: boolean;
  options: { id?: string; text: string }[];
}

export interface PollInput {
  title: string;
  description: string;
  expiryDate: string;
  anonymous: boolean;
  resultsVisibility: PollResultsVisibility;
  showTextAnswers: boolean;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  targetUserIds: string[];
  questions: PollQuestionInput[];
}

export interface PollAnswerInput {
  questionId: string;
  optionIds: string[];
  rating: number | null;
  text: string;
}

/** Every answer sheet of a poll, for its Excel copy. Anonymous polls have no names or times. */
export interface PollResponses {
  anonymous: boolean;
  questions: string[];
  responses: { name: string; department: string; submittedAt: string | null; answers: string[] }[];
}

export interface Attachment {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  authorId: string;
  author: string;
  authorRole: string;
  date: string; // ISO publish time
  publishAt: string;
  expiresAt: string | null;
  image: string;
  isPinned: boolean;
  isUrgent: boolean;
  requiresAck: boolean;
  tags: string[];
  targetDepartments: string[];
  targetLocations: string[];
  /** Role ids. */
  targetRoles: string[];
  /** Only sent to people who publish news; others get [] and the count. */
  targetUserIds: string[];
  targetUserCount: number;
  /** 'html' from the editor; older items are plain 'text'. */
  contentFormat: 'text' | 'html';
  /** Circulars: acknowledge by this time (end of a day), or null. */
  ackDeadline: string | null;
  /** When "remind" was last pressed (for people who publish news). */
  ackRemindedAt: string | null;
  attachments: Attachment[];
  likesCount: number;
  likedByMe: boolean;
  isRead: boolean;
  acknowledgedAt: string | null;
  status: 'draft' | 'published' | 'scheduled' | 'expired';
  readStats?: { read: number; acknowledged: number; audience: number };
  /** Last change after publication, if any. */
  editedAt: string | null;
  updatedAt: string;
  /** Unanswered questions, for the author and news managers (0 for others). */
  openQuestions: number;
}

export interface NewsInput {
  title: string;
  summary: string;
  content: string;
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
  contentFormat: 'text' | 'html';
  attachments: Attachment[];
  /** Jalali 'YYYY/MM/DD' or '' (circulars only). */
  ackDate: string;
  publishDate: string;
  publishTime: string;
  expiresDate: string;
  /** Saved without announcing it; only the title is required. */
  draft?: boolean;
}

/** A ready-made announcement; [text in brackets] marks what the publisher fills in. */
export interface NewsTemplate {
  id: string;
  name: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  isUrgent: boolean;
  requiresAck: boolean;
  tags: string[];
  updatedAt: string;
}

export type NewsTemplateInput = Omit<NewsTemplate, 'id' | 'updatedAt'>;

export interface NewsQuestion {
  id: string;
  question: string;
  /** The wording shown to everyone when the publisher changed it (publisher's view only). */
  publicQuestion: string | null;
  answer: string | null;
  answeredAt: string | null;
  isPublic: boolean;
  mine: boolean;
  /** Only for the publisher and news managers. */
  askerName: string | null;
  askerDepartment: string | null;
  createdAt: string;
}

export interface PendingNewsQuestion {
  id: string;
  newsId: string;
  newsTitle: string;
  question: string;
  createdAt: string;
}

export interface NewsSnapshot {
  title: string;
  summary: string;
  content: string;
  contentFormat: 'text' | 'html';
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
  attachments: Attachment[];
  publishAt: string;
  expiresAt: string | null;
  ackDeadline: string | null;
}

export interface NewsHistory {
  author: string;
  createdAt: string;
  entries: { id: number; action: 'publish' | 'edit'; editor: string; createdAt: string; changed: (keyof NewsSnapshot)[]; before: NewsSnapshot }[];
}

export interface ReadReceipt {
  userId: string;
  name: string;
  department: string;
  location: string;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export interface NewColleagueWelcome {
  id: string;
  userId: string;
  welcomeMessage: string;
  joinDate: string;
  createdAt: string;
  /** Colleagues' emoji under the introduction. */
  reactions: ReactionCount[];
  /** Each message can carry the new colleague's emoji. */
  wishes: { id: string; senderId: string; userName: string; message: string; time: string; reactions: ReactionCount[] }[];
}

export interface BirthdayWish {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  occasion: WishOccasion;
  design: WishDesign;
  /** Seen only by the sender and the colleague it was written to. */
  isPrivate: boolean;
  /** The colleague's reaction to the card ('' = none yet). */
  reaction: string;
  /** Other colleagues' emoji (cards that are not private). */
  reactions: ReactionCount[];
  time: string;
}

export interface GreetingCardInput {
  message: string;
  occasion: WishOccasion;
  design: WishDesign;
  isPrivate: boolean;
}

export interface TrainingProgram {
  id: string;
  title: string;
  instructor: string;
  instructorRole: string;
  date: string;
  time: string;
  duration: string;
  location: string;
  capacity: number;
  /** Empty for visitors who are not signed in; enrolledCount is for everyone. */
  enrolledUserIds: string[];
  enrolledCount: number;
  description: string;
  coverImage: string;
  category: string;
  prerequisites: string;
  /** The instructor's portal account, if any: they take attendance, share handouts and read the feedback. */
  instructorId: string | null;
  /** Handouts and slides. */
  materials: Attachment[];
  waitlistCount: number;
  /** This person's sign-up: confirmed, on the waitlist, or none. */
  myStatus: 'enrolled' | 'waitlist' | null;
  myWaitlistPosition?: number;
  /** Marked present or absent by the instructor; null until then. */
  myAttended: boolean | null;
  /** Answered the survey after the course. */
  myFeedback: boolean;
  /** For the people who run the course. */
  feedbackCount?: number;
}

/** What the training form sends; handouts are added separately, by the instructor too. */
export type TrainingInput = Pick<
  TrainingProgram,
  'title' | 'instructor' | 'instructorRole' | 'instructorId' | 'date' | 'time' | 'duration' | 'location' | 'capacity' | 'description' | 'coverImage' | 'category' | 'prerequisites'
>;

export interface TrainingEnrollment {
  userId: string;
  name: string;
  position: string;
  department: string;
  extension: string;
  enrolledAt: string;
  status: 'enrolled' | 'waitlist';
  attended: boolean | null;
}

/** The survey after a course, without names. */
export interface TrainingFeedbackSummary {
  count: number;
  participants: number;
  satisfaction: number | null;
  usefulness: number | null;
  /** How many chose 1..5. */
  satisfactionSpread: number[];
  usefulnessSpread: number[];
  comments: { comment: string; submittedAt: string }[];
}

/** One colleague's courses, for the «دوره‌های من» part of their profile. */
export interface PersonTrainings {
  courses: {
    id: string;
    title: string;
    date: string;
    time: string;
    location: string;
    instructor: string;
    category: string;
    status: 'enrolled' | 'waitlist';
    attended: boolean | null;
    materialsCount: number;
  }[];
  taught: { id: string; title: string; date: string; category: string }[];
}

/** A line on the calendar that is not an organisation event: an occasion or a birthday. */
export interface CalendarNote {
  id: string;
  title: string;
  date: string; // Jalali 'YYYY/MM/DD'
  type: 'holiday' | 'training' | 'birthday' | 'meeting' | 'event';
  description: string;
  time?: string;
  location?: string;
}

export interface CalendarEvent extends CalendarNote {
  endTime?: string;
  badgeColor?: string;
  /** Set when the entry belongs to a training; it is edited from the training page. */
  trainingId?: string | null;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  /** Names are only sent to calendar managers; targetUserCount is for everyone. */
  targetUserIds: string[];
  targetUserCount: number;
  /** The audience is told when it is added, moved or cancelled, and reminded the day before. */
  notify: boolean;
  /** Colleagues are asked whether they will attend. */
  rsvp: boolean;
  /** In the audience (so may say whether they attend). */
  forMe: boolean;
  /** This person's answer: attending, not attending, or not answered. */
  myRsvp: boolean | null;
  going?: number;
  notGoing?: number;
  /** For calendar managers, on events that ask for attendance. */
  audienceCount?: number;
}

export interface CalendarEventInput {
  title: string;
  date: string;
  type: CalendarEvent['type'];
  description: string;
  time: string;
  endTime: string;
  location: string;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  targetUserIds: string[];
  notify: boolean;
  rsvp: boolean;
}

/** One colleague's answer to "attending?", for calendar managers. */
export interface CalendarRsvpRow {
  id: string;
  name: string;
  department: string;
  location: string;
  attending: boolean | null;
  respondedAt: string | null;
}

export type NotificationType = 'birthday' | 'poll' | 'announcement' | 'training' | 'calendar' | 'profile' | 'welcome' | 'document' | 'system' | 'suggestion' | 'todo' | 'kudos';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  date: string; // ISO
  isRead: boolean;
  linkTab?: ActiveTab;
  linkId?: string;
}

export interface PortalDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  /** The current version's file. */
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Who uploaded the current version. */
  uploadedBy: string;
  createdAt: string;
  /** When the current version was uploaded. */
  updatedAt: string;
  version: number;
  versionNote: string;
  /** Mandatory: colleagues confirm they have read it, like a circular. */
  requiresAck: boolean;
  /** The viewer is among the people who must confirm it. */
  forMe: boolean;
  acknowledgedAt: string | null;
  /** Confirmed an earlier version; the current one must be confirmed again. */
  acknowledgedEarlier: boolean;
  ownerId: string | null;
  owner: string;
  ownerDepartment: string;
  reviewAt: string | null;
  /** The review date has come (sent only to the owner and document managers). */
  needsReview: boolean;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  targetUserIds: string[];
  targetUserCount: number;
  /** For the owner and document managers of a mandatory document. */
  ackStats?: { acknowledged: number; audience: number };
  ackRemindedAt: string | null;
}

export interface DocumentVersion {
  version: number;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  note: string;
  uploadedBy: string;
  createdAt: string;
  current: boolean;
}

/** What a document manager fills in for a document (the file is chosen separately). */
export interface DocumentDetails {
  title: string;
  description: string;
  category: string;
  requiresAck: boolean;
  ownerId: string | null;
  reviewDate: string;
  targetDepartments: string[];
  targetLocations: string[];
  targetRoles: string[];
  targetUserIds: string[];
}

export interface Guide {
  id: string;
  title: string;
  category: string;
  summary: string;
  /** Editor HTML, cleaned by the server. */
  content: string;
  /** The department it belongs to, or ''. */
  department: string;
  ownerId: string | null;
  owner: string;
  ownerExtension: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  /** Sent only to the owner and document managers. */
  reviewAt: string | null;
  needsReview: boolean;
  /** This person's answer to "was this helpful?", or null. */
  myFeedback: boolean | null;
  /** For the owner and document managers. */
  feedback?: { helpful: number; notHelpful: number };
}

/** What is written for a guide; the review date is Jalali or ''. */
export interface GuideInput {
  title: string;
  category: string;
  summary: string;
  content: string;
  department: string;
  ownerId: string | null;
  reviewDate: string;
}

/** The page of a department: who leads it and what to come to it for. */
export interface DepartmentPage {
  department: string;
  headId: string | null;
  /** Editor HTML. */
  about: string;
  updatedBy: string;
  updatedAt: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'polls'
  | 'colleagues'
  | 'orgchart'
  | 'departments'
  | 'search'
  | 'news'
  | 'documents'
  | 'guides'
  | 'training'
  | 'calendar'
  | 'notifications'
  | 'systems'
  | 'reports'
  | 'people'
  | 'admin'
  | 'audit'
  | 'suggestions'
  | 'todos';

export interface SearchResultItem {
  id: string;
  type: 'همکاران' | 'اخبار' | 'اطلاعیه' | 'نظرسنجی' | 'آموزش' | 'تقویم' | 'اسناد' | 'راهنما' | 'واحد';
  title: string;
  subtitle: string;
  snippet: string;
  targetTab: ActiveTab;
  targetId?: string;
  badgeColor: string;
  date?: string;
}

export type MoodState = 'عالی' | 'خوب' | 'معمولی' | 'بد' | 'خیلی بد';

/** A note in this person's own «یادداشت‌های من». */
export interface PersonalTodo {
  id: string;
  title: string;
  note: string;
  /** Jalali YYYY/MM/DD; null only on notes written before the due date became required. */
  dueDate: string | null;
  /** Starred: first in its group. */
  important: boolean;
  /** Ticking it off writes the next one. */
  repeat: TodoRepeat | null;
  remind: TodoRemind;
  steps: TodoStep[];
  /** The news item, event, course or document it was added from. */
  sourceType: TodoSourceType | null;
  sourceId: string | null;
  doneAt: string | null;
  /** Set once the person moved the done note to «آرشیو»; such notes are not in the page's list. */
  archivedAt: string | null;
  createdAt: string;
}

export interface TodoInput {
  title: string;
  note?: string;
  dueDate: string;
  important?: boolean;
  repeat?: TodoRepeat | null;
  remind?: TodoRemind;
  steps?: Pick<TodoStep, 'text' | 'done'>[];
  source?: { type: TodoSourceType; id: string };
}

export interface UserMood {
  id: string;
  userId: string;
  date: string;
  mood: MoodState;
}

export interface MoodSummaryRow {
  date: string;
  mood: MoodState;
  count: number;
}

export interface ExternalSystem {
  id: string;
  name: string;
  description: string;
  iconName: string;
  /** Optional logo uploaded to the portal server; shown instead of the icon when set. */
  imageUrl?: string;
  /** Address used inside the company network ('#' or '' = not set). */
  url: string;
  /** Address used from the internet (outside the company network). */
  externalUrl?: string;
  bgColor: string;
  textColor: string;
  /** The department that runs it, shown on that department's page; '' for none. */
  department?: string;
}

export interface AppSettings {
  id: string;
  departments: string[];
  newsCategories: string[];
  trainingCategories: string[];
  documentCategories: string[];
  systems: ExternalSystem[];
  /** Visitors who are not signed in may read news, polls, documents, trainings and the calendar. */
  guestAccess: boolean;
  /** Also show the staff directory (phone book, org chart, birthdays) to guests. */
  guestDirectory: boolean;
  /** A short message shown above every page until it expires; null when there is none. */
  banner: SiteBanner | null;
  /** Where colleagues work (branches, warehouse, floors); a managed list like departments. */
  locations: string[];
  /** Dashboard cards an admin switched off, e.g. { mood: false }. */
  dashboardCards: Record<string, boolean>;
  /** Uploaded company logo for the header ('' = the built-in ROYA wordmark). */
  logoUrl: string;
  /** The company's founding day (Jalali 'YYYY/MM/DD', '' = not set); everyone is congratulated on it each year. */
  foundingDate: string;
  /** The founding-day message ('' = the built-in one). */
  foundingMessage: string;
  /** The switchable parts this person sees: for everyone ('on') or only the pilot group ('preview'). Hidden ones are missing. */
  features: Partial<Record<FeatureKey, 'preview' | 'on'>>;
  /** Parts introduced in the last two weeks that this person has not opened yet. */
  featureNews: { key: FeatureKey; badge: boolean; card: boolean }[];
  /** This person wants the once-a-day effect of the occasions and seasons (always true for guests). */
  occasionEffects: boolean;
  /** This person's own order of the dashboard cards ([] = the default order; see shared/dashboard.ts). */
  dashboardOrder: string[];
  /** The names the administrator gave the suggestion boxes (see boxNames in shared/suggestions.ts). */
  suggestionBoxNames: SuggestionBoxNames;
  /** The administrator's order of the cards for everyone who has not arranged their own ([] = the built-in order). */
  dashboardDefaultOrder: string[];
  /** The emoji of «همکاران آنلاین» ([] = the built-in six). */
  kudosEmojis: KudosEmoji[];
}

export interface SiteBanner {
  text: string;
  /** 'warning' is for urgent, short-lived news such as an outage. */
  level: 'info' | 'warning';
  expiresAt: string; // ISO
  updatedById: string;
  updatedAt: string; // ISO
}

/** Which build of the portal is running (GET /api/version). */
export interface BuildInfo {
  version: string;
  /** Release tag, e.g. "build-57"; null when running from a source checkout. */
  build: string | null;
  commit: string | null;
  builtAt: string | null;
  startedAt: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export interface ServerStatus extends BuildInfo {
  disk: { free: number; total: number } | null;
  lowDiskBytes: number;
  uploads: { count: number; bytes: number };
  backups: {
    dir: string;
    database: BackupFile | null;
    uploads: BackupFile | null;
    lastError: { at: string; message: string } | null;
  };
  cleanup: { at: string; removed: number; freedBytes: number } | null;
}

export interface BackupFile {
  name: string;
  at: string; // ISO
  size: number;
  /** How many backups of this kind are kept on the server. */
  count: number;
}

export type CustomHolidays = Record<string, { title: string; isHoliday: boolean }>;

/** A colleague in «همکاران آنلاین». */
export interface OnlineColleague {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string;
  position: string;
  department: string;
  acceptKudos: boolean;
}

export interface PresenceInfo {
  me: { showOnline: boolean; acceptKudos: boolean };
  emojis: KudosEmoji[];
  online: OnlineColleague[];
  /** When this person may next send to a colleague they just sent to (ISO), by colleague id. */
  waits: Record<string, string>;
  sentToday: number;
  dailyLimit: number;
}

/** An emoji a colleague sent, waiting in the receiver's banner until they close it. */
export interface ReceivedKudos {
  id: number;
  from: { id: string; firstName: string; lastName: string; avatar: string };
  emoji: string;
  label: string;
  message: string;
  createdAt: string;
  canReply: boolean;
}
