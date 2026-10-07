import React from 'react';
import { Poll } from '../../types';
import { X, BarChart3, MessageSquare, ShieldCheck, UserCheck, CheckCircle2 } from 'lucide-react';

interface PollResultsModalProps {
  poll: Poll | null;
  onClose: () => void;
}

export const PollResultsModal: React.FC<PollResultsModalProps> = ({ poll, onClose }) => {
  if (!poll) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">نتایج کلی و ناشناس نظرسنجی</h3>
              <p className="text-xs text-slate-500">{poll.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Metadata banner */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>نتایج به صورت کاملاً کلی و ناشناس محاسبه شده‌اند</span>
            </div>
            <div className="text-slate-500 font-bold">
              مجموع شرکت‌کنندگان: <span className="text-slate-800">{poll.totalVotes} نفر</span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            {poll.description}
          </p>

          {/* Results Visualization based on Type */}
          {poll.type === 'multiple_choice' ? (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-red-600" />
                <span>توزیع درصد آرا:</span>
              </h4>

              {poll.options.map((opt) => {
                const percentage = poll.totalVotes > 0 
                  ? Math.round((opt.votesCount / poll.totalVotes) * 100) 
                  : 0;

                return (
                  <div key={opt.id} className="space-y-1.5 p-3 rounded-xl border border-slate-100 bg-slate-50/30">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800">{opt.text}</span>
                      <span className="text-red-600 font-extrabold">{percentage}% ({opt.votesCount} رای)</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-500 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-red-600" />
                <span>نظرات و پیشنهادات آزاد متنی ثبت‌شده ({poll.freeTextResponses.length} نظر):</span>
              </h4>

              {poll.freeTextResponses.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  هنوز هیچ نظر متنی ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-3">
                  {poll.freeTextResponses.map((ft) => (
                    <div key={ft.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-red-500" />
                          <span>{ft.anonymousUserHash}</span>
                        </span>
                        <span>{ft.submittedAt}</span>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed pt-1 border-t border-slate-100">
                        "{ft.responseText}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors"
          >
            بستن پنجره نتایج
          </button>
        </div>

      </div>
    </div>
  );
};
