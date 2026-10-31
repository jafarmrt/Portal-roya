import React, { useCallback, useEffect, useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  Eye,
  Footprints,
  HardDrive,
  Image as ImageIcon,
  LayoutDashboard,
  ListOrdered,
  PartyPopper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ToggleRight,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { departmentKey, findDepartment } from '../../../shared/departments';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, formatFileSize, toPersianDigits } from '../../lib/jalali';
import type { AppSettings, BackupFile, ServerStatus } from '../../types';
import { defaultFoundingMessage, yearsSince } from '../../../shared/celebrations';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { buildNumber, WhatsNewModal } from '../common/VersionInfo';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { RoyaLogo } from '../common/RoyaLogo';
import { DASHBOARD_CARDS } from '../dashboard/dashboardCards';
import { DashboardLayoutModal } from '../dashboard/DashboardLayoutModal';
import { DASHBOARD_LAYOUT } from '../../../shared/dashboard';
import { FIRST_WEEK_EXTRA_LENGTH, FIRST_WEEK_EXTRA_MAX } from '../../../shared/firstWeek';
import { FeatureSettings } from './FeatureSettings';
import { KudosEmojiSettings } from './KudosEmojiSettings';
import { RolesEditor } from './RolesEditor';
import { confirmDiscard, hasUnsavedChanges, useUnsavedChanges } from './unsavedChanges';

type ListKey = 'newsCategories' | 'trainingCategories' | 'documentCategories';

const SECTIONS: { key: ListKey; title: string; hint: string }[] = [
  { key: 'newsCategories', title: 'دسته‌های اخبار و اطلاعیه‌ها', hint: 'فیلترهای صفحهٔ اخبار.' },
  { key: 'documentCategories', title: 'دسته‌های اسناد و فرم‌ها', hint: 'گروه‌بندی کتابخانهٔ اسناد.' },
  { key: 'trainingCategories', title: 'دسته‌های دوره‌های آموزشی', hint: 'فیلترهای صفحهٔ آموزش.' },
];

const ListEditor: React.FC<{ settings: AppSettings; section: (typeof SECTIONS)[number] }> = ({ settings, section }) => {
  const { updateSettings } = usePortal();
  const [items, setItems] = useState<string[]>(settings[section.key]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(settings[section.key]);
  useUnsavedChanges(section.key, dirty);

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    setItems([...items, value]);
    setDraft('');
  };
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setItems(next);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3">
      <div>
        <h3 className="text-sm font-black text-ink">{section.title}</h3>
        <p className="text-xs text-muted">{section.hint}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-1 p-2 bg-surface rounded-xl text-xs font-bold">
            <span className="flex-1">{item}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`بالا بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`پایین بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            <button onClick={() => setItems(items.filter((x) => x !== item))} disabled={items.length === 1} aria-label={`حذف ${item}`} className="p-1 text-red-700 disabled:opacity-30"><X className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input aria-label={`مورد جدید در ${section.title}`} value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} placeholder="مورد جدید" className={inputClass} />
        <button type="submit" className="px-3 rounded-xl bg-surface hover:bg-line" aria-label="افزودن"><Plus className="w-4 h-4" /></button>
      </form>
      {dirty && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-faint">حذف یک مورد، داده‌های قبلی را تغییر نمی‌دهد.</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await updateSettings({ [section.key]: items });
              setBusy(false);
            }}
            className={primaryButtonClass}
          >
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      )}
    </section>
  );
};

interface ListUsage {
  name: string;
  employees: number;
  activeEmployees: number;
  news: number;
  documents: number;
  polls: number;
}

interface ManagedList {
  key: 'departments' | 'locations';
  title: string;
  hint: string;
  /** "واحد", "محل استقرار": used in the messages. */
  noun: string;
  mayBeEmpty: boolean;
}

const DEPARTMENTS: ManagedList = {
  key: 'departments',
  title: 'واحدهای سازمانی',
  hint: 'تنها فهرست واحدهای پرتال: پروفایل همکاران، فیلتر دفتر تلفن، چارت سازمانی، ورود از اکسل و اکتیو دایرکتوری و مخاطبان اخبار و نظرسنجی‌ها از همین فهرست استفاده می‌کنند. تغییر نام، همه‌جا اعمال می‌شود.',
  noun: 'واحد',
  mayBeEmpty: false,
};

const LOCATIONS: ManagedList = {
  key: 'locations',
  title: 'محل‌های استقرار',
  hint: 'شعبه، انبار یا طبقه‌ای که همکاران در آن کار می‌کنند. در پروفایل، دفتر تلفن، ورود از اکسل و انتخاب مخاطبان اخبار (مثلاً فقط شعبهٔ شیراز) استفاده می‌شود. تغییر نام، همه‌جا اعمال می‌شود.',
  noun: 'محل استقرار',
  mayBeEmpty: true,
};

