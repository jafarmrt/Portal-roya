import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { RoyaLogo } from './common/RoyaLogo';
import { LogIn } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = usePortal();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(username, password)) {
      setError('نام کاربری یا رمز عبور اشتباه است.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E6E0D5] p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#7f1d1d] rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <RoyaLogo className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#2D2D2D]">پرتال سازمانی رویا</h1>
          <p className="text-sm text-[#8C867A] mt-2">برای ورود مشخصات خود را وارد کنید</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-[#FBF0EC] text-[#D97B5F] text-xs font-bold rounded-xl border border-[#D97B5F]/30 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6E6A60] mb-1">نام کاربری</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#E6E0D5] bg-[#F5F2ED] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#dc2626]/30 focus:border-[#dc2626] transition-all text-sm text-left"
              dir="ltr"
              placeholder="مثال: m.rezaei"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-[#6E6A60] mb-1">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#E6E0D5] bg-[#F5F2ED] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#dc2626]/30 focus:border-[#dc2626] transition-all text-sm text-left"
              dir="ltr"
              placeholder="123"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-2"
          >
            <LogIn className="w-5 h-5" />
            <span>ورود به سیستم</span>
          </button>
        </form>

        <div className="mt-6 text-center text-[11px] text-[#A8A295]">
          <p>نام کاربری پیش‌فرض: m.rezaei یا admin</p>
          <p>رمز عبور: 123</p>
        </div>
      </div>
    </div>
  );
};
