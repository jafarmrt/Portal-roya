import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { UserCheck } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { errorMessage } from '../lib/api';
import { isPersian } from '../../shared/profile';
import { inputClass, labelClass, primaryButtonClass } from './common/Modal';
import { JalaliDateInput } from './common/JalaliDateInput';

/**
 * First sign-in of an AD account: Active Directory holds names in English, so the colleague enters
 * their name in Persian and their birthday before using the portal.
 */
export const CompleteProfilePage: React.FC = () => {
  const { currentUser, completeProfile, logout } = usePortal();
  // An English name from earlier (e.g. an Excel import) is not a starting point; a Persian one is.
  const [firstName, setFirstName] = useState(currentUser && isPersian(currentUser.firstName) ? currentUser.firstName : '');
  const [lastName, setLastName] = useState(currentUser && isPersian(currentUser.lastName) ? currentUser.lastName : '');
  const [birthDate, setBirthDate] = useState(currentUser?.birthDate ?? '');
  const [hideBirthday, setHideBirthday] = useState(currentUser?.hideBirthday ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPersian(firstName) || !isPersian(lastName)) return setError('نام و نام خانوادگی را با حروف فارسی بنویسید.');
    if (!birthDate) return setError('تاریخ تولد را وارد کنید.');
    setError('');
    setBusy(true);
    try {
      await completeProfile({ firstName, lastName, birthDate, hideBirthday });
      toast.success('خوش آمدید!');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E6E0D5] p-8 space-y-5">
        <div>
          <h1 className="text-lg font-black text-[#2D2D2D]">به پرتال سازمانی خوش آمدید</h1>
          <p className="text-xs text-[#6E6A60] mt-2 leading-relaxed">
            قبل از ادامه، نام و نام خانوادگی خود را به فارسی و تاریخ تولدتان را وارد کنید. همکاران شما را با همین نام در دفتر تلفن می‌بینند. بعداً هم از «ویرایش پروفایل» می‌توانید آن‌ها را تغییر دهید.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div role="alert" className="p-3 bg-red-50 text-red-800 text-xs font-bold rounded-xl border border-red-200">{error}</div>}
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
