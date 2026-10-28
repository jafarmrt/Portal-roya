import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, ArchiveRestore, CheckCircle2, Copy, Inbox, Loader2, Mail, MessageSquareText, Search, Send, ShieldCheck, Trash2, UserRound, VenetianMask } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, toPersianDigits } from '../../lib/jalali';
import { suggestionsChanged, useSuggestionSummary } from '../../lib/suggestionSummary';
import {
  ANONYMOUS_RELEASE_HOUR,
  boxNames,
  SUGGESTION_BOXES,
  SUGGESTION_KINDS,
  suggestionKindLabel,
  type SuggestionBox,
  type SuggestionKind,
} from '../../../shared/suggestions';
import { Avatar } from '../common/Avatar';

const releaseHour = toPersianDigits(ANONYMOUS_RELEASE_HOUR);

interface SentMessage {
  id: string;
  box: SuggestionBox;
  kind: SuggestionKind;
  subject: string;
  body: string;
  isAnonymous: boolean;
  createdAt: string;
  isRead: boolean;
  reply: string | null;
  repliedAt: string | null;
}

interface BoxMessage extends SentMessage {
  sender: { id: string; name: string; department: string; position: string; avatar: string } | null;
  readAt: string | null;
  repliedByName: string | null;
  isClosed: boolean;
  canFollow: boolean;
}

type View = 'send' | 'mine' | 'track' | SuggestionBox;

