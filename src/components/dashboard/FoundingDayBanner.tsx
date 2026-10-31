import React from 'react';
import { PartyPopper } from 'lucide-react';
import { daysSinceYearly, defaultFoundingMessage, yearsLabel, yearsSince } from '../../../shared/celebrations';
import { usePortal } from '../../context/PortalContext';

/** On the company's founding day everyone, guests included, sees this greeting at the top of the dashboard. */
export const FoundingDayBanner: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { appSettings } = usePortal();
  const foundingDate = appSettings?.foundingDate ?? '';
  const years = yearsSince(foundingDate);
  if (years < 1 || daysSinceYearly(foundingDate) !== 0) return null;

  return (
    <section
      aria-label="سالگرد تأسیس شرکت"
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-ink border border-gold/60 shadow-sm"
      style={{ background: 'linear-gradient(120deg, #FFF4D6 0%, #FDE7C2 45%, #FBD7C8 100%)' }}
    >
      <span aria-hidden className="absolute -top-2 left-6 text-5xl rotate-[-10deg] select-none">🎉</span>
      <span aria-hidden className="hidden sm:block absolute bottom-1 left-24 text-3xl rotate-[12deg] opacity-70 select-none">🎊</span>
      <div className="relative flex items-start gap-4 pl-10 sm:pl-16">
        <div className="p-3.5 bg-white/70 rounded-full text-amber-700 shadow-inner shrink-0">
          <PartyPopper className="w-7 h-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-amber-700">سالگرد تأسیس رویا طرح داخلی</p>
          <h2 className="text-lg sm:text-xl font-black mt-0.5">{yearsLabel(years)} با هم؛ سالگرد تأسیس مبارک!</h2>
          <p className="text-xs sm:text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-line max-w-2xl">
            {appSettings?.foundingMessage || defaultFoundingMessage(years)}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
};
