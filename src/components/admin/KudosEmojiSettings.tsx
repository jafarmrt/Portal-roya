import React, { useState } from 'react';
import { Check, Plus, Smile, Trash2 } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { DEFAULT_KUDOS_EMOJIS, KUDOS_EMOJI_MAX, type KudosEmoji, kudosEmojis } from '../../../shared/kudos';
import type { AppSettings } from '../../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { useUnsavedChanges } from './unsavedChanges';

const same = (a: KudosEmoji[], b: KudosEmoji[]) => JSON.stringify(a) === JSON.stringify(b);

/** The ready-made emoji colleagues can send each other in «همکاران آنلاین». */
export const KudosEmojiSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
  const { updateSettings } = usePortal();
  const saved = kudosEmojis(settings.kudosEmojis);
  const [list, setList] = useState<KudosEmoji[]>(saved);
  const [busy, setBusy] = useState(false);
  const changed = !same(list, saved);
  useUnsavedChanges('kudos-emojis', changed);
  const complete = list.length > 0 && list.every((e) => e.emoji.trim() && e.label.trim());

  const edit = (index: number, field: 'emoji' | 'label', value: string) =>
    setList((l) => l.map((e, i) => (i === index ? { ...e, [field]: value } : e)));

  const save = async () => {
    setBusy(true);
    const cleaned = list.map((e) => ({ ...e, emoji: e.emoji.trim(), label: e.label.trim() }));
    // The built-in list is saved as empty, so a later change to it reaches this portal too.
    await updateSettings({ kudosEmojis: same(cleaned, DEFAULT_KUDOS_EMOJIS) ? [] : cleaned });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3" aria-labelledby="kudos-emojis-title">
      <div className="flex items-center gap-2">
        <Smile className="w-4 h-4 text-red-700" />
        <h3 id="kudos-emojis-title" className="text-sm font-black text-ink">ایموجی‌های همکاران آنلاین</h3>
      </div>
      <p className="text-xs text-muted">
        همکاران فقط همین ایموجی‌ها را می‌توانند برای هم بفرستند؛ متن آزاد وجود ندارد. برچسب در پیام گیرنده می‌آید، مثلاً «سارا احمدی برایتان 🌹 «تقدیم با گل» فرستاد». حداکثر {toPersianDigits(KUDOS_EMOJI_MAX)} مورد.
      </p>
      <ul className="space-y-2">
        {list.map((e, i) => (
          <li key={e.id} className="flex items-center gap-2">
            <input
              value={e.emoji}
              maxLength={16}
              onChange={(ev) => edit(i, 'emoji', ev.target.value)}
              aria-label={`ایموجی ${toPersianDigits(i + 1)}`}
              className={`${inputClass} !w-16 text-center text-lg`}
            />
            <input
              value={e.label}
              maxLength={40}
              onChange={(ev) => edit(i, 'label', ev.target.value)}
              aria-label={`برچسب ایموجی ${toPersianDigits(i + 1)}`}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setList((l) => l.filter((_, j) => j !== i))}
              disabled={list.length <= 1}
              aria-label={`حذف ${e.label || 'ایموجی'}`}
              className="p-2 rounded-xl text-faint hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={list.length >= KUDOS_EMOJI_MAX}
          onClick={() => setList((l) => [...l, { id: `e${Date.now().toString(36)}`, emoji: '', label: '' }])}
          className={secondaryButtonClass}
        >
          <Plus className="w-3.5 h-3.5" />
          افزودن ایموجی
        </button>
        {!same(list, DEFAULT_KUDOS_EMOJIS) && (
          <button type="button" onClick={() => setList(DEFAULT_KUDOS_EMOJIS)} className={secondaryButtonClass}>
            بازگشت به شش ایموجی پیش‌فرض
          </button>
        )}
        <button type="button" disabled={busy || !changed || !complete} onClick={() => void save()} className={`${primaryButtonClass} ms-auto`}>
          <Check className="w-3.5 h-3.5" />
          ذخیره
        </button>
      </div>
    </section>
  );
};
