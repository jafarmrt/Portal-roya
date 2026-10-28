import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Search, ToggleRight, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { FEATURE_STATES, type FeatureKey, type FeatureState } from '../../../shared/features';
import { ADMIN_ROLE_ID } from '../../../shared/permissions';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/jalali';
import { inputClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface FeatureRow {
  key: FeatureKey;
  label: string;
  hint: string;
  state: FeatureState;
  launchedAt: string | null;
}

interface FeatureSettingsData {
  features: FeatureRow[];
  pilotRoles: string[];
  pilotUserIds: string[];
}

const STATE_HINTS: Record<FeatureState, string> = {
  off: 'برای هیچ‌کس، حتی ادمین، دیده نمی‌شود.',
  preview: 'فقط ادمین و گروه آزمایشی با برچسب «پیش‌نمایش» می‌بینند.',
  on: 'همه می‌بینند.',
};

const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${active ? 'bg-red-700 text-white border-red-700' : 'bg-white border-[#D9D4CB] hover:border-red-300'}`;

/** How to introduce a part that is switched on for everyone. */
const LaunchModal: React.FC<{ feature: FeatureRow; onClose: () => void; onLaunch: (announce: { badge: boolean; card: boolean; draft: boolean }) => Promise<void> }> = ({
  feature,
  onClose,
  onLaunch,
}) => {
  const { can } = usePortal();
  const [badge, setBadge] = useState(true);
  const [card, setCard] = useState(true);
  const [draft, setDraft] = useState(can('news.manage'));
  const [busy, setBusy] = useState(false);
  const options: { id: string; checked: boolean; set: (v: boolean) => void; label: string; hint: string; hidden?: boolean }[] = [
    { id: 'badge', checked: badge, set: setBadge, label: 'برچسب «جدید» در منو', hint: 'تا دو هفته، یا تا وقتی هر نفر یک بار آن را باز کند.' },
    { id: 'card', checked: card, set: setCard, label: 'کارت معرفی روی داشبورد', hint: 'یک بار برای هر نفر، با دکمهٔ «ببینم»؛ تا دو هفته.' },
    { id: 'draft', checked: draft, set: setDraft, label: 'پیش‌نویس خبر معرفی', hint: 'در «پیش‌نویس‌ها»ی اخبار ساخته می‌شود؛ خودکار منتشر نمی‌شود.', hidden: !can('news.manage') },
  ];

  return (
    <Modal
      title={`روشن کردن «${feature.label}» برای همه`}
      subtitle="همهٔ گزینه‌ها اختیاری‌اند"
      icon={<Megaphone className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onLaunch({ badge, card, draft });
              setBusy(false);
            }}
            className={primaryButtonClass}
          >
            {busy ? 'در حال ذخیره...' : 'روشن کن'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {options.filter((o) => !o.hidden).map((o) => (
          <label key={o.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#F5F2ED] cursor-pointer">
            <input type="checkbox" checked={o.checked} onChange={(e) => o.set(e.target.checked)} className="mt-0.5 w-4 h-4 accent-red-700" />
            <span>
              <span className="block text-xs font-bold text-[#2D2D2D]">{o.label}</span>
              <span className="block text-[11px] text-[#6E6A60] mt-0.5 leading-relaxed">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
};

/** Who tries the parts in preview besides the administrator: whole roles and colleagues by name. */
const PilotGroupEditor: React.FC<{ data: FeatureSettingsData; onSaved: (data: FeatureSettingsData) => void }> = ({ data, onSaved }) => {
  const { roles, employees } = usePortal();
  const [pilotRoles, setPilotRoles] = useState(data.pilotRoles);
  const [userIds, setUserIds] = useState(data.pilotUserIds);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => employees.filter((e) => e.isActive && e.hasAccount), [employees]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const dirty = JSON.stringify([pilotRoles, userIds]) !== JSON.stringify([data.pilotRoles, data.pilotUserIds]);
  const matches = query.trim()
    ? people.filter((p) => !userIds.includes(p.id) && `${p.firstName} ${p.lastName} ${p.position} ${p.department}`.includes(query.trim())).slice(0, 6)
    : [];
  const choosableRoles = roles.filter((r) => r.id !== ADMIN_ROLE_ID);

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.put<FeatureSettingsData>('/api/settings/pilot', { roles: pilotRoles, userIds }));
      toast.success('گروه آزمایشی ذخیره شد.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-red-700" />
        <h4 className="text-xs font-black text-[#2D2D2D]">گروه آزمایشی</h4>
      </div>
      <p className="text-[11px] text-[#6E6A60] leading-relaxed">بخش‌های «پیش‌نمایش» را ادمین و این افراد می‌بینند. ادمین همیشه در این گروه است.</p>
      {choosableRoles.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-[#6E6A60]">همهٔ همکارانِ این نقش‌ها</span>
          <div className="flex flex-wrap gap-1.5">
            {choosableRoles.map((r) => {
              const active = pilotRoles.includes(r.id);
              return (
                <button key={r.id} type="button" aria-pressed={active} onClick={() => setPilotRoles(active ? pilotRoles.filter((x) => x !== r.id) : [...pilotRoles, r.id])} className={chipClass(active)}>
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <span className="text-[11px] font-bold text-[#6E6A60]">همکاران به اسم</span>
        {userIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {userIds.map((id) => {
              const p = byId.get(id);
              return (
                <span key={id} className="flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-xl bg-[#F5F2ED] text-[11px] font-bold">
                  {p ? `${p.firstName} ${p.lastName}` : 'همکار حذف‌شده'}
                  <button type="button" onClick={() => setUserIds(userIds.filter((x) => x !== id))} aria-label="برداشتن از گروه" className="p-0.5 text-red-700">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C867A]" />
          <input aria-label="جست‌وجوی همکار برای گروه آزمایشی" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام همکار" className={`${inputClass} pr-8`} />
        </div>
        {matches.length > 0 && (
          <ul className="border border-[#E6E0D5] rounded-xl divide-y divide-[#F0EBE3]">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setUserIds([...userIds, p.id]);
                    setQuery('');
                  }}
                  className="w-full text-right px-3 py-2 text-[11px] hover:bg-[#F5F2ED]"
                >
                  <span className="font-bold">{p.firstName} {p.lastName}</span>
                  <span className="text-[#6E6A60]"> · {p.position || p.department}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {dirty && (
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={() => void save()} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'ذخیرهٔ گروه آزمایشی'}
          </button>
        </div>
      )}
    </div>
  );
};

/** Parts of the portal kept hidden until they are introduced, then switched on for everyone. */
export const FeatureSettings: React.FC = () => {
  const { setActiveTab } = usePortal();
  const [data, setData] = useState<FeatureSettingsData | null>(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<FeatureKey | null>(null);
  const [launching, setLaunching] = useState<FeatureRow | null>(null);

  const load = useCallback(() => {
    api.get<FeatureSettingsData>('/api/settings/features').then(setData).catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const change = async (feature: FeatureRow, state: FeatureState, announce?: { badge: boolean; card: boolean; draft: boolean }) => {
    setBusyKey(feature.key);
    try {
      const result = await api.put<FeatureSettingsData & { draftId: string | null }>(`/api/settings/features/${feature.key}`, { state, announce });
      setData(result);
      setLaunching(null);
      if (result.draftId) {
        toast.success((t) => (
          <span>
            «{feature.label}» برای همه روشن شد و پیش‌نویس خبر معرفی ساخته شد.{' '}
            <button
              type="button"
              className="underline font-bold"
              onClick={() => {
                toast.dismiss(t.id);
                setActiveTab('news');
              }}
            >
              دیدن پیش‌نویس‌ها
            </button>
          </span>
        ));
      } else {
        toast.success(`«${feature.label}»: ${FEATURE_STATES.find((s) => s.id === state)?.label}.`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-[#E6E0D5] space-y-3 lg:col-span-2" aria-labelledby="feature-settings-title">
      <div className="flex items-center gap-2">
        <ToggleRight className="w-4 h-4 text-red-700" />
        <h3 id="feature-settings-title" className="text-sm font-black text-[#2D2D2D]">امکانات پرتال</h3>
      </div>
      <p className="text-[11px] text-[#6E6A60] leading-relaxed">
        هر بخش را تا روز معرفی پنهان نگه دارید یا اول با گروه آزمایشی امتحان کنید. بخش پنهان از منو، داشبورد، جست‌وجو و اعلان‌ها برداشته می‌شود و با نوشتن
        نشانی‌اش هم باز نمی‌شود؛ داده‌هایش پاک نمی‌شود و با روشن کردن دوباره برمی‌گردد.
      </p>
      {error && <p role="alert" className="text-xs text-red-700 font-bold">{error}</p>}
      {data && (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.features.map((f) => (
              <li key={f.key} className="p-3 rounded-xl bg-[#F5F2ED] space-y-2">
                <div>
                  <span className="block text-xs font-bold text-[#2D2D2D]">{f.label}</span>
                  <span className="block text-[11px] text-[#6E6A60] mt-0.5 leading-relaxed">{f.hint}</span>
                </div>
                <div role="radiogroup" aria-label={`وضعیت ${f.label}`} className="flex flex-wrap gap-1.5">
                  {FEATURE_STATES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={f.state === s.id}
                      disabled={busyKey === f.key}
                      onClick={() => {
                        if (f.state === s.id) return;
                        if (s.id === 'on') setLaunching(f);
                        else void change(f, s.id);
                      }}
                      className={chipClass(f.state === s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#8C867A]">
                  {STATE_HINTS[f.state]}
                  {f.state === 'on' && f.launchedAt && ` روشن‌شده در ${formatDate(f.launchedAt)}.`}
                </p>
              </li>
            ))}
          </ul>
          <PilotGroupEditor key={JSON.stringify([data.pilotRoles, data.pilotUserIds])} data={data} onSaved={setData} />
        </>
      )}
      {launching && <LaunchModal feature={launching} onClose={() => setLaunching(null)} onLaunch={(announce) => change(launching, 'on', announce)} />}
    </section>
  );
};
