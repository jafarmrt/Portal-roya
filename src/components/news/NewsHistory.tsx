import React, { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { api } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/jalali';
import { NEWS_FIELD_LABELS } from '../../../shared/audit';
import type { NewsHistory, NewsItem, NewsSnapshot } from '../../types';
import { Modal, secondaryButtonClass } from '../common/Modal';
import { audienceSummary, NewsContent } from './NewsBody';

const changedLabels = (changed: (keyof NewsSnapshot)[]) => [...new Set(changed.map((k) => NEWS_FIELD_LABELS[k]))];
const yesNo = (v: boolean) => (v ? 'بله' : 'خیر');

/** The earlier value of each changed field other than the texts, which are shown in full. */
function earlierValues(before: NewsSnapshot, changed: (keyof NewsSnapshot)[], roleName: (id: string) => string) {
  const rows: [string, string][] = [];
  const has = (k: keyof NewsSnapshot) => changed.includes(k);
  if (has('category')) rows.push(['دسته‌بندی', before.category]);
  if (has('isPinned')) rows.push(['سنجاق', yesNo(before.isPinned)]);
  if (has('isUrgent')) rows.push(['فوری', yesNo(before.isUrgent)]);
  if (has('requiresAck')) rows.push(['بخشنامه', yesNo(before.requiresAck)]);
  if (has('tags')) rows.push(['برچسب‌ها', before.tags.join('، ') || 'بدون برچسب']);
  if (['targetDepartments', 'targetLocations', 'targetRoles', 'targetUserIds'].some((k) => has(k as keyof NewsSnapshot))) {
    rows.push(['مخاطبان', audienceSummary({ ...before, targetUserCount: before.targetUserIds.length }, roleName) ?? 'همهٔ سازمان']);
  }
  if (has('attachments')) rows.push(['پیوست‌ها', before.attachments.map((a) => a.name).join('، ') || 'بدون پیوست']);
  if (has('image')) rows.push(['تصویر', before.image ? 'داشت' : 'نداشت']);
  if (has('publishAt')) rows.push(['زمان انتشار', formatDateTime(before.publishAt)]);
  if (has('expiresAt')) rows.push(['تاریخ انقضا', before.expiresAt ? formatDate(before.expiresAt) : 'بدون انقضا']);
  if (has('ackDeadline')) rows.push(['مهلت تأیید', before.ackDeadline ? formatDate(before.ackDeadline) : 'بدون مهلت']);
  return rows;
}

/** Who published and edited an item and when, with what each edit replaced. For news managers. */
export const NewsHistoryModal: React.FC<{ item: NewsItem; onClose: () => void }> = ({ item, onClose }) => {
  const { roleName } = usePortal();
  const [history, setHistory] = useState<NewsHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api.get<NewsHistory>(`/api/news/${item.id}/revisions`).then(setHistory).catch(() => setFailed(true));
  }, [item.id]);

  return (
    <Modal
      title="تاریخچهٔ ویرایش"
      subtitle={item.title}
      icon={<History className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={<button onClick={onClose} className={secondaryButtonClass}>بستن</button>}
    >
      {failed && <p className="text-sm text-red-700">تاریخچه دریافت نشد.</p>}
      {history && (
        <ol className="space-y-3" aria-label="تغییرات خبر">
          {history.entries.map((entry) => {
            const texts = entry.changed.filter((k) => k === 'title' || k === 'summary' || k === 'content');
            const others = earlierValues(entry.before, entry.changed, roleName);
            return (
              <li key={entry.id} className="p-3 rounded-xl border border-[#E6E0D5] space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <span className="font-bold text-[#2D2D2D]">
                    {entry.editor || 'همکار حذف‌شده'}
                    {entry.action === 'publish' ? ' پیش‌نویس را منتشر کرد' : ` ویرایش کرد: ${changedLabels(entry.changed).join('، ')}`}
                  </span>
                  <span className="text-[11px] text-[#6E6A60]">{formatDateTime(entry.createdAt)}</span>
                </div>
                {entry.action === 'edit' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpen(open === entry.id ? null : entry.id)}
                      aria-expanded={open === entry.id}
                      className="text-[11px] font-bold text-red-700 flex items-center gap-1"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === entry.id ? 'rotate-180' : ''}`} /> پیش از این ویرایش چه بود؟
                    </button>
                    {open === entry.id && (
                      <div className="p-3 bg-[#F5F2ED] rounded-xl space-y-2 text-xs">
                        {texts.includes('title') && <p><strong>عنوان:</strong> {entry.before.title}</p>}
                        {texts.includes('summary') && <p><strong>خلاصه:</strong> {entry.before.summary}</p>}
                        {texts.includes('content') && (
                          <div className="space-y-1">
                            <strong>متن:</strong>
                            <NewsContent content={entry.before.content} format={entry.before.contentFormat} className="text-xs bg-white p-3 rounded-lg" />
                          </div>
                        )}
                        {others.map(([label, value]) => (
                          <p key={label}><strong>{label}:</strong> {value}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
          <li className="p-3 rounded-xl border border-dashed border-[#D9D4CB] text-xs flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-[#2D2D2D]">{history.author || 'همکار حذف‌شده'} آن را نوشت</span>
            <span className="text-[11px] text-[#6E6A60]">{formatDateTime(history.createdAt)}</span>
          </li>
        </ol>
      )}
    </Modal>
  );
};
