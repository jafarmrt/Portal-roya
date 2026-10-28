import React, { useState } from 'react';
import { ArrowDown, ArrowUp, LayoutDashboard } from 'lucide-react';
import { DASHBOARD_LAYOUT, DASHBOARD_ZONE_LABELS, dashboardOrder, type DashboardCardKey, type DashboardZone } from '../../../shared/dashboard';
import { usePortal } from '../../context/PortalContext';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const cardInfo = (id: DashboardCardKey) => DASHBOARD_LAYOUT.find((c) => c.id === id)!;

interface DashboardLayoutModalProps {
  /** 'mine': the person's own order. 'everyone': the administrator's order for all who have not arranged their own. */
  mode?: 'mine' | 'everyone';
  /** The cards to list; the others keep their place in the saved order. */
  shown: DashboardCardKey[];
  onClose: () => void;
}

/**
 * «چیدمان داشبورد»: cards move up and down; none can be hidden. Cards not listed (switched off, or
 * with nothing to show) keep their place in the saved order. A small picture shows how a computer
 * screen will look.
 */
export const DashboardLayoutModal: React.FC<DashboardLayoutModalProps> = ({ mode = 'mine', shown, onClose }) => {
  const { appSettings, setDashboardOrder, updateSettings } = usePortal();
  const everyone = mode === 'everyone';
  const adminOrder = appSettings?.dashboardDefaultOrder ?? [];
  const saved = everyone ? dashboardOrder(adminOrder) : dashboardOrder(appSettings?.dashboardOrder ?? [], adminOrder);
  const fallback = everyone ? dashboardOrder([]) : dashboardOrder([], adminOrder);
  const [order, setOrder] = useState(saved);
  const [busy, setBusy] = useState(false);
  const visible = order.filter((id) => shown.includes(id));
  const changed = JSON.stringify(order) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(order) === JSON.stringify(fallback);

  // Swaps the card with its visible neighbour; hidden cards in between stay where they are.
  const move = (id: DashboardCardKey, delta: -1 | 1) => {
    const neighbour = visible[visible.indexOf(id) + delta];
    if (!neighbour) return;
    setOrder(order.map((c) => (c === id ? neighbour : c === neighbour ? id : c)));
  };

  const save = async () => {
    setBusy(true);
    const next = isDefault ? [] : order;
    const ok = everyone ? await updateSettings({ dashboardDefaultOrder: next }) : await setDashboardOrder(next);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={everyone ? 'ترتیب پیش‌فرض داشبورد برای همه' : 'چیدمان داشبورد من'}
      subtitle={everyone ? 'برای همکارانی که ترتیب خودشان را نچیده‌اند' : 'این ترتیب فقط برای خودتان است'}
      icon={<LayoutDashboard className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" disabled={busy || isDefault} onClick={() => setOrder(fallback)} className={`${secondaryButtonClass} ml-auto`}>
            {everyone ? 'بازگشت به ترتیب اولیه' : 'بازگشت به چیدمان پیش‌فرض'}
          </button>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" disabled={busy || !changed} onClick={() => void save()} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </>
      }
    >
      <p className="text-[11px] text-[#6E6A60] leading-relaxed mb-3">
        روی گوشی کارت‌ها دقیقاً به همین ترتیب زیر هم می‌آیند. روی کامپیوتر هر کارت در بخش خودش از صفحه می‌ماند و در همان بخش به همین ترتیب چیده می‌شود.
        {everyone && ' کسانی که ترتیب خودشان را چیده‌اند، همان ترتیب خودشان را می‌بینند.'}
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
      <LayoutPreview order={visible} />
    </Modal>
  );
};

/** How a computer screen will look: the top row, then the wide column (right) and the side column (left). */
const LayoutPreview: React.FC<{ order: DashboardCardKey[] }> = ({ order }) => {
  const zone = (z: DashboardZone) => order.filter((id) => cardInfo(id).zone === z);
  const box = (id: DashboardCardKey) => (
    <div key={id} className="px-1.5 py-1 bg-white border border-[#E6E0D5] rounded-md text-[10px] font-bold text-[#4B4740] truncate">
      {cardInfo(id).label}
    </div>
  );
  return (
    <figure className="mt-4 hidden sm:block" aria-label="پیش‌نمایش روی کامپیوتر">
      <figcaption className="text-[11px] font-bold text-[#6E6A60] mb-1.5">پیش‌نمایش روی کامپیوتر</figcaption>
      <div className="p-2 bg-[#F5F2ED] rounded-xl space-y-1.5" aria-hidden="true">
        <div className="h-5 rounded-md bg-gradient-to-l from-[#7f1d1d] to-[#ef4444] opacity-80" />
        <div className="space-y-1">{zone('top').map(box)}</div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="col-span-2 space-y-1">{zone('main').map(box)}</div>
          <div className="space-y-1">{zone('side').map(box)}</div>
        </div>
      </div>
    </figure>
  );
};
