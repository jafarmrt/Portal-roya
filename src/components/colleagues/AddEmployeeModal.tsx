import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, UserPlus } from 'lucide-react';
import { usePortal, type NewEmployeeInput } from '../../context/PortalContext';
import { todayJalali } from '../../lib/jalali';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { RoleSelect } from './RoleSelect';
import { Avatar } from '../common/Avatar';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Shows a one-time password so the manager can hand it to the colleague. */
export const TemporaryPasswordNotice: React.FC<{ username?: string; password: string }> = ({ username, password }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-xs">
      <p className="font-bold text-amber-900 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> این رمز فقط یک بار نمایش داده می‌شود</p>
      <p className="text-amber-900 leading-relaxed">آن را به همکار بدهید. در اولین ورود از او خواسته می‌شود رمز شخصی انتخاب کند.</p>
      <div className="flex flex-wrap items-center gap-2">
        {username && <code dir="ltr" className="px-2 py-1 bg-white rounded-lg border border-amber-200">{username}</code>}
        <code dir="ltr" className="px-2 py-1 bg-white rounded-lg border border-amber-200 font-bold select-all">{password}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // The code above is selectable as a fallback.
            }
          }}
          className={secondaryButtonClass}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} کپی رمز
        </button>
      </div>
    </div>
  );
};

const emptyForm = (department: string): NewEmployeeInput => ({
  firstName: '',
  lastName: '',
  username: '',
  position: '',
  department,
  role: 'employee',
  extension: '',
  mobile: '',
  email: '',
  birthDate: '',
  hireDate: todayJalali(),
  bio: '',
  location: '',
  avatar: '',
  directManagerId: null,
  isNewColleague: true,
  newColleagueMessage: '',
});

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({ isOpen, onClose }) => {
  const { addEmployee, appSettings, employees } = usePortal();
  const [form, setForm] = useState<NewEmployeeInput>(() => emptyForm(appSettings?.departments[0] ?? ''));
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  if (!isOpen) return null;

  const set = <K extends keyof NewEmployeeInput>(key: K, value: NewEmployeeInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const close = () => {
    setCreated(null);
    setForm(emptyForm(appSettings?.departments[0] ?? ''));
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const password = await addEmployee({ ...form, username: form.username.trim().toLowerCase() });
    setBusy(false);
    if (password) setCreated({ username: form.username.trim().toLowerCase(), password });
  };

  if (created) {
    return (
      <Modal title="همکار اضافه شد" icon={<CheckCircle2 className="w-5 h-5" />} onClose={close} size="md" footer={<button onClick={close} className={primaryButtonClass}>بستن</button>}>
        <TemporaryPasswordNotice username={created.username} password={created.password} />
      </Modal>
    );
  }

  const managers = employees.filter((e) => e.isActive);

  return (
    <Modal
      title="ثبت همکار جدید"
      subtitle="ساخت حساب کاربری، افزودن به دفتر تلفن و معرفی در داشبورد"
      icon={<UserPlus className="w-5 h-5" />}
      onClose={close}
      size="xl"
      footer={
        <>
          <button type="button" onClick={close} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="add-employee" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'در حال ثبت...' : 'ثبت همکار'}
          </button>
        </>
      }
    >
      <form id="add-employee" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="emp-first" className={labelClass}>نام *</label>
            <input id="emp-first" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="emp-last" className={labelClass}>نام خانوادگی *</label>
            <input id="emp-last" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="emp-username" className={labelClass}>نام کاربری (انگلیسی) *</label>
            <input
              id="emp-username"
              required
              dir="ltr"
              pattern="[a-zA-Z0-9._\-]{3,40}"
              title="حروف انگلیسی، عدد و . _ - (۳ تا ۴۰ کاراکتر)"
              placeholder="m.rezaei"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
          <div>
            <label htmlFor="emp-position" className={labelClass}>سمت *</label>
            <input id="emp-position" required value={form.position} onChange={(e) => set('position', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="emp-department" className={labelClass}>واحد *</label>
            <select id="emp-department" value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass}>
              {appSettings?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emp-role" className={labelClass}>نقش</label>
            <RoleSelect id="emp-role" value={form.role} onChange={(role) => set('role', role)} />
          </div>
          <div>
            <label htmlFor="emp-manager" className={labelClass}>مدیر مستقیم</label>
            <select id="emp-manager" value={form.directManagerId ?? ''} onChange={(e) => set('directManagerId', e.target.value || null)} className={inputClass}>
              <option value="">—</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.position})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="emp-extension" className={labelClass}>تلفن داخلی</label>
            <input id="emp-extension" dir="ltr" value={form.extension} onChange={(e) => set('extension', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="emp-mobile" className={labelClass}>شماره همراه</label>
            <input id="emp-mobile" dir="ltr" type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="emp-email" className={labelClass}>ایمیل سازمانی</label>
            <input id="emp-email" dir="ltr" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="emp-birth" className={labelClass}>تاریخ تولد</label>
            <JalaliDateInput id="emp-birth" value={form.birthDate} onChange={(v) => set('birthDate', v)} defaultYear={1370} />
          </div>
          <div>
            <label htmlFor="emp-hire" className={labelClass}>تاریخ استخدام</label>
            <JalaliDateInput id="emp-hire" value={form.hireDate} onChange={(v) => set('hireDate', v)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="emp-location" className={labelClass}>محل استقرار</label>
            <input id="emp-location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="دفتر مرکزی - طبقه ۲" className={inputClass} />
          </div>
          <div>
            <span className={labelClass}>عکس پرسنلی</span>
            <div className="flex items-center gap-3">
              <Avatar src={form.avatar} firstName={form.firstName || '?'} lastName={form.lastName} className="w-11 h-11 rounded-xl text-sm" />
              <FileUpload accept={IMAGE_ACCEPT} label={form.avatar ? 'تغییر عکس' : 'بارگذاری عکس'} onUploaded={(f) => set('avatar', f.url)} />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="emp-bio" className={labelClass}>معرفی کوتاه</label>
          <textarea id="emp-bio" rows={2} value={form.bio} onChange={(e) => set('bio', e.target.value)} className={inputClass} />
        </div>

        <div className="p-4 bg-[#F5F2ED] rounded-2xl space-y-2">
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" checked={form.isNewColleague} onChange={(e) => set('isNewColleague', e.target.checked)} className="accent-red-700" />
            معرفی در داشبورد به عنوان همکار جدید (به همه اعلان داده می‌شود)
          </label>
          {form.isNewColleague && (
            <textarea
              rows={2}
              aria-label="پیام خوش‌آمدگویی"
              placeholder="پیام خوش‌آمدگویی (اختیاری؛ در صورت خالی بودن متن پیش‌فرض استفاده می‌شود)"
              value={form.newColleagueMessage}
              onChange={(e) => set('newColleagueMessage', e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      </form>
    </Modal>
  );
};