/**
 * One of the lists used everywhere in the portal (departments, locations). Changes are saved at once:
 * renaming updates every colleague and news item; an entry in use is removed by merging it into another.
 */
const ManagedListEditor: React.FC<{ settings: AppSettings; config: ManagedList }> = ({ settings, config }) => {
  const { updateSettings } = usePortal();
  const { key, noun } = config;
  const list = settings[key];
  const [usage, setUsage] = useState<ListUsage[]>([]);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [merging, setMerging] = useState<{ name: string; into: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<ListUsage[]>(`/api/settings/${key}`).then(setUsage, (err) => toast.error(errorMessage(err)));
  }, [key]);
  const listKey = list.join('|');
  useEffect(load, [load, listKey]);

  const usageOf = (name: string) => usage.find((u) => u.name === name);
  const inUse = (name: string) => {
    const u = usageOf(name);
    return Boolean(u && (u.employees || u.news || u.documents || u.polls));
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      load();
    }
  };
  const saveList = (next: string[]) => run(() => updateSettings({ [key]: next }));
  const rename = (from: string, to: string) =>
    run(async () => {
      try {
        const res = await api.post<{ to: string; merged: boolean }>(`/api/settings/${key}/rename`, { from, to });
        toast.success(res.merged ? `«${from}» در «${res.to}» ادغام شد.` : `نام ${noun} به «${res.to}» تغییر کرد.`);
        setRenaming(null);
        setMerging(null);
      } catch (err) {
        toast.error(errorMessage(err));
      }
    });

  const add = () => {
    const existing = findDepartment(list, draft);
    if (!draft.trim()) return;
    if (existing) {
      toast.error(`${noun} «${existing}» از قبل در فهرست هست.`);
      return;
    }
    setDraft('');
    saveList([...list, draft.trim()]);
  };
  const move = (index: number, delta: number) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    saveList(next);
  };
  const remove = (name: string) => {
    if (inUse(name)) setMerging({ name, into: list.find((d) => d !== name) ?? '' });
    else saveList(list.filter((d) => d !== name));
  };

  const describe = (name: string) => {
    const u = usageOf(name);
    if (!u || (!u.employees && !u.news && !u.documents && !u.polls)) return 'بدون همکار';
    const parts = [`${toPersianDigits(u.activeEmployees)} همکار`];
    if (u.employees > u.activeEmployees) parts.push(`${toPersianDigits(u.employees - u.activeEmployees)} غیرفعال`);
    if (u.news) parts.push(`${toPersianDigits(u.news)} خبر`);
    if (u.documents) parts.push(`${toPersianDigits(u.documents)} سند`);
    if (u.polls) parts.push(`${toPersianDigits(u.polls)} نظرسنجی`);
    return parts.join('، ');
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby={`${key}-title`}>
      <div>
        <h3 id={`${key}-title`} className="text-sm font-black text-ink">{config.title}</h3>
        <p className="text-xs text-muted leading-relaxed">{config.hint}</p>
      </div>
      {list.length === 0 && <p className="text-xs text-faint">فهرست خالی است.</p>}
      <ul className="space-y-1.5">
        {list.map((item, i) => (
          <li key={item} className="p-2 bg-surface rounded-xl text-xs font-bold space-y-2">
            {renaming?.name === item ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = renaming.value.trim();
                  if (!value || value === item) return setRenaming(null);
                  // Renaming to another department's name merges the two.
                  const other = list.find((d) => d !== item && departmentKey(d) === departmentKey(value));
                  if (other && !window.confirm(`${noun} «${other}» از قبل هست. همهٔ همکاران «${item}» به «${other}» منتقل و این دو یکی شوند؟`)) return;
                  rename(item, value);
                }}
                className="flex items-center gap-1"
              >
                <input
                  autoFocus
                  aria-label={`نام تازهٔ ${item}`}
                  value={renaming.value}
                  maxLength={100}
                  onChange={(e) => setRenaming({ name: item, value: e.target.value })}
                  className={inputClass}
                />
                <button type="submit" disabled={busy} aria-label="ذخیرهٔ نام" className="p-1.5 text-emerald-700"><Check className="w-4 h-4" /></button>
                <button type="button" onClick={() => setRenaming(null)} aria-label="انصراف" className="p-1.5"><X className="w-4 h-4" /></button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <span className="flex-1">
                  <span>{item}</span>
                  <span className="block text-xs font-normal text-muted">{describe(item)}</span>
                </span>
                <button onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`بالا بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => move(i, 1)} disabled={busy || i === list.length - 1} aria-label={`پایین بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setRenaming({ name: item, value: item })} disabled={busy} aria-label={`تغییر نام ${item}`} className="p-1"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove(item)} disabled={busy || (list.length === 1 && !config.mayBeEmpty)} aria-label={`حذف ${item}`} className="p-1 text-red-700 disabled:opacity-30"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {merging?.name === item && (
              <div className="p-2 bg-white rounded-lg border border-amber-300 space-y-2 font-normal">
                <p className="text-amber-900 leading-relaxed">این {noun} استفاده می‌شود ({describe(item)}). برای حذف، همه را به {noun} دیگری منتقل کنید:</p>
                <div className="flex gap-2">
                  <SearchableSelect aria-label={`${noun} مقصد برای ${item}`} value={merging.into} onChange={(e) => setMerging({ name: item, into: e.target.value })} className={inputClass}>
                    {list.filter((d) => d !== item).map((d) => <option key={d} value={d}>{d}</option>)}
                  </SearchableSelect>
                  <button type="button" disabled={busy || !merging.into} onClick={() => rename(item, merging.into)} className={primaryButtonClass}>انتقال و حذف</button>
                  <button type="button" onClick={() => setMerging(null)} className={secondaryButtonClass}>انصراف</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input aria-label={`${noun} جدید`} value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} placeholder={`${noun} جدید`} className={inputClass} />
        <button type="submit" disabled={busy} className="px-3 rounded-xl bg-surface hover:bg-line" aria-label={`افزودن ${noun}`}><Plus className="w-4 h-4" /></button>
      </form>
    </section>
  );
};

