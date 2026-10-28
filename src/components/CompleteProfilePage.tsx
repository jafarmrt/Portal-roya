import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { UserCheck } from 'lucide-react';
import { type PhoneBookMatch, usePortal } from '../context/PortalContext';
import { errorMessage } from '../lib/api';
import { isPersian, placeText, profileGaps } from '../../shared/profile';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from './common/Modal';
import { JalaliDateInput } from './common/JalaliDateInput';

/**
 * First sign-in: an AD account enters its name in Persian (AD holds names in English) and its birthday,
 * and anyone without a unit or position picks their own before using the portal.
 */
export const CompleteProfilePage: React.FC = () => {
  const { currentUser, completeProfile, logout, appSettings } = usePortal();
  const gaps = currentUser ? profileGaps(currentUser) : { names: true, department: true, position: true };
  // An English name from earlier (e.g. an Excel import) is not a starting point; a Persian one is.
  const [firstName, setFirstName] = useState(currentUser && isPersian(currentUser.firstName) ? currentUser.firstName : '');
  const [lastName, setLastName] = useState(currentUser && isPersian(currentUser.lastName) ? currentUser.lastName : '');
  const [birthDate, setBirthDate] = useState(currentUser?.birthDate ?? '');
  const [hideBirthday, setHideBirthday] = useState(currentUser?.hideBirthday ?? false);
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // People already in the phone book under this name, asked about before a second entry is made.
  const [matches, setMatches] = useState<PhoneBookMatch[] | null>(null);

  const save = async (claim?: string | null) => {
    setError('');
    setBusy(true);
    try {
      const found = await completeProfile({
        firstName,
        lastName,
        birthDate,
        hideBirthday,
        claim,
        ...(gaps.department ? { department } : {}),
        ...(gaps.position ? { position: position.trim() } : {}),
      });
      if (found) setMatches(found);
      else toast.success('خوش آمدید!');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (gaps.names && (!isPersian(firstName) || !isPersian(lastName))) return setError('نام و نام خانوادگی را با حروف فارسی بنویسید.');
    if (gaps.names && !birthDate) return setError('تاریخ تولد را وارد کنید.');
    if (gaps.department && !department) return setError('واحد خود را انتخاب کنید.');
    if (gaps.position && !position.trim()) return setError('سمت خود را بنویسید.');
    void save();
  };

  if (matches) {
    return (
      <main className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E6E0D5] p-8 space-y-5">
          <div>
            <h1 className="text-lg font-black text-[#2D2D2D]">این شما هستید؟</h1>
            <p className="text-xs text-[#6E6A60] mt-2 leading-relaxed">
              نام «{firstName} {lastName}» از قبل در دفتر تلفن پرتال هست. اگر خودتان هستید انتخابش کنید تا حساب شما به همان ردیف وصل شود و ردیف تکراری ساخته نشود.
            </p>
          </div>
          {error && <div role="alert" className="p-3 bg-red-50 text-red-800 text-xs font-bold rounded-xl border border-red-200">{error}</div>}
          <div className="space-y-2">
            {matches.map((m) => (
              <button key={m.id} type="button" disabled={busy} onClick={() => void save(m.id)} className="w-full text-right p-3 rounded-2xl border border-[#E6E0D5] hover:border-red-700 hover:bg-red-50/40 disabled:opacity-60">
                <span className="block text-sm font-bold text-[#2D2D2D]">بله، من {m.name} هستم</span>
                <span className="block text-[11px] text-[#6E6A60] mt-0.5">{placeText(m, '، ')}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => void save(null)} className={secondaryButtonClass}>
              {matches.length > 1 ? 'هیچ‌کدام من نیستم' : 'نه، من نیستم'}
            </button>
            <button type="button" disabled={busy} onClick={() => setMatches(null)} className="text-xs text-[#7A756D] hover:text-red-700 underline">
              بازگشت
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E6E0D5] p-8 space-y-5">
        <div>
          <h1 className="text-lg font-black text-[#2D2D2D]">به پرتال سازمانی خوش آمدید</h1>
          <p className="text-xs text-[#6E6A60] mt-2 leading-relaxed">
            {gaps.names
              ? 'قبل از ادامه، نام و نام خانوادگی خود را به فارسی و تاریخ تولدتان را وارد کنید. همکاران شما را با همین نام در دفتر تلفن می‌بینند. بعداً هم از «ویرایش پروفایل» می‌توانید آن‌ها را تغییر دهید.'
              : 'قبل از ادامه، بگویید در کدام واحد و با چه سمتی کار می‌کنید تا همکاران شما را در دفتر تلفن پیدا کنند و خبرهای واحدتان به شما برسد.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div role="alert" className="p-3 bg-red-50 text-red-800 text-xs font-bold rounded-xl border border-red-200">{error}</div>}
          {gaps.names && (
            <>
              <div>
                <label htmlFor="profile-first" className={labelClass}>نام</label>
                <input id="profile-first" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="profile-last" className={labelClass}>نام خانوادگی</label>
                <input id="profile-last" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="profile-birth" className={labelClass}>تاریخ تولد</label>
                <JalaliDateInput id="profile-birth" value={birthDate} onChange={setBirthDate} required defaultYear={1370} />
                <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#6E6A60] cursor-pointer">
                  <input type="checkbox" checked={hideBirthday} onChange={(e) => setHideBirthday(e.target.checked)} className="accent-red-700" />
                  تولدم به همکاران نمایش داده نشود
                </label>
                <p className="mt-1 text-[10px] text-[#8C867A]">سال تولد به همکاران نشان داده نمی‌شود؛ فقط روز و ماه.</p>
              </div>
            </>
          )}
          {(gaps.department || gaps.position) && (
            <fieldset className="p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
              <legend className="text-xs font-black px-1 text-[#2D2D2D]">جایگاه سازمانی</legend>
              {gaps.department && (
                <div>
                  <label htmlFor="profile-department" className={labelClass}>واحد</label>
                  <select id="profile-department" required value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass}>
                    <option value="" disabled>انتخاب کنید</option>
                    {appSettings?.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              {gaps.position && (
                <div>
                  <label htmlFor="profile-position" className={labelClass}>سمت</label>
                  <input id="profile-position" required maxLength={100} placeholder="مثلاً کارشناس فروش" value={position} onChange={(e) => setPosition(e.target.value)} className={inputClass} />
                </div>
              )}
              <p className="text-[10px] text-[#8C867A] leading-relaxed">
                واحد و سمت شما برای کسی که کارکنان را مدیریت می‌کند فرستاده می‌شود تا اگر لازم بود اصلاح کند. بعد از این، تغییرشان با او است.
              </p>
            </fieldset>
          )}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              <UserCheck className="w-4 h-4" />
              <span>{busy ? 'در حال ذخیره...' : 'ذخیره و ورود به پرتال'}</span>
            </button>
          </div>
        </form>
        <button type="button" onClick={() => void logout()} className="text-xs text-[#7A756D] hover:text-red-700 underline">
          خروج
        </button>
      </div>
    </main>
  );
};
