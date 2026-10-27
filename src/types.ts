import type { Permission } from '../shared/permissions';

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
  permissions: Permission[];
}

export type PollType = 'multiple_choice' | 'free_text';

/** Edits to a poll: existing options keep their id (and votes); options without an id are added. */
export interface PollUpdate {
  title: string;
  description: string;
  department: string;
  expiryDate: string;
  options: { id?: string; text: string }[];
}

export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
}

export interface FreeTextResponse {
  id: string;
  responseText: string;
  submittedAt: string;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  department: string; // 'all' or a department name
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  expiryDate: string; // Jalali, '' when open-ended
  type: PollType;
  options: PollOption[];
  freeTextResponses: FreeTextResponse[];
  totalVotes: number;
  isActive: boolean;
  hasVoted: boolean;
  myOptionId: string | null;
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
  status: 'published' | 'scheduled' | 'expired';
  readStats?: { read: number; acknowledged: number; audience: number };
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
  wishes: { id: string; senderId: string; userName: string; message: string; time: string }[];
}

export interface BirthdayWish {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
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
  enrolledUserIds: string[];
  description: string;
  coverImage: string;
  category: string;
  prerequisites: string;
}

export interface TrainingEnrollment {
  userId: string;
  name: string;
  position: string;
  department: string;
  extension: string;
  enrolledAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // Jalali 'YYYY/MM/DD'
  type: 'holiday' | 'training' | 'birthday' | 'meeting' | 'event';
  description: string;
  time?: string;
  location?: string;
  badgeColor?: string;
  /** Set when the entry belongs to a training; it is edited from the training page. */
  trainingId?: string | null;
}

export type NotificationType = 'birthday' | 'poll' | 'announcement' | 'training' | 'profile' | 'welcome' | 'document' | 'system';

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

export type ActiveTab =
  | 'dashboard'
  | 'polls'
  | 'colleagues'
  | 'orgchart'
  | 'search'
  | 'news'
  | 'documents'
  | 'training'
  | 'calendar'
  | 'notifications'
  | 'systems'
  | 'reports'
  | 'people'
  | 'admin';

export interface SearchResultItem {
  id: string;
  type: 'همکاران' | 'اخبار' | 'اطلاعیه' | 'نظرسنجی' | 'آموزش' | 'تقویم' | 'اسناد';
  title: string;
  subtitle: string;
  snippet: string;
  targetTab: ActiveTab;
  targetId?: string;
  badgeColor: string;
  date?: string;
}

export type MoodState = 'عالی' | 'خوب' | 'معمولی' | 'بد' | 'خیلی بد';

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
  url: string;
  bgColor: string;
  textColor: string;
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
}

export interface SiteBanner {
  text: string;
  /** 'warning' is for urgent, short-lived news such as an outage. */
  level: 'info' | 'warning';
  expiresAt: string; // ISO
  updatedById: string;
  updatedAt: string; // ISO
}

export interface ServerStatus {
  version: string;
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
