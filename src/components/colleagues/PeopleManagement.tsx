import React, { useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { Download, Edit3, Eye, FileSpreadsheet, KeyRound, Search, ShieldOff, UserCog, UserPlus, Users } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { matches } from '../../lib/search';
import { placeText } from '../../../shared/profile';
import type { UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { inputClass } from '../common/Modal';
import { AccountAccessModal } from './AccountAccessModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import { EditProfileModal } from './EditProfileModal';
import { downloadCsv } from '../../lib/download';
import { ImportEmployeesModal, TEMPLATE_HEADER } from './ImportEmployeesModal';
import { useCoversRole } from './RoleSelect';

type View = 'active' | 'account' | 'noAccount' | 'inactive' | 'all' | 'incomplete' | 'hireDate';

const VIEWS: { id: View; label: string; test: (e: UserProfile) => boolean; whenAny?: boolean }[] = [
  { id: 'active', label: 'همه کارکنان فعال', test: (e) => e.isActive },
  { id: 'account', label: 'با حساب پرتال', test: (e) => e.isActive && e.hasAccount },
  { id: 'noAccount', label: 'فقط دفتر تلفن', test: (e) => e.isActive && !e.hasAccount },
  { id: 'inactive', label: 'غیرفعال', test: (e) => !e.isActive },
  { id: 'all', label: 'همه', test: () => true },
  // The views below are shown only while someone matches.
  // No unit or position yet: not signed in since AD created them, or imported without them.
  { id: 'incomplete', label: 'نیاز به تکمیل', test: (e) => e.isActive && (!e.department || !e.position), whenAny: true },
  // A hire date that may be the form's old «today» default.
  { id: 'hireDate', label: 'بررسی تاریخ استخدام', test: (e) => e.isActive && Boolean(e.hireDateIsEntryDay), whenAny: true },
];

const badge = 'inline-block px-2 py-0.5 text-[10px] font-bold rounded-md whitespace-nowrap';
const actionClass =
  'px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-[#E6E0D5] bg-white hover:bg-[#F5F2ED] text-[#2D2D2D] flex items-center gap-1 whitespace-nowrap';

/**
 * One place for managers to keep the staff list: add people (with or without a portal account),
 * import from Excel, edit, give or remove portal access and deactivate those who left.
 */
export const PeopleManagement: React.FC = () => {
  const { employees, appSettings, roleName, currentUser, setActiveTab } = usePortal();
  const covers = useCoversRole();
  const [view, setView] = useState<View>('active');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<UserProfile | null>(null);

  const departments = [...new Set([...(appSettings?.departments ?? []), ...employees.map((e) => e.department)])].filter(Boolean);
  const test = VIEWS.find((v) => v.id === view)!.test;
  const shown = employees.filter(
    (e) =>
      test(e) &&
      (!department || e.department === department) &&
      (!query.trim() || matches(query, `${e.firstName} ${e.lastName}`, e.username, e.position, e.extension, e.mobile, e.email)),
  );

  // The same columns as the import, plus the portal id, so the edited file updates these people.
  const exportShown = () =>
    downloadCsv('roya-portal-staff.csv', [
      ['شناسه', ...TEMPLATE_HEADER],
      ...shown.map((e) => [
        e.id, e.firstName, e.lastName, e.username, e.position, e.department, e.hasAccount ? roleName(e.role) : '',
        e.email, e.mobile, e.extension, e.location, e.birthDate, e.hireDate,
      ]),
    ]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-5 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <UserCog className="w-3.5 h-3.5" />
              <span>مدیریت</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black">مدیریت کارکنان</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              همه کارکنان اینجا ثبت می‌شوند و در دفتر تلفن، چارت سازمانی و کارت‌های تولد دیده می‌شوند. حساب پرتال برای هر نفر اختیاری است.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAdding(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg flex items-center gap-2 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" /> افزودن همکار
            </button>
            <button
              onClick={() => setImporting(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 rounded-2xl flex items-center gap-2 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" /> ورود یا به‌روزرسانی از اکسل
            </button>
            <button
              onClick={exportShown}
              disabled={shown.length === 0}
              title="فهرست همین نمای فعلی؛ پس از ویرایش، از «ورود یا به‌روزرسانی از اکسل» بارگذاری کنید"
              className="px-5 py-3 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 rounded-2xl flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> خروجی اکسل
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="دسته‌بندی کارکنان">
          {VIEWS.filter((v) => !v.whenAny || view === v.id || employees.some(v.test)).map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                view === v.id ? 'bg-[#dc2626] text-white' : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
              }`}
            >
              {v.label} <span className="opacity-75">({toPersianDigits(employees.filter(v.test).length)})</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_14rem] gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو بر اساس نام، نام کاربری، سمت یا شماره..."
              aria-label="جستجوی کارکنان"
              className={`${inputClass} pr-9`}
            />
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C867A]" />
          </div>
          <SearchableSelect value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="واحد" className={inputClass}>
            <option value="">همه واحدها</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </SearchableSelect>
        </div>
        {view === 'incomplete' && (
          <p className="p-3 text-xs leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-xl">
            واحد یا سمت این همکاران ثبت نشده است. هر کدام که حساب پرتال دارد در اولین ورود خودش انتخاب می‌کند و به شما
            خبر داده می‌شود؛ می‌توانید همین حالا هم با «ویرایش» ثبتشان کنید. تا آن وقت در فیلتر واحدها و مخاطبان واحدها
            نیستند و فقط خبرهای «همه» به آن‌ها می‌رسد.
          </p>
        )}
        {view === 'hireDate' && (
          <p className="p-3 text-xs leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-xl">
            تاریخ استخدام این همکاران همان روزی است که در پرتال ثبت شده‌اند. برای همکار تازه‌وارد درست است، ولی برای کسی
            که از قبل در شرکت بوده معمولاً همان «امروزِ» پیش‌فرض فرم قدیمی است و سالگرد همکاری او را اشتباه نشان می‌دهد.
            تاریخ درست را با «ویرایش» ثبت کنید یا خالی بگذارید.
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
          <Users className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
          <p className="text-sm font-bold text-[#6E6A60]">کسی با این مشخصات پیدا نشد.</p>
        </div>
      ) : (
        <ul className="bg-white rounded-2xl border border-[#E6E0D5] divide-y divide-[#E6E0D5]">
          {shown.map((e) => {
            const isSelf = e.id === currentUser?.id;
            // Only someone holding every permission of the colleague's role changes their access; the server checks the same.
            const mayChangeAccess = !isSelf && covers(e.role);
            return (
              <li key={e.id} className={`p-3 sm:p-4 flex flex-col md:flex-row md:items-center gap-3 ${e.isActive ? '' : 'bg-stone-50'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar src={e.avatar} firstName={e.firstName} lastName={e.lastName} className={`w-11 h-11 rounded-xl text-sm shrink-0 ${e.isActive ? '' : 'opacity-60'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#2D2D2D] truncate">{e.firstName} {e.lastName}</p>
                    <p className="text-[11px] text-[#6E6A60] truncate">{placeText(e)}{e.extension ? ` · داخلی ${e.extension}` : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 md:w-64">
                  {!e.isActive && <span className={`${badge} bg-stone-200 text-stone-700`}>غیرفعال</span>}
                  {e.isActive && (!e.department || !e.position) && <span className={`${badge} bg-amber-50 text-amber-900`}>نیاز به تکمیل</span>}
                  {e.hasAccount ? (
                    <>
                      <span className={`${badge} bg-emerald-50 text-emerald-800`} dir="ltr">{e.username}</span>
                      <span className={`${badge} bg-[#F5F2ED] text-[#4B4740]`} title="روش ورود و سطح دسترسی در پرتال">
                        {e.authSource === 'ldap' ? 'ورود با ویندوز' : 'رمز پرتال'} · {roleName(e.role)}
                      </span>
                    </>
                  ) : (
                    <span className={`${badge} bg-amber-50 text-amber-900`}>بدون حساب پرتال</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setActiveTab('colleagues', e.id)} className={actionClass} aria-label={`مشاهده پروفایل ${e.firstName} ${e.lastName}`}>
                    <Eye className="w-3.5 h-3.5" /> پروفایل
                  </button>
                  <button onClick={() => setEditing(e)} className={actionClass}>
                    <Edit3 className="w-3.5 h-3.5" /> ویرایش
                  </button>
                  {mayChangeAccess && e.isActive && (
                    <button onClick={() => setAccess(e)} className={actionClass}>
                      {e.hasAccount ? <ShieldOff className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5 text-red-700" />}
                      {e.hasAccount ? 'برداشتن حساب' : 'ساختن حساب پرتال'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddEmployeeModal isOpen={adding} onClose={() => setAdding(false)} />
      {importing && <ImportEmployeesModal onClose={() => setImporting(false)} />}
      {editing && <EditProfileModal user={editing} onClose={() => setEditing(null)} />}
      {access && <AccountAccessModal user={access} onClose={() => setAccess(null)} />}
    </div>
  );
};
