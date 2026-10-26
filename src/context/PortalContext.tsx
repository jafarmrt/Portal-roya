import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, errorMessage, setUnauthorizedHandler } from '../lib/api';
import { buildSearchResults } from '../lib/search';
import type {
  ActiveTab,
  AppSettings,
  Attachment,
  BirthdayWish,
  CalendarEvent,
  CurrentUser,
  CustomHolidays,
  MoodState,
  NewColleagueWelcome,
  NewsInput,
  NewsItem,
  NotificationItem,
  Poll,
  PollType,
  Permission,
  PortalDocument,
  RoleInfo,
  SearchResultItem,
  TrainingProgram,
  UserMood,
  UserProfile,
  UserRole,
  WorkExperience,
} from '../types';
import { todayJalali } from '../lib/jalali';

const NEWS_PAGE_SIZE = 30;

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  username: string;
  position: string;
  department: string;
  role: UserRole;
  extension: string;
  mobile: string;
  email: string;
  birthDate: string;
  hireDate: string;
  bio: string;
  location: string;
  avatar: string;
  directManagerId: string | null;
  isNewColleague: boolean;
  newColleagueMessage: string;
}

export type ProfileUpdate = Partial<
  Pick<
    UserProfile,
    | 'firstName'
    | 'lastName'
    | 'position'
    | 'department'
    | 'role'
    | 'extension'
    | 'mobile'
    | 'email'
    | 'birthDate'
    | 'hireDate'
    | 'bio'
    | 'location'
    | 'avatar'
    | 'directManagerId'
    | 'isActive'
  >
>;

interface PortalContextType {
  // Session
  isSetupComplete: boolean | null;
  completeSetup: (user: CurrentUser) => void;
  authChecked: boolean;
  currentUser: CurrentUser | null;
  isLoggedIn: boolean;
  /** Browsing without a session while the manager allows guest access (read-only). */
  isGuest: boolean;
  guestAccess: boolean;
  /** Staff sign in with their Active Directory (Windows) username and password. */
  directoryLogin: boolean;
  /** Why the sign-in dialog is open (null when closed). Guests see it when they try to interact. */
  loginPrompt: string | null;
  requestLogin: (reason?: string) => void;
  closeLoginPrompt: () => void;
  /** Whether the signed-in user's role grants the permission. */
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
  roles: RoleInfo[];
  roleName: (roleId: string) => string;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Loading state for portal data
  isLoading: boolean;
  error: string | null;

  // Navigation (mirrored in location.hash so items can be linked)
  activeTab: ActiveTab;
  focusId: string | null;
  setActiveTab: (tab: ActiveTab, focusId?: string | null) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  getGlobalSearchResults: (query: string) => SearchResultItem[];

  // Data
  appSettings: AppSettings | null;
  employees: UserProfile[];
  polls: Poll[];
  news: NewsItem[];
  newsHasMore: boolean;
  loadMoreNews: () => Promise<void>;
  newColleagues: NewColleagueWelcome[];
  birthdayWishes: Record<string, BirthdayWish[]>;
  trainings: TrainingProgram[];
  calendarEvents: CalendarEvent[];
  customHolidays: CustomHolidays;
  notifications: NotificationItem[];
  documents: PortalDocument[];
  userMoods: UserMood[];
  todayMoodSubmitted: boolean;

