import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, errorMessage, setUnauthorizedHandler } from '../lib/api';
import { buildSearchResults } from '../lib/search';
import { systemLink } from '../../shared/systemLinks';
import { type FeatureKey, featureOfTab } from '../../shared/features';
import type { TodoStep } from '../../shared/todos';
import { featureOn as isFeatureOn } from '../lib/features';
import type {
  ExternalSystem,
  ActiveTab,
  AppSettings,
  Attachment,
  BirthdayWish,
  GreetingCardInput,
  CalendarEvent,
  CalendarEventInput,
  CurrentUser,
  CustomHolidays,
  DepartmentPage,
  Guide,
  GuideInput,
  IncomingKudos,
  MoodState,
  NewColleagueWelcome,
  NewsInput,
  NewsItem,
  NotificationItem,
  Poll,
  PollAnswerInput,
  PollInput,
  Permission,
  PersonalTodo,
  PortalDocument,
  DocumentDetails,
  RoleInfo,
  SearchResultItem,
  TodoInput,
  TrainingInput,
  TrainingProgram,
  UserMood,
  UserProfile,
  UserRole,
  WorkExperience,
} from '../types';
import { todayJalali, toPersianDigits } from '../lib/jalali';

const NEWS_PAGE_SIZE = 30;

/** Fired on window when the list of online colleagues may have changed. */
export const PRESENCE_EVENT = 'portal:presence';
/** Fired on window with an IncomingKudos when a colleague sends this person an emoji. */
export const KUDOS_EVENT = 'portal:kudos';

/** How a colleague with portal access signs in: a portal password, or their Active Directory password. */
export type SignInMethod = 'local' | 'ldap';

export interface AccountInput {
  username: string;
  role: UserRole;
  signIn: SignInMethod;
}

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  hasAccount: boolean;
  signIn: SignInMethod;
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
    | 'hideBirthday'
    | 'hideAnniversary'
    | 'hireDate'
    | 'bio'
    | 'location'
    | 'avatar'
    | 'directManagerId'
    | 'isActive'
  >
>;

export interface FirstProfile {
  firstName: string;
  lastName: string;
  birthDate: string;
  hideBirthday: boolean;
  /** The phone-book entry the colleague said is them, or null for none of them. */
  claim?: string | null;
}

