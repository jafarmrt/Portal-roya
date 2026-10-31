import React from 'react';
import { ReactionBar } from '../common/ReactionBar';
import { Award, Cake, Sparkles } from 'lucide-react';
import { CELEBRATION_DAYS, daysSinceYearly, type WishOccasion, yearsLabel, yearsSince } from '../../../shared/celebrations';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { GreetingCard } from '../common/GreetingCard';

interface Celebration {
  occasion: WishOccasion;
  daysAgo: number;
  years: number;
}

/**
 * The portal's own greeting to the colleague on their birthday or work anniversary, with the
 * cards colleagues sent them. It stays for a week so a birthday on the weekend is not missed.
 */
export const MyCelebrationCard: React.FC = () => {
  const { currentUser, birthdayWishes, reactToWish } = usePortal();
  if (!currentUser) return null;

  const celebrations: Celebration[] = [];
  const birthdayDays = daysSinceYearly(currentUser.birthDay);
  if (birthdayDays !== null && birthdayDays < CELEBRATION_DAYS) {
    celebrations.push({ occasion: 'birthday', daysAgo: birthdayDays, years: 0 });
  }
  const anniversaryDays = daysSinceYearly(currentUser.hireDate);
  const years = yearsSince(currentUser.hireDate);
  if (anniversaryDays !== null && anniversaryDays < CELEBRATION_DAYS && years >= 1) {
    celebrations.push({ occasion: 'anniversary', daysAgo: anniversaryDays, years });
  }
  if (celebrations.length === 0) return null;

  const received = birthdayWishes[currentUser.id] ?? [];

  return (
    <div className="space-y-4">
      {celebrations.map(({ occasion, daysAgo, years }) => {
        const cards = received.filter((w) => w.occasion === occasion && w.senderId !== currentUser.id);
        const isBirthday = occasion === 'birthday';
        return (
          <section
            key={occasion}
            aria-label={isBirthday ? 'تبریک تولد شما' : 'تبریک سالگرد همکاری شما'}
            className="bg-gradient-to-l from-[#dc2626] to-[#f87171] rounded-3xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-5 -mb-5" />
            <span aria-hidden className="absolute top-3 left-4 text-4xl opacity-90 select-none">{isBirthday ? '🎂' : '🏆'}</span>

            <div className="relative z-10 flex items-start gap-4">
              <div className="p-3.5 bg-white/20 rounded-full backdrop-blur-sm border border-white/30 shadow-inner shrink-0">
                {isBirthday ? <Cake className="w-7 h-7" /> : <Award className="w-7 h-7" />}
              </div>
              <div className="min-w-0 pl-10">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-[10px] font-bold border border-white/30 mb-2">
                  <Sparkles className="w-3 h-3" />
                  {isBirthday ? (daysAgo === 0 ? 'امروز تولد شماست' : 'تولد شما') : 'تولد سازمانی'}
                </div>
                <h3 className="text-lg font-black">
                  {isBirthday
                    ? `${currentUser.firstName} عزیز، تولدت مبارک! 🎉`
                    : `${currentUser.firstName} عزیز، ${yearsLabel(years)} همراهی‌ات با رویا مبارک! 🎉`}
                </h3>
                <p className="text-xs text-white/90 mt-1 max-w-xl leading-relaxed">
                  {isBirthday
                    ? 'خانوادهٔ رویا طرح داخلی برایت سالی پر از سلامتی، شادی و موفقیت آرزو می‌کند.'
                    : `از اینکه ${yearsLabel(years)} در کنار ما هستی و با تلاش‌هایت به رشد رویا کمک می‌کنی، صمیمانه سپاسگزاریم.`}
                </p>
              </div>
            </div>

            {cards.length > 0 && (
              <div className="relative z-10 mt-5 space-y-2">
                <p className="text-xs font-bold text-white/95">
                  {toPersianDigits(cards.length)} کارت تبریک از همکاران؛ با یک واکنش جوابشان را بدهید:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {cards.map((wish) => (
                    <GreetingCard
                      key={wish.id}
                      design={wish.design}
                      occasion={wish.occasion}
                      text={wish.text}
                      senderName={wish.senderName}
                      senderAvatar={wish.senderAvatar}
                      time={wish.time}
                      isPrivate={wish.isPrivate}
                      reaction={wish.reaction}
                      onReact={(reaction) => reactToWish(wish.id, reaction)}
                      extra={
                        !wish.isPrivate && (wish.reactions?.length ?? 0) > 0 && (
                          <ReactionBar target="greeting" id={wish.id} reactions={wish.reactions} canReact={false} label="واکنش همکاران به این کارت" small />
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