  // Actions
  updateSettings: (settings: Partial<AppSettings>) => Promise<boolean>;
  submitMood: (mood: MoodState) => Promise<void>;
  addPoll: (poll: { title: string; description: string; department: string; type: PollType; expiryDate: string; options: string[] }) => Promise<boolean>;
  votePoll: (pollId: string, optionId?: string, freeText?: string) => Promise<boolean>;
  togglePollActiveStatus: (pollId: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;
  addEmployee: (data: NewEmployeeInput) => Promise<string | null>;
  updateUserProfile: (id: string, update: ProfileUpdate) => Promise<boolean>;
  resetEmployeePassword: (id: string) => Promise<string | null>;
  addWorkExperience: (userId: string, exp: Omit<WorkExperience, 'id'>) => Promise<void>;
  removeWorkExperience: (userId: string, expId: string) => Promise<void>;
  addSkill: (userId: string, skill: { name: string; category: string }) => Promise<void>;
  removeSkill: (userId: string, skillId: string) => Promise<void>;
  endorseSkill: (userId: string, skillId: string) => Promise<void>;
  saveNews: (data: NewsInput, id?: string) => Promise<boolean>;
  deleteNews: (id: string) => Promise<void>;
  toggleLikeNews: (newsId: string) => Promise<void>;
  markNewsRead: (newsId: string) => Promise<void>;
  acknowledgeNews: (newsId: string) => Promise<void>;
  enrollTraining: (trainingId: string) => Promise<void>;
  addTraining: (training: Omit<TrainingProgram, 'id' | 'enrolledUserIds'>) => Promise<boolean>;
  deleteTraining: (trainingId: string) => Promise<void>;
  sendBirthdayWish: (userId: string, text: string) => Promise<boolean>;
  sendWelcomeWish: (newColleagueId: string, message: string) => Promise<boolean>;
  deleteBirthdayWish: (wishId: string) => Promise<void>;
  deleteWelcomeWish: (wishId: string) => Promise<void>;
  saveRole: (role: { id?: string; name: string; description: string; permissions?: Permission[] }) => Promise<boolean>;
  deleteRole: (roleId: string) => Promise<boolean>;
  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<boolean>;
  deleteCalendarEvent: (id: string) => Promise<void>;
  setCustomHoliday: (date: string, title: string, isHoliday: boolean) => Promise<void>;
  removeCustomHoliday: (date: string) => Promise<void>;
  addDocument: (doc: { title: string; description: string; category: string; file: Attachment; notify: boolean }) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

const VALID_TABS: ActiveTab[] = [
  'dashboard', 'polls', 'colleagues', 'orgchart', 'search', 'news', 'documents',
  'training', 'calendar', 'notifications', 'systems', 'reports', 'admin',
];

function readHash(): { tab: ActiveTab; id: string | null } {
  const [tab, id] = window.location.hash.replace(/^#/, '').split('/');
  return VALID_TABS.includes(tab as ActiveTab) ? { tab: tab as ActiveTab, id: id || null } : { tab: 'dashboard', id: null };
}

export const DEFAULT_LOGIN_REASON = 'برای ثبت نظر، رأی، تبریک و سایر تعامل‌ها وارد حساب کاربری خود شوید.';

/** Runs an API call and shows its error as a toast. Returns undefined on failure. */
async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (success) toast.success(success);
    return result;
  } catch (err) {
    // A 401 opens the sign-in dialog (see the unauthorized handler), so no toast is needed.
    if (!(err instanceof ApiError && err.status === 401)) toast.error(errorMessage(err));
    return undefined;
  }
}

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [guestAccess, setGuestAccess] = useState(false);
  const [directoryLogin, setDirectoryLogin] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [{ tab: activeTab, id: focusId }, setRoute] = useState(readHash);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsHasMore, setNewsHasMore] = useState(false);
  const [newColleagues, setNewColleagues] = useState<NewColleagueWelcome[]>([]);
  const [birthdayWishes, setBirthdayWishes] = useState<Record<string, BirthdayWish[]>>({});
  const [trainings, setTrainings] = useState<TrainingProgram[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [customHolidays, setCustomHolidays] = useState<CustomHolidays>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [userMoods, setUserMoods] = useState<UserMood[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const newsCount = useRef(NEWS_PAGE_SIZE);

  const isGuest = !currentUser && guestAccess;
  const isReady = Boolean(currentUser && !currentUser.mustChangePassword) || isGuest;
  const guestAccessRef = useRef(false);
  guestAccessRef.current = guestAccess;

  const requestLogin = useCallback((reason?: string) => setLoginPrompt(reason || DEFAULT_LOGIN_REASON), []);
  const closeLoginPrompt = useCallback(() => setLoginPrompt(null), []);

  // --- Session ---

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCurrentUser(null);
      // Guests (or users whose session expired) can keep reading; offer them the sign-in dialog.
      if (guestAccessRef.current) setLoginPrompt(DEFAULT_LOGIN_REASON);
    });
    (async () => {
      try {
        const status = await api.get<{ isSetupComplete: boolean; guestAccess?: boolean; directoryLogin?: boolean }>(
          '/api/system/status',
        );
        setIsSetupComplete(status.isSetupComplete);
        setGuestAccess(Boolean(status.guestAccess));
        setDirectoryLogin(Boolean(status.directoryLogin));
        if (status.isSetupComplete) {
          const me = await api.get<{ user: CurrentUser }>('/api/auth/me').catch(() => null);
          setCurrentUser(me?.user ?? null);
        }
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setAuthChecked(true);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (username: string, password: string) => {
    const { user } = await api.post<{ user: CurrentUser }>('/api/auth/login', { username, password });
    setCurrentUser(user);
    setLoginPrompt(null);
    return user;
  };

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setCurrentUser(null);
    toast.success('از حساب کاربری خود خارج شدید');
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const { user } = await api.post<{ user: CurrentUser }>('/api/auth/change-password', { currentPassword, newPassword });
    setCurrentUser(user);
  };

  const completeSetup = (user: CurrentUser) => {
    setIsSetupComplete(true);
    setCurrentUser(user);
  };

  // --- Navigation ---

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setActiveTab = useCallback((tab: ActiveTab, id: string | null = null) => {
    const hash = `#${tab}${id ? `/${id}` : ''}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    setRoute({ tab, id });
    window.scrollTo({ top: 0 });
  }, []);

  // --- Loaders ---

  const loaders = useMemo(
    () => ({
      settings: () => api.get<AppSettings>('/api/settings').then(setAppSettings),
      employees: () => api.get<UserProfile[]>('/api/employees').then(setEmployees),
      polls: () => api.get<Poll[]>('/api/polls').then(setPolls),
      news: () =>
        api
          .get<{ items: NewsItem[]; hasMore: boolean }>(`/api/news?limit=${newsCount.current}`)
          .then((page) => {
            setNews(page.items);
            setNewsHasMore(page.hasMore);
          }),
      new_colleagues: () => api.get<NewColleagueWelcome[]>('/api/new_colleagues').then(setNewColleagues),
      birthday_wishes: () => api.get<Record<string, BirthdayWish[]>>('/api/birthday_wishes').then(setBirthdayWishes),
      trainings: () => api.get<TrainingProgram[]>('/api/trainings').then(setTrainings),
      calendar: () => api.get<CalendarEvent[]>('/api/calendar_events').then(setCalendarEvents),
      holidays: () => api.get<CustomHolidays>('/api/holidays').then(setCustomHolidays),
      notifications: () => api.get<NotificationItem[]>('/api/notifications').then(setNotifications),
      documents: () => api.get<PortalDocument[]>('/api/documents').then(setDocuments),
      moods: () => api.get<UserMood[]>('/api/moods/me').then(setUserMoods),
      roles: () => api.get<RoleInfo[]>('/api/roles').then(setRoles),
      // An admin may change this user's role or the role's permissions at any time.
      me: () => api.get<{ user: CurrentUser }>('/api/auth/me').then(({ user }) => setCurrentUser(user)),
    }),
    [],
  );
  type Resource = keyof typeof loaders;

  const refresh = useCallback(
    (resource: Resource) => loaders[resource]().catch((err) => console.error(`Failed to refresh ${resource}`, err)),
    [loaders],
  );

  const sessionKey = currentUser && !currentUser.mustChangePassword ? currentUser.id : null;

  useEffect(() => {
    if (!isReady) return;
    setIsLoading(true);
    setError(null);
    // Guests only load the shared, read-only content; personal data comes after sign-in.
    const { notifications: loadNotifications, moods: loadMoods, me: loadMe, ...shared } = loaders;
    const toLoad = sessionKey ? [...Object.values(shared), loadNotifications, loadMoods, loadMe] : Object.values(shared);
    if (!sessionKey) {
      setNotifications([]);
      setUserMoods([]);
    }
    Promise.all(toLoad.map((load) => load()))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setIsLoading(false));

    if (!sessionKey) return;

    // Live updates: the server sends "changed" signals and we refetch that resource.
    const source = new EventSource('/api/events');
    source.addEventListener('changed', (e) => {
      try {
        const { resource } = JSON.parse((e as MessageEvent).data) as { resource: string };
        if (resource === 'roles' || resource === 'employees') void refresh('me');
        if (resource in loaders) void refresh(resource as Resource);
      } catch {
        // Ignore malformed events.
      }
    });
    source.addEventListener('notification', () => {
      void refresh('notifications');
    });
    return () => source.close();
  }, [isReady, sessionKey, loaders, refresh]);

  // A manager may switch guest access while the page is open.
  useEffect(() => {
    if (appSettings) setGuestAccess(appSettings.guestAccess);
  }, [appSettings]);

  // When this user's permissions change, what the server shows them changes too (scheduled news, other departments' polls...).
  const permissionKey = currentUser?.permissions.join(',') ?? null;
  const lastPermissionKey = useRef(permissionKey);
  useEffect(() => {
    if (lastPermissionKey.current === permissionKey) return;
    const hadSession = lastPermissionKey.current !== null;
    lastPermissionKey.current = permissionKey;
    if (hadSession && permissionKey !== null && isReady) {
      void Promise.all(Object.values(loaders).map((load) => load())).catch(() => undefined);
    }
  }, [permissionKey, isReady, loaders]);

  const can = useCallback((permission: Permission) => Boolean(currentUser?.permissions.includes(permission)), [currentUser]);
  const roleName = useCallback((roleId: string) => roles.find((r) => r.id === roleId)?.name ?? roleId, [roles]);

  const loadMoreNews = async () => {
    newsCount.current += NEWS_PAGE_SIZE;
    await attempt(loaders.news);
  };

  // --- Actions ---

  const updateSettings = async (settings: Partial<AppSettings>) => {
    const updated = await attempt(() => api.put<AppSettings>('/api/settings', settings), 'تنظیمات ذخیره شد.');
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const submitMood = async (mood: MoodState) => {
    const result = await attempt(() => api.post<{ mood: UserMood }>('/api/moods', { mood }));
    if (result) setUserMoods((prev) => [result.mood, ...prev.filter((m) => m.date !== result.mood.date)]);
  };
  const todayMoodSubmitted = userMoods.some((m) => m.date === todayJalali());

  const replacePoll = (poll: Poll) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p)));

  const addPoll: PortalContextType['addPoll'] = async (poll) => {
    const created = await attempt(() => api.post<Poll>('/api/polls', poll), 'نظرسنجی منتشر شد.');
    if (created) setPolls((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
    return Boolean(created);
  };

  const votePoll = async (pollId: string, optionId?: string, freeText?: string) => {
    const updated = await attempt(() => api.post<Poll>(`/api/polls/${pollId}/vote`, { optionId, freeText }), 'رأی شما ثبت شد.');
    if (updated) replacePoll(updated);
    return Boolean(updated);
  };

  const togglePollActiveStatus = async (pollId: string) => {
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;
    const updated = await attempt(() => api.patch<Poll>(`/api/polls/${pollId}/status`, { isActive: !poll.isActive }));
    if (updated) replacePoll(updated);
  };

  const deletePoll = async (pollId: string) => {
    const ok = await attempt(() => api.delete(`/api/polls/${pollId}`), 'نظرسنجی حذف شد.');
    if (ok !== undefined) setPolls((prev) => prev.filter((p) => p.id !== pollId));
  };

  const replaceEmployee = (emp: UserProfile) => {
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? emp : e)));
    setCurrentUser((me) => (me && me.id === emp.id ? { ...me, ...emp } : me));
  };

  const addEmployee = async (data: NewEmployeeInput) => {
    const result = await attempt(
      () => api.post<{ employee: UserProfile; temporaryPassword: string }>('/api/employees', data),
      'همکار جدید اضافه شد.',
    );
    if (!result) return null;
    setEmployees((prev) => [...prev.filter((e) => e.id !== result.employee.id), result.employee]);
    return result.temporaryPassword;
  };

  const updateUserProfile = async (id: string, update: ProfileUpdate) => {
    const updated = await attempt(() => api.patch<UserProfile>(`/api/employees/${id}`, update), 'پروفایل ذخیره شد.');
    if (updated) replaceEmployee(updated);
    return Boolean(updated);
  };

  const resetEmployeePassword = async (id: string) => {
    const result = await attempt(() => api.post<{ temporaryPassword: string }>(`/api/employees/${id}/reset-password`));
    return result?.temporaryPassword ?? null;
  };

  const profileAction = async (fn: () => Promise<UserProfile>) => {
    const updated = await attempt(fn);
    if (updated) replaceEmployee(updated);
  };

  const addWorkExperience = (userId: string, exp: Omit<WorkExperience, 'id'>) =>
    profileAction(() => api.post(`/api/employees/${userId}/experiences`, exp));
  const removeWorkExperience = (userId: string, expId: string) =>
    profileAction(() => api.delete(`/api/employees/${userId}/experiences/${expId}`));
  const addSkill = (userId: string, skill: { name: string; category: string }) =>
    profileAction(() => api.post(`/api/employees/${userId}/skills`, skill));
  const removeSkill = (userId: string, skillId: string) =>
    profileAction(() => api.delete(`/api/employees/${userId}/skills/${skillId}`));
  const endorseSkill = (userId: string, skillId: string) =>
    profileAction(() => api.post(`/api/employees/${userId}/skills/${skillId}/endorse`));

  const replaceNews = (item: NewsItem) => setNews((prev) => prev.map((n) => (n.id === item.id ? item : n)));

  const saveNews = async (data: NewsInput, id?: string) => {
    const saved = await attempt(
      () => (id ? api.patch<NewsItem>(`/api/news/${id}`, data) : api.post<NewsItem>('/api/news', data)),
      id ? 'خبر ویرایش شد.' : 'خبر منتشر شد.',
    );
    if (saved) await refresh('news');
    return Boolean(saved);
  };

  const deleteNews = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/news/${id}`), 'خبر حذف شد.');
    if (ok !== undefined) setNews((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleLikeNews = async (newsId: string) => {
    const updated = await attempt(() => api.post<NewsItem>(`/api/news/${newsId}/like`));
    if (updated) replaceNews(updated);
  };

  const markNewsRead = async (newsId: string) => {
    // Opening an article is not an interaction worth a sign-in prompt for guests.
    if (!currentUser) return;
    const item = news.find((n) => n.id === newsId);
    if (item?.isRead) return;
    const updated = await api.post<NewsItem>(`/api/news/${newsId}/read`).catch(() => null);
    if (updated) replaceNews(updated);
  };

  const acknowledgeNews = async (newsId: string) => {
    const updated = await attempt(() => api.post<NewsItem>(`/api/news/${newsId}/ack`), 'مطالعهٔ بخشنامه تأیید شد.');
    if (updated) replaceNews(updated);
  };

  const enrollTraining = async (trainingId: string) => {
    const result = await attempt(() => api.post<{ enrolled: boolean }>(`/api/trainings/${trainingId}/enroll`));
    if (result) {
      toast.success(result.enrolled ? 'ثبت‌نام شما انجام شد.' : 'ثبت‌نام شما لغو شد.');
      await refresh('trainings');
    }
  };

  const addTraining = async (training: Omit<TrainingProgram, 'id' | 'enrolledUserIds'>) => {
    const ok = await attempt(() => api.post('/api/trainings', training), 'دوره آموزشی اضافه شد.');
    if (ok) await Promise.all([refresh('trainings'), refresh('calendar')]);
    return Boolean(ok);
  };

  const deleteTraining = async (trainingId: string) => {
    const ok = await attempt(() => api.delete(`/api/trainings/${trainingId}`), 'دوره حذف شد.');
    if (ok !== undefined) setTrainings((prev) => prev.filter((t) => t.id !== trainingId));
  };

  const sendBirthdayWish = async (userId: string, text: string) => {
    const ok = await attempt(() => api.post(`/api/employees/${userId}/birthday_wishes`, { message: text }), 'پیام تبریک ارسال شد.');
    if (ok) await refresh('birthday_wishes');
    return Boolean(ok);
  };

  const sendWelcomeWish = async (newColleagueId: string, message: string) => {
    const ok = await attempt(() => api.post(`/api/new_colleagues/${newColleagueId}/wishes`, { message }), 'پیام خوش‌آمد ارسال شد.');
    if (ok) await refresh('new_colleagues');
    return Boolean(ok);
  };

  const deleteBirthdayWish = async (wishId: string) => {
    const ok = await attempt(() => api.delete(`/api/birthday_wishes/${wishId}`), 'پیام حذف شد.');
    if (ok !== undefined) await refresh('birthday_wishes');
  };

  const deleteWelcomeWish = async (wishId: string) => {
    const ok = await attempt(() => api.delete(`/api/colleague_wishes/${wishId}`), 'پیام حذف شد.');
    if (ok !== undefined) await refresh('new_colleagues');
  };

  const saveRole: PortalContextType['saveRole'] = async ({ id, ...role }) => {
    const ok = await attempt(
      () => (id ? api.patch(`/api/roles/${id}`, role) : api.post('/api/roles', role)),
      id ? 'نقش ذخیره شد.' : 'نقش جدید ساخته شد.',
    );
    if (ok) await Promise.all([refresh('roles'), refresh('me')]);
    return Boolean(ok);
  };

  const deleteRole = async (roleId: string) => {
    const ok = await attempt(() => api.delete(`/api/roles/${roleId}`), 'نقش حذف شد.');
    if (ok !== undefined) await refresh('roles');
    return ok !== undefined;
  };

  const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'>) => {
    const ok = await attempt(() => api.post('/api/calendar_events', event), 'رویداد به تقویم اضافه شد.');
    if (ok) await refresh('calendar');
    return Boolean(ok);
  };

  const deleteCalendarEvent = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/calendar_events/${id}`), 'رویداد حذف شد.');
    if (ok !== undefined) setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const setCustomHoliday = async (date: string, title: string, isHoliday: boolean) => {
    const ok = await attempt(() => api.put(`/api/holidays/${date}`, { title, isHoliday }), 'تقویم به‌روزرسانی شد.');
    if (ok) setCustomHolidays((prev) => ({ ...prev, [date]: { title, isHoliday } }));
  };

  const removeCustomHoliday = async (date: string) => {
    const ok = await attempt(() => api.delete(`/api/holidays/${date}`));
    if (ok !== undefined) {
      setCustomHolidays((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
    }
  };

  const addDocument: PortalContextType['addDocument'] = async (doc) => {
    const ok = await attempt(() => api.post('/api/documents', doc), 'سند به کتابخانه اضافه شد.');
    if (ok) await refresh('documents');
    return Boolean(ok);
  };

  const deleteDocument = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/documents/${id}`), 'سند حذف شد.');
    if (ok !== undefined) setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await api.post(`/api/notifications/${id}/read`).catch(() => undefined);
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await attempt(() => api.post('/api/notifications/read-all'));
  };

  const deleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await api.delete(`/api/notifications/${id}`).catch(() => undefined);
  };

  const getGlobalSearchResults = (query: string) =>
    buildSearchResults(query, { employees, news, polls, trainings, calendarEvents, documents });

  return (
    <PortalContext.Provider
      value={{
        isSetupComplete,
        completeSetup,
        authChecked,
        currentUser,
        isLoggedIn: Boolean(currentUser),
        isGuest,
        guestAccess,
        directoryLogin,
        loginPrompt,
        requestLogin,
        closeLoginPrompt,
        can,
        isAdmin: currentUser?.role === 'admin',
        roles,
        roleName,
        login,
        logout,
        changePassword,
        isLoading,
        error,
        activeTab,
        focusId,
        setActiveTab,
        globalSearchQuery,
        setGlobalSearchQuery,
        getGlobalSearchResults,
        appSettings,
        employees,
        polls,
        news,
        newsHasMore,
        loadMoreNews,
        newColleagues,
        birthdayWishes,
        trainings,
        calendarEvents,
        customHolidays,
        notifications,
        documents,
        userMoods,
        todayMoodSubmitted,
        updateSettings,
        submitMood,
        addPoll,
        votePoll,
        togglePollActiveStatus,
        deletePoll,
        addEmployee,
        updateUserProfile,
        resetEmployeePassword,
        addWorkExperience,
        removeWorkExperience,
        addSkill,
        removeSkill,
        endorseSkill,
        saveNews,
        deleteNews,
        toggleLikeNews,
        markNewsRead,
        acknowledgeNews,
        enrollTraining,
        addTraining,
        deleteTraining,
        sendBirthdayWish,
        sendWelcomeWish,
        deleteBirthdayWish,
        deleteWelcomeWish,
        saveRole,
        deleteRole,
        addCalendarEvent,
        deleteCalendarEvent,
        setCustomHoliday,
        removeCustomHoliday,
        addDocument,
        deleteDocument,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
};

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) throw new Error('usePortal must be used within PortalProvider');
  return context;
};
