import { AppSettings } from '../types';
import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  UserMood,
  MoodState,
  UserProfile,
  UserRole,
  Poll,
  NewsItem,
  TrainingProgram,
  CalendarEvent,
  NotificationItem,
  NewColleagueWelcome,
  ActiveTab,
  SearchResultItem,
  PollType,
  WorkExperience,
  Skill
} from '../types';



interface PortalContextType {
  appSettings: AppSettings | null;
  updateSettings: (settings: AppSettings) => void;
  isSetupComplete: boolean | null;
  completeSetup: (user: UserProfile) => void;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  isLoggedIn: boolean;
  login: (u: string, p: string) => Promise<boolean>;
  logout: () => void;
  currentUser: UserProfile | null;
  userRole: UserRole;
  isLoginModalOpen: boolean;
  loginModalMessage: string | null;
  openLoginModal: (message?: string) => void;
  closeLoginModal: () => void;
  requireAuth: (action: () => void, message?: string) => boolean;
  userMoods: UserMood[];
  submitMood: (mood: MoodState) => void;
  todayMoodSubmitted: boolean;
  setCurrentUserId: (id: string) => void;
  employees: UserProfile[];
  polls: Poll[];
  news: NewsItem[];
  newColleagues: NewColleagueWelcome[];
  trainings: TrainingProgram[];
  calendarEvents: CalendarEvent[];
  notifications: NotificationItem[];
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  
  customHolidays: Record<string, { title: string, isHoliday: boolean }>;
  setCustomHoliday: (date: string, title: string, isHoliday: boolean) => void;
  removeCustomHoliday: (date: string) => void;

  // Actions
  addPoll: (poll: {
    title: string;
    description: string;
    department: string;
    type: PollType;
    expiryDate: string;
    options: string[];
  }) => void;
  votePoll: (pollId: string, optionId?: string, freeText?: string) => void;
  togglePollActiveStatus: (pollId: string) => void;
  deletePoll: (pollId: string) => void;

  updateUserProfile: (profile: Partial<UserProfile> & { id: string }) => void;
  addWorkExperience: (userId: string, exp: Omit<WorkExperience, 'id'>) => void;
  addSkill: (userId: string, skill: Omit<Skill, 'id' | 'endorsements'>) => void;
  endorseSkill: (userId: string, skillId: string) => void;
  addEmployee: (employeeData: Omit<UserProfile, 'id' | 'workExperiences' | 'skills'>) => void;

  addNews: (newsData: {
    title: string;
    summary: string;
    content: string;
    category: NewsItem['category'];
    image: string;
    tags: string[];
    isPinned?: boolean;
  }) => void;
  toggleLikeNews: (newsId: string) => void;

  enrollTraining: (trainingId: string) => void;
  addTraining: (training: Omit<TrainingProgram, 'id' | 'enrolledUserIds'>) => void;

  sendBirthdayWish: (birthdayUserId: string, text: string) => void;
  sendWelcomeWish: (newColleagueId: string, message: string) => void;

  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => void;

  sendNotification: (notif: { targetUserId: string; title: string; message: string; type: NotificationItem['type']; linkTab?: ActiveTab }) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;

