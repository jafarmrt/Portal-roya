import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Sparkles, Send, Heart, UserPlus, MessageSquare, Check } from 'lucide-react';

export const WelcomeNewColleagueCard: React.FC = () => {
  const { newColleagues, employees, sendWelcomeWish, isLoggedIn, openLoginModal } = usePortal();
  const [wishInputs, setWishInputs] = useState<Record<string, string>>({});
  const [submittedStatus, setSubmittedStatus] = useState<Record<string, boolean>>({});

  if (newColleagues.length === 0) return null;

  const handleSendWish = (ncId: string) => {
    if (!isLoggedIn) {
      openLoginModal('برای ارسال پیام خوش‌آمدگویی، لطفاً وارد حساب کاربری شوید.');
      return;
    }
    const text = wishInputs[ncId] || 'ورودتان به رویا طرح داخلی را صمیمانه تبریک می‌گوییم! 🎉';
    sendWelcomeWish(ncId, text);
    setSubmittedStatus(prev => ({ ...prev, [ncId]: true }));
    setTimeout(() => {
      setSubmittedStatus(prev => ({ ...prev, [ncId]: false }));
      setWishInputs(prev => ({ ...prev, [ncId]: '' }));
    }, 2000);
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-[#EFEFEA] text-[#991b1b] rounded-2xl">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">معرفی همکاران جدید با تصویر 👋</h3>
            <p className="text-xs text-[#6E6A60]">ارسال پیام خوش‌آمدگویی به اعضای جدید سازمان</p>
          </div>
        </div>
        <span className="text-xs bg-[#EFEFEA] text-[#991b1b] px-3 py-1 rounded-full font-bold border border-[#991b1b]/30">
          جدیدترین همکار
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {newColleagues.map((nc) => {
          const colleague = employees.find(e => e.id === nc.userId);
          if (!colleague) return null;

          return (
            <div key={nc.id} className="p-5 bg-gradient-to-br from-[#F5F2ED] to-[#EFEFEA]/50 rounded-2xl border border-[#E6E0D5] space-y-4">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <img
                  src={colleague.avatar || undefined}
                  alt={colleague.firstName}
                  className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-md"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-[#2D2D2D]">
                      {colleague.firstName} {colleague.lastName}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 bg-[#991b1b] text-white font-bold rounded-md">
                      همکار جدید
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#dc2626]">
                    {nc.position} | {nc.department}
                  </p>
                  <p className="text-[11px] text-[#6E6A60]">
                    تاریخ پیوستن: <strong>{nc.joinDate}</strong>
                  </p>
                </div>
              </div>

              {/* Welcome Official Message */}
              <p className="text-xs text-[#2D2D2D] leading-relaxed bg-white p-3.5 rounded-xl border border-[#E6E0D5]">
                "{nc.welcomeMessage}"
              </p>

              {/* Colleague Wishes Board */}
              {nc.wishes && nc.wishes.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-bold text-[#2D2D2D] flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-[#991b1b]" />
                    <span>پیام‌های خوش‌آمدگویی همکاران ({nc.wishes.length}):</span>
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pl-1">
                    {nc.wishes.map((w) => (
                      <div key={w.id} className="p-2 bg-white rounded-lg border border-[#E6E0D5] text-[11px] flex justify-between gap-2">
                        <span><strong>{w.userName}:</strong> {w.message}</span>
                        <span className="text-[10px] text-[#8C867A] whitespace-nowrap">{w.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input for sending welcome wish */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={wishInputs[nc.id] || ''}
                  onChange={(e) => setWishInputs(prev => ({ ...prev, [nc.id]: e.target.value }))}
                  placeholder="نوشتن پیام خوش‌آمدگویی صمیمانه..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#991b1b] text-[#2D2D2D]"
                />
                <button
                  onClick={() => handleSendWish(nc.id)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1 ${
                    submittedStatus[nc.id]
                      ? 'bg-[#7f1d1d] text-white'
                      : 'bg-[#991b1b] hover:bg-[#7f1d1d] text-white shadow-xs'
                  }`}
                >
                  {submittedStatus[nc.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>ثبت شد</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>ارسال</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
