import React, { useState } from 'react';
import { ArrowDown, ArrowUp, LayoutDashboard } from 'lucide-react';
import { DASHBOARD_LAYOUT, DASHBOARD_ZONE_LABELS, dashboardOrder, type DashboardCardKey } from '../../../shared/dashboard';
import { usePortal } from '../../context/PortalContext';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const cardInfo = (id: DashboardCardKey) => DASHBOARD_LAYOUT.find((c) => c.id === id)!;

/**
 * «چیدمان داشبورد من»: the person moves their cards up and down; none can be hidden. Cards they do not
 * see right now (switched off, or with nothing to show) keep their place in the saved order.
 */
export const DashboardLayoutModal: React.FC<{ shown: DashboardCardKey[]; onClose: () => void }> = ({ shown, onClose }) => {
  const { appSettings, setDashboardOrder } = usePortal();
  const [order, setOrder] = useState(() => dashboardOrder(appSettings?.dashboardOrder ?? []));
  const [busy, setBusy] = useState(false);
  const visible = order.filter((id) => shown.includes(id));
  const changed = JSON.stringify(order) !== JSON.stringify(dashboardOrder(appSettings?.dashboardOrder ?? []));
  const isDefault = JSON.stringify(order) === JSON.stringify(dashboardOrder([]));

  // Swaps the card with its visible neighbour; hidden cards in between stay where they are.
  const move = (id: DashboardCardKey, delta: -1 | 1) => {
    const neighbour = visible[visible.indexOf(id) + delta];
    if (!neighbour) return;
    setOrder(order.map((c) => (c === id ? neighbour : c === neighbour ? id : c)));
  };

  const save = async (next: string[]) => {
    setBusy(true);
    const ok = await setDashboardOrder(next);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="چیدمان داشبورد من"
      subtitle="این ترتیب فقط برای خودتان است"
      icon={<LayoutDashboard className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" disabled={busy || isDefault} onClick={() => setOrder(dashboardOrder([]))} className={`${secondaryButtonClass} ml-auto`}>
            بازگشت به چیدمان پیش‌فرض
          </button>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" disabled={busy || !changed} onClick={() => void save(isDefault ? [] : order)} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </>
      }
    >
      <p className="text-[11px] text-[#6E6A60] leading-relaxed mb-3">
        روی گوشی کارت‌ها دقیقاً به همین ترتیب زیر هم می‌آیند. روی کامپیوتر هر کارت در بخش خودش از صفحه می‌ماند و در همان بخش به همین ترتیب چیده می‌شود.
      </p>
      <ol className="space-y-1.5">
        {visible.map((id, i) => {
          const info = cardInfo(id);
          return (
            <li key={id} className="flex items-center gap-2 p-2.5 bg-[#F5F2ED] rounded-xl">
              <span className="w-5 text-center text-[11px] font-bold text-[#8C867A] tabular-nums">{(i + 1).toLocaleString('fa-IR')}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-[#2D2D2D]">{info.label}</span>
                <span className="hidden lg:block text-[10px] text-[#8C867A]">{DASHBOARD_ZONE_LABELS[info.zone]}</span>
              </span>
              <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`بالا بردن ${info.label}`} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30">
                <ArrowUp className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => move(id, 1)} disabled={i === visible.length - 1} aria-label={`پایین بردن ${info.label}`} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30">
                <ArrowDown className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
};
