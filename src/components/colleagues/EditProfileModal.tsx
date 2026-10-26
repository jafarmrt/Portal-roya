import React, { useState } from 'react';
import { CheckCircle2, KeyRound, ShieldOff, User } from 'lucide-react';
import { usePortal, type ProfileUpdate } from '../../context/PortalContext';
import type { UserProfile } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { Avatar } from '../common/Avatar';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AccountAccessModal, TemporaryPasswordNotice } from './AccountAccessModal';
import { RoleSelect } from './RoleSelect';

interface EditProfileModalProps {
  user: UserProfile;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, onClose }) => {
  const { updateUserProfile, resetEmployeePassword, directoryLogin, can, isAdmin: viewerIsAdmin, appSettings, employees, currentUser } = usePortal();
  // Admin accounts can only be changed by an admin; the server enforces the same rule.
  const isAdmin = can('users.manage') && (viewerIsAdmin || user.role !== 'admin');
  const isSelf = currentUser?.id === user.id;
  // Follows portal access granted or removed from the nested dialog while this one is open.
  const live = employees.find((e) => e.id === user.id) ?? user;
  const [accessOpen, setAccessOpen] = useState(false);

  const [form, setForm] = useState<Required<ProfileUpdate>>({
    firstName: user.firstName,
    lastName: user.lastName,
    position: user.position,
    department: user.department,
    role: user.role,
    extension: user.extension,
    mobile: user.mobile,
    email: user.email,
    birthDate: user.birthDate,
    hideBirthday: user.hideBirthday,
    hireDate: user.hireDate,
    bio: user.bio,
    location: user.location,
    avatar: user.avatar,
    directManagerId: user.directManagerId,
    isActive: user.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const set = <K extends keyof ProfileUpdate>(key: K, value: Required<ProfileUpdate>[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Employees may only change their own contact details; the server enforces the same rule.
    // The role is sent only when changed here, so access granted or removed meanwhile keeps its role.
    const { role, ...managed } = form;
    const update: ProfileUpdate = isAdmin
      ? { ...managed, ...(live.hasAccount && role !== user.role ? { role } : {}) }
      : {
          extension: form.extension,
          mobile: form.mobile,
          email: form.email,
          birthDate: form.birthDate,
          hideBirthday: form.hideBirthday,
          bio: form.bio,
          location: form.location,
          avatar: form.avatar,
        };
    const ok = await updateUserProfile(user.id, update);
    setBusy(false);
    if (ok) onClose();
  };

  const adminField = (id: string, label: string, key: 'firstName' | 'lastName' | 'position') => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input id={id} required value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!isAdmin} className={inputClass} />
    </div>
  );

  return (
    <Modal
      title="ویرایش پروفایل"
      subtitle={`${user.firstName} ${user.lastName}`}
      icon={<User className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="edit-profile" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'در حال ذخیره...' : 'ذخیرهٔ تغییرات'}
          </button>
        </>
      }
    >
      <form id="edit-profile" onSubmit={handleSubmit} className="space-y-4">
        {!isAdmin && (
          <p className="p-3 bg-[#F5F2ED] rounded-xl text-[11px] text-[#6E6A60]">نام، سمت، واحد و نقش را فقط مدیر کاربران می‌تواند تغییر دهد{user.role === 'admin' ? ' (حساب ادمین را فقط ادمین برنامه)' : ''}.</p>
        )}
        <div className="flex items-center gap-3">
          <Avatar src={form.avatar} firstName={form.firstName} lastName={form.lastName} className="w-14 h-14 rounded-2xl text-base" />
          <FileUpload accept={IMAGE_ACCEPT} label={form.avatar ? 'تغییر عکس' : 'بارگذاری عکس'} onUploaded={(f) => set('avatar', f.url)} />
          {form.avatar && <button type="button" onClick={() => set('avatar', '')} className="text-red-700 font-bold">حذف عکس</button>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminField('edit-first', 'نام *', 'firstName')}
          {adminField('edit-last', 'نام خانوادگی *', 'lastName')}
          {adminField('edit-position', 'سمت *', 'position')}
          <div>
            <label htmlFor="edit-department" className={labelClass}>واحد *</label>
            <select id="edit-department" value={form.department} onChange={(e) => set('department', e.target.value)} disabled={!isAdmin} className={inputClass}>
              {[...new Set([form.department, ...(appSettings?.departments ?? [])])].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="edit-ext" className={labelClass}>تلفن داخلی</label>
            <input id="edit-ext" dir="ltr" value={form.extension} onChange={(e) => set('extension', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="edit-mobile" className={labelClass}>شماره همراه</label>
            <input id="edit-mobile" dir="ltr" type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="edit-email" className={labelClass}>ایمیل</label>
            <input id="edit-email" dir="ltr" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`${inputClass} text-left`} />
          </div>
          <div>
            <label htmlFor="edit-birth" className={labelClass}>تاریخ تولد</label>
            <JalaliDateInput id="edit-birth" value={form.birthDate} onChange={(v) => set('birthDate', v)} defaultYear={1370} />
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#6E6A60] cursor-pointer">
              <input type="checkbox" checked={form.hideBirthday} onChange={(e) => set('hideBirthday', e.target.checked)} className="accent-red-700" />
              {isSelf ? 'تولدم به همکاران نمایش داده نشود' : 'تولد این همکار به دیگران نمایش داده نشود'}
            </label>
            <p className="mt-1 text-[10px] text-[#8C867A]">سال تولد به همکاران نشان داده نمی‌شود؛ فقط روز و ماه.</p>
          </div>
          <div>
            <label htmlFor="edit-location" className={labelClass}>محل استقرار</label>
            <input id="edit-location" value={form.location} onChange={(e) => set('location', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="edit-bio" className={labelClass}>معرفی کوتاه</label>
          <textarea id="edit-bio" rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)} className={inputClass} />
        </div>

        {isAdmin && (
          <fieldset className="p-4 bg-[#F5F2ED] rounded-2xl space-y-4">
            <legend className="text-xs font-black px-1">تنظیمات مدیر</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {live.hasAccount ? (
                <div>
                  <label htmlFor="edit-role" className={labelClass}>نقش</label>
                  <RoleSelect id="edit-role" value={form.role} onChange={(role) => set('role', role)} />
                </div>
              ) : (
                <div>
                  <span className={labelClass}>نقش</span>
                  <p className="text-[11px] text-[#6E6A60] leading-relaxed">بدون دسترسی پورتال نقشی ندارد.</p>
                </div>
              )}
              <div>
                <label htmlFor="edit-manager" className={labelClass}>مدیر مستقیم</label>
                <select id="edit-manager" value={form.directManagerId ?? ''} onChange={(e) => set('directManagerId', e.target.value || null)} className={inputClass}>
                  <option value="">—</option>
                  {employees.filter((e) => e.id !== user.id && e.isActive).map((m) => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-hire" className={labelClass}>تاریخ استخدام</label>
                <JalaliDateInput id="edit-hire" value={form.hireDate} onChange={(v) => set('hireDate', v)} />
              </div>
            </div>
            {!isSelf && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white rounded-xl border border-[#E6E0D5]">
                <span className="text-[11px] text-[#4B4740]">
                  {live.hasAccount
                    ? <>دسترسی پورتال: دارد (<code dir="ltr">{live.username}</code>{live.authSource === 'ldap' ? '، ورود با اکتیو دایرکتوری' : ''})</>
                    : 'دسترسی پورتال: ندارد؛ فقط در دفتر تلفن و کارت‌ها دیده می‌شود.'}
                </span>
                <button type="button" onClick={() => setAccessOpen(true)} className={secondaryButtonClass}>
                  {live.hasAccount ? <ShieldOff className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                  {live.hasAccount ? 'برداشتن دسترسی' : 'دادن دسترسی پورتال'}
                </button>
              </div>
            )}
            {!isSelf && (
              <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input type="checkbox" checked={!form.isActive} onChange={(e) => set('isActive', !e.target.checked)} className="accent-red-700" />
                غیرفعال کردن (برای کسی که از شرکت رفته است: نمی‌تواند وارد شود و از دفتر تلفن و همه‌جا پنهان می‌شود)
              </label>
            )}
            {!isSelf && live.hasAccount && live.authSource === 'ldap' && directoryLogin && (
              <p className="text-[11px] text-[#6E6A60] leading-relaxed">
                این همکار با حساب اکتیو دایرکتوری وارد می‌شود؛ رمز عبورش در ویندوز تغییر می‌کند، نه در پرتال.
              </p>
            )}
            {!isSelf && live.hasAccount && (live.authSource !== 'ldap' || !directoryLogin) && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => setTempPassword(await resetEmployeePassword(user.id))}
                  className={secondaryButtonClass}
                >
                  <KeyRound className="w-4 h-4" /> ساخت رمز موقت جدید
                </button>
                {tempPassword && <TemporaryPasswordNotice username={live.username} password={tempPassword} />}
              </div>
            )}
          </fieldset>
        )}
      </form>
      {/* Outside the form, so its own form cannot submit this one (React events bubble through portals). */}
      {accessOpen && <AccountAccessModal user={live} onClose={() => setAccessOpen(false)} />}
    </Modal>
  );
};
