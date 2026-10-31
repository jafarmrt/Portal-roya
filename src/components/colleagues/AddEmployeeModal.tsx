import React, { useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { AccountCreatedNotice, AccountFields } from './AccountAccessModal';
import { usePortal, type NewEmployeeInput } from '../../context/PortalContext';
import { todayJalali } from '../../lib/jalali';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { LocationSelect } from './LocationSelect';
import { legendClass, sectionClass } from './EditProfileModal';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const emptyForm = (department: string, directoryLogin: boolean): NewEmployeeInput => ({
  firstName: '',
  lastName: '',
  hasAccount: true,
  signIn: directoryLogin ? 'ldap' : 'local',
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
  const { addEmployee, appSettings, employees, directoryLogin } = usePortal();
  const blank = () => emptyForm(appSettings?.departments[0] ?? '', directoryLogin);
  const [form, setForm] = useState<NewEmployeeInput>(blank);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; temporaryPassword: string | null } | null>(null);

  if (!isOpen) return null;

  const set = <K extends keyof NewEmployeeInput>(key: K, value: NewEmployeeInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const close = () => {
    setCreated(null);
    setForm(blank());
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await addEmployee(form);
    setBusy(false);
    if (!result) return;
    if (form.hasAccount) setCreated({ username: form.username.trim().toLowerCase(), temporaryPassword: result.temporaryPassword });
    else close();
  };

  if (created) {
    return (
      <Modal title="همکار اضافه شد" icon={<CheckCircle2 className="w-5 h-5" />} onClose={close} size="md" footer={<button onClick={close} className={primaryButtonClass}>بستن</button>}>
        <AccountCreatedNotice username={created.username} temporaryPassword={created.temporaryPassword} />
      </Modal>
    );
  }

  const managers = employees.filter((e) => e.isActive);

  return (
    <Modal
      title="ثبت همکار جدید"
      subtitle="افزودن به دفتر تلفن، در صورت نیاز ساختن حساب پرتال و معرفی در داشبورد"
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
        <fieldset className={sectionClass}>
          <legend className={legendClass}>مشخصات فردی</legend>
          <div className="flex items-center gap-3">
            <Avatar src={form.avatar} firstName={form.firstName || '?'} lastName={form.lastName} className="w-11 h-11 rounded-xl text-sm" />
            <FileUpload accept={IMAGE_ACCEPT} label={form.avatar ? 'تغییر عکس پرسنلی' : 'بارگذاری عکس پرسنلی'} onUploaded={(f) => set('avatar', f.url)} />
          </div>
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
          </div>
          <div>
            <label htmlFor="emp-bio" className={labelClass}>معرفی کوتاه</label>
            <textarea id="emp-bio" rows={2} value={form.bio} onChange={(e) => set('bio', e.target.value)} className={inputClass} />
          </div>
        </fieldset>

        <fieldset className={sectionClass}>
          <legend className={legendClass}>جایگاه سازمانی</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="emp-position" className={labelClass}>سمت *</label>
              <input id="emp-position" required value={form.position} onChange={(e) => set('position', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="emp-department" className={labelClass}>واحد *</label>
              <SearchableSelect id="emp-department" value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass}>
                {appSettings?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </SearchableSelect>
            </div>
            <div>
              <label htmlFor="emp-location" className={labelClass}>محل استقرار</label>
              <LocationSelect id="emp-location" value={form.location} onChange={(v) => set('location', v)} />
            </div>
            <div>
              <label htmlFor="emp-manager" className={labelClass}>مدیر مستقیم</label>
              <SearchableSelect id="emp-manager" value={form.directManagerId ?? ''} onChange={(e) => set('directManagerId', e.target.value || null)} className={inputClass}>
                <option value="">—</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.position})</option>)}
              </SearchableSelect>
            </div>
            <div>
              <label htmlFor="emp-hire" className={labelClass}>تاریخ استخدام</label>
              <JalaliDateInput id="emp-hire" value={form.hireDate} onChange={(v) => set('hireDate', v)} />
              {!form.isNewColleague && !form.hireDate && (
                <p className="mt-1 text-xs text-muted">اگر نمی‌دانید خالی بماند؛ بعداً هم می‌شود ثبت کرد.</p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className={sectionClass}>
          <legend className={legendClass}>حساب پرتال</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.hasAccount} onChange={(e) => set('hasAccount', e.target.checked)} className="accent-red-700 mt-0.5" />
            <span>
              <strong>ساختن حساب پرتال</strong>
              <span className="block text-xs text-muted">
                {form.hasAccount
                  ? 'همکار می‌تواند وارد پرتال شود، اعلان بگیرد، رأی بدهد و پیام بفرستد.'
                  : 'فقط در دفتر تلفن، چارت سازمانی و کارت‌های تولد و همکار جدید دیده می‌شود و وارد پرتال نمی‌شود. هر وقت لازم شد می‌توانید از «مدیریت کارکنان» برایش حساب پرتال بسازید.'}
              </span>
            </span>
          </label>
          {form.hasAccount && (
            <AccountFields
              idPrefix="emp"
              value={{ username: form.username, role: form.role, signIn: form.signIn }}
              onChange={(a) => setForm((f) => ({ ...f, ...a }))}
            />
          )}
        </fieldset>

        <div className="p-4 bg-surface rounded-2xl space-y-2">
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={form.isNewColleague}
              onChange={(e) => {
                const isNew = e.target.checked;
                // A new colleague starts today; for someone already here, today is never the right default.
                setForm((f) => ({
                  ...f,
                  isNewColleague: isNew,
                  hireDate: isNew ? f.hireDate || todayJalali() : f.hireDate === todayJalali() ? '' : f.hireDate,
                }));
              }}
              className="accent-red-700"
            />
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