const cardClass = 'bg-white border border-[#E6E0D5] rounded-3xl p-4 sm:p-6';
const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-[#E6E0D5] bg-[#FDFBF7] text-sm focus:outline-none focus:border-[#dc2626]';
const primaryButton = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold disabled:opacity-50';

/** A box's name and who it goes to, as the administrator named them. */
const useBoxNames = () => {
  const { appSettings } = usePortal();
  return (id: string) => boxNames(appSettings?.suggestionBoxNames, id);
};

/** An anonymous message is stored with its day only, so its time is never shown. */
const sentAt = (m: SentMessage) => (m.isAnonymous ? formatDate(m.createdAt) : formatDateTime(m.createdAt));

const KindBadge: React.FC<{ kind: string }> = ({ kind }) => (
  <span
    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
      kind === 'criticism' ? 'bg-amber-100 text-amber-900' : kind === 'suggestion' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-700'
    }`}
  >
    {suggestionKindLabel(kind)}
  </span>
);

const ReplyBlock: React.FC<{ message: SentMessage; by?: string | null }> = ({ message, by }) => {
  const names = useBoxNames();
  return message.reply ? (
    <div className="mt-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 space-y-1">
      <div className="text-[11px] font-bold text-emerald-800">
        پاسخ {names(message.box).to}
        {by ? ` (${by})` : ''}، {formatDateTime(message.repliedAt)}
      </div>
      <p className="whitespace-pre-line leading-7">{message.reply}</p>
    </div>
  ) : (
    <div className="mt-3 text-[11px] text-[#6E6A60]">{message.isRead ? 'خوانده شده، هنوز پاسخی داده نشده است.' : 'هنوز خوانده نشده است.'}</div>
  );
};

/** The boxes this person can write to now; a box that is switched off takes no new messages. */
const useOpenBoxes = () => {
  const { featureOn } = usePortal();
  return SUGGESTION_BOXES.filter((b) => featureOn(b.feature)).map((b) => b.id);
};

const SendForm: React.FC<{ onSent: (trackingCode: string | null) => void }> = ({ onSent }) => {
  const names = useBoxNames();
  const openBoxes = useOpenBoxes();
  const [chosen, setBox] = useState<SuggestionBox>('management');
  const box = openBoxes.includes(chosen) ? chosen : openBoxes[0];
  const [kind, setKind] = useState<SuggestionKind>('suggestion');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ trackingCode: string | null }>('/api/suggestions', { box, kind, subject, body, anonymous });
      setSubject('');
      setBody('');
      onSent(res.trackingCode);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!box) return <div className={`${cardClass} text-center text-sm text-[#6E6A60]`}>فعلاً هیچ صندوقی پیام تازه نمی‌پذیرد.</div>;

  return (
    <form onSubmit={submit} className={`${cardClass} space-y-5`}>
      {openBoxes.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-[#2D2D2D] mb-2">پیام برای چه کسی است؟</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {openBoxes.map((id) => (
              <label
                key={id}
                className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
                  box === id ? 'border-[#dc2626] bg-[#fef2f2]' : 'border-[#E6E0D5] hover:border-[#dc2626]/50'
                }`}
              >
                <input type="radio" name="box" value={id} checked={box === id} onChange={() => setBox(id)} className="accent-[#991b1b]" />
                <span>
                  <span className="block text-sm font-bold text-[#2D2D2D]">{names(id).label}</span>
                  <span className="block text-[11px] text-[#6E6A60]">خواننده: {names(id).to}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        // Only one box is open, so there is nothing to choose.
        <p className="text-sm font-bold text-[#2D2D2D]">
          پیام شما به {names(box).to} می‌رسد <span className="text-[11px] font-normal text-[#6E6A60]">({names(box).label})</span>
        </p>
      )}

      <fieldset>
        <legend className="text-xs font-bold text-[#2D2D2D] mb-2">نوع پیام</legend>
        <div className="flex flex-wrap gap-2">
          {SUGGESTION_KINDS.map((k) => (
            <label
              key={k.id}
              className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                kind === k.id ? 'border-[#991b1b] bg-[#991b1b] text-white' : 'border-[#E6E0D5] text-[#4B4740] hover:border-[#991b1b]/50'
              }`}
            >
              <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} className="sr-only" />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-[#2D2D2D]">موضوع</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required className={inputClass} placeholder="مثلاً: ساعت ناهار" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-[#2D2D2D]">متن پیام</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required rows={6} className={`${inputClass} leading-7`} />
      </label>

      <div className={`rounded-2xl border p-3 sm:p-4 space-y-2 ${anonymous ? 'border-indigo-300 bg-indigo-50' : 'border-[#E6E0D5] bg-[#F9F7F4]'}`}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="w-4 h-4 accent-indigo-700" />
          <VenetianMask className="w-4 h-4 text-indigo-700" />
          <span className="text-sm font-bold text-[#2D2D2D]">ناشناس بفرست</span>
        </label>
        {anonymous ? (
          <ul className="text-xs text-indigo-950 leading-6 list-disc pr-5">
            <li>نام و حساب کاربری شما همراه پیام ذخیره نمی‌شود و نه خوانندهٔ صندوق و نه ادمین پرتال نمی‌توانند بفهمند فرستنده کیست.</li>
            <li>از زمان ارسال فقط روز آن ثبت می‌شود، نه ساعتش. پیام‌های ناشناس هر روز ساعت {releaseHour} صبح با هم به دست خوانندهٔ صندوق می‌رسند؛ پیام امروز شما فردا ساعت {releaseHour} دیده می‌شود.</li>
            <li>پس از ارسال یک کد پیگیری می‌گیرید. پاسخ را فقط با همین کد می‌توانید ببینید، پس آن را یادداشت کنید.</li>
            <li>اگر در متن نام خودتان یا جزئیاتی بنویسید که شما را معرفی کند، پیام دیگر ناشناس نمی‌ماند.</li>
          </ul>
        ) : (
          <p className="text-xs text-[#6E6A60] leading-6">نام و واحد شما برای خوانندهٔ صندوق نمایش داده می‌شود و پاسخ را در «پیام‌های من» و اعلان‌ها می‌بینید.</p>
        )}
      </div>

      <button type="submit" disabled={saving} className={primaryButton}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        ارسال پیام
      </button>
    </form>
  );
};

const TrackingCodeNotice: React.FC<{ code: string; onDone: () => void }> = ({ code, onDone }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('کد پیگیری کپی شد.');
    } catch {
      toast.error('کپی نشد؛ کد را از روی صفحه یادداشت کنید.');
    }
  };
  return (
    <div className={`${cardClass} border-indigo-300 text-center space-y-4`} role="status">
      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
      <h2 className="text-base font-black text-[#2D2D2D]">پیام ناشناس شما فرستاده شد</h2>
      <p className="text-xs text-[#4B4740] leading-6">
        کد پیگیری زیر را یادداشت کنید. این کد فقط همین یک بار نمایش داده می‌شود و جایی همراه نام شما ذخیره نشده است. پیام فردا ساعت {releaseHour} صبح، همراه پیام‌های ناشناس دیگر، به دست خوانندهٔ صندوق می‌رسد و پاسخ را با همین کد در بخش «پیگیری با کد» می‌بینید.
      </p>
      <div className="flex items-center justify-center gap-2">
        <code dir="ltr" className="px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-lg font-black tracking-widest text-indigo-900">
          {code}
        </code>
        <button type="button" onClick={copy} className="p-2.5 rounded-xl border border-[#E6E0D5] hover:border-indigo-400" aria-label="کپی کد پیگیری">
          <Copy className="w-4 h-4" />
        </button>
      </div>
      <button type="button" onClick={onDone} className={primaryButton}>
        یادداشت کردم
      </button>
    </div>
  );
};

