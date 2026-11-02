import React, { useId, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { Avatar } from '../common/Avatar';
import { inputClass, labelClass } from '../common/Modal';
import { normalizeForSearch } from '../../../shared/search';
import { toPersianDigits } from '../../lib/jalali';

interface PeoplePickerProps {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  max: number;
  /** People who cannot be picked, with the reason shown next to their name. */
  unavailable?: Map<string, string>;
  /** Only colleagues who can sign in (organizers, jurors); otherwise phone-book-only colleagues too. */
  accountsOnly?: boolean;
  hint?: string;
  /** Shown first and cannot be removed (e.g. the team's captain). */
  fixed?: string[];
}

/** Picks a few colleagues by typing part of a name, unit or job. */
export const PeoplePicker: React.FC<PeoplePickerProps> = ({ label, value, onChange, max, unavailable, accountsOnly, hint, fixed = [] }) => {
  const { employees } = usePortal();
  const id = useId();
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  const matches =
    words.length === 0
      ? []
      : employees
          .filter((e) => e.isActive && (!accountsOnly || e.hasAccount) && !value.includes(e.id) && !fixed.includes(e.id))
          .filter((e) => {
            const text = normalizeForSearch(`${e.firstName} ${e.lastName} ${e.position} ${e.department}`);
            return words.every((w) => text.includes(w));
          })
          .slice(0, 8);
  const full = value.length + fixed.length >= max;

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} <span className="font-normal text-faint">({toPersianDigits(value.length + fixed.length)} از {toPersianDigits(max)})</span>
      </label>
      {(fixed.length > 0 || value.length > 0) && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {[...fixed, ...value].map((pid) => {
            const p = byId.get(pid);
            const locked = fixed.includes(pid);
            return (
              <li key={pid} className="flex items-center gap-1.5 ps-1 pe-2 py-1 rounded-full bg-surface border border-line text-xs">
                <Avatar src={p?.avatar} firstName={p?.firstName ?? '؟'} lastName={p?.lastName ?? ''} className="w-6 h-6 rounded-full" />
                <span className="font-bold">{p ? `${p.firstName} ${p.lastName}` : 'همکار'}</span>
                {!locked && (
                  <button type="button" onClick={() => onChange(value.filter((v) => v !== pid))} className="p-0.5 rounded-full hover:bg-line" aria-label={`برداشتن ${p?.firstName ?? ''}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!full && (
        <div className="relative">
          <Search className="w-4 h-4 text-faint absolute top-1/2 -translate-y-1/2 right-3" aria-hidden />
          <input
            id={id}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام، واحد یا سمت همکار را بنویسید"
            className={`${inputClass} pr-9`}
            autoComplete="off"
          />
        </div>
      )}
      {matches.length > 0 && (
        <ul className="mt-1 border border-line rounded-xl divide-y divide-line bg-white overflow-hidden" role="listbox" aria-label="همکاران پیدا شده">
          {matches.map((e) => {
            const reason = unavailable?.get(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={Boolean(reason)}
                  onClick={() => {
                    onChange([...value, e.id]);
                    setQuery('');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-surface disabled:opacity-50 disabled:hover:bg-white"
                >
                  <Avatar src={e.avatar} firstName={e.firstName} lastName={e.lastName} className="w-7 h-7 rounded-full" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-ink truncate">
                      {e.firstName} {e.lastName}
                    </span>
                    <span className="block text-[11px] text-muted truncate">{reason ?? `${e.position} · ${e.department}`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
};
