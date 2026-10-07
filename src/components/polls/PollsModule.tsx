import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { Poll } from '../../types';
import { CreatePollModal } from './CreatePollModal';
import { PollResultsModal } from './PollResultsModal';
import {
  Vote,
  Plus,
  BarChart3,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building2,
  Lock,
  Send,
  MessageSquare,
  Sparkles,
  ChevronLeft,
  Trash2,
  Filter
} from 'lucide-react';
import toast from 'react-hot-toast';

export const PollsModule: React.FC = () => {
  const {
    polls,
    currentUser,
    userRole,
    isLoggedIn,
    openLoginModal,
    votePoll,
    togglePollActiveStatus,
    deletePoll
  } = usePortal();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPollForResults, setSelectedPollForResults] = useState<Poll | null>(null);
  
  // Local voting form states for each poll
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [freeTextInputs, setFreeTextInputs] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'closed'>('all');

  const filteredPolls = polls.filter(p => {
    if (activeFilter === 'active') return p.isActive;
    if (activeFilter === 'closed') return !p.isActive;
    return true;
  });

  const handleVoteSubmit = (poll: Poll) => {
    if (!isLoggedIn) {
      openLoginModal('برای ثبت رأی در این نظرسنجی، لطفاً وارد حساب کاربری خود شوید.');
      return;
    }
    if (poll.type === 'multiple_choice') {
      const selectedOptId = selectedOptions[poll.id];
      if (!selectedOptId) {
        toast.error('لطفاً یکی از گزینه‌ها را انتخاب کنید.');
        return;
      }
      votePoll(poll.id, selectedOptId);
    } else {
      const text = freeTextInputs[poll.id];
      if (!text || !text.trim()) {
        toast.error('لطفاً نظر متنی خود را وارد کنید.');
        return;
      }
      votePoll(poll.id, undefined, text.trim());
      setFreeTextInputs(prev => ({ ...prev, [poll.id]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 -ml-12 -mt-12 w-64 h-64 rounded-full bg-[#dc2626]/20 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Vote className="w-3.5 h-3.5" />
              <span>پرتال نظرسنجی و افکارسنجی سازمان</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">نظرسنجی‌های داخلی رویا طرح داخلی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              صدای شما در تصمیم‌گیری‌های سازمانی رویا طرح داخلی اهمیت دارد. در نظرسنجی‌ها شرکت کنید و نتایج را به صورت کلی و کاملاً ناشناس مشاهده فرمایید.
            </p>
          </div>

          {/* Admin Create Poll Button */}
          {userRole === 'manager' && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد نظرسنجی جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E6E0D5] shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeFilter === 'all'
                ? 'bg-[#7f1d1d] text-white shadow-xs'
                : 'text-[#6E6A60] hover:bg-[#F5F2ED]'
            }`}
          >
            همه نظرسنجی‌ها ({polls.length})
          </button>
          <button
            onClick={() => setActiveFilter('active')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeFilter === 'active'
                ? 'bg-[#991b1b] text-white shadow-xs'
                : 'text-[#6E6A60] hover:bg-[#F5F2ED]'
            }`}
          >
            فعال و در حال رای‌گیری ({polls.filter(p => p.isActive).length})
          </button>
          <button
            onClick={() => setActiveFilter('closed')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeFilter === 'closed'
                ? 'bg-[#dc2626] text-white shadow-xs'
                : 'text-[#6E6A60] hover:bg-[#F5F2ED]'
            }`}
          >
            پایان‌یافته و بایگانی ({polls.filter(p => !p.isActive).length})
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#6E6A60] bg-[#F5F2ED] px-3 py-1.5 rounded-xl border border-[#E6E0D5]">
          <ShieldCheck className="w-4 h-4 text-[#991b1b]" />
          <span>ثبت رای به صورت کاملاً ناشناس و ایمن</span>
        </div>
      </div>

      {/* Poll Cards List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredPolls.length === 0 ? (
          <div className="lg:col-span-2 py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <Vote className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">نظرسنجی در این بخش یافت نشد.</p>
          </div>
        ) : (
          filteredPolls.map((poll) => {
            const hasVoted = currentUser ? poll.votedUserIds.includes(currentUser.id) : false;

            return (
              <div
                key={poll.id}
                className={`bg-white rounded-2xl border transition-all shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden ${
                  poll.isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-90'
                }`}
              >
                
                {/* Poll Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                      poll.isActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {poll.isActive ? '• فعال برای رای‌گیری' : 'پایان یافته'}
                    </span>

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>دپارتمان: {poll.department === 'all' ? 'همه دپارتمان‌ها' : poll.department}</span>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-800 mb-2 leading-snug">{poll.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{poll.description}</p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>مهلت: {poll.expiryDate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Vote className="w-3.5 h-3.5 text-slate-400" />
                      <span>{poll.totalVotes} شرکت‌کننده</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      طراح: {poll.createdBy}
                    </div>
                  </div>
                </div>

                {/* Poll Interactive Voting or Results Preview */}
                <div className="p-6 pt-0 space-y-4">
                  
                  {/* Case 1: Active Poll & User Has NOT Voted Yet */}
                  {poll.isActive && !hasVoted && (
                    <div className="bg-[#F5F2ED]/70 p-4 rounded-xl border border-[#E6E0D5] space-y-3">
                      
                      {poll.type === 'multiple_choice' ? (
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[#2D2D2D] block mb-1">
                            انتخاب گزینه پاسخ:
                          </label>
                          {poll.options.map((option) => (
                            <label
                              key={option.id}
                              className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                                selectedOptions[poll.id] === option.id
                                  ? 'border-[#dc2626] bg-[#F5F2ED] text-[#2D2D2D] font-bold'
                                  : 'border-[#E6E0D5] hover:bg-white text-[#2D2D2D]'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`poll-opt-${poll.id}`}
                                value={option.id}
                                checked={selectedOptions[poll.id] === option.id}
                                onChange={() => setSelectedOptions(prev => ({ ...prev, [poll.id]: option.id }))}
                                className="accent-[#dc2626] w-4 h-4"
                              />
                              <span>{option.text}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[#2D2D2D] block mb-1">
                            نظر متنی آزاد خود را بنویسید (کاملاً ناشناس):
                          </label>
                          <textarea
                            rows={3}
                            value={freeTextInputs[poll.id] || ''}
                            onChange={(e) => setFreeTextInputs(prev => ({ ...prev, [poll.id]: e.target.value }))}
                            placeholder="پیشنهاد یا نظر خود را در این بخش بنویسید..."
                            className="w-full p-3 text-xs border border-[#E6E0D5] rounded-xl focus:border-[#dc2626] bg-white outline-hidden text-[#2D2D2D]"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[10px] text-[#8C867A]">
                          * پاسخ شما فقط به صورت آمار کلی ثبت می‌شود.
                        </span>
                        <button
                          onClick={() => handleVoteSubmit(poll)}
                          className="px-4 py-2 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>ثبت رای</span>
                        </button>
                      </div>

                    </div>
                  )}

                  {/* Case 2: User HAS Voted or Poll is Closed */}
                  {(hasVoted || !poll.isActive) && (
                    <div className="p-4 bg-[#EFEFEA] border border-[#E6E0D5] rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#991b1b]">
                        <CheckCircle2 className="w-4 h-4 text-[#991b1b]" />
                        <span>{hasVoted ? 'رای شما با موفقیت ثبت شده است.' : 'نظرسنجی خاتمه یافته است.'}</span>
                      </div>

                      <p className="text-[11px] text-[#6E6A60] leading-relaxed">
                        جهت مشاهده آمار کلی و درصد پاسخ‌های همکاران می‌توانید روی دکمه مشاهده نتایج کلیک کنید.
                      </p>
                    </div>
                  )}

                  {/* Action Bar (View Results & Admin Controls) */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setSelectedPollForResults(poll)}
                      className="px-4 py-2 text-xs font-bold text-[#2D2D2D] bg-[#F5F2ED] hover:bg-[#E6E0D5] rounded-xl transition-colors flex items-center gap-1.5"
                    >
                      <BarChart3 className="w-4 h-4 text-[#dc2626]" />
                      <span>مشاهده نتایج کلی ({poll.totalVotes} نظر)</span>
                    </button>

                    {/* Admin Actions */}
                    {userRole === 'manager' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => togglePollActiveStatus(poll.id)}
                          className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                            poll.isActive 
                              ? 'text-[#dc2626] bg-[#F5F2ED] hover:bg-[#E6E0D5]'
                              : 'text-[#991b1b] bg-[#EFEFEA] hover:bg-[#E6E0D5]'
                          }`}
                          title={poll.isActive ? 'بستن نظرسنجی' : 'فعال‌سازی مجدد'}
                        >
                          {poll.isActive ? 'بستن' : 'فعال‌سازی'}
                        </button>

                        <button
                          onClick={() => {
                            if (confirm('آیا از حذف این نظرسنجی اطمینان دارید؟')) deletePoll(poll.id);
                          }}
                          className="p-1.5 text-[#8C867A] hover:text-[#D97B5F] rounded-lg hover:bg-[#FBF0EC]"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      <CreatePollModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <PollResultsModal
        poll={selectedPollForResults}
        onClose={() => setSelectedPollForResults(null)}
      />

    </div>
  );
};
