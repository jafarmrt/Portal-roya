import React, { useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { CheckCircle2, KeyRound, ShieldOff, User } from 'lucide-react';
import { type ManagedProfileUpdate, usePortal, type ProfileUpdate } from '../../context/PortalContext';
import { NO_DEPARTMENT, unitHeads } from '../../../shared/profile';
import { ABOUT_ME_MAX, ABOUT_ME_QUESTIONS } from '../../../shared/aboutMe';
import type { UserProfile } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { Avatar } from '../common/Avatar';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AccountAccessModal, TemporaryPasswordNotice } from './AccountAccessModal';
import { RoleHint, RoleSelect, useCoversRole } from './RoleSelect';
import { LocationSelect } from './LocationSelect';
import { OnlineChoices } from '../online/OnlineChoices';
import { usePresence } from '../online/usePresence';

/** «همکاران آنلاین» choices; saved as soon as they are ticked, apart from the rest of the form. */
const OnlineProfileChoices: React.FC = () => {
  const { data, setChoice } = usePresence(true);
  if (!data) return null;
  return (
    <fieldset className="p-3 rounded-2xl border border-line space-y-1">
      <legend className="text-xs font-black px-1">همکاران آنلاین</legend>
      <OnlineChoices me={data.me} onChange={(choice) => void setChoice(choice)} />
    </fieldset>
  );
};

/** The three parts of a colleague: personal details, place in the organisation and portal account. */
export const sectionClass = 'p-4 rounded-2xl border border-line space-y-4';
export const legendClass = 'text-xs font-black px-1 text-ink';

