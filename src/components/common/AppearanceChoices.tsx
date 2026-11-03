import React from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { setAccent, setTextSize, setTheme, useAppearance, type Accent, type TextSize, type Theme } from '../../lib/appearance';

const THEMES: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'روشن', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'dark', label: 'تیره', icon: <Moon className="w-3.5 h-3.5" /> },
  { id: 'system', label: 'خودکار', icon: <Monitor className="w-3.5 h-3.5" /> },
];

const SIZES: { id: TextSize; label: string; sample: string }[] = [
  { id: 'normal', label: 'متن معمولی', sample: 'text-xs' },
  { id: 'large', label: 'متن درشت', sample: 'text-sm' },
  { id: 'larger', label: 'متن درشت‌تر', sample: 'text-base' },
];

/** Each colour's swatch shows its own button shade (the same values as --accent-700 in index.css). */
const ACCENT_CHOICES: { id: Accent; label: string; swatch: string }[] = [
  { id: 'roya', label: 'زرشکی رویا', swatch: 'oklch(49.5% 0.2 22)' },
  { id: 'graphite', label: 'گرافیتی', swatch: 'oklch(38% 0.016 260)' },
  { id: 'navy', label: 'سرمه‌ای', swatch: 'oklch(44% 0.175 264)' },
  { id: 'teal', label: 'فیروزه‌ای', swatch: 'oklch(48.5% 0.093 186.4)' },
  { id: 'green', label: 'سبز', swatch: 'oklch(46.5% 0.11 153)' },
  { id: 'violet', label: 'بنفش', swatch: 'oklch(46% 0.2 304)' },
];

const optionClass = (active: boolean) =>
  `flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 whitespace-nowrap rounded-lg text-xs font-bold transition-colors ${
    active ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'
  }`;

/** Dark mode, text size and the person's own colour, for this device only. */
export const AppearanceChoices: React.FC = () => {
  const { theme, textSize, accent } = useAppearance();
  const current = ACCENT_CHOICES.find((a) => a.id === accent) ?? ACCENT_CHOICES[0];
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-xs font-bold text-muted">ظاهر پرتال روی این دستگاه</div>
      <div className="flex p-0.5 rounded-xl bg-surface" role="group" aria-label="روشن یا تیره">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-pressed={theme === t.id}
            title={t.id === 'system' ? 'روشن یا تیره، مثل تنظیم خود دستگاه' : undefined}
            className={optionClass(theme === t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex p-0.5 rounded-xl bg-surface" role="group" aria-label="اندازهٔ متن">
        {SIZES.map((s) => (
          <button key={s.id} type="button" onClick={() => setTextSize(s.id)} aria-pressed={textSize === s.id} aria-label={s.label} title={s.label} className={optionClass(textSize === s.id)}>
            <span className={`${s.sample} font-black leading-none`}>الف</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted">
          رنگ پرتال: <span className="font-bold text-ink">{current.label}</span>
        </div>
        <div className="flex items-center justify-between px-1" role="radiogroup" aria-label="رنگ پرتال">
          {ACCENT_CHOICES.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={accent === a.id}
              aria-label={a.label}
              title={a.label}
              onClick={() => setAccent(a.id)}
              style={{ backgroundColor: a.swatch }}
              className={`tap-area w-6 h-6 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 ${
                accent === a.id ? 'outline-2 outline-offset-2 outline-ink-soft' : ''
              }`}
            >
              {/* Wrapped so the touch rule for icon-only buttons does not enlarge just the chosen one. */}
              <span aria-hidden>{accent === a.id && <Check className="w-3.5 h-3.5" strokeWidth={3} />}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
