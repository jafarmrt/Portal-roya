import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { MoodState } from '../../types';
import { Smile, Frown, Meh, Sparkles, Heart } from 'lucide-react';

export const MoodTrackerWidget: React.FC = () => {
  const { submitMood, todayMoodSubmitted } = usePortal();
  const [selectedMood, setSelectedMood] = useState<MoodState | null>(null);

  const handleMoodSelect = (mood: MoodState) => {
    setSelectedMood(mood);
    submitMood(mood);
  };

  const getMotivation = (mood: MoodState) => {
    switch (mood) {
      case 'عالی': return 'عالیه! پرانرژی ادامه بده، امروز روز توئه!';
      case 'خوب': return 'خوبه! با همین رویه پیش برو، کارهای بزرگی در انتظارته.';
      case 'معمولی': return 'امیدوارم ادامه‌ی روزت پر از اتفاقات مثبت و هیجان‌انگیز باشه!';
      case 'بد': return 'گاهی پیش میاد! یه نفس عمیق بکش، یه نوشیدنی بنوش و از نو شروع کن.';
      case 'خیلی بد': return 'روزهای سخت هم می‌گذرن. مهم اینه که تو قوی‌تر از موانعی. ما در کنار تیمیم!';
      default: return '';
    }
  };

  if (todayMoodSubmitted && selectedMood) {
    return (
      <div className="bg-[#FEF2F2] rounded-3xl p-6 border border-[#FCA5A5]/60 shadow-2xs flex items-center justify-between" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#991b1b] text-white rounded-2xl shadow-xs">
            <Heart className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1E1E1E]">بازخورد شما ثبت شد</h3>
            <p className="text-xs font-medium text-[#991b1b] mt-0.5">{getMotivation(selectedMood)}</p>
          </div>
        </div>
      </div>
    );
  }

  if (todayMoodSubmitted) return null; // Submitted previously

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#EAE6DF] shadow-2xs space-y-4" dir="rtl">
      <div className="flex items-center justify-between pb-3 border-b border-[#EAE6DF]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#FEF2F2] text-[#991b1b] rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1E1E1E]">حال و هوای کاری امروز شما</h3>
            <p className="text-[11px] text-[#7A756D]">ناشناس است؛ مدیران فقط آمار کلی را می‌بینند.</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-5 gap-1 pt-1">
        <button 
          type="button"
          onClick={() => handleMoodSelect('خیلی بد')} 
          className="min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl hover:bg-[#FEF2F2] hover:text-[#991b1b] text-[#7A756D] transition-all border border-transparent hover:border-[#FCA5A5]/40 cursor-pointer"
        >
          <Frown className="w-7 h-7 text-[#DC2626]" />
          <span className="text-[10px] font-bold whitespace-nowrap">خیلی بد</span>
        </button>
        <button 
          type="button"
          onClick={() => handleMoodSelect('بد')} 
          className="min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl hover:bg-[#F5F2ED] hover:text-[#B45309] text-[#7A756D] transition-all border border-transparent hover:border-[#EAE6DF] cursor-pointer"
        >
          <Frown className="w-7 h-7 text-[#D97706] opacity-80" />
          <span className="text-[10px] font-bold whitespace-nowrap">بد</span>
        </button>
        <button 
          type="button"
          onClick={() => handleMoodSelect('معمولی')} 
          className="min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl hover:bg-[#F5F2ED] hover:text-[#605C54] text-[#7A756D] transition-all border border-transparent hover:border-[#EAE6DF] cursor-pointer"
        >
          <Meh className="w-7 h-7 text-[#7A756D]" />
          <span className="text-[10px] font-bold whitespace-nowrap">معمولی</span>
        </button>
        <button 
          type="button"
          onClick={() => handleMoodSelect('خوب')} 
          className="min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl hover:bg-[#F0FDF4] hover:text-[#15803D] text-[#7A756D] transition-all border border-transparent hover:border-[#BBF7D0] cursor-pointer"
        >
          <Smile className="w-7 h-7 text-[#16A34A] opacity-90" />
          <span className="text-[10px] font-bold whitespace-nowrap">خوب</span>
        </button>
        <button 
          type="button"
          onClick={() => handleMoodSelect('عالی')} 
          className="min-w-0 flex flex-col items-center gap-1.5 px-1 py-2.5 rounded-2xl hover:bg-[#FEF2F2] hover:text-[#991b1b] text-[#7A756D] transition-all border border-transparent hover:border-[#FCA5A5]/40 cursor-pointer"
        >
          <Smile className="w-7 h-7 text-[#991b1b]" />
          <span className="text-[10px] font-bold whitespace-nowrap">عالی</span>
        </button>
      </div>
    </div>
  );
};
