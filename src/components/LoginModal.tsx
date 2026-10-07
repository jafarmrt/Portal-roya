import React, { useState, useEffect } from 'react';
import { usePortal } from '../context/PortalContext';
import { RoyaLogo } from './common/RoyaLogo';
import { LogIn, X, Lock, User, Sparkles, ShieldCheck, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    closeLoginModal,
    loginModalMessage,
    login,
    employees
  } = usePortal();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoginModalOpen) {
        closeLoginModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoginModalOpen, closeLoginModal]);

  if (!isLoginModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError('');
    setIsSubmitting(true);
    const success = await login(username.trim(), password.trim());
    setIsSubmitting(false);

    if (success) {
      toast.success('ورود با موفقیت انجام شد');
      closeLoginModal();
    } else {
      setError('نام کاربری یا رمز عبور اشتباه است.');
    }
  };

  const handleQuickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setIsSubmitting(true);
    setError('');
    const success = await login(u, p);
    setIsSubmitting(false);
    if (success) {
      toast.success('ورود با موفقیت انجام شد');
      closeLoginModal();
    } else {
      setError('ورود با حساب کاربری آزمایشی ناموفق بود.');
    }
  };

  return (
    <div
      id="login-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E1E1E]/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLoginModal();
      }}
      dir="rtl"
    >
      <div
        id="login-modal-card"
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-[#EAE6DF] overflow-hidden animate-in zoom-in-95 duration-200 relative"
      >
        {/* Top Header with Roya Crimson Gradient */}
        <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#dc2626] p-6 text-white relative">
          <button
            id="close-login-modal-btn"
            onClick={closeLoginModal}
            className="absolute top-5 left-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <RoyaLogo className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">ورود به حساب سازمانی</h2>
              <p className="text-[11px] text-[#F3E8E8]">رویا طرح داخلی | ROYA Surface Center</p>
            </div>
          </div>

          {loginModalMessage ? (
            <div className="mt-3 p-2.5 bg-black/20 rounded-xl border border-white/15 text-xs text-[#FDE8E8] flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <span>{loginModalMessage}</span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#F5D5D5] leading-relaxed">
              جهت ثبت نظر، رأی‌دهی، ارسال پیام تبریک، پسندیدن اخبار و دسترسی به تنظیمات وارد شوید.
            </p>
          )}
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 bg-[#FCFAF7]">
          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl text-xs font-bold text-[#DC2626] text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#4B4740] mb-1.5">
                نام کاربری سازمانی
              </label>
              <div className="relative">
                <input
                  id="login-username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="مثال: m.rezaei یا admin"
                  className="w-full pl-3 pr-10 py-3 rounded-xl border border-[#D9D4CB] bg-white text-xs font-medium text-[#1E1E1E] focus:outline-hidden focus:border-[#991b1b] focus:ring-2 focus:ring-[#991b1b]/20 transition-all text-left"
                  dir="ltr"
                  required
                />
                <User className="w-4 h-4 text-[#8C867A] absolute right-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#4B4740] mb-1.5">
                کلمه عبور
              </label>
              <div className="relative">
                <input
                  id="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور شما"
                  className="w-full pl-3 pr-10 py-3 rounded-xl border border-[#D9D4CB] bg-white text-xs font-medium text-[#1E1E1E] focus:outline-hidden focus:border-[#991b1b] focus:ring-2 focus:ring-[#991b1b]/20 transition-all text-left"
                  dir="ltr"
                  required
                />
                <Lock className="w-4 h-4 text-[#8C867A] absolute right-3 top-3.5" />
              </div>
            </div>

            <button
              id="submit-login-btn"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-[#991b1b] hover:bg-[#7f1d1d] active:bg-[#6b1414] text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'در حال بررسی...' : 'ورود به حساب کاربری'}</span>
            </button>
          </form>

          {/* Quick Demo Accounts */}
          <div className="pt-4 border-t border-[#EAE6DF] space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#7A756D]">
              <span className="font-bold">ورود سریع با اکانت‌های تستی:</span>
              <span className="text-[10px] bg-[#EFECE6] px-2 py-0.5 rounded-md">رمز پیش‌فرض: 123</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="quick-login-employee-btn"
                onClick={() => handleQuickLogin('m.rezaei', '123')}
                className="p-2.5 bg-white hover:bg-[#F3EFE9] border border-[#D9D4CB] hover:border-[#991b1b] rounded-xl text-right transition-all flex items-center gap-2 cursor-pointer shadow-2xs group"
              >
                <div className="w-7 h-7 rounded-lg bg-[#F5F2ED] group-hover:bg-[#991b1b] group-hover:text-white text-[#4B4740] flex items-center justify-center transition-colors">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-[#1E1E1E]">مریم رضایی</div>
                  <div className="text-[10px] text-[#7A756D]">کارشناس طراحی</div>
                </div>
              </button>

              <button
                type="button"
                id="quick-login-manager-btn"
                onClick={() => handleQuickLogin('admin', '123')}
                className="p-2.5 bg-white hover:bg-[#F3EFE9] border border-[#D9D4CB] hover:border-[#991b1b] rounded-xl text-right transition-all flex items-center gap-2 cursor-pointer shadow-2xs group"
              >
                <div className="w-7 h-7 rounded-lg bg-[#F5F2ED] group-hover:bg-[#991b1b] group-hover:text-white text-[#4B4740] flex items-center justify-center transition-colors">
                  <ShieldCheck className="w-4 h-4 text-[#991b1b] group-hover:text-white" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-[#1E1E1E]">علیرضا محمدی</div>
                  <div className="text-[10px] text-[#7A756D]">مدیر سیستم (ادمین)</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="px-6 py-3 bg-[#EFECE6] border-t border-[#EAE6DF] text-center">
          <p className="text-[11px] text-[#7A756D]">
            برای مشاهده پرتال و اخبار نیازی به ورود نیست.
            {' '}
            <button
              onClick={closeLoginModal}
              className="text-[#991b1b] font-bold hover:underline cursor-pointer"
            >
              ادامه به عنوان میهمان
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
