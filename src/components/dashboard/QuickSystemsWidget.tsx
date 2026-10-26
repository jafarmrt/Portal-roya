import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { ExternalLink, LayoutGrid, Settings2 } from 'lucide-react';
import type { ExternalSystem } from '../../types';
import { iconMap } from '../systems/SystemsModule';

export const isSystemLinkSet = (system: ExternalSystem) => Boolean(system.url) && system.url !== '#';

/** One organisation app as a launch tile; opens in a new tab so the portal stays open. */
export const SystemTile: React.FC<{ system: ExternalSystem; compact?: boolean; onLaunch?: () => void }> = ({ system, compact, onLaunch }) => {
  const Icon = iconMap[system.iconName] || ExternalLink;
  const ready = isSystemLinkSet(system);
  return (
    <a
      href={ready ? system.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!ready}
      title={ready ? `${system.name} (در زبانهٔ جدید باز می‌شود)` : 'آدرس این سامانه هنوز ثبت نشده است'}
      onClick={(e) => {
        if (!ready) e.preventDefault();
        else onLaunch?.();
      }}
      className={`group flex items-center gap-2.5 rounded-2xl border transition-all min-w-0 ${compact ? 'p-2.5' : 'p-3'} ${
        ready
          ? 'bg-white border-[#E6E0D5] hover:border-[#dc2626] hover:shadow-md focus-visible:border-[#dc2626]'
          : 'bg-[#F5F2ED]/60 border-dashed border-[#D9D4CB] opacity-70 cursor-not-allowed'
      }`}
    >
      <span className={`p-2 rounded-xl shrink-0 ${system.bgColor} ${system.textColor}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs sm:text-sm font-bold text-[#2D2D2D] group-hover:text-[#dc2626] transition-colors line-clamp-2 leading-snug">{system.name}</span>
        {!compact && system.description && <span className="block text-[11px] text-[#6E6A60] truncate">{system.description}</span>}
      </span>
      {ready && <ExternalLink className="w-3.5 h-3.5 text-[#A8A295] group-hover:text-[#dc2626] shrink-0 hidden sm:block" />}
    </a>
  );
};

/** All organisation apps, shown right under the welcome banner so nobody has to scroll for them. */
export const QuickSystemsWidget: React.FC = () => {
  const { setActiveTab, appSettings, userRole } = usePortal();
  const systems = appSettings?.systems ?? [];
  if (systems.length === 0) return null;

  return (
    <section aria-labelledby="quick-systems-title" className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E6E0D5] shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quick-systems-title" className="flex items-center gap-2 text-sm font-black text-[#2D2D2D]">
          <span className="p-1.5 bg-[#7f1d1d] text-white rounded-lg"><LayoutGrid className="w-4 h-4" /></span>
          سامانه‌های سازمان
        </h2>
        <button onClick={() => setActiveTab('systems')} className="text-xs font-bold text-[#dc2626] hover:underline flex items-center gap-1">
          {userRole === 'manager' && <Settings2 className="w-3.5 h-3.5" />}
          {userRole === 'manager' ? 'مدیریت سامانه‌ها' : 'همه سامانه‌ها'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
        {systems.map((system) => <SystemTile key={system.id} system={system} compact />)}
      </div>
    </section>
  );
};
