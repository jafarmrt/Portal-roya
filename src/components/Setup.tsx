import React, { useState } from 'react';
import { usePortal } from '../context/PortalContext';
import { Settings, Shield, User, Briefcase, Building, Mail, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export const Setup: React.FC = () => {
  const { completeSetup } = usePortal();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    position: 'مدیر سیستم',
    department: 'مدیریت',
    email: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/system/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success('سیستم با موفقیت راه اندازی شد!');
        completeSetup(data.user);
      } else {
        toast.error(data.error || 'خطا در راه اندازی');
      }
    } catch (err) {
      toast.error('خطای ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-lg border border-[#E6E0D5] p-8 sm:p-12 text-right">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#dc2626] text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Settings className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#2D2D2D]">راه اندازی اولیه پرتال</h1>
          <p className="text-[#6E6A60] mt-2">لطفاً حساب کاربری مدیر ارشد سیستم را ایجاد کنید</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#F5F2ED] p-4 rounded-xl mb-6 flex items-start gap-3">
            <Shield className="w-5 h-5 text-[#991b1b] mt-0.5" />
            <p className="text-xs text-[#6E6A60] leading-relaxed">
              این حساب کاربری دارای <strong>دسترسی کامل (مدیر ارشد)</strong> به تمامی بخش‌های سامانه از جمله مدیریت همکاران، دوره‌ها، اخبار و نظرسنجی‌ها خواهد بود.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">نام کاربری</label>
              <input
                type="text"
                name="username"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full bg-[#F5F2ED] border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">رمز عبور</label>
              <input
                type="password"
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full bg-[#F5F2ED] border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                placeholder="***"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">نام</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="text"
                  name="firstName"
                  required
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                  placeholder="علی"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">نام خانوادگی</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="text"
                  name="lastName"
                  required
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                  placeholder="محمدی"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">سمت</label>
              <div className="relative">
                <Briefcase className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="text"
                  name="position"
                  required
                  value={formData.position}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                  placeholder="مدیر سیستم"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">دپارتمان</label>
              <div className="relative">
                <Building className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="text"
                  name="department"
                  required
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626]"
                  placeholder="مدیریت"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">ایمیل (اختیاری)</label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626] text-left"
                  dir="ltr"
                  placeholder="admin@example.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2D2D2D] mb-2">شماره تماس (اختیاری)</label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A295]" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full bg-[#F5F2ED] border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-[#dc2626] text-left"
                  dir="ltr"
                  placeholder="09123456789"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#dc2626] text-white rounded-xl font-bold hover:bg-[#b91c1c] transition-colors disabled:opacity-50 mt-8"
          >
            {loading ? 'در حال ایجاد حساب...' : 'ایجاد حساب مدیر و ورود به پرتال'}
          </button>
        </form>
      </div>
    </div>
  );
};
