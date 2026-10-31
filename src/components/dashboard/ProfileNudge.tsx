import React, { useState } from 'react';
import { IdCard, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { profileCompleteness } from '../../../shared/aboutMe';
import { FIRST_WEEK_CLOSED, inFirstWeeks } from '../../../shared/firstWeek';
import { toPersianDigits } from '../../lib/jalali';
import { EditProfileModal } from '../colleagues/EditProfileModal';

const LATER_DAYS = 14;
const laterKey = (id: string) => `roya.profileNudgeLater.${id}`;

const hiddenUntil = (id: string) => {
  try {
    return Number(localStorage.getItem(laterKey(id)) ?? 0);
  } catch {
    return 0;
  }
};

/**
 * A private, gentle reminder on one's own dashboard: what is still missing from one's card (photo,
 * extension, mobile, «دربارهٔ من»). Only the person sees it; «بعداً» hides it for two weeks on this
 * device, and it goes away for good once the card is complete.
 */
export const ProfileNudge: React.FC = () => {
  const { currentUser, newColleagues, appSettings, featureOn } = usePortal();
  const [editing, setEditing] = useState(false);
  const [later, setLater] = useState(() => (currentUser ? hiddenUntil(currentUser.id) > Date.now() : true));
  if (!currentUser) return null;
  const { percent, missing } = profileCompleteness(currentUser);
  // A new colleague's «هفتهٔ اول من» already asks for the same things.
  const intro = newColleagues.find((nc) => nc.userId === currentUser.id);
  const firstWeekOpen = featureOn('firstWeek') && inFirstWeeks(intro?.createdAt) && !appSettings?.firstWeekDone?.includes(FIRST_WEEK_CLOSED);
  if (editing) return <EditProfileModal user={currentUser} onClose={() => setEditing(false)} />;
  if (missing.length === 0 || later || firstWeekOpen) return null;

  const hide = () => {
    try {
      localStorage.setItem(laterKey(currentUser.id), String(Date.now() + LATER_DAYS * 864e5));
    } catch {
      // Private mode: hidden until the page is reloaded.
    }
    setLater(true);
  };

  return (
    <section className="relative bg-white border border-line/70 shadow-card rounded-3xl p-4 space-y-3" aria-labelledby="profile-nudge-title">
      <button type="button" onClick={hide} aria-label="بعداً" title="بعداً (دو هفته دیگر دوباره)" className="absolute top-3 left-3 p-1.5 rounded-lg text-faint hover:text-ink hover:bg-surface">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-3 pl-8">
        <div className="relative w-11 h-11 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-surface-strong" />
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-warm" strokeDasharray={`${(percent / 100) * 97.4} 97.4`} />
          </svg>
          <IdCard className="absolute inset-0 m-auto w-4 h-4 text-warm-strong" />
        </div>
        <div className="min-w-0">
          <h2 id="profile-nudge-title" className="text-sm font-black text-ink">
            {percent === 0 ? 'کارت همکاری‌تان را کامل کنید' : `کارت شما ${toPersianDigits(percent)}٪ کامل است`}
          </h2>
          <p className="text-xs text-muted leading-relaxed">مانده: {missing.map((m) => m.label).join('، ')}. فقط خودتان این را می‌بینید.</p>
        </div>
      </div>
      <button type="button" onClick={() => setEditing(true)} className="w-full py-2 rounded-xl bg-warm-soft hover:bg-warm/20 text-warm-strong text-xs font-bold transition-colors">
        تکمیل کارت من
      </button>
    </section>
  );
};