const MyMessages: React.FC = () => {
  const names = useBoxNames();
  const [items, setItems] = useState<SentMessage[] | null>(null);
  useEffect(() => {
    api.get<SentMessage[]>('/api/suggestions/mine').then(setItems).catch(() => setItems([]));
  }, []);
  if (!items) return <Loader2 className="w-6 h-6 text-red-600 animate-spin mx-auto my-10" />;
  if (items.length === 0) {
    return (
      <div className={`${cardClass} text-center text-sm text-[#6E6A60]`}>
        هنوز پیامی با نام خودتان نفرستاده‌اید. پیام‌های ناشناس اینجا نمی‌آیند؛ پاسخ آن‌ها را با کد پیگیری ببینید.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.id} className={cardClass}>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6A60]">
            <KindBadge kind={m.kind} />
            <span className="font-bold text-[#4B4740]">{names(m.box).label}</span>
            <span>{sentAt(m)}</span>
          </div>
          <h3 className="mt-2 text-sm font-black text-[#2D2D2D]">{m.subject}</h3>
          <p className="mt-1 text-sm text-[#4B4740] whitespace-pre-line leading-7">{m.body}</p>
          <ReplyBlock message={m} />
        </li>
      ))}
    </ul>
  );
};

const TrackByCode: React.FC = () => {
  const names = useBoxNames();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<SentMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      setFound(await api.post<SentMessage>('/api/suggestions/track', { code }));
    } catch (err) {
      setFound(null);
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-3">
      <form onSubmit={submit} className={`${cardClass} space-y-3`}>
        <p className="text-xs text-[#4B4740] leading-6">کد پیگیری‌ای را که پس از ارسال پیام ناشناس گرفتید وارد کنید تا پیام و پاسخ آن را ببینید.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            required
            className={`${inputClass} sm:max-w-xs text-center tracking-widest font-bold`}
            aria-label="کد پیگیری"
          />
          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            پیگیری
          </button>
        </div>
      </form>
      {found && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6A60]">
            <KindBadge kind={found.kind} />
            <span className="font-bold text-[#4B4740]">{names(found.box).label}</span>
            <span>{sentAt(found)}</span>
          </div>
          <h3 className="mt-2 text-sm font-black text-[#2D2D2D]">{found.subject}</h3>
          <p className="mt-1 text-sm text-[#4B4740] whitespace-pre-line leading-7">{found.body}</p>
          <ReplyBlock message={found} />
        </div>
      )}
    </div>
  );
};

