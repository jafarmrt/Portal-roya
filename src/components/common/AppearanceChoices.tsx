import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { setTextSize, setTheme, useAppearance, type TextSize, type Theme } from '../../lib/appearance';

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

const optionClass = (active: boolean) =>
  `flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 whitespace-nowrap rounded-lg text-xs font-bold transition-colors ${
    active ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'
  }`;

/** Dark mode and text size, for this device only. */
export const AppearanceChoices: React.FC = () => {
  const { theme, textSize } = useAppearance();
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
    </div>
  );
};
