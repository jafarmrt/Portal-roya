import React, { useEffect, useState } from 'react';
import { Sparkles, Play } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { canPlayEffects, effectPlayedToday, markEffectPlayed, todayTheme, type DayTheme, type DayThemeKey } from '../../lib/dayTheme';
import { FoundingDayBanner } from './FoundingDayBanner';
import { ThemeEffect } from './ThemeEffect';

interface Look {
  background: string;
  border: string;
  accent: string;
  text: string;
  muted: string;
  /** Decorations in the corner; none on a day of mourning. */
  decorations: string[];
}

const LOOKS: Record<DayThemeKey, Look> = {
  nowruz: { background: 'linear-gradient(120deg, #ECFDF5 0%, #FDF2F8 55%, #FCE7F3 100%)', border: '#F9A8D4', accent: '#BE185D', text: '#2D2D2D', muted: '#4B4740', decorations: ['🌸', '🌱', '🐟'] },
  sizdah: { background: 'linear-gradient(120deg, #F0FDF4 0%, #DCFCE7 55%, #FEF9C3 100%)', border: '#86EFAC', accent: '#15803D', text: '#2D2D2D', muted: '#4B4740', decorations: ['🌿', '🌼', '🧺'] },
  summer: { background: 'linear-gradient(120deg, #FFFBEB 0%, #FEF3C7 50%, #FFEDD5 100%)', border: '#FCD34D', accent: '#B45309', text: '#2D2D2D', muted: '#4B4740', decorations: ['☀️', '🌻', '🍉'] },
  autumn: { background: 'linear-gradient(120deg, #FFF7ED 0%, #FFEDD5 50%, #FDE68A 100%)', border: '#FDBA74', accent: '#C2410C', text: '#2D2D2D', muted: '#4B4740', decorations: ['🍁', '🍂', '☔'] },
  yalda: { background: 'linear-gradient(120deg, #3B0A12 0%, #7F1D1D 55%, #991B1B 100%)', border: '#7F1D1D', accent: '#FCA5A5', text: '#FFFFFF', muted: '#FDE2E4', decorations: ['🍉', '🕯️', '📖'] },
  winter: { background: 'linear-gradient(120deg, #EFF6FF 0%, #E0F2FE 55%, #F1F5F9 100%)', border: '#93C5FD', accent: '#1D4ED8', text: '#2D2D2D', muted: '#475569', decorations: ['❄️', '☃️', '☕'] },
  founding: { background: 'linear-gradient(120deg, #FFF4D6 0%, #FDE7C2 45%, #FBD7C8 100%)', border: '#E9C46A', accent: '#B45309', text: '#2D2D2D', muted: '#4B4740', decorations: ['🎉', '🎊'] },
  feast: { background: 'linear-gradient(120deg, #F0FDF4 0%, #ECFDF5 50%, #FEF9C3 100%)', border: '#6EE7B7', accent: '#047857', text: '#2D2D2D', muted: '#4B4740', decorations: ['✨', '🌙'] },
  mourning: { background: 'linear-gradient(120deg, #1F1F1F 0%, #2E2E2E 100%)', border: '#3F3F3F', accent: '#D4D4D4', text: '#F5F5F5', muted: '#D4D4D4', decorations: [] },
};

/** The banner of a theme, as everyone sees it on the day and as an administrator previews it. */
export const ThemeBannerView: React.FC<{ theme: DayTheme; label: string; children?: React.ReactNode }> = ({ theme, label, children }) => {
  const look = LOOKS[theme.key];
  return (
    <section
      aria-label={label}
      data-testid="day-theme-banner"
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 border shadow-sm"
      style={{ background: look.background, borderColor: look.border, color: look.text }}
    >
      {look.decorations.map((d, i) => (
        <span
          key={d}
          aria-hidden
          className={`absolute select-none ${i === 0 ? '-top-1 left-6 text-5xl rotate-[-10deg]' : i === 1 ? 'hidden sm:block bottom-1 left-24 text-3xl rotate-[12deg] opacity-80' : 'hidden md:block top-3 left-40 text-2xl opacity-70'}`}
        >
          {d}
        </span>
      ))}
      <div className={`relative min-w-0 ${look.decorations.length ? 'pl-12 sm:pl-24 md:pl-48' : ''}`}>
        <p className="text-[11px] font-bold" style={{ color: look.accent }}>{label}</p>
        <h2 className="text-lg sm:text-xl font-black mt-0.5">{theme.title}</h2>
        {theme.message && <p className="text-xs sm:text-sm mt-1.5 leading-relaxed max-w-2xl" style={{ color: look.muted }}>{theme.message}</p>}
        {children}
      </div>
    </section>
  );
};

const linkClass = 'tap-area inline-flex items-center gap-1 text-[11px] font-bold underline-offset-2 hover:underline';

/**
 * The top of the dashboard on Nowruz, the first day of each season, Yalda, the founding day and the
 * festive official holidays: a banner for everyone, and on a computer a one-minute effect the first
 * time the dashboard opens that day. Days of mourning get a quiet banner and no effect.
 */
export const DayThemeBanner: React.FC = () => {
  const { appSettings, customHolidays, isGuest, featureOn, setOccasionEffects } = usePortal();
  const [playing, setPlaying] = useState(false);
  const enabled = featureOn('occasionThemes');
  const theme = enabled ? todayTheme(customHolidays, appSettings?.foundingDate ?? '') : null;
  const wantsEffects = appSettings?.occasionEffects !== false;
  const desktop = canPlayEffects();
  const effect = theme?.effect && desktop ? theme.effect : null;

  // Play once a day on the first visit; settings arrive after the first paint, hence the dependencies.
  useEffect(() => {
    if (!theme || !effect || !wantsEffects || !appSettings || effectPlayedToday(theme)) return;
    markEffectPlayed(theme);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme?.key, effect, wantsEffects, Boolean(appSettings)]);

  if (!enabled) return <FoundingDayBanner />;
  if (!theme) return null;

  const controls = effect && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3" style={{ color: LOOKS[theme.key].accent }}>
      {wantsEffects && !playing && (
        <button type="button" onClick={() => setPlaying(true)} className={linkClass}>
          <Play className="w-3.5 h-3.5" />
          دوباره ببینم
        </button>
      )}
      {!isGuest && (
        <button
          type="button"
          onClick={async () => {
            if (await setOccasionEffects(!wantsEffects)) setPlaying(false);
          }}
          className={linkClass}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {wantsEffects ? 'افکت مناسبت‌ها را برای من خاموش کن' : 'افکت مناسبت‌ها را برای من روشن کن'}
        </button>
      )}
    </div>
  );

  return (
    <>
      {theme.key === 'founding' ? (
        <FoundingDayBanner>{controls}</FoundingDayBanner>
      ) : (
        <ThemeBannerView theme={theme} label={theme.tone === 'mourning' ? 'تسلیت' : 'مناسبت امروز'}>
          {controls}
        </ThemeBannerView>
      )}
      {playing && effect && <ThemeEffect effect={effect} onDone={() => setPlaying(false)} />}
    </>
  );
};
