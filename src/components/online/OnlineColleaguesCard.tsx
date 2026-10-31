import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Search, Settings2, Users, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { normalizeForSearch } from '../../lib/search';
import { featureInPreview } from '../../lib/features';
import { toPersianDigits } from '../../lib/jalali';
import { Avatar } from '../common/Avatar';
import { OnlineChoices } from './OnlineChoices';
import { usePresence } from './usePresence';

/** With more people than this, a small search box appears above the photos. */
const SEARCH_FROM = 8;
/** Photos shown in the closed bar on a phone. */
const PHONE_PREVIEW = 5;

const nameOf = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/**
 * «همکاران آنلاین»: every colleague who has the portal open, as small photos side by side (name on
 * hover), and six ready-made emoji for the one picked. On a phone it is a thin bar that opens on tap.
 * There is nowhere to type a message, on purpose.
 */
export const OnlineColleaguesCard: React.FC = () => {
  const { appSettings } = usePortal();
  const { data, send, setChoice } = usePresence(true);
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [openOnPhone, setOpenOnPhone] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const online = useMemo(() => data?.online ?? [], [data]);
  const shown = useMemo(() => {
    // The same matching as every other search box, so «علي» finds «علی» and «ك» finds «ک».
    const q = normalizeForSearch(query.trim());
    return q ? online.filter((p) => normalizeForSearch(`${nameOf(p)} ${p.department}`).includes(q)) : online;
  }, [online, query]);
  const picked = online.find((p) => p.id === pickedId) ?? null;

  if (!data) return null;
  const hidden = !data.me.showOnline;
  const count = online.length;
  const waitUntil = picked ? data.waits[picked.id] : undefined;
  const waitMinutes = waitUntil ? Math.ceil((new Date(waitUntil).getTime() - now) / 60_000) : 0;
  const dailyLeft = data.dailyLimit - data.sentToday;

  const onSend = async (emojiId: string) => {
    if (!picked || sending) return;
    const emoji = data.emojis.find((e) => e.id === emojiId);
    setSending(true);
    const ok = await send(picked.id, emojiId);
    setSending(false);
    if (ok) {
      toast.success(`${emoji?.emoji ?? ''} برای ${nameOf(picked)} فرستاده شد.`);
      setPickedId(null);
    }
  };

  const title = hidden ? 'همکاران آنلاین' : count === 0 ? 'همکار آنلاینی نیست' : `${toPersianDigits(count)} همکار آنلاین`;

  return (
    <section className="bg-white border border-line/70 shadow-card rounded-3xl p-3 lg:p-4 space-y-3" aria-labelledby="online-colleagues-title">
      <div className="flex items-center gap-2">
        {/* On a phone the header is the bar that opens the card */}
        <button
          type="button"
          onClick={() => setOpenOnPhone((o) => !o)}
          aria-expanded={openOnPhone}
          className="flex-1 min-w-0 flex items-center gap-2 text-right lg:pointer-events-none"
        >
          <span className="relative p-1.5 bg-emerald-50 text-emerald-700 rounded-xl">
            <Users className="w-4 h-4" />
            {!hidden && count > 0 && <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
          </span>
          <h2 id="online-colleagues-title" className="text-sm font-black text-ink whitespace-nowrap">{title}</h2>
          {featureInPreview(appSettings, 'onlineColleagues') && (
            <span className="px-2 py-0.5 text-xs font-bold bg-violet-100 text-violet-800 rounded-full">پیش‌نمایش</span>
          )}
          {/* A few photos in the closed bar on a phone */}
          {!openOnPhone && !hidden && count > 0 && (
            <span className="lg:hidden flex -space-x-2 space-x-reverse ms-auto" aria-hidden>
              {online.slice(0, PHONE_PREVIEW).map((p) => (
                <Avatar key={p.id} src={p.avatar} firstName={p.firstName} lastName={p.lastName} className="w-6 h-6 rounded-full ring-2 ring-white text-[9px]" />
              ))}
            </span>
          )}
          <ChevronDown className={`lg:hidden w-4 h-4 text-faint shrink-0 transition-transform ${openOnPhone ? 'rotate-180' : ''} ${!openOnPhone && !hidden && count > 0 ? '' : 'ms-auto'}`} />
        </button>
        <button
          type="button"
          onClick={() => setChoicesOpen((o) => !o)}
          aria-expanded={choicesOpen}
          aria-label="انتخاب‌های من"
          title="انتخاب‌های من"
          className={`p-1.5 rounded-xl text-faint hover:bg-surface ${openOnPhone ? '' : 'hidden lg:block'}`}
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      <div className={`space-y-3 ${openOnPhone ? '' : 'hidden lg:block'}`}>
        {choicesOpen && (
          <div className="p-2.5 rounded-2xl bg-surface-soft border border-line">
            <OnlineChoices me={data.me} onChange={(choice) => void setChoice(choice)} />
          </div>
        )}

        {hidden ? (
          <p className="text-xs text-muted leading-relaxed">
            خودتان را آنلاین نشان نمی‌دهید، پس فهرست همکاران آنلاین را هم نمی‌بینید.{' '}
            <button type="button" onClick={() => void setChoice({ showOnline: true })} className="font-bold text-emerald-700 hover:underline">
              نشانم بده
            </button>
          </p>
        ) : count === 0 ? (
          <p className="text-xs text-faint">الان همکار دیگری پرتال را باز ندارد.</p>
        ) : (
          <>
            {count > SEARCH_FROM && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-faint absolute right-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="پیدا کردن همکار"
                  aria-label="پیدا کردن همکار آنلاین"
                  className="w-full h-8 pr-8 pl-2 text-xs rounded-xl border border-line bg-surface-soft focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>
            )}
            <ul className="flex flex-wrap gap-2" aria-label="همکاران آنلاین">
              {shown.map((p) => {
                const name = nameOf(p);
                const isPicked = p.id === pickedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPickedId(isPicked ? null : p.id)}
                      aria-pressed={isPicked}
                      aria-label={`${name}، ${p.position}`}
                      title={`${name} · ${p.position}`}
                      className={`block rounded-full ring-2 transition ${isPicked ? 'ring-emerald-600' : 'ring-transparent hover:ring-emerald-300'}`}
                    >
                      <Avatar src={p.avatar} firstName={p.firstName} lastName={p.lastName} className="w-11 h-11 lg:w-10 lg:h-10 rounded-full text-xs" />
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="text-xs text-faint">کسی با این نام آنلاین نیست.</li>}
            </ul>

            {picked && (
              <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink truncate">برای {nameOf(picked)}</span>
                  <span className="text-xs text-faint truncate">{picked.department}</span>
                  <button type="button" onClick={() => setPickedId(null)} aria-label="بستن" className="ms-auto p-0.5 rounded-lg text-faint hover:bg-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!picked.acceptKudos ? (
                  <p className="text-xs text-muted">این همکار دریافت ایموجی را خاموش کرده است.</p>
                ) : waitMinutes > 0 ? (
                  <p className="text-xs text-muted">تازه برایش فرستادید؛ {toPersianDigits(waitMinutes)} دقیقهٔ دیگر می‌توانید دوباره بفرستید.</p>
                ) : dailyLeft <= 0 ? (
                  <p className="text-xs text-muted">امروز به سقف {toPersianDigits(data.dailyLimit)} ایموجی رسیده‌اید؛ فردا دوباره.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {data.emojis.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        disabled={sending}
                        onClick={() => void onSend(e.id)}
                        title={e.label}
                        aria-label={`فرستادن ${e.label}`}
                        className="flex items-center gap-1 px-2 py-1 rounded-xl bg-white border border-line hover:border-emerald-500 text-xs font-bold text-ink disabled:opacity-50"
                      >
                        <span className="text-base leading-none">{e.emoji}</span>
                        <span>{e.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
