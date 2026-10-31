import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, Megaphone, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { isForEveryone } from '../../../shared/audience';
import { NOTICE_KEEP_DAYS, NOTICE_STATUS_LABELS, noticeStatus, type NoticeStatus } from '../../../shared/notices';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import type { ManagedNotice } from '../../types';
import { Modal, secondaryButtonClass } from '../common/Modal';
import { NoticeFormModal } from './NoticeFormModal';

const STATUS_STYLE: Record<NoticeStatus, string> = {
  live: 'bg-emerald-100 text-emerald-900',
  scheduled: 'bg-sky-100 text-sky-900',
  ended: 'bg-[#E6E0D5] text-[#4B4740]',
};
const STATUS_ORDER: NoticeStatus[] = ['live', 'scheduled', 'ended'];

/** Every notice for the people who publish them: on the board, scheduled and recently ended, with how many saw each. */
export const NoticeManageModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { notices: liveNotices, reloadNotices } = usePortal();
  const [items, setItems] = useState<ManagedNotice[] | null>(null);
  const [editing, setEditing] = useState<ManagedNotice | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<ManagedNotice[]>('/api/notices/manage'));
    } catch (err) {
      toast.error(errorMessage(err));
      setItems([]);
    }
  }, []);
  // Loaded again whenever the board changes (also by another publisher).
  useEffect(() => {
    void load();
  }, [load, liveNotices]);

  const remove = async (n: ManagedNotice) => {
    if (!window.confirm('این اطلاعیه برای همیشه حذف شود؟ اگر فقط می‌خواهید زودتر از تابلو برداشته شود، روز پایان را امروز کنید.')) return;
    try {
      await api.delete(`/api/notices/${n.id}`);
      toast.success('اطلاعیه حذف شد.');
      await reloadNotices();
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const now = Date.now();
  const groups = STATUS_ORDER.map((status) => ({ status, list: (items ?? []).filter((n) => noticeStatus(n, now) === status) })).filter((g) => g.list.length > 0);

  return (
    <>
      <Modal
        title="مدیریت اطلاعیه‌ها"
        subtitle={`اطلاعیه‌های تابلو، زمان‌بندی‌شده‌ها و پایان‌یافته‌های ${toPersianDigits(NOTICE_KEEP_DAYS)} روز اخیر`}
        icon={<Megaphone className="w-5 h-5" />}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>بستن</button>
            <button type="button" onClick={() => setEditing('new')} className={secondaryButtonClass}>
              <Plus className="w-4 h-4" /> اطلاعیهٔ جدید
            </button>
          </>
        }
      >
        {items === null ? (
          <p className="text-[#6E6A60]">در حال بارگذاری…</p>
        ) : groups.length === 0 ? (
          <p className="text-[#6E6A60]">هنوز اطلاعیه‌ای گذاشته نشده است.</p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.status} className="space-y-2">
                <h4 className="text-xs font-black text-[#4B4740]">
                  {NOTICE_STATUS_LABELS[g.status]} ({toPersianDigits(g.list.length)})
                </h4>
                <ul className="space-y-2">
                  {g.list.map((n) => (
                    <li key={n.id} className="border border-[#E6E0D5] rounded-2xl p-3 space-y-2 bg-white">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-xs leading-6 whitespace-pre-line line-clamp-3 break-words" dir="auto">
                          {n.important && <Star className="inline w-3 h-3 ms-1 fill-amber-500 text-amber-500" aria-label="مهم" />}
                          {n.text}
                        </p>
                        <button type="button" onClick={() => setEditing(n)} aria-label="ویرایش" title="ویرایش" className="tap-area p-1.5 hover:bg-[#F5F2ED] rounded-lg text-[#4B4740]">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => void remove(n)} aria-label="حذف" title="حذف" className="tap-area p-1.5 hover:bg-red-50 rounded-lg text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6E6A60]">
                        <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_STYLE[g.status]}`}>{NOTICE_STATUS_LABELS[g.status]}</span>
                        <span>{formatDate(n.startsAt)} تا {formatDate(n.endsAt)}</span>
                        {n.sender && <span>از طرف {n.sender}</span>}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {isForEveryone({ departments: n.targetDepartments, locations: n.targetLocations, roles: n.targetRoles, userIds: n.targetUserIds })
                            ? 'همهٔ همکاران'
                            : 'مخاطب خاص'}
                        </span>
                        {g.status !== 'scheduled' && (
                          <span className="flex items-center gap-1" title="کسانی که «دیدم» زدند">
                            <Eye className="w-3 h-3" />
                            {toPersianDigits(n.stats.seen)} از {toPersianDigits(n.stats.audience)} نفر دیدند
                          </span>
                        )}
                        {n.notify && <span>با اعلان</span>}
                        {n.createdBy && <span>گذاشته‌شده توسط {n.createdBy}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Modal>
      {editing && <NoticeFormModal notice={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </>
  );
};
