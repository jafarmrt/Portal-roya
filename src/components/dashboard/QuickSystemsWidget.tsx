import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { MonitorSmartphone, ExternalLink, Database, Globe, CalendarClock } from 'lucide-react';

export const QuickSystemsWidget: React.FC = () => {
  const { setActiveTab } = usePortal();

  const quickLinks = [
    { name: 'سیستم CRM', icon: <Database className="w-5 h-5" />, color: 'text-red-600', bg: 'bg-red-50' },
    { name: 'اتوماسیون', icon: <Globe className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'حضور و غیاب', icon: <CalendarClock className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#7f1d1d] text-white rounded-xl">
            <MonitorSmartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">دسترسی سریع سامانه‌ها</h3>
            <p className="text-xs text-[#6E6A60]">برنامه‌های سازمانی پرکاربرد</p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('systems')}
          className="text-xs font-bold text-[#dc2626] hover:underline"
        >
          مشاهده همه
        </button>
      </div>

      <div className="space-y-3 pt-2">
        {quickLinks.map((link, idx) => (
          <button key={idx} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-[#F5F2ED] transition-colors group">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${link.bg} ${link.color}`}>
                {link.icon}
              </div>
              <span className="text-sm font-bold text-[#2D2D2D] group-hover:text-[#dc2626] transition-colors">{link.name}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-[#A8A295] group-hover:text-[#dc2626]" />
          </button>
        ))}
      </div>
    </div>
  );
};
