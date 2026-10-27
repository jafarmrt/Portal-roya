import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { LayoutTemplate, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { NewsInput, NewsTemplate, NewsTemplateInput } from '../../types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

/** "[روز و تاریخ]": a blank of a template that the publisher fills in. */
const BLANK = /\[([^[\]<>\n]{1,40})\]/g;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The blanks still in the title, summary or text, in order of appearance. */
export const blanksIn = (form: Pick<NewsInput, 'title' | 'summary' | 'content'>) => [
  ...new Set([form.title, form.summary, form.content].flatMap((text) => [...text.matchAll(BLANK)].map((m) => m[1].trim()))),
];

/** Ready-made announcements to start a new item from (holiday, working hours, outage...). */
export const TemplatePicker: React.FC<{ onPick: (template: NewsTemplate) => void }> = ({ onPick }) => {
  const [templates, setTemplates] = useState<NewsTemplate[]>([]);
  const [managing, setManaging] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () =>
    api
      .get<NewsTemplate[]>('/api/news-templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  useEffect(() => {
    void load();
  }, []);

  const remove = async (template: NewsTemplate) => {
    try {
      await api.delete(`/api/news-templates/${template.id}`);
      toast.success(`قالب «${template.name}» حذف شد.`);
      setConfirmId(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (templates.length === 0) return null;
  return (
    <section aria-labelledby="news-templates-title" className="p-3 bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="news-templates-title" className="text-xs font-black text-[#2D2D2D] flex items-center gap-1.5">
          <LayoutTemplate className="w-4 h-4 text-red-700" /> شروع از قالب آماده
        </h3>
        <button
          type="button"
          onClick={() => {
            setManaging((m) => !m);
            setConfirmId(null);
          }}
          className="text-[11px] font-bold text-red-700 hover:underline"
        >
          {managing ? 'پایان مدیریت قالب‌ها' : 'مدیریت قالب‌ها'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {templates.map((t) =>
          managing ? (
            <span key={t.id} className="inline-flex items-center gap-1 pr-3 pl-1 py-1 rounded-xl bg-white border border-[#D9D4CB] text-xs font-bold">
              {t.name}
              {confirmId === t.id ? (
                <button type="button" onClick={() => remove(t)} className="px-2 py-0.5 rounded-lg bg-red-700 text-white text-[11px]">
                  حذف شود
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmId(t.id)} aria-label={`حذف قالب ${t.name}`} className="p-0.5 text-[#8C867A] hover:text-red-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#D9D4CB] hover:border-red-400 text-xs font-bold text-[#2D2D2D]"
            >
              {t.name}
            </button>
          ),
        )}
      </div>
      <p className="text-[11px] text-[#6E6A60]">با انتخاب قالب، عنوان و متن آن در فرم می‌آید و فقط جاهای خالی [داخل کروشه] را پر می‌کنید.</p>
    </section>
  );
};

/** One field per blank; filling them replaces every [blank] in the title, summary and text. */
export const PlaceholderPanel: React.FC<{ form: NewsInput; onFill: (next: Partial<NewsInput>) => void }> = ({ form, onFill }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const blanks = blanksIn(form);
  if (blanks.length === 0) return null;

  const apply = () => {
    const value = (name: string) => values[name]?.trim() ?? '';
    if (!blanks.some(value)) {
      toast.error('دست‌کم یکی از جاهای خالی را پر کنید.');
      return;
    }
    const swap = (text: string, html: boolean) =>
      text.replace(BLANK, (match, name: string) => (value(name.trim()) ? (html ? escapeHtml(value(name.trim())) : value(name.trim())) : match));
    onFill({ title: swap(form.title, false), summary: swap(form.summary, false), content: swap(form.content, true) });
    setValues({});
  };

  return (
    <fieldset className="p-4 rounded-2xl border border-amber-300 bg-amber-50 space-y-3">
      <legend className="text-xs font-black text-amber-900 px-1">جاهای خالی را پر کنید</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {blanks.map((name, i) => (
          <div key={name}>
            <label htmlFor={`news-blank-${i}`} className={labelClass}>{name}</label>
            <input
              id={`news-blank-${i}`}
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                }
              }}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-amber-900">تا پر نشوند، همین [کروشه‌ها] در اطلاعیه منتشر می‌شوند.</p>
        <button type="button" onClick={apply} className={primaryButtonClass}>جای‌گذاری در متن</button>
      </div>
    </fieldset>
  );
};

/** Keeps the current text as a template; a template with the same name is replaced. */
export const SaveAsTemplate: React.FC<{ form: NewsInput; suggestedName: string }> = ({ form, suggestedName }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState<NewsTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const existing = templates.find((t) => t.name === name.trim());

  const start = () => {
    setName(suggestedName || form.title);
    setOpen(true);
    api
      .get<NewsTemplate[]>('/api/news-templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));
  };

  const save = async () => {
    const body: NewsTemplateInput = {
      name: name.trim(),
      title: form.title.trim(),
      summary: form.summary,
      content: form.content,
      category: form.category,
      isUrgent: form.isUrgent,
      requiresAck: form.requiresAck,
      tags: form.tags,
    };
    if (!body.name || !body.title) {
      toast.error('نام قالب و عنوان اطلاعیه را بنویسید.');
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.put(`/api/news-templates/${existing.id}`, body);
      else await api.post('/api/news-templates', body);
      toast.success(existing ? `قالب «${body.name}» به‌روز شد.` : `قالب «${body.name}» ذخیره شد.`);
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button type="button" onClick={start} className="flex items-center gap-1.5 text-xs font-bold text-red-700 hover:underline">
        <LayoutTemplate className="w-4 h-4" /> ذخیره به عنوان قالب برای دفعه‌های بعد
      </button>
    );
  }
  return (
    <div className="p-3 bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] space-y-2">
      <label htmlFor="news-template-name" className={labelClass}>نام قالب</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="news-template-name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
          className={inputClass}
        />
        <button type="button" onClick={save} disabled={busy} className={`${primaryButtonClass} whitespace-nowrap`}>
          {existing ? 'جایگزینی قالب' : 'ذخیرهٔ قالب'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>انصراف</button>
      </div>
      {existing && <p className="text-[11px] text-amber-900">قالبی با همین نام هست و با متن فعلی جایگزین می‌شود.</p>}
      <p className="text-[11px] text-[#6E6A60] leading-relaxed">
        عنوان، خلاصه، متن، دسته‌بندی، برچسب‌ها و گزینه‌های «فوری» و «بخشنامه» در قالب ذخیره می‌شوند. جاهایی را که هر بار عوض می‌شوند داخل کروشه بنویسید، مثلاً [تاریخ].
      </p>
    </div>
  );
};