/** A phone-book entry without a portal account that has the name a colleague entered on first sign-in. */
export interface PhoneBookMatch {
  id: string;
  name: string;
  position: string;
  department: string;
}

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
  /** The visitor is inside the company network (false when they came from the internet). */
  companyNetwork: boolean;
  /** The address of an organisation app that works where the visitor is; '' when it has none. */
  systemHref: (system: ExternalSystem) => string;
  /** Staff sign in with their Active Directory (Windows) username and password. */
  directoryLogin: boolean;
  /** Address of the uploaded company logo, or null for the built-in ROYA wordmark. */
  logoSrc: string | null;
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
  logoutEverywhere: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Saves the first-sign-in profile, or returns the phone-book entries that may be this colleague (asked about first). */
  completeProfile: (profile: FirstProfile) => Promise<PhoneBookMatch[] | null>;

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
  guides: Guide[];
  departmentPages: DepartmentPage[];
  userMoods: UserMood[];
  todayMoodSubmitted: boolean;
  /** This person's own to-do notes (empty for guests and while the part is hidden). */
  todos: PersonalTodo[];

  /** Whether this person sees a part an administrator can keep hidden until it is introduced. */
  featureOn: (key: FeatureKey) => boolean;
  /** «جدید» goes away once the person opens the part or closes its introduction. */
  markFeatureSeen: (key: FeatureKey) => void;
  /** Switches the once-a-day effect of the occasions and seasons on or off for this person. */
  setOccasionEffects: (on: boolean) => Promise<boolean>;
  /** Saves this person's order of the dashboard cards; an empty list puts the default order back. */
  setDashboardOrder: (order: string[]) => Promise<boolean>;

  // Actions
  updateSettings: (settings: Partial<AppSettings>) => Promise<boolean>;
  setBanner: (banner: { text: string; level: 'info' | 'warning'; expiresAt: string }) => Promise<boolean>;
  clearBanner: () => Promise<boolean>;
  submitMood: (mood: MoodState) => Promise<void>;
  /** Resolves to the new note, or undefined when it failed (e.g. it is already in the list). */
  addTodo: (input: TodoInput) => Promise<PersonalTodo | undefined>;
  updateTodo: (
    id: string,
    changes: Partial<Pick<PersonalTodo, 'title' | 'note' | 'important' | 'repeat' | 'remind'>> & {
      dueDate?: string;
      steps?: Pick<TodoStep, 'text' | 'done'>[];
      done?: boolean;
    },
  ) => Promise<boolean>;
  deleteTodo: (id: string) => Promise<boolean>;
  /** This person's open notes due on a Jalali day, for the calendar; none while the part is hidden. */
  myDueTodos: (date: string) => PersonalTodo[];
  clearDoneTodos: () => Promise<boolean>;
  addPoll: (poll: PollInput) => Promise<boolean>;
  votePoll: (pollId: string, answers: PollAnswerInput[]) => Promise<boolean>;
  togglePollActiveStatus: (pollId: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;
  updatePoll: (pollId: string, poll: PollInput) => Promise<boolean>;
  /** Resolves to the one-time password (null when none is needed), or undefined when it failed. */
  addEmployee: (data: NewEmployeeInput) => Promise<{ temporaryPassword: string | null } | undefined>;
  grantAccess: (id: string, account: AccountInput) => Promise<{ temporaryPassword: string | null } | undefined>;
  revokeAccess: (id: string) => Promise<boolean>;
  updateUserProfile: (id: string, update: ProfileUpdate) => Promise<boolean>;
  resetEmployeePassword: (id: string) => Promise<string | null>;
  addWorkExperience: (userId: string, exp: Omit<WorkExperience, 'id'>) => Promise<void>;
  removeWorkExperience: (userId: string, expId: string) => Promise<void>;
  addSkill: (userId: string, skill: { name: string; category: string }) => Promise<void>;
  removeSkill: (userId: string, skillId: string) => Promise<void>;
  endorseSkill: (userId: string, skillId: string) => Promise<void>;
  saveNews: (data: NewsInput, id?: string, message?: string) => Promise<boolean>;
  deleteNews: (id: string) => Promise<void>;
  toggleLikeNews: (newsId: string) => Promise<void>;
  markNewsRead: (newsId: string) => Promise<void>;
  acknowledgeNews: (newsId: string) => Promise<void>;
  /** Signs up, or joins the waitlist when the course is full. */
  enrollTraining: (trainingId: string) => Promise<void>;
  /** Cancels one's sign-up or place on the waitlist. */
  leaveTraining: (trainingId: string) => Promise<void>;
  /** The short survey after a course. */
  sendTrainingFeedback: (trainingId: string, feedback: { satisfaction: number; usefulness: number; comment: string }) => Promise<boolean>;
  /** Handouts and slides, by the instructor or the people who run trainings. */
  saveTrainingMaterials: (trainingId: string, materials: Attachment[]) => Promise<boolean>;
  addTraining: (training: TrainingInput) => Promise<boolean>;
  deleteTraining: (trainingId: string) => Promise<void>;
  updateTraining: (trainingId: string, training: TrainingInput, notifyEnrolled: boolean) => Promise<boolean>;
  sendBirthdayWish: (userId: string, card: GreetingCardInput) => Promise<boolean>;
  reactToWish: (wishId: string, reaction: string) => Promise<void>;
  sendWelcomeWish: (newColleagueId: string, message: string) => Promise<boolean>;
  deleteBirthdayWish: (wishId: string) => Promise<void>;
  deleteWelcomeWish: (wishId: string) => Promise<void>;
  introduceColleague: (userId: string, input: { message: string; joinDate: string }) => Promise<boolean>;
  updateIntroduction: (id: string, input: { welcomeMessage: string; joinDate: string }) => Promise<boolean>;
  deleteIntroduction: (id: string) => Promise<void>;
  saveRole: (role: { id?: string; name: string; description: string; permissions?: Permission[] }) => Promise<boolean>;
  deleteRole: (roleId: string) => Promise<boolean>;
  addCalendarEvent: (event: CalendarEventInput) => Promise<boolean>;
  deleteCalendarEvent: (id: string) => Promise<void>;
  updateCalendarEvent: (id: string, event: CalendarEventInput) => Promise<boolean>;
  /** "Attending or not" for an event that asks; can be changed until the day. */
  rsvpCalendarEvent: (id: string, attending: boolean) => Promise<boolean>;
  setCustomHoliday: (date: string, title: string, isHoliday: boolean) => Promise<void>;
  removeCustomHoliday: (date: string) => Promise<void>;
  addDocument: (doc: DocumentDetails & { file: Attachment; notify: boolean }) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<void>;
  updateDocument: (id: string, doc: DocumentDetails) => Promise<boolean>;
  addDocumentVersion: (id: string, version: { file: Attachment; note: string; reAck: boolean; notify: boolean; reviewDate: string }) => Promise<boolean>;
  markDocumentReviewed: (id: string, reviewDate: string) => Promise<boolean>;
  acknowledgeDocument: (id: string) => Promise<void>;
  saveGuide: (guide: GuideInput, id?: string) => Promise<boolean>;
  deleteGuide: (id: string) => Promise<boolean>;
  markGuideReviewed: (id: string, reviewDate: string) => Promise<boolean>;
  sendGuideFeedback: (id: string, helpful: boolean) => Promise<void>;
  /** Resolves to the name of the colleague the question went to, or undefined when it failed. */
  askGuideQuestion: (id: string, text: string) => Promise<string | undefined>;
  saveDepartmentPage: (department: string, page: { headId?: string | null; about: string }) => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

const VALID_TABS: ActiveTab[] = [
  'dashboard', 'polls', 'colleagues', 'orgchart', 'departments', 'search', 'news', 'documents', 'guides',
  'training', 'calendar', 'notifications', 'systems', 'reports', 'people', 'admin', 'audit', 'suggestions', 'todos',
];

/** Ids in the address are encoded, since a department's page is named by the department. */
function decodeId(id: string | undefined) {
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function readHash(): { tab: ActiveTab; id: string | null } {
  const [tab, id] = window.location.hash.replace(/^#/, '').split('/');
  return VALID_TABS.includes(tab as ActiveTab) ? { tab: tab as ActiveTab, id: decodeId(id) } : { tab: 'dashboard', id: null };
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
  // Guests may only read from inside the company network; from the internet everyone signs in.
  const [companyNetwork, setCompanyNetwork] = useState(true);
  const [directoryLogin, setDirectoryLogin] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
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
  const [guides, setGuides] = useState<Guide[]>([]);
  const [departmentPages, setDepartmentPages] = useState<DepartmentPage[]>([]);
  const [userMoods, setUserMoods] = useState<UserMood[]>([]);
  const [todos, setTodos] = useState<PersonalTodo[]>([]);
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
        const status = await api.get<{
          isSetupComplete: boolean;
          guestAccess?: boolean;
          companyNetwork?: boolean;
          directoryLogin?: boolean;
          logoUrl?: string;
        }>('/api/system/status');
        setLogoUrl(status.logoUrl ?? '');
        setIsSetupComplete(status.isSetupComplete);
        setGuestAccess(Boolean(status.guestAccess));
        setCompanyNetwork(status.companyNetwork !== false);
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

  /** Signs out on every computer and phone, for when a device is lost or was left signed in. */
  const logoutEverywhere = async () => {
    try {
      await api.post('/api/auth/logout-everywhere');
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }
    setCurrentUser(null);
    toast.success('از حساب کاربری خود در همهٔ دستگاه‌ها خارج شدید');
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const { user } = await api.post<{ user: CurrentUser }>('/api/auth/change-password', { currentPassword, newPassword });
    setCurrentUser(user);
  };

  const completeProfile = async (profile: FirstProfile) => {
    const res = await api.post<{ user?: CurrentUser; matches?: PhoneBookMatch[] }>('/api/auth/profile', profile);
    if (res.matches) return res.matches;
    if (res.user) setCurrentUser(res.user);
    return null;
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
    const hash = `#${tab}${id ? `/${encodeURIComponent(id)}` : ''}`;
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
      guides: () => api.get<Guide[]>('/api/guides').then(setGuides),
      department_pages: () => api.get<DepartmentPage[]>('/api/department_pages').then(setDepartmentPages),
      moods: () => api.get<UserMood[]>('/api/moods/me').then(setUserMoods),
      todos: () => api.get<PersonalTodo[]>('/api/todos').then(setTodos),
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
    const { notifications: loadNotifications, moods: loadMoods, todos: loadTodos, me: loadMe, ...shared } = loaders;
    const toLoad = sessionKey ? [...Object.values(shared), loadNotifications, loadMoods, loadTodos, loadMe] : Object.values(shared);
    if (!sessionKey) {
      setNotifications([]);
      setUserMoods([]);
      setTodos([]);
    }
    Promise.all(toLoad.map((load) => load()))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setIsLoading(false));

    if (!sessionKey) return;

    // Live updates: the server sends "changed" signals and we refetch that resource.
    const source = new EventSource('/api/events');
    // The browser reconnects on its own (after an update restarts the server, a dropped Wi-Fi, a laptop
    // waking up); whatever changed meanwhile was not signalled, so everything is fetched again.
    // A refetch that a signal asked for while the network was down failed, so coming back online does the same.
    const refreshAll = () => {
      for (const resource of Object.keys(loaders) as Resource[]) void refresh(resource);
    };
    let connectedBefore = false;
    source.addEventListener('open', () => {
      if (connectedBefore) refreshAll();
      connectedBefore = true;
      // «همکاران آنلاین» keeps its own list (see src/components/online).
      window.dispatchEvent(new Event(PRESENCE_EVENT));
    });
    window.addEventListener('online', refreshAll);
    source.addEventListener('changed', (e) => {
      try {
        const { resource } = JSON.parse((e as MessageEvent).data) as { resource: string };
        if (resource === 'roles' || resource === 'employees') void refresh('me');
        if (resource === 'presence') window.dispatchEvent(new Event(PRESENCE_EVENT));
        if (resource in loaders) void refresh(resource as Resource);
      } catch {
        // Ignore malformed events.
      }
    });
    source.addEventListener('notification', () => {
      void refresh('notifications');
    });
    source.addEventListener('kudos', (e) => {
      try {
        window.dispatchEvent(new CustomEvent<IncomingKudos>(KUDOS_EVENT, { detail: JSON.parse((e as MessageEvent).data) }));
      } catch {
        // Ignore malformed events.
      }
    });
    return () => {
      source.close();
      window.removeEventListener('online', refreshAll);
    };
  }, [isReady, sessionKey, loaders, refresh]);

  // A manager may switch guest access or replace the logo while the page is open.
  useEffect(() => {
    if (!appSettings) return;
    setGuestAccess(appSettings.guestAccess && companyNetwork);
    setLogoUrl(appSettings.logoUrl ?? '');
  }, [appSettings, companyNetwork]);
  // Served through /api/system/logo so the sign-in page can show it too; the file name busts the cache.
  const logoSrc = logoUrl ? `/api/system/logo?v=${encodeURIComponent(logoUrl.replace(/^\/uploads\//, ''))}` : null;

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

  const featureOn = useCallback((key: FeatureKey) => isFeatureOn(appSettings, key), [appSettings]);

  const markFeatureSeen = useCallback((key: FeatureKey) => {
    setAppSettings((s) => (s ? { ...s, featureNews: s.featureNews.filter((n) => n.key !== key) } : s));
    api.post<AppSettings>(`/api/settings/features/${key}/seen`).then(setAppSettings).catch(() => undefined);
  }, []);

  // Opening a newly introduced page counts as having seen it.
  const unseenTabFeature = featureOfTab(activeTab);
  const tabIsNew = Boolean(currentUser && unseenTabFeature && appSettings?.featureNews.some((n) => n.key === unseenTabFeature));
  useEffect(() => {
    if (tabIsNew && unseenTabFeature) markFeatureSeen(unseenTabFeature);
  }, [tabIsNew, unseenTabFeature, markFeatureSeen]);

  const setOccasionEffects = async (on: boolean) => {
    const updated = await attempt(
      () => api.put<AppSettings>('/api/settings/occasion-effects', { on }),
      on ? 'افکت مناسبت‌ها برای شما روشن شد.' : 'افکت مناسبت‌ها برای شما خاموش شد.',
    );
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const setDashboardOrder = async (order: string[]) => {
    const updated = await attempt(
      () => api.put<AppSettings>('/api/settings/dashboard-order', { order }),
      order.length === 0 ? 'چیدمان پیش‌فرض داشبورد برگشت.' : 'چیدمان داشبورد ذخیره شد.',
    );
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const updateSettings = async (settings: Partial<AppSettings>) => {
    const updated = await attempt(() => api.put<AppSettings>('/api/settings', settings), 'تنظیمات ذخیره شد.');
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const setBanner: PortalContextType['setBanner'] = async (banner) => {
    const updated = await attempt(() => api.put<AppSettings>('/api/settings/banner', banner), 'پیام سراسری منتشر شد.');
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const clearBanner = async () => {
    const updated = await attempt(() => api.delete<AppSettings>('/api/settings/banner'), 'پیام سراسری برداشته شد.');
    if (updated) setAppSettings(updated);
    return Boolean(updated);
  };

  const submitMood = async (mood: MoodState) => {
    const result = await attempt(() => api.post<{ mood: UserMood }>('/api/moods', { mood }));
    if (result) setUserMoods((prev) => [result.mood, ...prev.filter((m) => m.date !== result.mood.date)]);
  };
  const todayMoodSubmitted = userMoods.some((m) => m.date === todayJalali());

  const addTodo: PortalContextType['addTodo'] = async (input) => {
    const created = await attempt(() => api.post<PersonalTodo>('/api/todos', input), 'به یادداشت کارهای شما اضافه شد.');
    if (created) setTodos((prev) => [...prev.filter((t) => t.id !== created.id), created]);
    return created;
  };

  const updateTodo: PortalContextType['updateTodo'] = async (id, changes) => {
    const updated = await attempt(() => api.patch<PersonalTodo>(`/api/todos/${id}`, changes));
    if (updated) setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    // Ticking a repeating note off writes the next one, and un-ticking takes it back.
    if (updated && changes.done !== undefined && updated.repeat) void refresh('todos');
    return Boolean(updated);
  };

  const deleteTodo: PortalContextType['deleteTodo'] = async (id) => {
    const ok = await attempt(() => api.delete(`/api/todos/${id}`).then(() => true));
    if (ok) setTodos((prev) => prev.filter((t) => t.id !== id));
    return Boolean(ok);
  };

  const myDueTodos: PortalContextType['myDueTodos'] = (date) =>
    featureOn('todos') ? todos.filter((t) => !t.doneAt && t.dueDate === date) : [];

  const clearDoneTodos: PortalContextType['clearDoneTodos'] = async () => {
    const ok = await attempt(() => api.delete('/api/todos/done').then(() => true));
    if (ok) setTodos((prev) => prev.filter((t) => !t.doneAt));
    return Boolean(ok);
  };

  const replacePoll = (poll: Poll) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p)));

  const addPoll: PortalContextType['addPoll'] = async (poll) => {
    const created = await attempt(() => api.post<Poll>('/api/polls', poll), 'نظرسنجی منتشر شد.');
    if (created) setPolls((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
    return Boolean(created);
  };

  const votePoll: PortalContextType['votePoll'] = async (pollId, answers) => {
    const updated = await attempt(() => api.post<Poll>(`/api/polls/${pollId}/vote`, { answers }), 'پاسخ شما ثبت شد.');
    if (updated) replacePoll(updated);
    return Boolean(updated);
  };

  const togglePollActiveStatus = async (pollId: string) => {
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;
    const updated = await attempt(() => api.patch<Poll>(`/api/polls/${pollId}/status`, { isActive: !poll.isActive }));
    if (updated) replacePoll(updated);
  };

  const updatePoll: PortalContextType['updatePoll'] = async (pollId, poll) => {
    const updated = await attempt(() => api.put<Poll>(`/api/polls/${pollId}`, poll), 'نظرسنجی ویرایش شد.');
    if (updated) replacePoll(updated);
    return Boolean(updated);
  };

  const deletePoll = async (pollId: string) => {
    const ok = await attempt(() => api.delete(`/api/polls/${pollId}`), 'نظرسنجی حذف شد.');
    if (ok !== undefined) setPolls((prev) => prev.filter((p) => p.id !== pollId));
  };

  const replaceEmployee = (emp: UserProfile) => {
    setEmployees((prev) => prev.map((e) => (e.id === emp.id ? emp : e)));
    setCurrentUser((me) => (me && me.id === emp.id ? { ...me, ...emp } : me));
  };

  const addEmployee = async ({ username, ...data }: NewEmployeeInput) => {
    const result = await attempt(
      () =>
        api.post<{ employee: UserProfile; temporaryPassword: string | null }>(
          '/api/employees',
          data.hasAccount ? { ...data, username: username.trim().toLowerCase() } : data,
        ),
      'همکار جدید اضافه شد.',
    );
    if (!result) return undefined;
    setEmployees((prev) => [...prev.filter((e) => e.id !== result.employee.id), result.employee]);
    return { temporaryPassword: result.temporaryPassword };
  };

  const grantAccess = async (id: string, account: AccountInput) => {
    const result = await attempt(
      () => api.post<{ employee: UserProfile; temporaryPassword: string | null }>(`/api/employees/${id}/account`, account),
      'دسترسی پورتال داده شد.',
    );
    if (!result) return undefined;
    replaceEmployee(result.employee);
    return { temporaryPassword: result.temporaryPassword };
  };

  const revokeAccess = async (id: string) => {
    const updated = await attempt(() => api.delete<UserProfile>(`/api/employees/${id}/account`), 'دسترسی پورتال برداشته شد.');
    if (updated) replaceEmployee(updated);
    return Boolean(updated);
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

  const saveNews = async (data: NewsInput, id?: string, message?: string) => {
    const saved = await attempt(
      () => (id ? api.patch<NewsItem>(`/api/news/${id}`, data) : api.post<NewsItem>('/api/news', data)),
      message ?? (id ? 'خبر ویرایش شد.' : 'خبر منتشر شد.'),
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
    const result = await attempt(() => api.post<{ status: 'enrolled' | 'waitlist'; position?: number }>(`/api/trainings/${trainingId}/enroll`));
    if (result) {
      toast.success(
        result.status === 'enrolled'
          ? 'ثبت‌نام شما انجام شد.'
          : `ظرفیت پر است؛ نفر ${toPersianDigits(result.position ?? 1)} لیست انتظار هستید. اگر جایی آزاد شود، خودکار ثبت‌نام می‌شوید و خبردار می‌شوید.`,
      );
      await refresh('trainings');
    }
  };

  const leaveTraining = async (trainingId: string) => {
    const ok = await attempt(() => api.delete(`/api/trainings/${trainingId}/enroll`), 'ثبت‌نام شما لغو شد.');
    if (ok !== undefined) await refresh('trainings');
  };

  const sendTrainingFeedback: PortalContextType['sendTrainingFeedback'] = async (trainingId, feedback) => {
    const ok = await attempt(() => api.post(`/api/trainings/${trainingId}/feedback`, feedback), 'نظر شما ثبت شد. ممنون!');
    if (ok !== undefined) await refresh('trainings');
    return ok !== undefined;
  };

  const saveTrainingMaterials: PortalContextType['saveTrainingMaterials'] = async (trainingId, materials) => {
    const ok = await attempt(() => api.put(`/api/trainings/${trainingId}/materials`, { materials }));
    if (ok !== undefined) await refresh('trainings');
    return ok !== undefined;
  };

  const addTraining = async (training: TrainingInput) => {
    const ok = await attempt(() => api.post('/api/trainings', training), 'دوره آموزشی اضافه شد.');
    if (ok) await Promise.all([refresh('trainings'), refresh('calendar')]);
    return Boolean(ok);
  };

  const updateTraining: PortalContextType['updateTraining'] = async (trainingId, training, notifyEnrolled) => {
    const ok = await attempt(() => api.put(`/api/trainings/${trainingId}`, { ...training, notifyEnrolled }), 'دوره ویرایش شد.');
    if (ok) await Promise.all([refresh('trainings'), refresh('calendar')]);
    return Boolean(ok);
  };

  const deleteTraining = async (trainingId: string) => {
    const ok = await attempt(() => api.delete(`/api/trainings/${trainingId}`), 'دوره حذف شد.');
    if (ok !== undefined) {
      setTrainings((prev) => prev.filter((t) => t.id !== trainingId));
      setCalendarEvents((prev) => prev.filter((e) => e.trainingId !== trainingId));
    }
  };

  const sendBirthdayWish = async (userId: string, card: GreetingCardInput) => {
    const ok = await attempt(() => api.post(`/api/employees/${userId}/birthday_wishes`, card), 'کارت تبریک فرستاده شد.');
    if (ok) await refresh('birthday_wishes');
    return Boolean(ok);
  };

  const reactToWish = async (wishId: string, reaction: string) => {
    const ok = await attempt(() => api.put(`/api/birthday_wishes/${wishId}/reaction`, { reaction }));
    if (ok !== undefined) await refresh('birthday_wishes');
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

  const introduceColleague: PortalContextType['introduceColleague'] = async (userId, input) => {
    const ok = await attempt(() => api.post(`/api/employees/${userId}/introduce`, input), 'همکار در داشبورد معرفی شد.');
    if (ok) await refresh('new_colleagues');
    return Boolean(ok);
  };

  const updateIntroduction: PortalContextType['updateIntroduction'] = async (id, input) => {
    const ok = await attempt(() => api.patch(`/api/new_colleagues/${id}`, input), 'کارت معرفی ویرایش شد.');
    if (ok) await refresh('new_colleagues');
    return Boolean(ok);
  };

  const deleteIntroduction = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/new_colleagues/${id}`), 'کارت معرفی حذف شد.');
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

  const addCalendarEvent: PortalContextType['addCalendarEvent'] = async (event) => {
    const ok = await attempt(() => api.post('/api/calendar_events', event), 'رویداد به تقویم اضافه شد.');
    if (ok) await refresh('calendar');
    return Boolean(ok);
  };

  const updateCalendarEvent: PortalContextType['updateCalendarEvent'] = async (id, event) => {
    const ok = await attempt(() => api.put(`/api/calendar_events/${id}`, event), 'رویداد ویرایش شد.');
    if (ok) await refresh('calendar');
    return Boolean(ok);
  };

  const deleteCalendarEvent = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/calendar_events/${id}`), 'رویداد حذف شد.');
    if (ok !== undefined) setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const rsvpCalendarEvent: PortalContextType['rsvpCalendarEvent'] = async (id, attending) => {
    const updated = await attempt(
      () => api.post<CalendarEvent>(`/api/calendar_events/${id}/rsvp`, { attending }),
      attending ? 'حضورتان ثبت شد.' : 'ثبت شد که شرکت نمی‌کنید.',
    );
    if (updated) setCalendarEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return Boolean(updated);
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

  const updateDocument: PortalContextType['updateDocument'] = async (id, doc) => {
    const ok = await attempt(() => api.put(`/api/documents/${id}`, doc), 'مشخصات سند ذخیره شد.');
    if (ok) await refresh('documents');
    return Boolean(ok);
  };

  const deleteDocument = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/documents/${id}`), 'سند حذف شد.');
    if (ok !== undefined) setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const replaceDocument = (doc: PortalDocument) => setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));

  const addDocumentVersion: PortalContextType['addDocumentVersion'] = async (id, version) => {
    const doc = await attempt(() => api.post<PortalDocument>(`/api/documents/${id}/versions`, version), 'نسخهٔ جدید جایگزین شد.');
    if (doc) replaceDocument(doc);
    return Boolean(doc);
  };

  const markDocumentReviewed: PortalContextType['markDocumentReviewed'] = async (id, reviewDate) => {
    const doc = await attempt(() => api.post<PortalDocument>(`/api/documents/${id}/review`, { reviewDate }), 'بازبینی ثبت شد.');
    if (doc) replaceDocument(doc);
    return Boolean(doc);
  };

  const acknowledgeDocument = async (id: string) => {
    const doc = await attempt(() => api.post<PortalDocument>(`/api/documents/${id}/ack`), 'تأیید مطالعه ثبت شد.');
    if (doc) replaceDocument(doc);
  };

  const replaceGuide = (guide: Guide) => setGuides((prev) => prev.map((g) => (g.id === guide.id ? guide : g)));

  const saveGuide: PortalContextType['saveGuide'] = async (guide, id) => {
    const saved = await attempt(
      () => (id ? api.put<Guide>(`/api/guides/${id}`, guide) : api.post<Guide>('/api/guides', guide)),
      id ? 'راهنما ذخیره شد.' : 'راهنما منتشر شد.',
    );
    if (saved) await refresh('guides');
    return Boolean(saved);
  };

  const deleteGuide = async (id: string) => {
    const ok = await attempt(() => api.delete(`/api/guides/${id}`), 'راهنما حذف شد.');
    if (ok !== undefined) setGuides((prev) => prev.filter((g) => g.id !== id));
    return ok !== undefined;
  };

  const markGuideReviewed: PortalContextType['markGuideReviewed'] = async (id, reviewDate) => {
    const guide = await attempt(() => api.post<Guide>(`/api/guides/${id}/review`, { reviewDate }), 'بازبینی ثبت شد.');
    if (guide) replaceGuide(guide);
    return Boolean(guide);
  };

  const sendGuideFeedback = async (id: string, helpful: boolean) => {
    const guide = await attempt(() => api.post<Guide>(`/api/guides/${id}/feedback`, { helpful }), 'از نظرتان ممنونیم.');
    if (guide) replaceGuide(guide);
  };

  const askGuideQuestion: PortalContextType['askGuideQuestion'] = async (id, text) => {
    const result = await attempt(() => api.post<{ sentTo: string }>(`/api/guides/${id}/question`, { text }));
    if (result) {
      toast.success(`پرسش شما برای ${result.sentTo} فرستاده شد.`);
      setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, myFeedback: false } : g)));
    }
    return result?.sentTo;
  };

  const saveDepartmentPage: PortalContextType['saveDepartmentPage'] = async (department, page) => {
    const ok = await attempt(() => api.put(`/api/department_pages/${encodeURIComponent(department)}`, page), 'صفحهٔ واحد ذخیره شد.');
    if (ok) await refresh('department_pages');
    return Boolean(ok);
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

  const systemHref = useCallback((system: ExternalSystem) => systemLink(system, companyNetwork), [companyNetwork]);

  const getGlobalSearchResults = (query: string) =>
    buildSearchResults(query, { employees, news, polls, trainings, calendarEvents, documents, guides, departmentPages, departments: appSettings?.departments ?? [] });

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
        companyNetwork,
        systemHref,
        directoryLogin,
        logoSrc,
        loginPrompt,
        requestLogin,
        closeLoginPrompt,
        can,
        isAdmin: currentUser?.role === 'admin',
        roles,
        roleName,
        login,
        logout,
        logoutEverywhere,
        changePassword,
        completeProfile,
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
        guides,
        departmentPages,
        userMoods,
        todayMoodSubmitted,
        todos,
        featureOn,
        markFeatureSeen,
        setOccasionEffects,
        setDashboardOrder,
        updateSettings,
        setBanner,
        clearBanner,
        submitMood,
        addTodo,
        updateTodo,
        deleteTodo,
        myDueTodos,
        clearDoneTodos,
        addPoll,
        votePoll,
        togglePollActiveStatus,
        deletePoll,
        updatePoll,
        addEmployee,
        grantAccess,
        revokeAccess,
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
        leaveTraining,
        sendTrainingFeedback,
        saveTrainingMaterials,
        addTraining,
        deleteTraining,
        updateTraining,
        sendBirthdayWish,
        reactToWish,
        sendWelcomeWish,
        deleteBirthdayWish,
        deleteWelcomeWish,
        introduceColleague,
        updateIntroduction,
        deleteIntroduction,
        saveRole,
        deleteRole,
        addCalendarEvent,
        deleteCalendarEvent,
        updateCalendarEvent,
        rsvpCalendarEvent,
        setCustomHoliday,
        removeCustomHoliday,
        addDocument,
        deleteDocument,
        updateDocument,
        addDocumentVersion,
        markDocumentReviewed,
        acknowledgeDocument,
        saveGuide,
        deleteGuide,
        markGuideReviewed,
        sendGuideFeedback,
        askGuideQuestion,
        saveDepartmentPage,
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
