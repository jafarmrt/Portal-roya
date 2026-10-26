import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import { Cake, Send, Check, Trash2 } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { daysUntilBirthday, formatDate, timeAgo, toPersianDigits } from '../../lib/jalali';

const UPCOMING_DAYS = 14;

export const BirthdayCard: React.FC = () => {
  const { employees, sendBirthdayWish, deleteBirthdayWish, birthdayWishes, currentUser, can } = usePortal();
  const [wishTexts, setWishTexts] = useState<Record<string, string>>({});
  const [sentStatus, setSentStatus] = useState<Record<string, boolean>>({});

  // Colleagues whose birthday is today or within the next two weeks, soonest first.
  const birthdayColleagues = employees
    .filter(e => e.isActive)
    .map(e => ({ emp: e, days: daysUntilBirthday(e.birthDate) }))
    .filter((x): x is { emp: UserProfile; days: number } => x.days !== null && x.days <= UPCOMING_DAYS)
    .sort((a, b) => a.days - b.days);

  if (birthdayColleagues.length === 0) return null;

  const handleSendWish = async (userId: string) => {
    const text = wishTexts[userId]?.trim();
    if (!text) return;
    if (!(await sendBirthdayWish(userId, text))) return;
    setSentStatus(prev => ({ ...prev, [userId]: true }));
    setTimeout(() => {
      setSentStatus(prev => ({ ...prev, [userId]: false }));
      setWishTexts(prev => ({ ...prev, [userId]: '' }));
    }, 2500);
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6E0D5] shadow-xs space-y-4">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E6E0D5]">
        <div className="flex items-center gap-2">
          <div className="p-2.5 bg-[#FBF0EC] text-[#D97B5F] rounded-2xl">
            <Cake className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#2D2D2D]">زادروز همکاران رویا 🎂</h3>
            <p className="text-xs text-[#6E6A60]">تولدهای امروز و دو هفتهٔ آینده</p>
          </div>
        </div>
        <span className="text-xs bg-[#FBF0EC] text-[#D97B5F] px-3 py-1 rounded-full font-bold border border-[#D97B5F]/30">
          {toPersianDigits(birthdayColleagues.length)} همکار
        </span>
      </div>

      {/* List */}
      <div className="space-y-4">
        {birthdayColleagues.slice(0, 4).map(({ emp, days }) => (
          <div key={emp.id} className="p-4 bg-[#F5F2ED]/70 rounded-2xl border border-[#E6E0D5] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-12 h-12 rounded-full border-2 border-[#D97B5F] shadow-xs text-sm" />
                <div>
                  <h4 className="text-sm font-bold text-[#2D2D2D]">
                    {emp.firstName} {emp.lastName}
                  </h4>
                  <p className="text-xs text-[#6E6A60]">{emp.position} | {emp.department}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-black text-[#D97B5F] bg-[#FBF0EC] px-2.5 py-1 rounded-xl border border-[#D97B5F]/20">
                  {days === 0 ? 'امروز 🎉' : days === 1 ? 'فردا' : `${toPersianDigits(days)} روز دیگر`}
                </span>
                <div className="text-[10px] text-[#8C867A] mt-1">{formatDate(emp.birthDate).replace(/ [۰-۹]+$/, '')}</div>
              </div>
            </div>

            {/* Quick Wish Input Box */}
            {emp.id !== currentUser?.id && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={wishTexts[emp.id] || ''}
                onChange={(e) => setWishTexts(prev => ({ ...prev, [emp.id]: e.target.value }))}
                placeholder="متن پیام تبریک تولد..."
                aria-label={`پیام تبریک برای ${emp.firstName} ${emp.lastName}`}
                maxLength={500}
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E6E0D5] rounded-xl outline-hidden focus:border-[#D97B5F] text-[#2D2D2D]"
              />
              <button
                onClick={() => handleSendWish(emp.id)}
                disabled={!wishTexts[emp.id]?.trim()}

                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1 ${
                  sentStatus[emp.id]
                    ? 'bg-[#991b1b] text-white'
                    : 'bg-[#D97B5F] hover:bg-[#C2684D] text-white shadow-xs'
                }`}
              >
                {sentStatus[emp.id] ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>ارسال شد</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>تبریک</span>
                  </>
                )}
              </button>
            </div>
            )}

            {/* Wishes Display */}
            {birthdayWishes[emp.id] && birthdayWishes[emp.id].length > 0 && (
              <div className="mt-3 space-y-2 max-h-32 overflow-y-auto no-scrollbar pt-2 border-t border-[#E6E0D5]">
                {birthdayWishes[emp.id].map(wish => (
                  <div key={wish.id} className="bg-white p-2.5 rounded-xl border border-[#E6E0D5] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#D97B5F]">{wish.senderName}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-[#A8A295]">
                        {timeAgo(wish.time)}
                        {(wish.senderId === currentUser?.id || can('comments.moderate')) && (
                          <button type="button" onClick={() => deleteBirthdayWish(wish.id)} aria-label={`حذف پیام ${wish.senderName}`} title="حذف پیام" className="p-0.5 text-[#A8A295] hover:text-red-700">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-[#2D2D2D] leading-relaxed">{wish.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
};
