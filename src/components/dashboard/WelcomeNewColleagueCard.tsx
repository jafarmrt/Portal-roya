import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Send, UserPlus, MessageSquare, Check, Trash2, Edit3 } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { formatDate, timeAgo, toPersianDigits } from '../../lib/jalali';
import type { NewColleagueWelcome } from '../../types';
import { IntroduceColleagueModal } from '../colleagues/IntroduceColleagueModal';

export const WelcomeNewColleagueCard: React.FC = () => {
  const { newColleagues, employees, sendWelcomeWish, deleteWelcomeWish, deleteIntroduction, currentUser, can, isGuest } = usePortal();
  const [wishInputs, setWishInputs] = useState<Record<string, string>>({});
  const [submittedStatus, setSubmittedStatus] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<NewColleagueWelcome | null>(null);
  const canManage = can('users.manage');

  // Only colleagues introduced in the last 60 days are shown on the dashboard.
  const recent = newColleagues.filter(nc => Date.now() - new Date(nc.createdAt).getTime() < 60 * 864e5).slice(0, 3);
  const editingColleague = editing ? employees.find((e) => e.id === editing.userId) : undefined;

  const handleSendWish = async (ncId: string) => {
    const text = wishInputs[ncId]?.trim() || 'ورودتان به رویا طرح داخلی را صمیمانه تبریک می‌گوییم! 🎉';
    if (!(await sendWelcomeWish(ncId, text))) return;
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
        {recent.length > 0 && (
          <span className="text-xs bg-[#EFEFEA] text-[#991b1b] px-3 py-1 rounded-full font-bold border border-[#991b1b]/30">
            {toPersianDigits(recent.length)} همکار جدید
          </span>
        )}
      </div>

      {editing && editingColleague && <IntroduceColleagueModal colleague={editingColleague} card={editing} onClose={() => setEditing(null)} />}

      {recent.length === 0 ? (
        <div className="py-4 text-center space-y-1.5 text-xs">
          <p className="text-[#6E6A60]">
            {isGuest && newColleagues.length === 0 ? 'معرفی همکاران جدید پس از ورود به پرتال نمایش داده می‌شود.' : 'در دو ماه گذشته همکار جدیدی معرفی نشده است.'}
          </p>
          {canManage && (
            <p className="text-[#8C867A]">برای معرفی، هنگام «ثبت همکار جدید» تیک معرفی را بزنید یا از پروفایل همکار «معرفی به عنوان همکار جدید» را انتخاب کنید.</p>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {recent.map((nc) => {
          const colleague = employees.find(e => e.id === nc.userId);
          if (!colleague) return null;

          return (
            <div key={nc.id} className="p-5 bg-gradient-to-br from-[#F5F2ED] to-[#EFEFEA]/50 rounded-2xl border border-[#E6E0D5] space-y-4">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Avatar src={colleague.avatar} firstName={colleague.firstName} lastName={colleague.lastName} className="w-20 h-20 rounded-2xl border-4 border-white shadow-md text-xl" />
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
                    {colleague.position} | {colleague.department}
                  </p>
                  <p className="text-[11px] text-[#6E6A60]">
                    تاریخ پیوستن: <strong>{formatDate(nc.joinDate)}</strong>
                  </p>
                </div>
                {canManage && (
                  <div className="sm:mr-auto flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(nc)} aria-label="ویرایش کارت معرفی" title="ویرایش کارت معرفی" className="p-1.5 text-[#8C867A] hover:text-[#991b1b] rounded-lg hover:bg-white">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`کارت معرفی ${colleague.firstName} ${colleague.lastName} و پیام‌های آن حذف شود؟`)) void deleteIntroduction(nc.id);
                      }}
                      aria-label="حذف کارت معرفی"
                      title="حذف کارت معرفی"
                      className="p-1.5 text-[#8C867A] hover:text-red-700 rounded-lg hover:bg-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
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
                    <span>پیام‌های خوش‌آمدگویی همکاران ({toPersianDigits(nc.wishes.length)}):</span>
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pl-1">
                    {nc.wishes.map((w) => (
                      <div key={w.id} className="p-2 bg-white rounded-lg border border-[#E6E0D5] text-[11px] flex justify-between gap-2">
                        <span><strong>{w.userName}:</strong> {w.message}</span>
                        <span className="flex items-start gap-1.5 text-[10px] text-[#8C867A] whitespace-nowrap">
                          {timeAgo(w.time)}
                          {(w.senderId === currentUser?.id || can('comments.moderate')) && (
                            <button type="button" onClick={() => deleteWelcomeWish(w.id)} aria-label={`حذف پیام ${w.userName}`} title="حذف پیام" className="text-[#8C867A] hover:text-red-700">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input for sending welcome wish */}
              {nc.userId !== currentUser?.id && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={wishInputs[nc.id] || ''}
                  onChange={(e) => setWishInputs(prev => ({ ...prev, [nc.id]: e.target.value }))}
                  placeholder="نوشتن پیام خوش‌آمدگویی صمیمانه..."
                  aria-label={`پیام خوش‌آمد برای ${colleague.firstName}`}
                  maxLength={500}
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
              )}

            </div>
          );
        })}
      </div>
      )}

    </div>
  );
};
