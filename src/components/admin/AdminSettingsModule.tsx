import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Eye, HardDrive, Image as ImageIcon, LayoutDashboard, Pencil, Plus, RefreshCw, Settings, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { departmentKey, findDepartment } from '../../../shared/departments';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, formatFileSize, toPersianDigits } from '../../lib/jalali';
import type { AppSettings, BackupFile, ServerStatus } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { buildNumber, WhatsNewModal } from '../common/VersionInfo';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { RoyaLogo } from '../common/RoyaLogo';
import { DASHBOARD_CARDS, isCardOn } from '../dashboard/dashboardCards';
import { RolesEditor } from './RolesEditor';

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
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3">
      <div>
        <h3 className="text-sm font-black text-[#2D2D2D]">{section.title}</h3>
        <p className="text-[11px] text-[#6E6A60]">{section.hint}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-1 p-2 bg-[#F5F2ED] rounded-xl text-xs font-bold">
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
        <button type="submit" className="px-3 rounded-xl bg-[#F5F2ED] hover:bg-[#E6E0D5]" aria-label="افزودن"><Plus className="w-4 h-4" /></button>
      </form>
      {dirty && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#8C867A]">حذف یک مورد، داده‌های قبلی را تغییر نمی‌دهد.</p>
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
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3" aria-labelledby={`${key}-title`}>
      <div>
        <h3 id={`${key}-title`} className="text-sm font-black text-[#2D2D2D]">{config.title}</h3>
        <p className="text-[11px] text-[#6E6A60] leading-relaxed">{config.hint}</p>
      </div>
      {list.length === 0 && <p className="text-[11px] text-[#8C867A]">فهرست خالی است.</p>}
      <ul className="space-y-1.5">
        {list.map((item, i) => (
          <li key={item} className="p-2 bg-[#F5F2ED] rounded-xl text-xs font-bold space-y-2">
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
                  <span className="block text-[10px] font-normal text-[#6E6A60]">{describe(item)}</span>
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
                  <select aria-label={`${noun} مقصد برای ${item}`} value={merging.into} onChange={(e) => setMerging({ name: item, into: e.target.value })} className={inputClass}>
                    {list.filter((d) => d !== item).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
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
        <button type="submit" disabled={busy} className="px-3 rounded-xl bg-[#F5F2ED] hover:bg-[#E6E0D5]" aria-label={`افزودن ${noun}`}><Plus className="w-4 h-4" /></button>
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
  <label className={`flex items-start gap-3 p-3 rounded-xl bg-[#F5F2ED] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-700" />
    <span>
      <span className="block text-xs font-bold text-[#2D2D2D]">{label}</span>
      <span className="block text-[11px] text-[#6E6A60] mt-0.5 leading-relaxed">{hint}</span>
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
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3 lg:col-span-2">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-red-700" />
        <h3 className="text-sm font-black text-[#2D2D2D]">دسترسی مهمان (بدون ورود)</h3>
      </div>
      <p className="text-[11px] text-[#6E6A60]">
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
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3 lg:col-span-2" aria-labelledby="logo-title">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-red-700" />
        <h3 id="logo-title" className="text-sm font-black text-[#2D2D2D]">لوگوی شرکت</h3>
      </div>
      <p className="text-[11px] text-[#6E6A60]">
        لوگو در بالای همهٔ صفحه‌ها، صفحهٔ ورود و سربرگ برگه‌های چاپی نمایش داده می‌شود. بهتر است تصویر PNG با پس‌زمینهٔ شفاف و افقی باشد (مثلاً ۴۰۰ در ۱۲۰ پیکسل)؛ در هدر حداکثر ۴۰ پیکسل ارتفاع دارد.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="px-4 py-3 rounded-2xl border border-[#EAE6DF] bg-white shadow-2xs" aria-label="پیش‌نمایش هدر">
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

/** Which cards everyone sees on the dashboard. */
const DashboardCardsSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const [busy, setBusy] = useState(false);
  const set = async (id: string, value: boolean) => {
    setBusy(true);
    await updateSettings({ dashboardCards: { ...settings.dashboardCards, [id]: value } });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3 lg:col-span-2">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="w-4 h-4 text-red-700" />
        <h3 className="text-sm font-black text-[#2D2D2D]">کارت‌های داشبورد</h3>
      </div>
      <p className="text-[11px] text-[#6E6A60]">کارت‌های خاموش برای هیچ‌کس نمایش داده نمی‌شوند. «آخرین اخبار» همیشه روشن است.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {DASHBOARD_CARDS.map((card) => (
          <Toggle key={card.id} label={card.label} hint={card.hint} checked={isCardOn(settings, card.id)} disabled={busy} onChange={(value) => set(card.id, value)} />
        ))}
      </div>
    </section>
  );
};

const StatusRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="p-3 rounded-xl bg-[#F5F2ED] space-y-1">
    <dt className="text-[11px] font-bold text-[#6E6A60]">{label}</dt>
    <dd className="text-xs text-[#2D2D2D] leading-relaxed">{children}</dd>
  </div>
);

const describeBackup = (file: BackupFile | null, keep: string, when: string) =>
  file ? (
    <>
      <span className="font-bold">{formatDateTime(file.at)}</span> · {formatFileSize(file.size)}
      <span className="block text-[11px] text-[#6E6A60]">{toPersianDigits(file.count)} نسخه روی سرور ({keep}).</span>
    </>
  ) : (
    <span className="text-[#6E6A60]">هنوز گرفته نشده است؛ {when}.</span>
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
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3 lg:col-span-2" aria-labelledby="server-status-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-red-700" />
          <h3 id="server-status-title" className="text-sm font-black text-[#2D2D2D]">وضعیت سرور و پشتیبان‌ها</h3>
          {status && (
            <span className="text-[11px] text-[#6E6A60]">
              نسخهٔ {toPersianDigits(status.version)}
              {status.build && ` · بیلد ${buildNumber(status.build)}`}
            </span>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="به‌روزرسانی وضعیت سرور" className="p-1.5 rounded-lg hover:bg-[#F5F2ED] disabled:opacity-40">
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
                <span className="block text-[11px] mt-0.5">ساعت بعد دوباره امتحان می‌شود.</span>
              </span>
            </div>
          )}
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <StatusRow label="نسخهٔ در حال اجرا">
              <span className="font-bold">{toPersianDigits(status.version)}</span>
              {status.build ? ` · بیلد ${buildNumber(status.build)}` : ' · اجرا از کد منبع'}
              {status.commit && <span className="text-[11px] text-[#6E6A60]" dir="ltr"> ({status.commit})</span>}
              <span className="block text-[11px] text-[#6E6A60]">
                {status.builtAt && <>ساخته‌شده {formatDateTime(status.builtAt)} · </>}
                راه‌اندازی {formatDateTime(status.startedAt)}
              </span>
              <button type="button" onClick={() => setShowWhatsNew(true)} className="mt-1 text-[11px] font-bold text-red-700 hover:underline">
                تازه‌های این نسخه
              </button>
              {showWhatsNew && <WhatsNewModal info={status} onClose={() => setShowWhatsNew(false)} />}
            </StatusRow>
            <StatusRow label="فضای دیسک">
              {disk ? (
                <>
                  <span className={lowDisk ? 'font-bold text-red-700' : 'font-bold'}>{formatFileSize(disk.free)} خالی</span> از {formatFileSize(disk.total)}
                  <span className="block h-1.5 mt-1.5 rounded-full bg-[#E6E0D5] overflow-hidden" aria-hidden="true">
                    <span className={`block h-full ${lowDisk ? 'bg-red-600' : 'bg-emerald-600'}`} style={{ width: `${usedPercent}%` }} />
                  </span>
                  {lowDisk && <span className="block text-[11px] text-red-700 mt-1">فضای خالی کم است؛ پشتیبان‌های قدیمی یا فایل‌های بزرگ را از سرور بردارید.</span>}
                </>
              ) : (
                'نامشخص'
              )}
            </StatusRow>
            <StatusRow label="فایل‌های بارگذاری‌شده">
              <span className="font-bold">{toPersianDigits(status.uploads.count)} فایل</span> · {status.uploads.count ? formatFileSize(status.uploads.bytes) : 'خالی'}
              <span className="block text-[11px] text-[#6E6A60]">
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
          <p className="text-[11px] text-[#6E6A60] leading-relaxed">
            پشتیبان‌ها در پوشهٔ <code dir="ltr" className="px-1 bg-[#F5F2ED] rounded">{status.backups.dir}</code> روی همین سرور ذخیره می‌شوند. اگر دیسک سرور خراب شود پشتیبان‌ها هم از دست می‌روند؛ هر چند وقت یک بار این پوشه را روی کامپیوتر یا دیسک دیگری کپی کنید.
          </p>
        </>
      )}
    </section>
  );
};

export const AdminSettingsModule: React.FC = () => {
  const { appSettings, can, isAdmin } = usePortal();
  if (!appSettings) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#2D2D2D]">تنظیمات پرتال</h2>
          <p className="text-sm text-[#6E6A60]">نقش‌ها و دسترسی‌ها، لوگوی شرکت، فهرست واحدها و دسته‌بندی‌ها. سامانه‌های سازمانی از صفحهٔ «سامانه‌ها» ویرایش می‌شوند.</p>
        </div>
      </div>
      {isAdmin && <RolesEditor />}
      {can('settings.manage') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LogoSettings settings={appSettings} />
          <ServerStatusCard />
          <GuestAccessSettings settings={appSettings} />
          <DashboardCardsSettings settings={appSettings} />
          <ManagedListEditor settings={appSettings} config={DEPARTMENTS} />
          <ManagedListEditor settings={appSettings} config={LOCATIONS} />
          {SECTIONS.map((s) => <ListEditor key={`${s.key}-${appSettings[s.key].join('|')}`} settings={appSettings} section={s} />)}
        </div>
      )}
    </div>
  );
};
