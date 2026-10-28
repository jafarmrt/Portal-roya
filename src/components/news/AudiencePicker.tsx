import React, { useMemo, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { inAudience, isForEveryone, type Audience } from '../../../shared/audience';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import { inputClass, labelClass } from '../common/Modal';

const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-xl font-bold border transition-colors ${active ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB] hover:border-red-300'}`;

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

const ChipGroup: React.FC<{ title: string; options: { value: string; label: string }[]; selected: string[]; onChange: (next: string[]) => void }> = ({
  title,
  options,
  selected,
  onChange,
}) =>
  options.length === 0 ? null : (
    <div className="space-y-1.5">
      <span className="text-[11px] font-bold text-[#6E6A60]">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={selected.includes(o.value)} onClick={() => onChange(toggle(selected, o.value))} className={chipClass(selected.includes(o.value))}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

/**
 * Chooses who a news item (or document) is for: everyone, or departments / locations / roles (which
 * narrow each other) plus people by name. Shows how many colleagues will see it, counted the way the
 * server does; `authorId` (the author, or a document's owner) is not counted.
 */
export const AudiencePicker: React.FC<{ value: Audience; onChange: (next: Audience) => void; authorId: string; noun?: string }> = ({
  value,
  onChange,
  authorId,
  noun = 'خبر',
}) => {
  const { appSettings, employees, roles } = usePortal();
  const [targeted, setTargeted] = useState(!isForEveryone(value));
  const [query, setQuery] = useState('');
  const [showNames, setShowNames] = useState(false);

  const people = useMemo(() => employees.filter((e) => e.isActive && e.hasAccount), [employees]);
  const audience = useMemo(() => people.filter((p) => p.id !== authorId && inAudience(p, value)), [people, value, authorId]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const set = <K extends keyof Audience>(key: K, next: Audience[K]) => onChange({ ...value, [key]: next });

  const matches = query.trim()
    ? people
        .filter((p) => !value.userIds.includes(p.id) && `${p.firstName} ${p.lastName} ${p.position} ${p.department}`.includes(query.trim()))
        .slice(0, 6)
    : [];

  const hasGroups = value.departments.length + value.locations.length + value.roles.length > 0;
  // The chosen lists narrow each other, which is worth saying when more than one is used.
  const narrowing = [
    value.departments.length > 0 && 'واحدشان',
    value.locations.length > 0 && 'محل استقرارشان',
    value.roles.length > 0 && 'سطح دسترسی‌شان',
  ].filter(Boolean) as string[];

  return (
    <fieldset className="space-y-3">
      <legend className={`${labelClass} flex items-center gap-1.5`}>
        <Users className="w-4 h-4" /> مخاطبان
      </legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!targeted}
          onClick={() => {
            setTargeted(false);
            onChange({ departments: [], locations: [], roles: [], userIds: [] });
          }}
          className={chipClass(!targeted)}
        >
          همهٔ سازمان
        </button>
        <button type="button" aria-pressed={targeted} onClick={() => setTargeted(true)} className={chipClass(targeted)}>
          گروه یا افراد مشخص
        </button>
      </div>

      {targeted && (
        <div className="p-4 bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] space-y-3">
          <ChipGroup
            title="واحد"
            options={(appSettings?.departments ?? []).map((d) => ({ value: d, label: d }))}
            selected={value.departments}
            onChange={(next) => set('departments', next)}
          />
          <ChipGroup
            title="محل استقرار"
            options={(appSettings?.locations ?? []).map((l) => ({ value: l, label: l }))}
            selected={value.locations}
            onChange={(next) => set('locations', next)}
          />
          <ChipGroup title="سطح دسترسی" options={roles.map((r) => ({ value: r.id, label: r.name }))} selected={value.roles} onChange={(next) => set('roles', next)} />
          {narrowing.length > 1 && (
            <p className="text-[11px] text-[#6E6A60] leading-relaxed">فقط کسانی می‌بینند که {narrowing.join(' و ')} جزو انتخاب‌ها باشد.</p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="audience-person" className="text-[11px] font-bold text-[#6E6A60]">
              {hasGroups ? 'به‌اضافهٔ این افراد' : 'افراد مشخص'}
            </label>
            {value.userIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {value.userIds.map((id) => {
                  const p = byId.get(id);
                  return (
                    <span key={id} className="flex items-center gap-1 pr-3 pl-1 py-1 rounded-xl bg-white border border-[#D9D4CB] font-bold">
                      {p ? `${p.firstName} ${p.lastName}` : 'همکار غیرفعال'}
                      <button type="button" aria-label={`حذف ${p ? `${p.firstName} ${p.lastName}` : 'همکار'}`} onClick={() => set('userIds', value.userIds.filter((u) => u !== id))} className="p-0.5 text-[#8C867A] hover:text-red-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-[#8C867A] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                id="audience-person"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی نام همکار برای افزودن"
                autoComplete="off"
                className={`${inputClass} pr-9`}
              />
            </div>
            {matches.length > 0 && (
              <ul className="bg-white border border-[#E6E0D5] rounded-xl divide-y divide-[#F5F2ED] overflow-hidden">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        set('userIds', [...value.userIds, p.id]);
                        setQuery('');
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-[#F9F7F4]"
                    >
                      <span className="font-bold">{p.firstName} {p.lastName}</span>
                      <span className="text-[11px] text-[#6E6A60]"> · {p.position} · {p.department}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
        <span className={`font-bold ${audience.length === 0 ? 'text-red-700' : 'text-[#2D2D2D]'}`}>
          {audience.length === 0 ? `هیچ همکاری این ${noun} را نمی‌بیند؛ مخاطبان را تغییر دهید.` : `${toPersianDigits(audience.length)} نفر این ${noun} را می‌بینند.`}
        </span>
        {targeted && audience.length > 0 && (
          <button type="button" onClick={() => setShowNames((s) => !s)} aria-expanded={showNames} className="text-red-700 font-bold hover:underline">
            {showNames ? 'بستن فهرست' : 'دیدن نام‌ها'}
          </button>
        )}
      </div>
      {targeted && showNames && (
        <p className="text-[11px] text-[#4B4740] leading-relaxed p-3 bg-white border border-[#E6E0D5] rounded-xl max-h-32 overflow-y-auto">
          {audience.map((p) => `${p.firstName} ${p.lastName}`).join('، ')}
        </p>
      )}
    </fieldset>
  );
};