  getGlobalSearchResults: (query: string) => SearchResultItem[];
  
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [birthdayWishes, setBirthdayWishes] = useState<Record<string, { id: string; senderName: string; text: string; time: string }[]>>({});
  const clearError = () => setError(null);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/polls').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت نظرسنجی‌ها')),
      fetch('/api/news').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت اخبار')),
      fetch('/api/employees').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت لیست همکاران')),
      fetch('/api/trainings').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت آموزش‌ها')),
      fetch('/api/calendar_events').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت تقویم')),
      fetch('/api/new_colleagues').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت همکاران جدید')),
      fetch('/api/settings').then(res => res.ok ? res.json() : Promise.reject('خطا در دریافت تنظیمات'))
    ])
    .then(([pollsData, newsData, employeesData, trainingsData, calendarEventsData, newColleaguesData, settingsData]) => {
      setAppSettings(settingsData);
      setPolls(pollsData);
      setNews(newsData);
      setEmployees(employeesData);
      setTrainings(trainingsData);
      setCalendarEvents(calendarEventsData);
      setNewColleagues(newColleaguesData);
    })
    .catch(err => {
      console.error(err);
      setError(typeof err === 'string' ? err : 'خطا در برقراری ارتباط با سرور');
    })
    .finally(() => {
      setIsLoading(false);
    });

    // Setup SSE
    const eventSource = new EventSource('/api/events');
    eventSource.addEventListener('news_added', (e) => {
      try {
        const newNews = JSON.parse(e.data);
        setNews(prev => [newNews, ...prev]);
      } catch (err) {}
    });
    eventSource.addEventListener('refresh_polls', () => {
      fetch('/api/polls').then(res => res.json()).then(setPolls).catch(console.error);
    });
    eventSource.addEventListener('employee_added', (e) => {
      try { setEmployees(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('training_added', (e) => {
      try { setTrainings(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('calendar_event_added', (e) => {
      try { setCalendarEvents(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    eventSource.addEventListener('settings_updated', (e) => {
      try { setAppSettings(JSON.parse(e.data)); } catch(err) {}
    });
    eventSource.addEventListener('new_colleague_added', (e) => {
      try { setNewColleagues(prev => [JSON.parse(e.data), ...prev]); } catch(err) {}
    });
    return () => eventSource.close();

  }, []);


  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => {
    return localStorage.getItem('roya_current_user_id');
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalMessage, setLoginModalMessage] = useState<string | null>(null);

  const openLoginModal = (message?: string) => {
    setLoginModalMessage(message || null);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
    setLoginModalMessage(null);
  };

  const requireAuth = (action: () => void, message?: string): boolean => {
    if (!currentUserId || !currentUser) {
      openLoginModal(message || 'برای انجام این عملیات، لطفاً ابتدا وارد حساب کاربری خود شوید.');
      return false;
    }
    action();
    return true;
  };

  // Load from localStorage or default
  const [userMoods, setUserMoods] = useState<UserMood[]>([]);
  // We fetch user moods when currentUserId changes
  useEffect(() => {
    if (currentUserId) {
      fetch('/api/moods/me', { headers: { 'X-User-Id': currentUserId } })
        .then(res => res.json())
        .then(data => setUserMoods(data))
        .catch(console.error);
    }
  }, [currentUserId]);
  

  const getTodayStr = () => new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/([۰-۹])/g, d => String.fromCharCode(d.charCodeAt(0) - 1728));

  const submitMood = async (mood: MoodState) => {
    if (!currentUserId || !currentUser) {
      openLoginModal('برای ثبت بازخورد و حس و حال امروز خود، لطفاً وارد حساب کاربری شوید.');
      return;
    }
    const todayStr = getTodayStr();
    try {
      const res = await fetch('/api/moods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify({ userId: currentUserId, date: todayStr, mood })
      });
      if (res.ok) {
        const data = await res.json();
        setUserMoods(prev => [...prev.filter(m => !(m.userId === currentUserId && m.date === todayStr)), data.mood]);
      }
    } catch(e) { console.error(e); }
  };

  const todayMoodSubmitted = currentUserId ? userMoods.some(m => m.userId === currentUserId && m.date === getTodayStr()) : false;


  const [employees, setEmployees] = useState<UserProfile[]>([]);



  const [polls, setPolls] = useState<Poll[]>([]);

  const [news, setNews] = useState<NewsItem[]>([]);

  const [newColleagues, setNewColleagues] = useState<NewColleagueWelcome[]>([]);

  const [trainings, setTrainings] = useState<TrainingProgram[]>([]);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/system/status');
        const data = await res.json();
        setIsSetupComplete(data.isSetupComplete);
      } catch (err) {
        setIsSetupComplete(true); // Fallback to true if error
      }
    };
    checkSetup();
  }, []);

  const completeSetup = (user: UserProfile) => {
    setIsSetupComplete(true);
    setCurrentUserId(user.id);
    setEmployees([user]);
  };

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem('roya_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [customHolidays, setCustomHolidays] = useState<Record<string, { title: string, isHoliday: boolean }>>(() => {
    const saved = localStorage.getItem('roya_custom_holidays');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('roya_custom_holidays', JSON.stringify(customHolidays));
  }, [customHolidays]);

  const setCustomHoliday = (date: string, title: string, isHoliday: boolean) => {
    setCustomHolidays(prev => ({ ...prev, [date]: { title, isHoliday } }));
  };

  const removeCustomHoliday = (date: string) => {
    setCustomHolidays(prev => {
      const next = { ...prev };
      // Also to allow clearing hardcoded holidays, we can set title to empty string instead of deleting.
      // But let's just delete for user added, and for hardcoded ones, they can set it to {title: '', isHoliday: false}.
      delete next[date];
      return next;
    });
  };
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // Persist state updates
  useEffect(() => {
    localStorage.setItem('roya_employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('roya_polls', JSON.stringify(polls));
  }, [polls]);

  useEffect(() => {
    localStorage.setItem('roya_news', JSON.stringify(news));
  }, [news]);

  useEffect(() => {
    localStorage.setItem('roya_new_colleagues', JSON.stringify(newColleagues));
  }, [newColleagues]);

  useEffect(() => {
    localStorage.setItem('roya_trainings', JSON.stringify(trainings));
  }, [trainings]);

  useEffect(() => {
    localStorage.setItem('roya_calendar', JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  useEffect(() => {
    localStorage.setItem('roya_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem('roya_current_user_id', currentUserId);
    } else {
      localStorage.removeItem('roya_current_user_id');
    }
  }, [currentUserId]);

  const currentUser: UserProfile | null = currentUserId ? (employees.find(e => e.id === currentUserId) || null) : null;
  const userRole: UserRole = currentUser?.role || 'guest';
  const isLoggedIn = !!currentUser;

  const login = async (u: string, p: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUserIdState(data.user.id);
        return true;
      }
    } catch(e) { console.error(e); }
    return false;
  };


  const logout = () => {
    setCurrentUserIdState(null);
    localStorage.removeItem('roya_current_user_id');
    toast.success('از حساب کاربری خود خارج شدید');
  };

  const setCurrentUserId = (id: string) => {
    setCurrentUserIdState(id);
  };

  
  // Poll actions
  const votePoll = async (pollId: string, optionId?: string, freeText?: string) => {
    if (!currentUserId || !currentUser) {
      openLoginModal('برای ثبت رأی در نظرسنجی، لطفاً وارد حساب کاربری شوید.');
      return;
    }
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, optionId, freeText })
      });
      if (res.ok) {
        fetch('/api/polls').then(r=>r.json()).then(setPolls).catch(console.error);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to vote');
      }
    } catch(e) { console.error(e); }
  };
  
  
  const addPoll = async (pollData: {
    title: string;
    description: string;
    department: string;
    type: PollType;
    expiryDate: string;
    options: string[];
  }) => {
    if (!currentUser) {
      openLoginModal('برای تعریف نظرسنجی جدید، لطفاً با حساب مدیریت وارد شوید.');
      return;
    }
    const newPoll = {
      id: `poll-${Date.now()}`,
      ...pollData,
      createdBy: `${currentUser.firstName} ${currentUser.lastName}`,
      createdAt: getTodayStr(),
      totalVotes: 0,
      freeTextResponses: [],
      votedUserIds: [],
      isActive: true,
      options: pollData.options.map(opt => ({
        id: `opt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        text: opt,
        votesCount: 0
      }))
    };
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(newPoll)
      });
      if (res.ok) {
        fetch('/api/polls').then(r=>r.json()).then(setPolls).catch(console.error);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to add poll');
      }
    } catch(e) { console.error(e); }
  };

  const togglePollActiveStatus = (pollId: string) => {
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isActive: !p.isActive } : p));
  };

  const deletePoll = (pollId: string) => {
    setPolls(prev => prev.filter(p => p.id !== pollId));
  };

  // User & Profile actions
  const updateUserProfile = (updated: Partial<UserProfile> & { id: string }) => {
    setEmployees(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
  };

  const addWorkExperience = (userId: string, exp: Omit<WorkExperience, 'id'>) => {
    const newExp: WorkExperience = {
      ...exp,
      id: `we-${Date.now()}`
    };
    setEmployees(prev => prev.map(e => {
      if (e.id !== userId) return e;
      return {
        ...e,
        workExperiences: [newExp, ...(e.workExperiences || [])]
      };
    }));
  };

  const addSkill = (userId: string, skill: Omit<Skill, 'id' | 'endorsements'>) => {
    const newSkill: Skill = {
      ...skill,
      id: `sk-${Date.now()}`,
      endorsements: 1
    };
    setEmployees(prev => prev.map(e => {
      if (e.id !== userId) return e;
      return {
        ...e,
        skills: [...(e.skills || []), newSkill]
      };
    }));
  };

  const endorseSkill = (userId: string, skillId: string) => {
    if (!currentUser) {
      openLoginModal('برای تایید مهارت همکاران، لطفاً وارد حساب کاربری شوید.');
      return;
    }
    setEmployees(prev => prev.map(e => {
      if (e.id !== userId) return e;
      return {
        ...e,
        skills: e.skills.map(s => s.id === skillId ? { ...s, endorsements: s.endorsements + 1 } : s)
      };
    }));
  };

  const addEmployee = async (empData: Omit<UserProfile, 'id' | 'workExperiences' | 'skills'>) => {
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(empData)
      });
      if (res.ok) {
        toast.success('همکار جدید با موفقیت اضافه شد.');
        if (empData.isNewColleague) {
          sendNotification({
            targetUserId: 'all',
            title: 'معرفی همکار جدید 👋',
            message: `${empData.firstName} ${empData.lastName} به عنوان ${empData.position} به سازمان ملحق شد.`,
            type: 'welcome',
            linkTab: 'dashboard'
          });
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to add employee');
      }
    } catch(e) { console.error(e); }
  };
  const addNews = async (newsData: {
    title: string;
    summary: string;
    content: string;
    category: NewsItem['category'];
    image: string;
    tags: string[];
    isPinned?: boolean;
  }) => {
    if (!currentUser) {
      openLoginModal('برای انتشار خبر یا اطلاعیه، لطفاً وارد حساب شوید.');
      return;
    }
    const newArticle = {
      title: newsData.title,
      summary: newsData.summary,
      content: newsData.content,
      category: newsData.category,
      author: `${currentUser.firstName} ${currentUser.lastName}`,
      authorRole: currentUser.position,
      date: new Date().toLocaleDateString('fa-IR'),
      image: newsData.image || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80',
      isPinned: newsData.isPinned || false,
      tags: newsData.tags,
      likesCount: 1,
      likedBy: [currentUser.id],
      commentsCount: 0
    };

    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(newArticle)
      });
      
      if (res.ok) {
        // the eventSource will update the state
        sendNotification({
          targetUserId: 'all',
          title: 'اطلاعیه/خبر جدید انتشار یافت 📰',
          message: newsData.title,
          type: 'announcement',
          linkTab: 'news'
        });
      } else {
        console.error('Failed to add news');
      }
    } catch(e) {
      console.error(e);
    }
  };

  const toggleLikeNews = (newsId: string) => {
    if (!currentUser) {
      openLoginModal('برای پسندیدن خبرها و اطلاعیه‌ها، لطفاً وارد حساب شوید.');
      return;
    }
    setNews(prev => prev.map(n => {
      if (n.id !== newsId) return n;
      const isLiked = n.likedBy.includes(currentUser.id);
      const updatedLikedBy = isLiked 
        ? n.likedBy.filter(id => id !== currentUser.id)
        : [...n.likedBy, currentUser.id];
      return {
        ...n,
        likedBy: updatedLikedBy,
        likesCount: updatedLikedBy.length
      };
    }));
  };

  // Training actions
  const enrollTraining = (trainingId: string) => {
    if (!currentUser) {
      openLoginModal('برای ثبت‌نام در دوره‌های آموزشی، لطفاً وارد حساب خود شوید.');
      return;
    }
    setTrainings(prev => prev.map(t => {
      if (t.id !== trainingId) return t;
      const isEnrolled = t.enrolledUserIds.includes(currentUser.id);
      const updatedUserIds = isEnrolled
        ? t.enrolledUserIds.filter(id => id !== currentUser.id)
        : [...t.enrolledUserIds, currentUser.id];
      
      return {
        ...t,
        enrolledUserIds: updatedUserIds
      };
    }));
  };

  const addTraining = async (tr: Omit<TrainingProgram, 'id' | 'enrolledUserIds'>) => {
    try {
      const res = await fetch('/api/trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(tr)
      });
      if (res.ok) {
        toast.success('دوره آموزشی با موفقیت اضافه شد.');
        // Also add to calendar automatically!
        addCalendarEvent({
          title: `دوره آموزشی: ${tr.title}`,
          date: tr.date,
          type: 'training',
          description: `مدرس: ${tr.instructor} (${tr.instructorRole})`,
          time: tr.time,
          location: tr.location,
          badgeColor: 'bg-blue-600'
        });
        sendNotification({
          targetUserId: 'all',
          title: 'دوره آموزشی جدید ثبت شد 🎓',
          message: `دوره "${tr.title}" برای تاریخ ${tr.date} تعریف شد. امکان ثبت‌نام فراهم می‌باشد.`,
          type: 'training',
          linkTab: 'training'
        });
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to add training');
      }
    } catch(e) { console.error(e); }
  };

  // Wishes
  const sendBirthdayWish = (birthdayUserId: string, text: string) => {
    if (!currentUser) {
      openLoginModal('برای ارسال پیام تبریک به همکاران، لطفاً وارد حساب کاربری خود شوید.');
      return;
    }
    setBirthdayWishes(prev => ({
      ...prev,
      [birthdayUserId]: [...(prev[birthdayUserId] || []), { id: Date.now().toString(), senderName: currentUser.firstName + ' ' + currentUser.lastName, text, time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) }]
    }));

    const targetUser = employees.find(e => e.id === birthdayUserId);
    if (!targetUser) return;

    sendNotification({
      targetUserId: birthdayUserId,
      title: 'تبریک تولد دریافت شد 🎂',
      message: `${currentUser.firstName} ${currentUser.lastName}: "${text}"`,
      type: 'birthday',
      linkTab: 'dashboard'
    });
  };

  const sendWelcomeWish = (newColleagueId: string, message: string) => {
    if (!currentUser) {
      openLoginModal('برای ارسال پیام خوش‌آمدگویی، لطفاً وارد حساب کاربری شوید.');
      return;
    }
    setNewColleagues(prev => prev.map(nc => {
      if (nc.id !== newColleagueId) return nc;
      return {
        ...nc,
        wishes: [
          ...nc.wishes,
          {
            id: `w-${Date.now()}`,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            message,
            time: new Date().toLocaleDateString('fa-IR')
          }
        ]
      };
    }));
  };

  // Calendar
  const addCalendarEvent = async (eventData: Omit<CalendarEvent, 'id'>) => {
    try {
      const res = await fetch('/api/calendar_events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(eventData)
      });
      if (res.ok) {
        toast.success('رویداد با موفقیت به تقویم اضافه شد.');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to add calendar event');
      }
    } catch(e) { console.error(e); }
  };

  // Notifications
  const sendNotification = (notif: {
    targetUserId: string;
    title: string;
    message: string;
    type: NotificationItem['type'];
    linkTab?: ActiveTab;
  }) => {
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      targetUserId: notif.targetUserId,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      date: 'هم‌اکنون',
      isRead: false,
      linkTab: notif.linkTab
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Categorized Global Search Logic
  const updateSettings = async (settings: AppSettings) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': currentUserId || '' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        toast.success('تنظیمات با موفقیت به‌روزرسانی شد.');
      } else {
        toast.error('خطا در به‌روزرسانی تنظیمات');
      }
    } catch(e) {
      console.error(e);
      toast.error('خطای شبکه در ارتباط با سرور');
    }
  };

  const getGlobalSearchResults = (query: string): SearchResultItem[] => {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const results: SearchResultItem[] = [];

    // Search Colleagues (First/Last Name, Extension, Mobile, Email, Department, Position, Skills)
    employees.forEach(emp => {
      const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const match = name.includes(q) ||
        emp.extension.includes(q) ||
        emp.mobile.includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.position.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.skills.some(s => s.name.toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `res-emp-${emp.id}`,
          type: 'همکاران',
          title: `${emp.firstName} ${emp.lastName}`,
          subtitle: `${emp.position} | بخش ${emp.department}`,
          snippet: `داخلی: ${emp.extension} | همراه: ${emp.mobile} | ایمیل: ${emp.email}`,
          targetTab: 'colleagues',
          targetId: emp.id,
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
        });
      }
    });

    // Search News & Announcements
    news.forEach(n => {
      const match = n.title.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `res-news-${n.id}`,
          type: n.category === 'اطلاعیه هام' ? 'اطلاعیه' : 'اخبار',
          title: n.title,
          subtitle: `نویسنده: ${n.author} | تاریخ: ${n.date}`,
          snippet: n.summary,
          targetTab: 'news',
          targetId: n.id,
          badgeColor: n.category === 'اطلاعیه هام' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300',
          date: n.date
        });
      }
    });

    // Search Polls
    polls.forEach(p => {
      const match = p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.options.some(o => o.text.toLowerCase().includes(q));

      if (match) {
        results.push({
          id: `res-poll-${p.id}`,
          type: 'نظرسنجی',
          title: p.title,
          subtitle: `نوع: ${p.type === 'multiple_choice' ? 'گزینه‌ای' : 'پاسخ متنی آزاد'} | مهلت: ${p.expiryDate}`,
          snippet: p.description,
          targetTab: 'polls',
          targetId: p.id,
          badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300'
        });
      }
    });

    // Search Trainings
    trainings.forEach(tr => {
      const match = tr.title.toLowerCase().includes(q) ||
        tr.description.toLowerCase().includes(q) ||
        tr.instructor.toLowerCase().includes(q) ||
        tr.category.toLowerCase().includes(q);

      if (match) {
        results.push({
          id: `res-tr-${tr.id}`,
          type: 'آموزش',
          title: tr.title,
          subtitle: `مدرس: ${tr.instructor} | تاریخ: ${tr.date} (ساعت ${tr.time})`,
          snippet: tr.description,
          targetTab: 'training',
          targetId: tr.id,
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
          date: tr.date
        });
      }
    });

    // Search Calendar
    calendarEvents.forEach(cal => {
      const match = cal.title.toLowerCase().includes(q) || cal.description.toLowerCase().includes(q);
      if (match) {
        results.push({
          id: `res-cal-${cal.id}`,
          type: 'تقویم',
          title: cal.title,
          subtitle: `تاریخ: ${cal.date} ${cal.time ? `(${cal.time})` : ''}`,
          snippet: cal.description,
          targetTab: 'calendar',
          targetId: cal.id,
          badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
          date: cal.date
        });
      }
    });

    return results;
  };

  return (
    <PortalContext.Provider
      value={{
        isSetupComplete,
        completeSetup,
        isLoggedIn,
        login,
        logout,
        currentUser,
        isLoginModalOpen,
        loginModalMessage,
        openLoginModal,
        closeLoginModal,
        requireAuth,
        userMoods,
        submitMood,
        todayMoodSubmitted,
        userRole,
        setCurrentUserId,
        employees,
        polls,
        news,
        newColleagues,
        trainings,
        calendarEvents,
        notifications,
        activeTab,
        setActiveTab,
        globalSearchQuery,
        setGlobalSearchQuery,
        addPoll,
        votePoll,
        togglePollActiveStatus,
        deletePoll,
        updateUserProfile,
        customHolidays,
        setCustomHoliday,
        removeCustomHoliday,
        addWorkExperience,
        addSkill,
        endorseSkill,
        addEmployee,
        addNews,
        toggleLikeNews,
        enrollTraining,
        addTraining,
        sendBirthdayWish,
        birthdayWishes,
        sendWelcomeWish,
        addCalendarEvent,
        sendNotification,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        getGlobalSearchResults,
        
        isLoading,
        error,
        clearError,
        appSettings,
        updateSettings
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
