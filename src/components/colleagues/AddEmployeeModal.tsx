import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserRole } from '../../types';
import { X, UserPlus, CheckCircle2, Sparkles, Image as ImageIcon } from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({ isOpen, onClose }) => {
  const { addEmployee, appSettings } = usePortal();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState(appSettings?.departments[0] || '');
  const [extension, setExtension] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('15 اردیبهشت 1372');
  const [hireDate, setHireDate] = useState(new Date().toLocaleDateString('fa-IR'));
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('دفتر مرکزی - طبقه ۲');
  const [avatar, setAvatar] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80');
  const [role, setRole] = useState<UserRole>('employee');
  const [isNewColleague, setIsNewColleague] = useState(true);
  const [newColleagueMessage, setNewColleagueMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !position.trim() || !extension.trim()) return;

    addEmployee({
      firstName,
      lastName,
      position,
      department,
      extension,
      mobile,
      email: email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@roya.ir`,
      birthDate,
      hireDate,
      bio,
      location,
      avatar,
      role,
      isNewColleague,
      newColleagueMessage
    });

    onClose();
    // Reset
    setFirstName('');
    setLastName('');
    setPosition('');
    setExtension('');
    setMobile('');
    setEmail('');
    setBio('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">ثبت همکار جدید در پرتال سازمان</h3>
              <p className="text-xs text-slate-500">افزودن همکار به دفترچه تلفن و انتشار تصویر در دیوار خوش‌آمدگویی</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">نام *</label>
              <input
                type="text"
                required
                placeholder="مثال: کیارش"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">نام خانوادگی *</label>
              <input
                type="text"
                required
                placeholder="مثال: حسینی"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">سمت سازمانی *</label>
              <input
                type="text"
                required
                placeholder="مثال: طراح سه بعدی"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">دپارتمان / بخش *</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 bg-white outline-hidden"
              >
                {appSettings?.departments.map(dep => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">تلفن داخلی (Extension) *</label>
              <input
                type="text"
                required
                placeholder="مثال: 108"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">شماره همراه *</label>
              <input
                type="text"
                required
                placeholder="0912..."
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">پست الکترونیکی</label>
              <input
                type="email"
                placeholder="k.hosseini@roya.ir"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">تاریخ تولد *</label>
              <input
                type="text"
                required
                placeholder="05 اسفند 1373"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">تصویر پرتره همکار (URL)</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">معرفی کوتاه / بیوگرافی</label>
            <textarea
              rows={2}
              placeholder="توضیحات کوتاه درباره سوابق و تخصص‌های همکار..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          {/* New Colleague Welcome Option */}
          <div className="p-4 bg-red-50/70 rounded-2xl border border-red-200 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-red-900">
              <input
                type="checkbox"
                checked={isNewColleague}
                onChange={(e) => setIsNewColleague(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <span>معرفی همکار جدید در بخش داشبورد با تصویر و پیام خوش‌آمدگویی</span>
            </label>

            {isNewColleague && (
              <textarea
                rows={2}
                placeholder="متن پیام خوش‌آمدگویی رسمی سازمان..."
                value={newColleagueMessage}
                onChange={(e) => setNewColleagueMessage(e.target.value)}
                className="w-full p-2.5 border border-red-300 rounded-xl bg-white outline-hidden"
              />
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-600/20 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت و ذخیره همکار</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