const BoxMessageCard: React.FC<{ message: BoxMessage; onChanged: () => void }> = ({ message: m, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(m.reply ?? '');
  const [busy, setBusy] = useState(false);

  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast.success(done);
      onChanged();
      suggestionsChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && !m.readAt) void act(() => api.post(`/api/suggestions/${m.id}/read`));
  };

  return (
    <li className={`${cardClass} ${!m.readAt ? 'border-[#dc2626]/50' : ''} ${m.isClosed ? 'opacity-75' : ''}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full text-right">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E6A60]">
          {!m.readAt && <span className="px-2 py-0.5 rounded-full bg-[#dc2626] text-white text-[10px] font-bold">تازه</span>}
          <KindBadge kind={m.kind} />
          {m.reply && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">پاسخ داده شد</span>}
          <span>{sentAt(m)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {m.sender ? (
            <Avatar src={m.sender.avatar} firstName={m.sender.name.split(' ')[0]} lastName={m.sender.name.split(' ').slice(1).join(' ')} className="w-7 h-7 rounded-full text-[10px]" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center">
              {m.isAnonymous ? <VenetianMask className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
            </span>
          )}
          <span className="text-xs text-[#4B4740]">
            {m.sender ? (
              <>
                <strong>{m.sender.name}</strong>
                {m.sender.department ? `، ${m.sender.department}` : ''}
              </>
            ) : m.isAnonymous ? (
              <strong className="text-indigo-900">ناشناس</strong>
            ) : (
              'همکاری که دیگر در پرتال نیست'
            )}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-black text-[#2D2D2D]">{m.subject}</h3>
        {!open && <p className="mt-1 text-xs text-[#6E6A60] line-clamp-2">{m.body}</p>}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-[#2D2D2D] whitespace-pre-line leading-7">{m.body}</p>
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#2D2D2D]" htmlFor={`reply-${m.id}`}>
              {m.reply ? `پاسخ (${m.repliedByName ?? ''}، ${formatDateTime(m.repliedAt)})` : 'پاسخ'}
            </label>
            <textarea id={`reply-${m.id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} className={`${inputClass} leading-7`} />
            <p className="text-[11px] text-[#6E6A60]">
              {m.isAnonymous
                ? 'فرستنده ناشناس است؛ پاسخ را با کد پیگیری خودش می‌بیند و اعلانی برایش نمی‌رود.'
                : m.canFollow
                  ? 'فرستنده با اعلان از پاسخ باخبر می‌شود.'
                  : 'فرستنده دیگر در پرتال نیست.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !reply.trim()}
              onClick={() => act(() => api.put(`/api/suggestions/${m.id}/reply`, { reply }), m.reply ? 'پاسخ به‌روز شد.' : 'پاسخ ثبت شد.')}
              className={primaryButton}
            >
              <Send className="w-4 h-4" /> {m.reply ? 'به‌روزرسانی پاسخ' : 'ثبت پاسخ'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.patch(`/api/suggestions/${m.id}`, { closed: !m.isClosed }), m.isClosed ? 'پیام به صندوق برگشت.' : 'پیام بایگانی شد.')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E6E0D5] text-xs font-bold text-[#4B4740] hover:border-[#991b1b]"
            >
              {m.isClosed ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {m.isClosed ? 'برگرداندن از بایگانی' : 'بایگانی'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('این پیام برای همیشه حذف شود؟')) void act(() => api.delete(`/api/suggestions/${m.id}`), 'پیام حذف شد.');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> حذف
            </button>
          </div>
        </div>
      )}
    </li>
  );
};

