import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClock, BarChart3, BellRing, Check, Copy, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import type { NewsItem, ReadReceipt } from '../../types';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { formatDate, formatDateTime, toPersianDigits } from '../../lib/jalali';
import { Modal, secondaryButtonClass } from './Modal';

type Tab = 'pending' | 'done';

const ALL = '';

/** What the report is about: a news item, or a mandatory document. */
export interface ReceiptsSource {
  title: string;
  /** `${endpoint}/receipts` lists the audience, `${endpoint}/remind` reminds those still pending. */
  endpoint: string;
  requiresAck: boolean;
  ackDeadline?: string | null;
  canRemind: boolean;
  ackRemindedAt: string | null;
  /** Documents only record the confirmation, not opening them. */
  tracksReads: boolean;
  fileName: string;
}

/**
 * Manager view of who has read (and, for circulars and mandatory documents, acknowledged) an item:
 * totals per department, the names, a reminder to those still pending and an Excel (CSV) copy.
 */
export const ReceiptsModal: React.FC<{ item: ReceiptsSource; onClose: () => void }> = ({ item, onClose }) => {
  const [receipts, setReceipts] = useState<ReadReceipt[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [department, setDepartment] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [copied, setCopied] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindedAt, setRemindedAt] = useState(item.ackRemindedAt);

  useEffect(() => {
    api.get<ReadReceipt[]>(`${item.endpoint}/receipts`).then(setReceipts).catch((err) => setError(errorMessage(err)));
  }, [item.endpoint]);

  const deadline = item.requiresAck && item.ackDeadline ? new Date(item.ackDeadline).getTime() : null;
  const isDone = (r: ReadReceipt) => (item.requiresAck ? Boolean(r.acknowledgedAt) : Boolean(r.readAt));
  const isLate = (r: ReadReceipt) => deadline !== null && r.acknowledgedAt !== null && new Date(r.acknowledgedAt).getTime() > deadline;

  const all = useMemo(() => receipts ?? [], [receipts]);
  const filtered = all.filter((r) => (!department || r.department === department) && (!location || r.location === location));
  const pending = filtered.filter((r) => !isDone(r));
  const done = filtered.filter(isDone);
  const late = done.filter(isLate).length;
  const shown = tab === 'pending' ? pending : done;

  // Departments with the most people still pending first, so the manager sees where to follow up.
  const byDepartment = useMemo(() => {
    const groups = new Map<string, { total: number; done: number }>();
    for (const r of all) {
      const g = groups.get(r.department) ?? { total: 0, done: 0 };
      g.total += 1;
      if (item.requiresAck ? r.acknowledgedAt : r.readAt) g.done += 1;
      groups.set(r.department, g);
    }
    return [...groups].sort((a, b) => b[1].total - b[1].done - (a[1].total - a[1].done) || a[0].localeCompare(b[0], 'fa'));
  }, [all, item.requiresAck]);
  const locations = useMemo(() => [...new Set(all.map((r) => r.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')), [all]);

  const doneLabel = item.requiresAck ? 'تأیید کرده‌اند' : 'خوانده‌اند';
  const pendingLabel = item.requiresAck ? 'هنوز تأیید نکرده‌اند' : 'هنوز نخوانده‌اند';
  const allPending = all.filter((r) => !isDone(r)).length;

  const copyPending = async () => {
    const text = pending.map((r) => `${r.name} (${r.department})`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable on plain-HTTP intranets; nothing else to do.
    }
  };

  const exportCsv = () =>
    downloadCsv(item.fileName, [
      ['نام', 'واحد', 'محل استقرار', ...(item.tracksReads ? ['زمان خواندن'] : []), ...(item.requiresAck ? ['زمان تأیید', 'وضعیت'] : [])],
      ...all.map((r) => [
        r.name,
        r.department,
        r.location,
        ...(item.tracksReads ? [r.readAt ? formatDateTime(r.readAt) : ''] : []),
        ...(item.requiresAck ? [r.acknowledgedAt ? formatDateTime(r.acknowledgedAt) : '', !r.acknowledgedAt ? 'تأیید نشده' : isLate(r) ? 'با تأخیر' : 'تأیید شده'] : []),
      ]),
    ]);

  const remind = async () => {
    setReminding(true);
    try {
      const { sent } = await api.post<{ sent: number }>(`${item.endpoint}/remind`);
      setRemindedAt(new Date().toISOString());
      toast.success(sent > 0 ? `یادآوری برای ${toPersianDigits(sent)} نفر فرستاده شد.` : 'کسی برای یادآوری نمانده است.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setReminding(false);
    }
  };

  return (
    <Modal title={item.tracksReads ? 'گزارش خوانده‌شدن' : 'گزارش تأیید مطالعه'} subtitle={item.title} icon={<BarChart3 className="w-5 h-5" />} onClose={onClose} size="lg">
      {error && <p role="alert" className="text-red-700 font-bold">{error}</p>}
      {!receipts && !error && <p>در حال دریافت...</p>}
      {receipts && (
        <div className="space-y-4">
          {deadline !== null && (
            <p className={`text-xs flex items-center gap-1.5 ${deadline < Date.now() ? 'text-red-700 font-bold' : 'text-[#4B4740]'}`}>
              <AlarmClock className="w-4 h-4" />
              مهلت تأیید: {formatDate(item.ackDeadline!)}
              {deadline < Date.now() && ' (گذشته است)'}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-2xl font-black text-emerald-800">{toPersianDigits(done.length)}</div>
              <div className="text-[11px] text-emerald-900">
                {doneLabel}
                {late > 0 && ` (${toPersianDigits(late)} نفر با تأخیر)`}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <div className="text-2xl font-black text-amber-800">{toPersianDigits(pending.length)}</div>
              <div className="text-[11px] text-amber-900">{pendingLabel}</div>
            </div>
          </div>

          {byDepartment.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[#6E6A60]">به تفکیک واحد</span>
              <div className="flex flex-wrap gap-1.5">
                {byDepartment.map(([name, g]) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={department === name}
                    onClick={() => setDepartment(department === name ? ALL : name)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                      department === name ? 'bg-red-700 text-white border-red-700' : g.done < g.total ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    {name} {toPersianDigits(g.done)}/{toPersianDigits(g.total)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {item.canRemind && allPending > 0 && (
              <button onClick={remind} disabled={reminding} className={secondaryButtonClass}>
                <BellRing className="w-4 h-4" />
                {reminding ? 'در حال فرستادن...' : `یادآوری به ${toPersianDigits(allPending)} نفر`}
              </button>
            )}
            <button onClick={exportCsv} className={secondaryButtonClass}>
              <Download className="w-4 h-4" /> خروجی اکسل
            </button>
            {remindedAt && <span className="text-[11px] text-[#6E6A60]">آخرین یادآوری: {formatDateTime(remindedAt)}</span>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5" role="tablist">
              {(['pending', 'done'] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-xl font-bold ${tab === t ? 'bg-red-700 text-white' : 'bg-[#F5F2ED]'}`}
                >
                  {t === 'pending' ? pendingLabel : doneLabel}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {locations.length > 1 && (
                <select aria-label="محل استقرار" value={location} onChange={(e) => setLocation(e.target.value)} className="px-2.5 py-1.5 border border-[#D9D4CB] rounded-xl bg-white text-xs focus:border-red-600 outline-hidden">
                  <option value={ALL}>همهٔ محل‌ها</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              )}
              {tab === 'pending' && pending.length > 0 && (
                <button onClick={copyPending} className={secondaryButtonClass}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} کپی فهرست
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6E6A60] border-b border-[#E6E0D5]">
                  <th className="text-right py-2 font-medium">نام</th>
                  <th className="text-right py-2 font-medium">واحد</th>
                  <th className="text-right py-2 font-medium">محل</th>
                  {item.tracksReads && <th className="text-right py-2 font-medium">خوانده</th>}
                  {item.requiresAck && <th className="text-right py-2 font-medium">تأیید</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.userId} className="border-b border-[#F5F2ED]">
                    <td className="py-2 font-bold">{r.name}</td>
                    <td className="py-2">{r.department}</td>
                    <td className="py-2">{r.location || '—'}</td>
                    {item.tracksReads && <td className="py-2">{r.readAt ? formatDateTime(r.readAt) : '—'}</td>}
                    {item.requiresAck && (
                      <td className="py-2">
                        {r.acknowledgedAt ? formatDateTime(r.acknowledgedAt) : '—'}
                        {isLate(r) && <span className="mr-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">با تأخیر</span>}
                      </td>
                    )}
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-[#6E6A60]">کسی در این فهرست نیست.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
};

/** The read report of a news item. */
export const ReadReceiptsModal: React.FC<{ item: NewsItem; onClose: () => void }> = ({ item, onClose }) => (
  <ReceiptsModal
    item={{
      title: item.title,
      endpoint: `/api/news/${item.id}`,
      requiresAck: item.requiresAck,
      ackDeadline: item.ackDeadline,
      canRemind: item.status === 'published',
      ackRemindedAt: item.ackRemindedAt,
      tracksReads: true,
      fileName: 'roya-portal-read-report.csv',
    }}
    onClose={onClose}
  />
);
