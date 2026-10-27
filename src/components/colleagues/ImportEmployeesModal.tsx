import React, { useRef, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Download, FileSpreadsheet, Loader2, Network, Printer, Upload, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { inputClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { PrintPortal } from '../common/PrintSheet';

interface PreviewRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** Whether the row adds someone, updates who it matched (`target`), or matches someone unchanged. */
  action?: 'create' | 'update' | 'unchanged';
  target?: string;
  changes?: string[];
}

/** A department the file names that the portal does not have yet. */
interface NewDepartment {
  name: string;
  rows: number[];
  suggestion?: string;
}

interface CreatedAccount {
  id: string;
  /** False (with no username or password) for rows that join the phone book only. */
  hasAccount: boolean;
  username: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  /** 'ldap' accounts sign in with the Windows password and have no temporary password. */
  authSource: 'local' | 'ldap';
  temporaryPassword: string | null;
}

interface ImportResult {
  created: CreatedAccount[];
  updated: (CreatedAccount & { changes: string[] })[];
  unchanged: number;
  skipped: { row: number; username: string; errors: string[] }[];
}

/** What the portal found in Active Directory: new people as import rows, and accounts to look at. */
interface DirectoryReport {
  newUsers: { firstName: string; lastName: string; username: string; position: string; department: string; email: string; mobile: string; extension: string }[];
  inPortal: number;
  unnamed: string[];
  notInDirectory: { username: string; name: string }[];
}

type SignInMethod = 'local' | 'ldap';

export const TEMPLATE_HEADER = ['نام', 'نام خانوادگی', 'نام کاربری', 'سمت', 'واحد', 'نقش', 'ایمیل', 'موبایل', 'داخلی', 'محل استقرار', 'تاریخ تولد', 'تاریخ استخدام'];
const TEMPLATE_SAMPLES = [
  ['علی', 'رضایی', 'ali.rezaei', 'کارشناس فروش', 'فروش و امور مشتریان', 'کارشناس', 'ali.rezaei@roya.local', '09121234567', '215', 'دفتر تهران طبقه اول', '1370/05/12', '1400/01/15'],
  // No username: listed in the phone book without a portal account.
  ['حسن', 'محمدی', '', 'اپراتور تولید', 'تولید', '', '', '09131234567', '310', 'انبار', '1368/11/02', '1398/06/01'],
];

/** One card per person, only visible when printing. */
const PrintSheet: React.FC<{ accounts: CreatedAccount[] }> = ({ accounts }) => (
  <PrintPortal>
    <div className="print-cards">
      {accounts.map((a) => (
        <div key={a.id} className="print-card">
          <p className="print-card-title">حساب کاربری پرتال سازمانی رویا</p>
          <p><strong>{a.firstName} {a.lastName}</strong> · {a.position} · {a.department}</p>
          <p>آدرس پرتال: <span dir="ltr">{window.location.origin}</span></p>
          <p>نام کاربری: <code dir="ltr">{a.username}</code></p>
          <p>رمز موقت: <code dir="ltr">{a.temporaryPassword}</code></p>
          <p className="print-card-note">در اولین ورود از شما خواسته می‌شود رمز شخصی انتخاب کنید. این برگه را پس از ورود از بین ببرید.</p>
        </div>
      ))}
    </div>
  </PrintPortal>
);

export const ImportEmployeesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [introduce, setIntroduce] = useState(false);
  const { appSettings, directoryLogin } = usePortal();
  const [signIn, setSignIn] = useState<SignInMethod>(directoryLogin ? 'ldap' : 'local');
  const [directory, setDirectory] = useState<DirectoryReport | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  // Kept so the preview can be rebuilt when the sign-in method changes.
  const fileRef = useRef<File | null>(null);
  const [newDepartments, setNewDepartments] = useState<NewDepartment[]>([]);
  // For each new department: its own name creates it, another department's name moves its rows there.
  const [departmentChoices, setDepartmentChoices] = useState<Record<string, string>>({});

  const validRows = preview?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (preview?.length ?? 0) - validRows.length;
  const newRows = validRows.filter((r) => r.action === 'create');
  const updateCount = validRows.filter((r) => r.action === 'update').length;
  const unchangedCount = validRows.filter((r) => r.action === 'unchanged').length;
  const phoneOnlyCount = newRows.filter((r) => !r.data.username).length;
  const makesAccounts = newRows.length > phoneOnlyCount || updateCount > 0;
  const toSend = validRows.filter((r) => r.action !== 'unchanged');
  // Everyone who got a portal account in this import: new people and people given access.
  const accounts = [...(result?.created ?? []), ...(result?.updated ?? [])].filter((a) => a.temporaryPassword);

  const loadPreview = async (file: File, method: SignInMethod) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('signIn', method);
      const res = await api.post<{ rows: PreviewRow[]; newDepartments: NewDepartment[] }>('/api/employees/import/preview', form);
      fileRef.current = file;
      setFileName(file.name);
      setPreview(res.rows);
      setNewDepartments(res.newDepartments);
      setDepartmentChoices(Object.fromEntries(res.newDepartments.map((d) => [d.name, d.suggestion ?? d.name])));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void loadPreview(file, signIn);
  };

  const changeSignIn = (method: SignInMethod) => {
    setSignIn(method);
    if (fileRef.current) void loadPreview(fileRef.current, method);
  };

  const downloadDirectoryUsers = async () => {
    setLoadingDirectory(true);
    try {
      const res = await api.get<DirectoryReport>('/api/employees/directory');
      setDirectory(res);
      if (res.newUsers.length > 0) {
        downloadCsv('roya-ad-users.csv', [
          ['نام', 'نام خانوادگی', 'نام کاربری', 'سمت', 'واحد', 'ایمیل', 'موبایل', 'داخلی'],
          ...res.newUsers.map((u) => [u.firstName, u.lastName, u.username, u.position, u.department, u.email, u.mobile, u.extension]),
        ]);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingDirectory(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const res = await api.post<ImportResult>('/api/employees/import', {
        rows: toSend.map((r) => r.data),
        introduce,
        departments: departmentChoices,
        signIn: directoryLogin ? signIn : 'local',
      });
      setResult(res);
      toast.success(`${toPersianDigits(res.created.length)} نفر اضافه و ${toPersianDigits(res.updated.length)} نفر به‌روز شد.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadPasswords = () =>
    downloadCsv('roya-portal-accounts.csv', [
      ['نام', 'نام خانوادگی', 'نام کاربری', 'رمز موقت', 'سمت', 'واحد'],
      ...accounts.map((a) => [a.firstName, a.lastName, a.username, a.temporaryPassword ?? '', a.position, a.department]),
    ]);

  if (result) {
    return (
      <Modal
        title="کارکنان ثبت شدند"
        subtitle={accounts.length > 0 ? 'رمزهای موقت فقط همین یک بار نمایش داده می‌شوند' : undefined}
        icon={<CheckCircle2 className="w-5 h-5" />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            {accounts.length > 0 && (
              <>
                <button type="button" onClick={downloadPasswords} className={secondaryButtonClass}><Download className="w-4 h-4" /> دانلود فایل رمزها</button>
                <button type="button" onClick={() => window.print()} className={secondaryButtonClass}><Printer className="w-4 h-4" /> چاپ برگهٔ رمزها</button>
              </>
            )}
            <button type="button" onClick={onClose} className={primaryButtonClass}>بستن</button>
          </>
        }
      >
        <PrintSheet accounts={accounts} />
        <div className="space-y-4">
          <p className="font-bold">
            {toPersianDigits(result.created.length)} نفر اضافه شد ({toPersianDigits(result.created.filter((a) => a.hasAccount).length)} نفر با حساب پورتال) و {toPersianDigits(result.updated.length)} نفر به‌روز شد.
          </p>
          {accounts.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 leading-relaxed">
              قبل از بستن این پنجره برگهٔ رمزها را چاپ یا فایل آن را دانلود کنید. هر همکار در اولین ورود رمز شخصی خودش را انتخاب می‌کند. اگر کسی رمزش را گم کرد، از پروفایل او «ساخت رمز موقت جدید» را بزنید.
            </div>
          )}
          <div className="overflow-x-auto border border-[#E6E0D5] rounded-2xl">
            <table className="w-full text-xs">
              <thead className="bg-[#F5F2ED] text-[#4B4740]">
                <tr><th className="p-2 text-right">نام</th><th className="p-2 text-right">نام کاربری</th><th className="p-2 text-right">رمز موقت</th><th className="p-2 text-right">واحد</th></tr>
              </thead>
              <tbody>
                {[...result.created.map((a) => ({ ...a, changes: [] as string[] })), ...result.updated].map((a) => (
                  <tr key={a.id} className="border-t border-[#E6E0D5]">
                    <td className="p-2">
                      {a.firstName} {a.lastName}
                      {a.changes.length > 0 && <span className="block text-[11px] text-[#6E6A60]">به‌روز شد: {a.changes.join('، ')}</span>}
                    </td>
                    {a.hasAccount ? (
                      <>
                        <td className="p-2"><code dir="ltr">{a.username}</code></td>
                        <td className="p-2">
                          {a.temporaryPassword ? <code dir="ltr" className="font-bold select-all">{a.temporaryPassword}</code> : a.authSource === 'ldap' ? <span className="text-[#6E6A60]">رمز ویندوز</span> : <span className="text-[#8C867A]">—</span>}
                        </td>
                      </>
                    ) : (
                      <td className="p-2 text-[#6E6A60]" colSpan={2}>فقط دفتر تلفن (بدون دسترسی پورتال)</td>
                    )}
                    <td className="p-2">{a.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.skipped.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-1">
              <p className="font-bold">{toPersianDigits(result.skipped.length)} ردیف ثبت نشد:</p>
              {result.skipped.map((s) => <p key={s.row}>{s.username || '—'}: {s.errors.join(' ')}</p>)}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="ورود و به‌روزرسانی کارکنان از اکسل"
      subtitle="افزودن افراد جدید یا تغییر مشخصات افراد موجود با یک فایل"
      icon={<FileSpreadsheet className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          {preview && (
            <button type="button" onClick={handleImport} disabled={busy || toSend.length === 0} className={primaryButtonClass}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {busy ? 'در حال ثبت...' : `ثبت ${toPersianDigits(toSend.length)} ردیف`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {directoryLogin && (
          <section aria-label="کاربران اکتیو دایرکتوری" className="p-3 bg-[#F5F2ED] rounded-2xl space-y-2 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5"><Network className="w-4 h-4" /> کاربران اکتیو دایرکتوری</p>
            <p className="text-[#4B4740]">
              فایل کاربران فعال اکتیو دایرکتوری را که هنوز در پرتال نیستند بگیرید. نام‌ها در اکتیو دایرکتوری معمولاً انگلیسی‌اند؛ در اکسل آن‌ها را فارسی کنید، سمت و واحد را درست کنید و ردیف کسانی را که نمی‌خواهید حذف کنید. بعد همین فایل را پایین‌تر بارگذاری کنید.
            </p>
            <button type="button" onClick={downloadDirectoryUsers} disabled={loadingDirectory} className={secondaryButtonClass}>
              {loadingDirectory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} دانلود فایل کاربران فعال اکتیو دایرکتوری
            </button>
            {directory && (
              <div className="space-y-1 text-[#4B4740]">
                <p>
                  {directory.newUsers.length > 0
                    ? `${toPersianDigits(directory.newUsers.length)} کاربر فعال در فایل آمد.`
                    : 'همهٔ کاربران فعال اکتیو دایرکتوری در پرتال هستند؛ فایلی ساخته نشد.'}
                  {directory.inPortal > 0 && ` ${toPersianDigits(directory.inPortal)} نفر دیگر از قبل در پرتال هستند و در فایل نیامدند.`}
                </p>
                {directory.unnamed.length > 0 && (
                  <p>
                    {toPersianDigits(directory.unnamed.length)} حساب بدون نام و نام خانوادگی (احتمالاً حساب سیستمی) کنار گذاشته شد:{' '}
                    <span dir="ltr">{directory.unnamed.join(', ')}</span>
                  </p>
                )}
                {directory.notInDirectory.length > 0 && (
                  <p className="text-amber-900">
                    این حساب‌های پرتال در اکتیو دایرکتوری (بین کاربران فعال) پیدا نشدند و با رمز ویندوز وارد نمی‌شوند؛ یا حساب محلی پرتال‌اند، یا نام کاربری‌شان با نام ورود ویندوز فرق دارد، یا از شرکت رفته‌اند:{' '}
                    {directory.notInDirectory.map((p, i) => (
                      <span key={p.username}>{i > 0 && '، '}{p.name} (<code dir="ltr">{p.username}</code>)</span>
                    ))}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        <ol className="list-decimal pr-5 space-y-1.5 text-[#4B4740] leading-relaxed">
          <li>
            فایل نمونه را دانلود کنید و در اکسل برای هر همکار یک ردیف پر کنید. ستون‌های نام، نام خانوادگی، سمت و واحد الزامی‌اند.
            <button type="button" onClick={() => downloadCsv('roya-portal-staff-template.csv', [TEMPLATE_HEADER, ...TEMPLATE_SAMPLES])} className="mr-2 text-red-700 font-bold hover:underline inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> دانلود فایل نمونه
            </button>
          </li>
          <li><strong>نام کاربری</strong> را همان نام ورود ویندوز همکار بنویسید (مثلاً <code dir="ltr">ali.rezaei</code>) تا بعداً با ورود اکتیو دایرکتوری یکی شود. برای همکارانی که به پورتال دسترسی ندارند (مثلاً همکاران کارگاه) نام کاربری را <strong>خالی بگذارید</strong>؛ فقط در دفتر تلفن و کارت‌های تولد دیده می‌شوند.</li>
          <li>در ستون نقش نام یکی از نقش‌های پرتال را بنویسید، مثلاً «مدیر» یا «کارشناس» (خالی یعنی کارشناس). تاریخ‌ها به شکل ۱۴۰۰/۰۱/۱۵.</li>
          <li>
            <strong>برای تغییر مشخصات افراد موجود</strong> (مثلاً موبایل یا دادن نام کاربری به همکاری که حساب ندارد) از «مدیریت کارکنان» دکمهٔ «خروجی اکسل» را بزنید، فایل را ویرایش کنید و همین‌جا بارگذاری کنید. ستون شناسه را تغییر ندهید؛ ردیف‌ها با آن پیدا می‌شوند. فقط خانه‌های پر شده تغییر می‌کنند.
          </li>
          <li>فایل را با فرمت xlsx یا CSV ذخیره و اینجا بارگذاری کنید. قبل از ثبت، پیش‌نمایش افراد جدید، تغییرات و خطاها را می‌بینید.</li>
        </ol>

        <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full p-5 border-2 border-dashed border-[#D9D4CB] hover:border-red-600 hover:text-red-700 rounded-2xl flex items-center justify-center gap-2 font-bold disabled:opacity-60"
        >
          {busy && !preview ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          {fileName ? `فایل «${fileName}» — انتخاب فایل دیگر` : 'انتخاب فایل اکسل یا CSV'}
        </button>

        {preview && (
          <>
            <div className="flex flex-wrap gap-2 font-bold">
              {newRows.length > 0 && <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800">{toPersianDigits(newRows.length)} نفر جدید</span>}
              {updateCount > 0 && <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-800">{toPersianDigits(updateCount)} نفر به‌روزرسانی</span>}
              {unchangedCount > 0 && <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-700">{toPersianDigits(unchangedCount)} نفر بدون تغییر</span>}
              {phoneOnlyCount > 0 && <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-900">{toPersianDigits(phoneOnlyCount)} نفر جدید فقط دفتر تلفن (بدون نام کاربری)</span>}
              {invalidCount > 0 && <span className="px-3 py-1 rounded-full bg-red-50 text-red-700">{toPersianDigits(invalidCount)} ردیف با خطا (ثبت نمی‌شود)</span>}
            </div>
            {newRows.length > 0 && <label className="flex items-start gap-2 p-3 bg-[#F5F2ED] rounded-xl cursor-pointer leading-relaxed">
              <input type="checkbox" checked={introduce} onChange={(e) => setIntroduce(e.target.checked)} className="accent-red-700 mt-0.5" />
              <span>
                <strong>این افراد همکار جدید هستند؛ در داشبورد معرفی شوند.</strong>
                <span className="block text-[#6E6A60]">فقط برای افراد جدید این فایل. برای ورود اولیهٔ همهٔ کارکنان فعلی این گزینه را خاموش بگذارید. به همه یک اعلان جمعی داده می‌شود.</span>
              </span>
            </label>}
            {directoryLogin && makesAccounts && (
              <fieldset className="p-3 bg-[#F5F2ED] rounded-xl space-y-1.5">
                <legend className="sr-only">روش ورود حساب‌های این فایل</legend>
                <p className="font-bold">حساب‌هایی که این فایل می‌سازد چطور وارد شوند؟</p>
                {([
                  ['ldap', 'با نام کاربری و رمز ویندوز (اکتیو دایرکتوری)', 'نام کاربری هر ردیف باید همان نام ورود ویندوز باشد. رمزی ساخته نمی‌شود.'],
                  ['local', 'با رمز پرتال', 'برای هر نفر یک رمز موقت ساخته می‌شود که باید چاپ و به او داده شود.'],
                ] as [SignInMethod, string, string][]).map(([method, label, hint]) => (
                  <label key={method} className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="import-signin" checked={signIn === method} disabled={busy} onChange={() => changeSignIn(method)} className="accent-red-700 mt-0.5" />
                    <span><strong>{label}</strong><span className="block text-[11px] text-[#6E6A60]">{hint}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {newDepartments.length > 0 && (
              <section aria-label="واحدهای جدید" className="p-3 bg-amber-50 border border-amber-300 rounded-2xl space-y-2">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> {toPersianDigits(newDepartments.length)} واحد این فایل در فهرست واحدهای سازمان نیست
                </p>
                <p className="text-amber-900 leading-relaxed">برای هر کدام مشخص کنید واحد تازه ساخته شود یا ردیف‌هایش در یکی از واحدهای موجود قرار بگیرند.</p>
                {newDepartments.map((d) => (
                  <div key={d.name} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="sm:w-1/2">
                      <strong>«{d.name}»</strong>
                      <span className="text-[#6E6A60]"> — ردیف {d.rows.map((r) => toPersianDigits(r)).join('، ')}</span>
                    </span>
                    <select
                      aria-label={`واحد برای «${d.name}»`}
                      value={departmentChoices[d.name] ?? d.name}
                      onChange={(e) => setDepartmentChoices({ ...departmentChoices, [d.name]: e.target.value })}
                      className={`${inputClass} sm:w-1/2`}
                    >
                      <option value={d.name}>ساخت واحد جدید «{d.name}»</option>
                      {(appSettings?.departments ?? []).map((existing) => (
                        <option key={existing} value={existing}>قرار دادن در «{existing}»</option>
                      ))}
                    </select>
                  </div>
                ))}
              </section>
            )}
            <div className="overflow-x-auto border border-[#E6E0D5] rounded-2xl max-h-[45dvh]">
              <table className="w-full text-xs">
                <thead className="bg-[#F5F2ED] text-[#4B4740] sticky top-0">
                  <tr>
                    <th className="p-2 text-right">ردیف</th><th className="p-2 text-right">نام</th><th className="p-2 text-right">نام کاربری</th>
                    <th className="p-2 text-right">سمت</th><th className="p-2 text-right">واحد</th><th className="p-2 text-right">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row} className={`border-t border-[#E6E0D5] ${r.errors.length ? 'bg-red-50/60' : ''}`}>
                      <td className="p-2">{toPersianDigits(r.row)}</td>
                      <td className="p-2">{r.target ?? `${r.data.firstName ?? ''} ${r.data.lastName ?? ''}`}</td>
                      <td className="p-2">{r.data.username ? <code dir="ltr">{r.data.username}</code> : <span className="text-[#8C867A]">بدون حساب</span>}</td>
                      <td className="p-2">{r.data.position}</td>
                      <td className="p-2">
                        {r.data.department}
                        {departmentChoices[r.data.department] && departmentChoices[r.data.department] !== r.data.department && (
                          <span className="block text-[#6E6A60]">← {departmentChoices[r.data.department]}</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.errors.length === 0 ? (
                          <>
                            {r.action === 'update' ? (
                              <>
                                <span className="text-sky-800 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> به‌روزرسانی</span>
                                {r.changes?.map((c) => <span key={c} className="block text-[#4B4740] mt-0.5">{c}</span>)}
                              </>
                            ) : r.action === 'unchanged' ? (
                              <span className="text-stone-600">بدون تغییر</span>
                            ) : (
                              <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> نفر جدید</span>
                            )}
                            {r.warnings.map((w) => <span key={w} className="block text-amber-800 mt-0.5">{w}</span>)}
                          </>
                        ) : (
                          <span className="text-red-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {r.errors.join(' ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
