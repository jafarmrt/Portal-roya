import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import { Award, Cake, ChevronDown, Mail } from 'lucide-react';
import { type WishOccasion, yearsLabel, yearsSince } from '../../../shared/celebrations';
import { Avatar } from '../common/Avatar';
import { GreetingCard } from '../common/GreetingCard';
import { daysUntilBirthday, formatBirthDay, toPersianDigits } from '../../lib/jalali';
import { EditProfileModal } from '../colleagues/EditProfileModal';
import { GreetingCardComposer } from './GreetingCardComposer';

const UPCOMING_DAYS = 14;
const ANNIVERSARY_DAYS = 7;
// Three of each at first, so the card stays about as tall as its neighbours; the rest open in place.
const MAX_SHOWN = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const ShowMore: React.FC<{ expanded: boolean; onToggle: () => void; label: string }> = ({ expanded, onToggle, label }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={expanded}
    className="tap-area w-full text-xs font-bold text-[#D97B5F] hover:underline flex items-center justify-center gap-1"
  >
    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    {expanded ? 'نمایش کمتر' : `بیشتر: ${label}`}
  </button>
);

const daysLabel = (days: number) => (days === 0 ? 'امروز 🎉' : days === 1 ? 'فردا' : `${toPersianDigits(days)} روز دیگر`);

