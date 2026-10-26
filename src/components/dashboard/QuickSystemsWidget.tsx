import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { MonitorSmartphone, ExternalLink } from 'lucide-react';
import { iconMap } from '../systems/SystemsModule';

export const QuickSystemsWidget: React.FC = () => {
  const { setActiveTab, appSettings } = usePortal();
  const systems = (appSettings?.systems ?? []).slice(0, 4);
  if (systems.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#7f1d1d] text-white rounded-xl">
            <MonitorSmartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">دسترسی سریع سامانه‌ها</h3>
            <p className="text-xs text-[#6E6A60]">نرم‌افزارهای سازمانی دیگر</p>
          </div>
        </div>
        <button onClick={() => setActiveTab('systems')} className="text-xs font-bold text-[#dc2626] hover:underline">
          مشاهده همه
        </button>
      </div>

      <div className="space-y-2 pt-1">
        {systems.map((system) => {
          const Icon = iconMap[system.iconName] || ExternalLink;
          const disabled = !system.url || system.url === '#';
          return (
            <a
              key={system.id}
              href={disabled ? undefined : system.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={disabled}
              className={`w-full flex items-center justify-between p-3 rounded-2xl transition-colors group ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#F5F2ED]'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${system.bgColor} ${system.textColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold text-[#2D2D2D] group-hover:text-[#dc2626] transition-colors">{system.name}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-[#A8A295] group-hover:text-[#dc2626]" />
            </a>
          );
        })}
      </div>
    </div>
  );
};