const BoxInbox: React.FC<{ box: SuggestionBox }> = ({ box }) => {
  const names = useBoxNames();
  const isOpen = useOpenBoxes().includes(box);
  const [items, setItems] = useState<BoxMessage[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const { notifications } = usePortal();
  const latest = notifications.find((n) => n.type === 'suggestion')?.id;
  const load = useCallback(() => {
    api.get<BoxMessage[]>(`/api/suggestions/box/${box}`).then(setItems).catch((err) => {
      toast.error(errorMessage(err));
      setItems([]);
    });
  }, [box]);
  useEffect(load, [load, latest]);

  if (!items) return <Loader2 className="w-6 h-6 text-red-600 animate-spin mx-auto my-10" />;
  const shown = items.filter((m) => m.isClosed === showClosed);
  const closedCount = items.filter((m) => m.isClosed).length;
  return (
    <div className="space-y-3">
      {!isOpen && (
        <p role="status" className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-6">
          این صندوق خاموش است و پیام تازه نمی‌پذیرد. پیام‌های قبلی را همچنان می‌بینید و می‌توانید به آن‌ها پاسخ دهید.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#6E6A60]">
          پیام‌های {names(box).label}. نام فرستندهٔ پیام‌های ناشناس جایی ثبت نشده است.
        </p>
        <button type="button" onClick={() => setShowClosed((s) => !s)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#991b1b]">
          <Archive className="w-4 h-4" />
          {showClosed ? 'پیام‌های جاری' : `بایگانی (${toPersianDigits(closedCount)})`}
        </button>
      </div>
      {shown.length === 0 ? (
        <div className={`${cardClass} text-center text-sm text-[#6E6A60]`}>{showClosed ? 'پیام بایگانی‌شده‌ای نیست.' : 'پیام تازه‌ای در این صندوق نیست.'}</div>
      ) : (
        <ul className="space-y-3">
          {shown.map((m) => (
            <BoxMessageCard key={m.id} message={m} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
};

/** صندوق انتقادات و پیشنهادات: every colleague writes to management or HR, named or anonymous; each box's readers answer. */
export const SuggestionsModule: React.FC = () => {
  const { focusId, setActiveTab } = usePortal();
  const names = useBoxNames();
  const openBoxes = useOpenBoxes();
  const summary = useSuggestionSummary();
  const readable = summary?.boxes ?? [];
  const [view, setView] = useState<View>('send');
  const [trackingCode, setTrackingCode] = useState<string | null>(null);

  // A notification opens the box it came from, or «پیام‌های من» for an answer.
  useEffect(() => {
    if (focusId === 'mine' || focusId === 'track' || (focusId && readable.includes(focusId as SuggestionBox))) setView(focusId as View);
  }, [focusId, readable.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (next: View) => {
    setView(next);
    setTrackingCode(null);
    setActiveTab('suggestions', next === 'send' ? null : next);
  };

  const tabs: { id: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'send', label: 'ارسال پیام', icon: <Send className="w-4 h-4" /> },
    { id: 'mine', label: 'پیام‌های من', icon: <Mail className="w-4 h-4" /> },
    { id: 'track', label: 'پیگیری با کد', icon: <Search className="w-4 h-4" /> },
    ...readable.map((b) => ({
      id: b as View,
      label: openBoxes.includes(b) ? names(b).label : `${names(b).label} (خاموش)`,
      icon: <Inbox className="w-4 h-4" />,
      badge: summary?.unread[b],
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-5 sm:p-8 text-white shadow-xl">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>صدای همکاران</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black">صندوق انتقادات و پیشنهادات</h1>
          <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
            انتقاد یا پیشنهادتان را برای {openBoxes.map((b) => names(b).to).join(' یا ') || 'همکاران مسئول'} بفرستید. اگر بخواهید، پیام کاملاً ناشناس فرستاده می‌شود.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="بخش‌های صندوق">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={view === t.id}
            onClick={() => choose(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
              view === t.id ? 'bg-[#991b1b] text-white' : 'bg-white border border-[#E6E0D5] text-[#4B4740] hover:border-[#991b1b]/50'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge ? <span className="px-1.5 rounded-full bg-amber-400 text-amber-950 text-[10px]">{toPersianDigits(t.badge)}</span> : null}
          </button>
        ))}
      </div>

      {view === 'send' &&
        (trackingCode ? (
          <TrackingCodeNotice code={trackingCode} onDone={() => setTrackingCode(null)} />
        ) : (
          <SendForm
            onSent={(code) => {
              if (code) setTrackingCode(code);
              else {
                toast.success('پیام شما فرستاده شد. پاسخ را در «پیام‌های من» می‌بینید.');
                choose('mine');
              }
            }}
          />
        ))}
      {view === 'mine' && <MyMessages />}
      {view === 'track' && <TrackByCode />}
      {(view === 'management' || view === 'hr') && readable.includes(view) && <BoxInbox box={view} />}

      <p className="flex items-center gap-1.5 text-[11px] text-[#6E6A60]">
        <ShieldCheck className="w-3.5 h-3.5" />
        خوانندگان هر صندوق را ادمین پرتال در «تنظیمات ← نقش‌ها و دسترسی» تعیین می‌کند. ادمین پرتال همیشه هر دو صندوق را می‌بیند. پیام‌های ناشناس روزی یک بار، ساعت {releaseHour} صبح، با هم می‌رسند تا زمان نوشتنشان معلوم نباشد.
      </p>
    </div>
  );
};
