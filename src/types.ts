export type UserRole = 'employee' | 'manager' | 'guest';

export interface WorkExperience {
  id: string;
  username?: string;
  password?: string;
  company: string;
  role: string;
  startYear: string;
  endYear: string;
  description: string;
}

export interface Skill {
  id: string;
  username?: string;
  password?: string;
  name: string;
  category: string;
  endorsements: number;
}

export interface UserProfile {
  id: string;
  username?: string;
  password?: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  extension: string;
  mobile: string;
  email: string;
  birthDate: string; // e.g. "1368/02/15" or "15 اردیبهشت"
  birthDateIso?: string; // MM-DD for calendar lookup
  hireDate: string;
  bio: string;
  avatar: string;
  role: UserRole;
  workExperiences: WorkExperience[];
  skills: Skill[];
  isNewColleague?: boolean;
  newColleagueMessage?: string;
  location?: string;
  directManager?: string;
}

export type PollType = 'multiple_choice' | 'free_text';

export interface PollOption {
  id: string;
  username?: string;
  password?: string;
  text: string;
  votesCount: number;
}

export interface FreeTextResponse {
  id: string;
  username?: string;
  password?: string;
  anonymousUserHash: string;
  responseText: string;
  submittedAt: string;
}

export interface Poll {
  id: string;
  username?: string;
  password?: string;
  title: string;
  description: string;
  department: string; // 'all' or specific department
  createdBy: string;
  createdAt: string;
  expiryDate: string;
  type: PollType;
  options: PollOption[];
  freeTextResponses: FreeTextResponse[];
  totalVotes: number;
  isActive: boolean;
  votedUserIds: string[]; // Track user IDs to enforce single vote per user
}

export interface PollVotePayload {
  pollId: string;
  userId: string;
  optionId?: string;
  freeText?: string;
}

export interface NewsItem {
  id: string;
  username?: string;
  password?: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  author: string;
  authorRole: string;
  date: string;
  image: string;
  isPinned?: boolean;
  tags: string[];
  likesCount: number;
  likedBy: string[];
  commentsCount: number;
}

export interface NewColleagueWelcome {
  id: string;
  username?: string;
  password?: string;
  userId: string;
  welcomeMessage: string;
  joinDate: string;
  department: string;
  position: string;
  likes: number;
  wishes: { id: string;
  username?: string;
  password?: string; userName: string; message: string; time: string }[];
}

export interface BirthdayCard {
  id: string;
  username?: string;
  password?: string;
  userId: string;
  birthDate: string;
  wishes: { id: string;
  username?: string;
  password?: string; senderName: string; text: string; time: string }[];
}

export interface TrainingProgram {
  id: string;
  username?: string;
  password?: string;
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
  prerequisites?: string;
}

export interface CalendarEvent {
  id: string;
  username?: string;
  password?: string;
  title: string;
  date: string; // e.g. "1403/05/20"
  type: 'holiday' | 'training' | 'birthday' | 'meeting' | 'event';
  description: string;
  time?: string;
  location?: string;
  badgeColor?: string;
}

export interface NotificationItem {
  id: string;
  username?: string;
  password?: string;
  targetUserId: string; // 'all' or specific user ID
  title: string;
  message: string;
  type: 'birthday' | 'poll' | 'announcement' | 'training' | 'profile' | 'welcome';
  date: string;
  isRead: boolean;
  linkTab?: string;
}

export type ActiveTab = 
  | 'dashboard'
  | 'polls'
  | 'colleagues'
  | 'search'
  | 'news'
  | 'training'
  | 'calendar'
  | 'notifications'
  | 'systems'
  | 'reports';

export interface SearchResultItem {
  id: string;
  username?: string;
  password?: string;
  type: 'همکاران' | 'اخبار' | 'اطلاعیه' | 'نظرسنجی' | 'آموزش' | 'تقویم';
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

export interface ExternalSystem {
  id: string;
  name: string;
  description: string;
  iconName: string;
  url: string;
  bgColor: string;
  textColor: string;
}

export interface AppSettings {
  id: string;
  departments: string[];
  newsCategories: string[];
  trainingCategories: string[];
  systems?: ExternalSystem[];
}
