import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { Sparkles, Award } from 'lucide-react';
import { todayJalali, toPersianDigits } from '../../lib/jalali';

export const WorkAnniversaryWidget: React.FC = () => {
  const { currentUser } = usePortal();

  if (!currentUser || !currentUser.hireDate) return null;
  const hireDate = currentUser.hireDate; // e.g. "1399/04/10"

  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(hireDate);
  if (!match) return null;
  const [, hireYear, hireMonth, hireDay] = match.map(Number);
  const [currentYear, currentMonth, currentDay] = todayJalali().split('/').map(Number);

  // Shown during the first week after the anniversary date.
  const isAnniversaryWeek = hireMonth === currentMonth && currentDay >= hireDay && currentDay - hireDay < 7;
  const yearsOfService = currentYear - hireYear;

  if (yearsOfService > 0 && isAnniversaryWeek) {
    return (
      <div className="bg-gradient-to-r from-[#dc2626] to-[#f87171] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-5 -mb-5"></div>
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="p-4 bg-white/20 rounded-full backdrop-blur-sm border border-white/30 shadow-inner">
            <Award className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-bold border border-white/30 mb-2">
              <Sparkles className="w-3 h-3" />
              تولد سازمانی
            </div>
            <h3 className="text-lg font-black text-white">{toPersianDigits(yearsOfService)} سالگی حضور شما در رویا طرح داخلی مبارک! 🎉</h3>
            <p className="text-xs text-white/90 mt-1 max-w-xl leading-relaxed">
              از اینکه {toPersianDigits(yearsOfService)} سال در کنار ما هستید و با تلاش‌هایتان به رشد سازمان کمک می‌کنید، صمیمانه سپاسگزاریم.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
