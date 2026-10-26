export type UserRole = 'employee' | 'manager';

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
  username: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  role: UserRole;
  isActive: boolean;
  extension: string;
  mobile: string;
  email: string;
  birthDate: string; // Jalali 'YYYY/MM/DD' or ''
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
}

export type PollType = 'multiple_choice' | 'free_text';

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
  attachments: Attachment[];
  publishDate: string;
  publishTime: string;
  expiresDate: string;
}

export interface ReadReceipt {
  userId: string;
  name: string;
  department: string;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export interface NewColleagueWelcome {
  id: string;
  userId: string;
  welcomeMessage: string;
  joinDate: string;
  createdAt: string;
  wishes: { id: string; userName: string; message: string; time: string }[];
}

export interface BirthdayWish {
  id: string;
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

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // Jalali 'YYYY/MM/DD'
  type: 'holiday' | 'training' | 'birthday' | 'meeting' | 'event';
  description: string;
  time?: string;
  location?: string;
  badgeColor?: string;
}

export type NotificationType = 'birthday' | 'poll' | 'announcement' | 'training' | 'profile' | 'welcome' | 'document';

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
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
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
}

export type CustomHolidays = Record<string, { title: string; isHoliday: boolean }>;