interface EditProfileModalProps {
  user: UserProfile;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, onClose }) => {
  const { updateUserProfile, resetEmployeePassword, directoryLogin, can, isAdmin: viewerIsAdmin, appSettings, employees, currentUser, featureOn, departmentPages } = usePortal();
  // Admin accounts can only be changed by an admin; the server enforces the same rule.
  const isAdmin = can('users.manage') && (viewerIsAdmin || user.role !== 'admin');
  const isSelf = currentUser?.id === user.id;
  // Follows portal access granted or removed from the nested dialog while this one is open.
  const live = employees.find((e) => e.id === user.id) ?? user;
  // Someone who holds a permission the viewer lacks keeps their role, password and access as they are;
  // nobody but an admin changes their own role. The server enforces the same rules.
  const covers = useCoversRole();
  const mayChangeAccount = viewerIsAdmin || (!isSelf && covers(live.role));
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
    hideAnniversary: user.hideAnniversary,
    hireDate: user.hireDate,
    bio: user.bio,
    aboutMe: user.aboutMe ?? {},
    location: user.location,
    avatar: user.avatar,
    directManagerId: user.directManagerId,
    isActive: user.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  // Head of the unit chosen above (its page's «مسئول واحد»); a unit has one head.
  const heads = unitHeads(departmentPages);
  const [unitHead, setUnitHead] = useState(Boolean(user.department) && heads.get(user.department) === user.id);
  const otherHeadId = form.department ? heads.get(form.department) : undefined;
  const otherHead = otherHeadId && otherHeadId !== user.id ? employees.find((e) => e.id === otherHeadId) : undefined;
  const fallbackManager = !form.directManagerId && otherHead && !unitHead ? otherHead : undefined;

  const set = <K extends keyof ProfileUpdate>(key: K, value: Required<ProfileUpdate>[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Employees may only change their own contact details; the server enforces the same rule.
    // The role is sent only when changed here, so access granted or removed meanwhile keeps its role.
    // «دربارهٔ من» is the colleague's own; nobody else sends it.
    const { role, aboutMe, ...managed } = form;
    const own = isSelf ? { aboutMe } : {};
    const headsChosenUnit = Boolean(form.department) && heads.get(form.department) === user.id;
    const update: ManagedProfileUpdate = isAdmin
      ? {
          ...managed,
          ...(live.hasAccount && role !== user.role ? { role } : {}),
          ...(unitHead !== headsChosenUnit ? { isUnitHead: unitHead } : {}),
          ...own,
        }
      : {
          firstName: form.firstName,
          lastName: form.lastName,
          extension: form.extension,
          mobile: form.mobile,
          email: form.email,
          birthDate: form.birthDate,
          hideBirthday: form.hideBirthday,
          hideAnniversary: form.hideAnniversary,
          bio: form.bio,
          location: form.location,
          avatar: form.avatar,
          ...own,
        };
    const ok = await updateUserProfile(user.id, update);
    setBusy(false);
    if (ok) onClose();
  };

  const adminField = (id: string, label: string, key: 'firstName' | 'lastName' | 'position') => (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {/* Colleagues may rename themselves; the position stays with user managers. */}
      <input id={id} required value={form[key]} onChange={(e) => set(key, e.target.value)} disabled={!isAdmin && !(isSelf && key !== 'position')} className={inputClass} />
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
          <p className="p-3 bg-surface rounded-xl text-xs text-muted">سمت، واحد و سطح دسترسی را کسی تغییر می‌دهد که «مدیریت کارکنان» دارد{user.role === 'admin' ? ' (حساب ادمین را فقط ادمین پرتال)' : ''}.</p>
        )}

        <fieldset className={sectionClass}>
          <legend className={legendClass}>مشخصات فردی</legend>
          <div className="flex items-center gap-3">
            <Avatar src={form.avatar} firstName={form.firstName} lastName={form.lastName} className="w-14 h-14 rounded-2xl text-base" />
            <FileUpload accept={IMAGE_ACCEPT} label={form.avatar ? 'تغییر عکس' : 'بارگذاری عکس'} onUploaded={(f) => set('avatar', f.url)} />
            {form.avatar && <button type="button" onClick={() => set('avatar', '')} className="text-red-700 font-bold">حذف عکس</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminField('edit-first', 'نام *', 'firstName')}
            {adminField('edit-last', 'نام خانوادگی *', 'lastName')}
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
              <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={form.hideBirthday} onChange={(e) => set('hideBirthday', e.target.checked)} className="accent-red-700" />
                {isSelf ? 'تولدم به همکاران نمایش داده نشود' : 'تولد این همکار به دیگران نمایش داده نشود'}
              </label>
              <label className="mt-1 flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={form.hideAnniversary} onChange={(e) => set('hideAnniversary', e.target.checked)} className="accent-red-700" />
                {isSelf ? 'سالگرد همکاری‌ام به همکاران اعلام نشود' : 'سالگرد همکاری این همکار به دیگران اعلام نشود'}
              </label>
              <p className="mt-1 text-xs text-faint">سال تولد به همکاران نشان داده نمی‌شود؛ فقط روز و ماه.</p>
            </div>
          </div>
          <div>
            <label htmlFor="edit-bio" className={labelClass}>معرفی کوتاه</label>
            <textarea id="edit-bio" rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)} className={inputClass} />
          </div>
        </fieldset>

        {isSelf && (
          <fieldset className={sectionClass} id="about-me">
            <legend className={legendClass}>دربارهٔ من (دلخواه)</legend>
            <p className="text-xs text-muted leading-relaxed -mt-1">
              چند سؤال خودمانی تا همکاران شما را بهتر بشناسند و نقطهٔ مشترک پیدا کنند. پاسخ‌ها روی کارت شما و در معرفی همکار جدید دیده می‌شوند؛ هر کدام را نخواستید خالی بگذارید.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ABOUT_ME_QUESTIONS.map((q) => (
                <div key={q.key}>
                  <label htmlFor={`about-${q.key}`} className={labelClass}>{q.question}</label>
                  <input
                    id={`about-${q.key}`}
                    value={form.aboutMe[q.key] ?? ''}
                    maxLength={ABOUT_ME_MAX}
                    placeholder={q.placeholder}
                    onChange={(e) => set('aboutMe', { ...form.aboutMe, [q.key]: e.target.value })}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {isSelf && featureOn('onlineColleagues') && <OnlineProfileChoices />}

        <fieldset className={sectionClass}>
          <legend className={legendClass}>جایگاه سازمانی</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminField('edit-position', 'سمت *', 'position')}
            <div>
              <label htmlFor="edit-department" className={labelClass}>واحد *</label>
              <SearchableSelect id="edit-department" required value={form.department} onChange={(e) => set('department', e.target.value)} disabled={!isAdmin} className={inputClass}>
                {!form.department && <option value="" disabled>{NO_DEPARTMENT} (انتخاب کنید)</option>}
                {[...new Set([form.department, ...(appSettings?.departments ?? [])])].filter(Boolean).map((d) => <option key={d} value={d}>{d}</option>)}
              </SearchableSelect>
            </div>
            <div>
              <label htmlFor="edit-location" className={labelClass}>محل استقرار</label>
              <LocationSelect id="edit-location" value={form.location} onChange={(v) => set('location', v)} />
            </div>
            {isAdmin && (
              <>
                <div>
                  <label htmlFor="edit-manager" className={labelClass}>مدیر مستقیم</label>
                  <SearchableSelect id="edit-manager" value={form.directManagerId ?? ''} onChange={(e) => set('directManagerId', e.target.value || null)} className={inputClass}>
                    <option value="">—</option>
                    {employees.filter((e) => e.id !== user.id && e.isActive).map((m) => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                    ))}
                  </SearchableSelect>
                  {fallbackManager && (
                    <p className="mt-1 text-xs text-muted">
                      خالی یعنی مسئول واحد، {fallbackManager.firstName} {fallbackManager.lastName}، در چارت سازمانی مدیر او حساب می‌شود.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="edit-hire" className={labelClass}>تاریخ استخدام</label>
                  <JalaliDateInput id="edit-hire" value={form.hireDate} onChange={(v) => set('hireDate', v)} />
                </div>
              </>
            )}
          </div>
          {isAdmin && (
            <label className={`flex items-start gap-2 ${live.hasAccount && form.department && form.isActive ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={unitHead}
                disabled={!live.hasAccount || !form.department || !form.isActive}
                onChange={(e) => setUnitHead(e.target.checked)}
                className="accent-red-700 mt-0.5"
              />
              <span>
                <strong className="text-xs">مسئول این واحد است</strong>
                <span className="block text-xs text-muted leading-relaxed">
                  {!live.hasAccount
                    ? 'مسئول واحد باید حساب پرتال داشته باشد.'
                    : otherHead && unitHead
                      ? `الان ${otherHead.firstName} ${otherHead.lastName} مسئول ${form.department} است؛ با ذخیره، جای او را می‌گیرد.`
                      : otherHead
                        ? `مسئول فعلی ${form.department}: ${otherHead.firstName} ${otherHead.lastName}.`
                        : 'در دفتر تلفن برچسب «مسئول واحد» می‌گیرد، صفحهٔ واحد را به‌روز نگه می‌دارد و برای همکارانی که مدیر مستقیم ندارند مدیر حساب می‌شود.'}
                </span>
              </span>
            </label>
          )}
        </fieldset>

        {isAdmin && (
          <fieldset className={sectionClass}>
            <legend className={legendClass}>حساب پرتال</legend>
            {live.hasAccount ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-role" className={labelClass}>سطح دسترسی</label>
                  <RoleSelect id="edit-role" value={form.role} onChange={(role) => set('role', role)} disabled={!mayChangeAccount} />
                  {mayChangeAccount ? (
                    <RoleHint roleId={form.role} />
                  ) : (
                    <p className="mt-1 text-xs text-muted leading-relaxed">
                      {isSelf ? 'سطح دسترسی خودتان را ادمین پرتال تغییر می‌دهد.' : 'این همکار دسترسی‌هایی دارد که شما ندارید؛ سطح دسترسی، رمز و حساب او را ادمین پرتال تغییر می‌دهد.'}
                    </p>
                  )}
                </div>
                <div className="text-xs text-ink-soft leading-relaxed sm:pt-6">
                  نام کاربری <code dir="ltr">{live.username}</code>
                  {' · '}
                  {live.authSource === 'ldap' ? 'ورود با حساب ویندوز (اکتیو دایرکتوری)' : 'ورود با رمز پرتال'}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">حساب پرتال ندارد؛ فقط در دفتر تلفن، چارت سازمانی و کارت‌ها دیده می‌شود و سطح دسترسی ندارد.</p>
            )}
            {!isSelf && mayChangeAccount && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setAccessOpen(true)} className={secondaryButtonClass}>
                  {live.hasAccount ? <ShieldOff className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                  {live.hasAccount ? 'برداشتن حساب' : 'ساختن حساب پرتال'}
                </button>
                {live.hasAccount && (live.authSource !== 'ldap' || !directoryLogin) && (
                  <button type="button" onClick={async () => setTempPassword(await resetEmployeePassword(user.id))} className={secondaryButtonClass}>
                    <KeyRound className="w-4 h-4" /> ساخت رمز موقت جدید
                  </button>
                )}
              </div>
            )}
            {tempPassword && <TemporaryPasswordNotice username={live.username} password={tempPassword} />}
            {!isSelf && live.hasAccount && live.authSource === 'ldap' && directoryLogin && (
              <p className="text-xs text-muted leading-relaxed">
                این همکار با حساب اکتیو دایرکتوری وارد می‌شود؛ رمز عبورش در ویندوز تغییر می‌کند، نه در پرتال.
              </p>
            )}
          </fieldset>
        )}

        {isAdmin && !isSelf && mayChangeAccount && (
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" checked={!form.isActive} onChange={(e) => set('isActive', !e.target.checked)} className="accent-red-700" />
            غیرفعال کردن (برای کسی که از شرکت رفته است: نمی‌تواند وارد شود و از دفتر تلفن و همه‌جا پنهان می‌شود)
          </label>
        )}
      </form>
      {/* Outside the form, so its own form cannot submit this one (React events bubble through portals). */}
      {accessOpen && <AccountAccessModal user={live} onClose={() => setAccessOpen(false)} />}
    </Modal>
  );
};
