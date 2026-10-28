import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { canPlayEffects, DAY_THEMES, previewTheme, type DayThemeKey } from '../../lib/dayTheme';
import { ThemeBannerView } from '../dashboard/DayThemeBanner';
import { ThemeEffect } from '../dashboard/ThemeEffect';

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${active ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB] hover:border-red-300'}`;

/** Shows the administrator each day's banner and plays its effect, whatever today is. */
export const DayThemePreview: React.FC = () => {
  const [key, setKey] = useState<DayThemeKey | null>(null);
  const [playing, setPlaying] = useState(false);
  const desktop = canPlayEffects();
  const theme = key ? previewTheme(key) : null;

  return (
    <div className="space-y-2 pt-1">
      <span className="flex items-center gap-1 text-[11px] font-bold text-[#6E6A60]">
        <Eye className="w-3.5 h-3.5" />
        پیش‌نمایش روزها
      </span>
      <div className="flex flex-wrap gap-1.5">
        {DAY_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={key === t.key}
            onClick={() => {
              setKey(t.key);
              setPlaying(Boolean(t.effect) && desktop);
            }}
            className={chipClass(key === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[#8C867A] leading-relaxed">
        {desktop
          ? 'افکت حدود یک دقیقه پخش می‌شود و با «توقف افکت» زودتر تمام می‌شود.'
          : 'روی گوشی و تبلت فقط بنر نشان داده می‌شود؛ افکت را روی رایانه ببینید.'}
      </p>
      {theme && <ThemeBannerView theme={theme} label={theme.tone === 'mourning' ? 'تسلیت' : 'مناسبت امروز'} />}
      {playing && theme?.effect && <ThemeEffect key={theme.key} effect={theme.effect} onDone={() => setPlaying(false)} />}
    </div>
  );
};