export const BirthdayCard: React.FC = () => {
  const { employees, deleteBirthdayWish, birthdayWishes, currentUser, can, isGuest } = usePortal();
  const [composing, setComposing] = useState<{ colleague: UserProfile; occasion: WishOccasion; years?: number } | null>(null);
  const [editingOwnProfile, setEditingOwnProfile] = useState(false);
  const [allBirthdaysShown, setAllBirthdaysShown] = useState(false);
  const [allAnniversariesShown, setAllAnniversariesShown] = useState(false);

  // Every known birthday, soonest first; the card lists today and the next two weeks.
  const allBirthdays = employees
    .filter(e => e.isActive)
    .map(e => ({ emp: e, days: daysUntilBirthday(e.birthDay) }))
    .filter((x): x is { emp: UserProfile; days: number } => x.days !== null)
    .sort((a, b) => a.days - b.days);
  const birthdayColleagues = allBirthdays.filter((x) => x.days <= UPCOMING_DAYS);
  const nextBirthday = allBirthdays[0];
  const missingOwnBirthday = Boolean(currentUser && !currentUser.birthDate);
  // Work anniversaries today and in the coming week, for colleagues who did not opt out.
  const anniversaries = employees
    .filter(e => e.isActive && !e.hideAnniversary && e.hireDate)
    .map(e => {
      const days = daysUntilBirthday(e.hireDate);
      return { emp: e, days, years: days === null ? 0 : yearsSince(e.hireDate, new Date(Date.now() + days * DAY_MS)) };
    })
    .filter((x): x is { emp: UserProfile; days: number; years: number } => x.days !== null && x.days <= ANNIVERSARY_DAYS && x.years >= 1)
    .sort((a, b) => a.days - b.days);

  const cardsFor = (emp: UserProfile, occasion: WishOccasion) => (birthdayWishes[emp.id] ?? []).filter(w => w.occasion === occasion);

  const renderCards = (emp: UserProfile, occasion: WishOccasion) => {
    const cards = cardsFor(emp, occasion);
    if (cards.length === 0) return null;
    return (
      <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar pt-2 border-t border-[#E6E0D5]">
        {cards.map(wish => (
          <GreetingCard
            key={wish.id}
            compact
            design={wish.design}
            occasion={wish.occasion}
            text={wish.text}
            senderName={wish.senderName}
            senderAvatar={wish.senderAvatar}
            time={wish.time}
            isPrivate={wish.isPrivate}
            reaction={wish.reaction}
            onDelete={wish.senderId === currentUser?.id || can('comments.moderate') ? () => deleteBirthdayWish(wish.id) : undefined}
          />
        ))}
      </div>
    );
  };

  const sendButton = (emp: UserProfile, occasion: WishOccasion, years?: number) =>
    emp.id !== currentUser?.id && (
      <button
        type="button"
        onClick={() => setComposing({ colleague: emp, occasion, years })}
        className="w-full px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#D97B5F] hover:bg-[#C2684D] text-white shadow-xs flex items-center justify-center gap-1.5"
      >
        <Mail className="w-3.5 h-3.5" />
        ارسال کارت تبریک
      </button>
    );

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-[#FBF0EC] text-[#D97B5F] rounded-2xl">
            <Cake className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">زادروز همکاران رویا 🎂</h3>
            <p className="text-xs text-[#6E6A60]">تولدها و سالگردهای همکاری پیش‌رو</p>
          </div>
        </div>
        {birthdayColleagues.length > 0 && (
          <span className="text-xs bg-[#FBF0EC] text-[#D97B5F] px-3 py-1 rounded-full font-bold border border-[#D97B5F]/30">
            {toPersianDigits(birthdayColleagues.length)} همکار
          </span>
        )}
      </div>

      {missingOwnBirthday && (
        <div className="p-3 bg-[#FBF0EC]/60 rounded-2xl border border-dashed border-[#D97B5F]/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#6E6A60]">تاریخ تولد شما ثبت نشده است. ثبت کنید تا همکاران روز تولدتان را بدانند.</span>
          <button type="button" onClick={() => setEditingOwnProfile(true)} className="px-3 py-1.5 bg-[#D97B5F] hover:bg-[#C2684D] text-white font-bold rounded-xl">
            ثبت تاریخ تولد
          </button>
        </div>
      )}
      {editingOwnProfile && currentUser && <EditProfileModal user={currentUser} onClose={() => setEditingOwnProfile(false)} />}

      {isGuest ? (
        <p className="py-4 text-center text-xs text-[#6E6A60] leading-relaxed">تولد همکاران پس از ورود به پرتال نمایش داده می‌شود.</p>
      ) : birthdayColleagues.length === 0 ? (
        <div className="py-4 text-center space-y-1.5">
          <p className="text-xs text-[#6E6A60]">در دو هفتهٔ آینده تولدی در پیش نیست.</p>
          {nextBirthday && (
            <p className="text-xs text-[#2D2D2D]">
              نزدیک‌ترین تولد: <strong>{nextBirthday.emp.firstName} {nextBirthday.emp.lastName}</strong>، {formatBirthDay(nextBirthday.emp.birthDay)} ({daysLabel(nextBirthday.days)})
            </p>
          )}
        </div>
      ) : (
      <div className="space-y-3">
        {(allBirthdaysShown ? birthdayColleagues : birthdayColleagues.slice(0, MAX_SHOWN)).map(({ emp, days }) => (
          <div key={emp.id} className="p-3 bg-[#F5F2ED]/70 rounded-2xl border border-[#E6E0D5] space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-10 h-10 rounded-full border-2 border-[#D97B5F] shadow-xs text-xs" />
                <div>
                  <h4 className="text-sm font-bold text-[#2D2D2D]">
                    {emp.firstName} {emp.lastName}
                  </h4>
                  <p className="text-xs text-[#6E6A60]">{emp.position} | {emp.department}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-black text-[#D97B5F] bg-[#FBF0EC] px-2.5 py-1 rounded-xl border border-[#D97B5F]/20">
                  {daysLabel(days)}
                </span>
                <div className="text-[10px] text-[#8C867A] mt-1">{formatBirthDay(emp.birthDay)}</div>
              </div>
            </div>

            {sendButton(emp, 'birthday')}
            {renderCards(emp, 'birthday')}
          </div>
        ))}
        {birthdayColleagues.length > MAX_SHOWN && (
          <ShowMore expanded={allBirthdaysShown} onToggle={() => setAllBirthdaysShown((s) => !s)} label={`${toPersianDigits(birthdayColleagues.length - MAX_SHOWN)} تولد دیگر`} />
        )}
      </div>
      )}

      {!isGuest && anniversaries.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-[#E6E0D5]">
          <h4 className="flex items-center gap-1.5 text-sm font-black text-[#2D2D2D]">
            <Award className="w-4 h-4 text-[#D97B5F]" />
            سالگرد همکاری
          </h4>
          {(allAnniversariesShown ? anniversaries : anniversaries.slice(0, MAX_SHOWN)).map(({ emp, days, years }) => (
            <div key={emp.id} className="p-3 bg-[#F5F2ED]/70 rounded-2xl border border-[#E6E0D5] space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-10 h-10 rounded-full border-2 border-[#D97B5F]/60 text-xs" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#2D2D2D] truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-[11px] text-[#6E6A60]">{yearsLabel(years)} همراهی با رویا</p>
                  </div>
                </div>
                <span className="text-xs font-black text-[#D97B5F] bg-[#FBF0EC] px-2.5 py-1 rounded-xl border border-[#D97B5F]/20 whitespace-nowrap">
                  {daysLabel(days)}
                </span>
              </div>
              {sendButton(emp, 'anniversary', years)}
              {renderCards(emp, 'anniversary')}
            </div>
          ))}
          {anniversaries.length > MAX_SHOWN && (
            <ShowMore expanded={allAnniversariesShown} onToggle={() => setAllAnniversariesShown((s) => !s)} label={`${toPersianDigits(anniversaries.length - MAX_SHOWN)} سالگرد دیگر`} />
          )}
        </div>
      )}

      {composing && (
        <GreetingCardComposer
          colleague={composing.colleague}
          occasion={composing.occasion}
          years={composing.years}
          onClose={() => setComposing(null)}
        />
      )}
    </div>
  );
};