const Toggle: React.FC<{ label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }> = ({
  label,
  hint,
  checked,
  disabled,
  onChange,
}) => (
  <label className={`flex items-start gap-3 p-3 rounded-xl bg-surface ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-700" />
    <span>
      <span className="block text-xs font-bold text-ink">{label}</span>
      <span className="block text-xs text-muted mt-0.5 leading-relaxed">{hint}</span>
    </span>
  </label>
);

/** Whether visitors who are not signed in can read the portal. */
const GuestAccessSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const [busy, setBusy] = useState(false);
  const save = async (update: Partial<AppSettings>) => {
    setBusy(true);
    await updateSettings(update);
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-red-700" />
        <h3 className="text-sm font-black text-ink">دسترسی مهمان (بدون ورود)</h3>
      </div>
      <p className="text-xs text-muted">
        مهمان فقط از داخل شبکهٔ شرکت پرتال را می‌بیند؛ از بیرون شرکت (اینترنت) همیشه باید وارد شد. مهمان نمی‌تواند نظر، رأی، لایک یا تبریک ثبت کند؛ برای هر تعامل از او خواسته می‌شود وارد شود. اخباری که برای گروه یا افراد مشخص فرستاده شده‌اند و نظرسنجی‌های مخصوص یک واحد به مهمان نشان داده نمی‌شوند.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Toggle
          label="نمایش پرتال به کاربران واردنشده"
          hint="اخبار و اطلاعیه‌های عمومی، نظرسنجی‌ها (بدون پاسخ‌های متنی)، اسناد، آموزش، تقویم و سامانه‌ها."
          checked={settings.guestAccess}
          disabled={busy}
          onChange={(guestAccess) => save({ guestAccess })}
        />
        <Toggle
          label="نمایش دفتر تلفن و چارت سازمانی به مهمان"
          hint="نام، سمت، واحد، داخلی و ایمیل همکاران و کارت‌های تولد و خوش‌آمد. شمارهٔ همراه و نام کاربری هرگز نشان داده نمی‌شود."
          checked={settings.guestDirectory}
          disabled={busy || !settings.guestAccess}
          onChange={(guestDirectory) => save({ guestDirectory })}
        />
      </div>
    </section>
  );
};

/** The company logo in the header, on the sign-in page and on printed notices. */
const LogoSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const [busy, setBusy] = useState(false);
  const save = async (logoUrl: string) => {
    setBusy(true);
    await updateSettings({ logoUrl });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby="logo-title">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-red-700" />
        <h3 id="logo-title" className="text-sm font-black text-ink">لوگوی شرکت</h3>
      </div>
      <p className="text-xs text-muted">
        لوگو در بالای همهٔ صفحه‌ها، صفحهٔ ورود و سربرگ برگه‌های چاپی نمایش داده می‌شود. بهتر است تصویر PNG با پس‌زمینهٔ شفاف و افقی باشد (مثلاً ۴۰۰ در ۱۲۰ پیکسل)؛ در هدر حداکثر ۴۰ پیکسل ارتفاع دارد.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="px-4 py-3 rounded-2xl border border-line bg-white shadow-2xs" aria-label="پیش‌نمایش هدر">
          <RoyaLogo size="md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FileUpload accept={IMAGE_ACCEPT} label={settings.logoUrl ? 'تغییر لوگو' : 'بارگذاری لوگو'} onUploaded={(file) => void save(file.url)} />
          {settings.logoUrl && (
            <button type="button" disabled={busy} onClick={() => void save('')} className={secondaryButtonClass}>
              بازگشت به لوگوی پیش‌فرض
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

/** The company's founding day: every year on it everyone sees a greeting on the dashboard and gets a notice. */
const FoundingDaySettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const [foundingDate, setFoundingDate] = useState(settings.foundingDate);
  const [foundingMessage, setFoundingMessage] = useState(settings.foundingMessage);
  const [busy, setBusy] = useState(false);
  const changed = foundingDate !== settings.foundingDate || foundingMessage !== settings.foundingMessage;
  useUnsavedChanges('founding', changed);
  const years = Math.max(1, yearsSince(foundingDate));

  const save = async () => {
    setBusy(true);
    await updateSettings({ foundingDate, foundingMessage: foundingMessage.trim() });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby="founding-title">
      <div className="flex items-center gap-2">
        <PartyPopper className="w-4 h-4 text-red-700" />
        <h3 id="founding-title" className="text-sm font-black text-ink">سالگرد تأسیس شرکت</h3>
      </div>
      <p className="text-xs text-muted">
        هر سال در روز تأسیس، پیام زیر بالای داشبورد همه نشان داده می‌شود و ساعت ۸ صبح برای همه اعلان می‌رود. اگر تاریخ خالی باشد، چیزی نشان داده نمی‌شود.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="founding-date" className="block text-xs font-bold text-ink-soft mb-1">تاریخ تأسیس</label>
          <JalaliDateInput id="founding-date" value={foundingDate} onChange={setFoundingDate} defaultYear={1380} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="founding-message" className="block text-xs font-bold text-ink-soft mb-1">متن پیام (اختیاری)</label>
          <textarea
            id="founding-message"
            rows={3}
            maxLength={500}
            value={foundingMessage}
            onChange={(e) => setFoundingMessage(e.target.value)}
            placeholder={defaultFoundingMessage(years)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-faint">اگر خالی بماند، متن پیش‌فرض بالا با تعداد سال‌ها استفاده می‌شود.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" disabled={busy || !changed} onClick={() => void save()} className={primaryButtonClass}>
          <Check className="w-3.5 h-3.5" />
          ذخیره
        </button>
      </div>
    </section>
  );
};

/** The administrator's own steps in every new colleague's «هفتهٔ اول من», one per line. */
const FirstWeekSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const saved = (settings.firstWeekSteps ?? []).join('\n');
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const steps = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const changed = steps.join('\n') !== saved;
  useUnsavedChanges('first-week', changed);
  const tooMany = steps.length > FIRST_WEEK_EXTRA_MAX;
  const tooLong = steps.some((line) => line.length > FIRST_WEEK_EXTRA_LENGTH);

  const save = async () => {
    setBusy(true);
    await updateSettings({ firstWeekSteps: steps });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby="first-week-settings-title">
      <div className="flex items-center gap-2">
        <Footprints className="w-4 h-4 text-red-700" />
        <h3 id="first-week-settings-title" className="text-sm font-black text-ink">«هفتهٔ اول من» برای همکار تازه</h3>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        همکاری که در ۳۰ روز اخیر به‌عنوان همکار جدید معرفی شده، روی داشبوردش فهرست کوتاهی از کارهای روزهای اول می‌بیند (کامل کردن کارت، خواندن بخشنامه‌ها، آشنایی با مدیر و همکاران واحد، سامانه‌ها و راهنماها). مرحله‌های خودتان را هر کدام در یک خط اینجا بنویسید تا آخر همان فهرست بیایند؛ مثلاً «فرم‌های اداری را از واحد منابع انسانی بگیرید».
      </p>
      <label htmlFor="first-week-steps" className="block text-xs font-bold text-ink-soft">مرحله‌های اضافه (هر خط یک مرحله، حداکثر {toPersianDigits(FIRST_WEEK_EXTRA_MAX)})</label>
      <textarea id="first-week-steps" rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} placeholder="فرم‌های اداری را از واحد منابع انسانی بگیرید" />
      {(tooMany || tooLong) && (
        <p className="text-xs text-red-700">
          {tooMany ? `حداکثر ${toPersianDigits(FIRST_WEEK_EXTRA_MAX)} مرحله. ` : ''}
          {tooLong ? `هر مرحله حداکثر ${toPersianDigits(FIRST_WEEK_EXTRA_LENGTH)} حرف.` : ''}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" disabled={busy || !changed || tooMany || tooLong} onClick={() => void save()} className={primaryButtonClass}>
          <Check className="w-3.5 h-3.5" />
          ذخیره
        </button>
      </div>
    </section>
  );
};

/** Which cards everyone sees on the dashboard. */
const DashboardCardsSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const [busy, setBusy] = useState(false);
  const [arranging, setArranging] = useState(false);
  const set = async (id: string, value: boolean) => {
    setBusy(true);
    await updateSettings({ dashboardCards: { ...settings.dashboardCards, [id]: value } });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="w-4 h-4 text-red-700" />
        <h3 className="text-sm font-black text-ink">کارت‌های داشبورد</h3>
        <button type="button" onClick={() => setArranging(true)} className={`${secondaryButtonClass} ms-auto`}>
          ترتیب پیش‌فرض برای همه
        </button>
      </div>
      <p className="text-xs text-muted">
        کارت‌های خاموش برای هیچ‌کس نمایش داده نمی‌شوند. «آخرین اخبار» همیشه روشن است.
        {settings.dashboardDefaultOrder?.length ? ' ترتیب کارت‌ها را خودتان برای همه چیده‌اید.' : ''}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {DASHBOARD_CARDS.map((card) => (
          <Toggle key={card.id} label={card.label} hint={card.hint} checked={settings.dashboardCards?.[card.id] !== false} disabled={busy} onChange={(value) => set(card.id, value)} />
        ))}
      </div>
      {arranging && <DashboardLayoutModal mode="everyone" shown={DASHBOARD_LAYOUT.map((c) => c.id)} onClose={() => setArranging(false)} />}
    </section>
  );
};

const StatusRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="p-3 rounded-xl bg-surface space-y-1">
    <dt className="text-xs font-bold text-muted">{label}</dt>
    <dd className="text-xs text-ink leading-relaxed">{children}</dd>
  </div>
);

const describeBackup = (file: BackupFile | null, keep: string, when: string) =>
  file ? (
    <>
      <span className="font-bold">{formatDateTime(file.at)}</span> · {formatFileSize(file.size)}
      <span className="block text-xs text-muted">{toPersianDigits(file.count)} نسخه روی سرور ({keep}).</span>
    </>
  ) : (
    <span className="text-muted">هنوز گرفته نشده است؛ {when}.</span>
  );

/** Disk space, backups and housekeeping on the server, so problems show up before they hurt. */
const ServerStatusCard: React.FC = () => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<ServerStatus>('/api/settings/server-status')
      .then((s) => {
        setStatus(s);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const disk = status?.disk;
  const lowDisk = Boolean(disk && status && disk.free < status.lowDiskBytes);
  const usedPercent = disk && disk.total > 0 ? Math.round(((disk.total - disk.free) / disk.total) * 100) : 0;

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby="server-status-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-red-700" />
          <h3 id="server-status-title" className="text-sm font-black text-ink">وضعیت سرور و پشتیبان‌ها</h3>
          {status && (
            <span className="text-xs text-muted">
              نسخهٔ {toPersianDigits(status.version)}
              {status.build && ` · بیلد ${buildNumber(status.build)}`}
            </span>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="به‌روزرسانی وضعیت سرور" className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700 font-bold">{error}</p>}
      {status && (
        <>
          {status.backups.lastError && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">آخرین پشتیبان‌گیری ({formatDateTime(status.backups.lastError.at)}) انجام نشد:</span> {status.backups.lastError.message}
                <span className="block text-xs mt-0.5">ساعت بعد دوباره امتحان می‌شود.</span>
              </span>
            </div>
          )}
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <StatusRow label="نسخهٔ در حال اجرا">
              <span className="font-bold">{toPersianDigits(status.version)}</span>
              {status.build ? ` · بیلد ${buildNumber(status.build)}` : ' · اجرا از کد منبع'}
              {status.commit && <span className="text-xs text-muted" dir="ltr"> ({status.commit})</span>}
              <span className="block text-xs text-muted">
                {status.builtAt && <>ساخته‌شده {formatDateTime(status.builtAt)} · </>}
                راه‌اندازی {formatDateTime(status.startedAt)}
              </span>
              <button type="button" onClick={() => setShowWhatsNew(true)} className="mt-1 text-xs font-bold text-red-700 hover:underline">
                تازه‌های این نسخه
              </button>
              {showWhatsNew && <WhatsNewModal info={status} onClose={() => setShowWhatsNew(false)} />}
            </StatusRow>
            <StatusRow label="فضای دیسک">
              {disk ? (
                <>
                  <span className={lowDisk ? 'font-bold text-red-700' : 'font-bold'}>{formatFileSize(disk.free)} خالی</span> از {formatFileSize(disk.total)}
                  <span className="block h-1.5 mt-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
                    <span className={`block h-full ${lowDisk ? 'bg-red-600' : 'bg-emerald-600'}`} style={{ width: `${usedPercent}%` }} />
                  </span>
                  {lowDisk && <span className="block text-xs text-red-700 mt-1">فضای خالی کم است؛ پشتیبان‌های قدیمی یا فایل‌های بزرگ را از سرور بردارید.</span>}
                </>
              ) : (
                'نامشخص'
              )}
            </StatusRow>
            <StatusRow label="فایل‌های بارگذاری‌شده">
              <span className="font-bold">{toPersianDigits(status.uploads.count)} فایل</span> · {status.uploads.count ? formatFileSize(status.uploads.bytes) : 'خالی'}
              <span className="block text-xs text-muted">
                {status.cleanup
                  ? `آخرین پاک‌سازی (${formatDateTime(status.cleanup.at)}): ${status.cleanup.removed ? `${toPersianDigits(status.cleanup.removed)} فایل بی‌استفاده حذف شد (${formatFileSize(status.cleanup.freedBytes)})` : 'فایل بی‌استفاده‌ای نبود'}.`
                  : 'فایل‌هایی که هیچ خبر، سند یا پروفایلی از آن‌ها استفاده نمی‌کند پس از یک هفته، هر شب پاک می‌شوند.'}
              </span>
            </StatusRow>
            <StatusRow label="پشتیبان پایگاه داده (هر شب ساعت ۲)">
              {describeBackup(status.backups.database, 'هفت شب آخر نگه داشته می‌شود', 'اولین پشتیبان امشب ساعت ۲ گرفته می‌شود')}
            </StatusRow>
            <StatusRow label="پشتیبان فایل‌ها (شب‌های جمعه)">
              {describeBackup(status.backups.uploads, 'دو هفتهٔ آخر نگه داشته می‌شود', 'اولین پشتیبان شب جمعه گرفته می‌شود')}
            </StatusRow>
          </dl>
          <p className="text-xs text-muted leading-relaxed">
            پشتیبان‌ها در پوشهٔ <code dir="ltr" className="px-1 bg-surface rounded">{status.backups.dir}</code> روی همین سرور ذخیره می‌شوند. اگر دیسک سرور خراب شود پشتیبان‌ها هم از دست می‌روند؛ هر چند وقت یک بار این پوشه را روی کامپیوتر یا دیسک دیگری کپی کنید.
          </p>
        </>
      )}
    </section>
  );
};

type SettingsTab = 'general' | 'access' | 'features' | 'lists' | 'server';

/** The settings page's tabs; each opens at its own address, e.g. #admin/lists. */
const TABS: { id: SettingsTab; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'عمومی', hint: 'لوگوی شرکت و سالگرد تأسیس', icon: <Building2 className="w-4 h-4" /> },
  { id: 'access', label: 'سطح‌های دسترسی', hint: 'سطح‌های دسترسی و مجوزها، دسترسی مهمان', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'features', label: 'امکانات و داشبورد', hint: 'روشن و خاموش بخش‌ها، صندوق‌ها، کارت‌های داشبورد', icon: <ToggleRight className="w-4 h-4" /> },
  { id: 'lists', label: 'فهرست‌ها', hint: 'واحدها، محل‌های استقرار و دسته‌بندی‌ها', icon: <ListOrdered className="w-4 h-4" /> },
  { id: 'server', label: 'سرور', hint: 'وضعیت سرور، فضای دیسک و پشتیبان‌ها', icon: <HardDrive className="w-4 h-4" /> },
];

const isSettingsTab = (value: string | null): value is SettingsTab => TABS.some((t) => t.id === value);

/** Every section of the settings, for the search box; `id` is the element it scrolls to (settings-<id>). */
const SEARCH_INDEX: { id: string; tab: SettingsTab; title: string; keywords: string }[] = [
  { id: 'logo', tab: 'general', title: 'لوگوی شرکت', keywords: 'لوگو آرم هدر سربرگ تصویر' },
  { id: 'founding', tab: 'general', title: 'سالگرد تأسیس شرکت', keywords: 'تاسیس سالگرد تبریک تولد شرکت' },
  { id: 'roles', tab: 'access', title: 'سطح‌های دسترسی و مجوزها', keywords: 'سطح دسترسی نقش مجوز ادمین خواننده صندوق ناشر محتوا همکار' },
  { id: 'guest', tab: 'access', title: 'دسترسی مهمان', keywords: 'مهمان بدون ورود عمومی دفتر تلفن' },
  { id: 'features', tab: 'features', title: 'امکانات پرتال', keywords: 'روشن خاموش پیش نمایش امکانات بخش نظرسنجی آموزش یادداشت چیدمان' },
  { id: 'occasions', tab: 'features', title: 'افکت مناسبت‌ها و فصل‌ها', keywords: 'مناسبت فصل نوروز یلدا افکت جلوه بنر' },
  { id: 'suggestion-boxes', tab: 'features', title: 'صندوق‌های انتقادات و پیشنهادات', keywords: 'صندوق انتقاد پیشنهاد مدیریت مدیرعامل منابع انسانی' },
  { id: 'pilot', tab: 'features', title: 'گروه آزمایشی', keywords: 'آزمایشی پیش نمایش پایلوت' },
  { id: 'dashboard-cards', tab: 'features', title: 'کارت‌های داشبورد', keywords: 'داشبورد کارت تولد حال و هوا' },
  { id: 'kudos-emojis', tab: 'features', title: 'ایموجی‌های همکاران آنلاین', keywords: 'ایموجی آنلاین گل تشکر همکاران آنلاین شکلک' },
  { id: 'first-week', tab: 'features', title: '«هفتهٔ اول من» برای همکار تازه', keywords: 'هفته اول همکار جدید تازه ورود آشنایی مرحله فهرست کار' },
  { id: 'departments', tab: 'lists', title: 'واحدهای سازمانی', keywords: 'واحد دپارتمان بخش سازمانی' },
  { id: 'locations', tab: 'lists', title: 'محل‌های استقرار', keywords: 'محل شعبه انبار طبقه دفتر' },
  { id: 'newsCategories', tab: 'lists', title: 'دسته‌های اخبار و اطلاعیه‌ها', keywords: 'دسته اخبار خبر اطلاعیه' },
  { id: 'documentCategories', tab: 'lists', title: 'دسته‌های اسناد و فرم‌ها', keywords: 'دسته سند اسناد فرم' },
  { id: 'trainingCategories', tab: 'lists', title: 'دسته‌های دوره‌های آموزشی', keywords: 'دسته دوره آموزش' },
  { id: 'server', tab: 'server', title: 'وضعیت سرور و پشتیبان‌ها', keywords: 'سرور دیسک فضا پشتیبان بکاپ نسخه بیلد' },
];

// Arabic letters and the zero-width non-joiner typed differently should still match.
const normalize = (text: string) => text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').replace(/[أإآ]/g, 'ا').trim();

const LAST_TAB_KEY = 'portal:settings-tab';
const readLastTab = () => {
  try {
    return localStorage.getItem(LAST_TAB_KEY);
  } catch {
    return null;
  }
};
const saveLastTab = (tab: SettingsTab) => {
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Remembering the tab is only a convenience.
  }
};

/** A box above the tabs: typing «لوگو» offers the logo section, and choosing it opens its tab there. */
const SettingsSearch: React.FC<{ visibleTabs: SettingsTab[]; isAdmin: boolean; manage: boolean; onPick: (tab: SettingsTab, id: string) => void }> = ({
  visibleTabs,
  isAdmin,
  manage,
  onPick,
}) => {
  const [query, setQuery] = useState('');
  const q = normalize(query);
  const matches = q
    ? SEARCH_INDEX.filter((e) => visibleTabs.includes(e.tab) && (e.id !== 'roles' || isAdmin) && (e.id !== 'guest' || manage) && normalize(`${e.title} ${e.keywords}`).includes(q)).slice(0, 6)
    : [];
  const pick = (entry: (typeof SEARCH_INDEX)[number]) => {
    setQuery('');
    onPick(entry.tab, entry.id);
  };

  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        type="search"
        aria-label="جستجو در تنظیمات"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            pick(matches[0]);
          }
          if (e.key === 'Escape') setQuery('');
        }}
        placeholder="جستجو در تنظیمات، مثلاً «لوگو» یا «صندوق»"
        className={`${inputClass} pr-9`}
      />
      {q && (
        <ul className="absolute z-20 inset-x-0 mt-1 bg-white border border-line rounded-2xl shadow-lg overflow-hidden divide-y divide-surface-strong">
          {matches.length === 0 && <li className="px-4 py-3 text-xs text-muted">بخشی با این نام پیدا نشد.</li>}
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => pick(m)} className="w-full text-right px-4 py-2.5 text-xs hover:bg-surface">
                <span className="font-bold text-ink">{m.title}</span>
                <span className="text-muted"> · {TABS.find((t) => t.id === m.tab)?.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** One section of a tab, with the element the search scrolls to. */
const Panel: React.FC<{ id: string; wide?: boolean; children: React.ReactNode }> = ({ id, wide, children }) => (
  <div id={`settings-${id}`} className={`scroll-mt-24 rounded-3xl ${wide ? 'lg:col-span-2' : ''}`}>
    {children}
  </div>
);

export const AdminSettingsModule: React.FC = () => {
  const { appSettings, can, isAdmin, focusId, setActiveTab } = usePortal();
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const manage = can('settings.manage');
  // Someone who may change only part of the settings sees only the tabs for it.
  const visibleTabs = TABS.filter((t) => (t.id === 'access' ? isAdmin || manage : manage)).map((t) => t.id);
  const last = readLastTab();
  const tab: SettingsTab | undefined = isSettingsTab(focusId) && visibleTabs.includes(focusId)
    ? focusId
    : isSettingsTab(last) && visibleTabs.includes(last)
      ? last
      : visibleTabs[0];

  useEffect(() => {
    if (tab) saveLastTab(tab);
  }, [tab]);

  // Closing the browser tab with unsaved edits asks first, like switching settings tabs does.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // A search result opens its tab first, then scrolls to the section and marks it for a moment. Some
  // sections appear only once their data has loaded, so it looks again for a couple of seconds.
  useEffect(() => {
    if (!scrollTo) return;
    let tries = 0;
    let timer = 0;
    const find = () => {
      const el = document.getElementById(`settings-${scrollTo}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-red-300');
        window.setTimeout(() => el.classList.remove('ring-2', 'ring-red-300'), 2000);
        setScrollTo(null);
      } else if (++tries < 20) timer = window.setTimeout(find, 100);
      else setScrollTo(null);
    };
    timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [scrollTo, tab]);

  if (!appSettings || !tab) return null;

  const open = (next: SettingsTab) => {
    if (next === tab || !confirmDiscard()) return false;
    setActiveTab('admin', next);
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-deep text-white rounded-2xl shadow-lg">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-ink">تنظیمات پرتال</h2>
          <p className="text-sm text-muted">تنظیمات در چند بخش آمده است؛ برای پیدا کردن سریع، نام آن را جستجو کنید. سامانه‌های سازمانی از صفحهٔ «سامانه‌ها» ویرایش می‌شوند.</p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6 space-y-4 lg:space-y-0 lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-24">
          <SettingsSearch
            visibleTabs={visibleTabs}
            isAdmin={isAdmin}
            manage={manage}
            onPick={(next, id) => {
              if (next === tab || open(next)) setScrollTo(id);
            }}
          />
          {/* A phone has no room for the list of tabs, so it gets a drop-down. */}
          <label className="lg:hidden block">
            <span className="sr-only">بخش تنظیمات</span>
            <select className={inputClass} value={tab} onChange={(e) => open(e.target.value as SettingsTab)}>
              {TABS.filter((t) => visibleTabs.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <nav aria-label="بخش‌های تنظیمات" className="hidden lg:block">
            <ul className="space-y-1">
              {TABS.filter((t) => visibleTabs.includes(t.id)).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => open(t.id)}
                    className={`w-full flex items-start gap-2.5 text-right px-3 py-2.5 rounded-2xl transition-colors ${
                      tab === t.id ? 'bg-brand-deep text-white' : 'text-ink hover:bg-white'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">{t.icon}</span>
                    <span>
                      <span className="block text-xs font-bold">{t.label}</span>
                      <span className={`block text-xs leading-relaxed ${tab === t.id ? 'text-white/80' : 'text-faint'}`}>{t.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
          {tab === 'general' && (
            <>
              <Panel id="logo" wide><LogoSettings settings={appSettings} /></Panel>
              <Panel id="founding" wide><FoundingDaySettings settings={appSettings} /></Panel>
            </>
          )}
          {tab === 'access' && (
            <>
              {isAdmin && <Panel id="roles" wide><RolesEditor /></Panel>}
              {manage && <Panel id="guest" wide><GuestAccessSettings settings={appSettings} /></Panel>}
            </>
          )}
          {tab === 'features' && (
            <>
              <Panel id="features" wide><FeatureSettings /></Panel>
              <Panel id="dashboard-cards" wide><DashboardCardsSettings settings={appSettings} /></Panel>
              <Panel id="first-week" wide>
                <FirstWeekSettings key={(appSettings.firstWeekSteps ?? []).join('|')} settings={appSettings} />
              </Panel>
              <Panel id="kudos-emojis" wide>
                <KudosEmojiSettings key={JSON.stringify(appSettings.kudosEmojis)} settings={appSettings} />
              </Panel>
            </>
          )}
          {tab === 'lists' && (
            <>
              <Panel id="departments"><ManagedListEditor settings={appSettings} config={DEPARTMENTS} /></Panel>
              <Panel id="locations"><ManagedListEditor settings={appSettings} config={LOCATIONS} /></Panel>
              {SECTIONS.map((s) => (
                <Panel key={s.key} id={s.key}>
                  <ListEditor key={`${s.key}-${appSettings[s.key].join('|')}`} settings={appSettings} section={s} />
                </Panel>
              ))}
            </>
          )}
          {tab === 'server' && <Panel id="server" wide><ServerStatusCard /></Panel>}
        </div>
      </div>
    </div>
  );
};
