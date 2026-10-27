import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Search } from 'lucide-react';
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_ENTITY_LABELS, type AuditAction, type AuditEntity } from '../../../shared/audit';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import type { ActiveTab } from '../../types';
import { inputClass, secondaryButtonClass } from '../common/Modal';

interface AuditItem {
  id: number;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  title: string;
  detail: string;
  createdAt: string;
}

const ACTION_STYLES: Record<AuditAction, string> = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-amber-50 text-amber-800',
  delete: 'bg-red-50 text-red-700',
  publish: 'bg-sky-50 text-sky-700',
  import: 'bg-violet-50 text-violet-700',
};

/** Where an entry's subject can be opened, while it still exists. */
const PAGES: Partial<Record<AuditEntity, ActiveTab>> = {
  news: 'news',
  document: 'documents',
  guide: 'guides',
  department_page: 'departments',
  poll: 'polls',
  training: 'training',
  calendar_event: 'calendar',
  employee: 'colleagues',
  role: 'admin',
  settings: 'admin',
  holiday: 'calendar',
};

/** و۳: who created, changed or deleted what in the portal, searchable; for the admin. */
export const AuditLogModule: React.FC = () => {
  const { setActiveTab } = usePortal();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState<AuditEntity | ''>('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Searching starts once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (before?: number) => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (entity) params.set('entity', entity);
      if (action) params.set('action', action);
      if (before) params.set('before', String(before));
      setLoading(true);
      try {
        const page = await api.get<{ items: AuditItem[]; hasMore: boolean }>(`/api/audit-log?${params}`);
        setItems((current) => (before && current ? [...current, ...page.items] : page.items));
        setHasMore(page.hasMore);
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
      setLoading(false);
    },
    [search, entity, action],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = Boolean(search || entity || action);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-[#fdfbf7] text-[#991b1b] rounded-2xl border border-[#f5f2ed]">
          <History className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#2d2d2d]">تاریخچهٔ تغییرات</h2>
          <p className="text-sm text-[#6e6a60] mt-1">چه کسی، چه زمانی، اطلاعیه، سند، نقش، حساب کاربری یا تنظیمات را ساخت، تغییر داد یا حذف کرد</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] grid grid-cols-1 sm:grid-cols-[1fr_12rem_10rem] gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C867A] absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در عنوان، نام همکار یا جزئیات..."
            aria-label="جستجو در تاریخچهٔ تغییرات"
            className={`${inputClass} pr-9`}
          />
        </div>
        <select value={entity} onChange={(e) => setEntity(e.target.value as AuditEntity | '')} aria-label="بخش" className={inputClass}>
          <option value="">همهٔ بخش‌ها</option>
          {AUDIT_ENTITIES.map((e) => (
            <option key={e} value={e}>{AUDIT_ENTITY_LABELS[e]}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')} aria-label="نوع تغییر" className={inputClass}>
          <option value="">همهٔ کارها</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!items ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 text-red-600 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-[#6E6A60] text-center py-10 bg-white rounded-2xl border border-[#E6E0D5]">
          {filtered ? 'موردی با این جستجو پیدا نشد.' : 'هنوز تغییری ثبت نشده است. از این نسخه به بعد تغییرها اینجا ثبت می‌شوند.'}
        </p>
      ) : (
        <ol className="bg-white rounded-2xl border border-[#E6E0D5] divide-y divide-[#F5F2ED]" aria-label="تغییرها">
          {items.map((item) => {
            const page = item.action !== 'delete' ? PAGES[item.entity] : undefined;
            return (
              <li key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <div className="flex items-center gap-1.5 shrink-0 sm:w-44">
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${ACTION_STYLES[item.action]}`}>{AUDIT_ACTION_LABELS[item.action]}</span>
                  <span className="text-[11px] font-bold text-[#6E6A60]">{AUDIT_ENTITY_LABELS[item.entity]}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  {page ? (
                    <button
                      onClick={() => setActiveTab(page, page === 'admin' ? null : item.entityId)}
                      className="text-sm font-bold text-[#2D2D2D] hover:text-[#dc2626] text-right break-words"
                    >
                      {item.title}
                    </button>
                  ) : (
                    <p className="text-sm font-bold text-[#2D2D2D] break-words">{item.title}</p>
                  )}
                  {item.detail && <p className="text-xs text-[#6E6A60] whitespace-pre-line break-words">{toPersianDigits(item.detail)}</p>}
                </div>
                <div className="shrink-0 text-[11px] text-[#6E6A60] sm:text-left">
                  <p className="font-bold text-[#2D2D2D]">{item.actorName}</p>
                  <p>{formatDateTime(item.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && items && (
        <div className="flex justify-center">
          <button onClick={() => load(items[items.length - 1].id)} disabled={loading} className={secondaryButtonClass}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} تغییرهای قدیمی‌تر
          </button>
        </div>
      )}
    </div>
  );
};
