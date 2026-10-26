import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, Copy } from 'lucide-react';
import type { NewsItem, ReadReceipt } from '../../types';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import { Modal, secondaryButtonClass } from '../common/Modal';

type Tab = 'pending' | 'done';

/** Manager view of who has read (and, for circulars, acknowledged) a news item. */
export const ReadReceiptsModal: React.FC<{ item: NewsItem; onClose: () => void }> = ({ item, onClose }) => {
  const [receipts, setReceipts] = useState<ReadReceipt[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<ReadReceipt[]>(`/api/news/${item.id}/receipts`).then(setReceipts).catch((err) => setError(errorMessage(err)));
  }, [item.id]);

  const isDone = (r: ReadReceipt) => (item.requiresAck ? Boolean(r.acknowledgedAt) : Boolean(r.readAt));
  const { pending, done } = useMemo(() => {
    const list = receipts ?? [];
    return { pending: list.filter((r) => !isDone(r)), done: list.filter(isDone) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts]);

  const shown = tab === 'pending' ? pending : done;
  const doneLabel = item.requiresAck ? 'تأیید کرده‌اند' : 'خوانده‌اند';
  const pendingLabel = item.requiresAck ? 'هنوز تأیید نکرده‌اند' : 'هنوز نخوانده‌اند';

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

  return (
    <Modal title="گزارش خوانده‌شدن" subtitle={item.title} icon={<BarChart3 className="w-5 h-5" />} onClose={onClose} size="lg">
      {error && <p role="alert" className="text-red-700 font-bold">{error}</p>}
      {!receipts && !error && <p>در حال دریافت...</p>}
      {receipts && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-2xl font-black text-emerald-800">{toPersianDigits(done.length)}</div>
              <div className="text-[11px] text-emerald-900">{doneLabel}</div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <div className="text-2xl font-black text-amber-800">{toPersianDigits(pending.length)}</div>
              <div className="text-[11px] text-amber-900">{pendingLabel}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
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
            {tab === 'pending' && pending.length > 0 && (
              <button onClick={copyPending} className={secondaryButtonClass}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} کپی فهرست
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6E6A60] border-b border-[#E6E0D5]">
                  <th className="text-right py-2 font-medium">نام</th>
                  <th className="text-right py-2 font-medium">واحد</th>
                  <th className="text-right py-2 font-medium">خوانده</th>
                  {item.requiresAck && <th className="text-right py-2 font-medium">تأیید</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.userId} className="border-b border-[#F5F2ED]">
                    <td className="py-2 font-bold">{r.name}</td>
                    <td className="py-2">{r.department}</td>
                    <td className="py-2">{r.readAt ? formatDateTime(r.readAt) : '—'}</td>
                    {item.requiresAck && <td className="py-2">{r.acknowledgedAt ? formatDateTime(r.acknowledgedAt) : '—'}</td>}
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-[#6E6A60]">کسی در این فهرست نیست.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
};
