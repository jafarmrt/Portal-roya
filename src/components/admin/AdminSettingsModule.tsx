import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Settings, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { AppSettings } from '../../types';
import { inputClass, primaryButtonClass } from '../common/Modal';

type ListKey = 'departments' | 'newsCategories' | 'trainingCategories' | 'documentCategories';

const SECTIONS: { key: ListKey; title: string; hint: string }[] = [
  { key: 'departments', title: 'واحدهای سازمانی', hint: 'در پروفایل همکاران، هدف‌گیری اخبار و نظرسنجی‌ها استفاده می‌شود.' },
  { key: 'newsCategories', title: 'دسته‌های اخبار و اطلاعیه‌ها', hint: 'فیلترهای صفحهٔ اخبار.' },
  { key: 'documentCategories', title: 'دسته‌های اسناد و فرم‌ها', hint: 'گروه‌بندی کتابخانهٔ اسناد.' },
  { key: 'trainingCategories', title: 'دسته‌های دوره‌های آموزشی', hint: 'فیلترهای صفحهٔ آموزش.' },
];

const ListEditor: React.FC<{ settings: AppSettings; section: (typeof SECTIONS)[number] }> = ({ settings, section }) => {
  const { updateSettings } = usePortal();
  const [items, setItems] = useState<string[]>(settings[section.key]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(items) !== JSON.stringify(settings[section.key]);

  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    setItems([...items, value]);
    setDraft('');
  };
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setItems(next);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3">
      <div>
        <h3 className="text-sm font-black text-[#2D2D2D]">{section.title}</h3>
        <p className="text-[11px] text-[#6E6A60]">{section.hint}</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-1 p-2 bg-[#F5F2ED] rounded-xl text-xs font-bold">
            <span className="flex-1">{item}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`بالا بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`پایین بردن ${item}`} className="p-1 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            <button onClick={() => setItems(items.filter((x) => x !== item))} disabled={items.length === 1} aria-label={`حذف ${item}`} className="p-1 text-red-700 disabled:opacity-30"><X className="w-3.5 h-3.5" /></button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input aria-label={`مورد جدید در ${section.title}`} value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} placeholder="مورد جدید" className={inputClass} />
        <button type="submit" className="px-3 rounded-xl bg-[#F5F2ED] hover:bg-[#E6E0D5]" aria-label="افزودن"><Plus className="w-4 h-4" /></button>
      </form>
      {dirty && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#8C867A]">حذف یک مورد، داده‌های قبلی را تغییر نمی‌دهد.</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await updateSettings({ [section.key]: items });
              setBusy(false);
            }}
            className={primaryButtonClass}
          >
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      )}
    </section>
  );
};

export const AdminSettingsModule: React.FC = () => {
  const { appSettings } = usePortal();
  if (!appSettings) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#2D2D2D]">تنظیمات پرتال</h2>
          <p className="text-sm text-[#6E6A60]">فهرست واحدها و دسته‌بندی‌ها. سامانه‌های سازمانی از صفحهٔ «سامانه‌ها» ویرایش می‌شوند.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SECTIONS.map((s) => <ListEditor key={`${s.key}-${appSettings[s.key].join('|')}`} settings={appSettings} section={s} />)}
      </div>
    </div>
  );
};
