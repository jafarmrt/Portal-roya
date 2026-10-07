import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import { X, CheckCircle2, User, Building2, PhoneCall, Mail, Calendar, MapPin, Sparkles } from 'lucide-react';

interface EditProfileModalProps {
  user: UserProfile;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, onClose }) => {
  const { updateUserProfile, userRole, appSettings } = usePortal();


  const isAdmin = userRole === 'manager';

  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [position, setPosition] = useState(user.position || '');
  const [department, setDepartment] = useState(user.department || '');
  const [extension, setExtension] = useState(user.extension || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [email, setEmail] = useState(user.email || '');
  const [birthDate, setBirthDate] = useState(user.birthDate || '');
  const [location, setLocation] = useState(user.location || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatar, setAvatar] = useState(user.avatar || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      id: user.id,
      firstName,
      lastName,
      position,
      department,
      extension,
      mobile,
      email,
      birthDate,
      location,
      bio,
      avatar
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">ویرایش مشخصات پروفایل</h3>
              <p className="text-xs text-slate-500">{firstName} {lastName}</p>
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
              <label className="block text-[11px] font-bold text-[#6E6A60] mb-1">نام *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={!isAdmin}
                className="w-full p-2.5 border border-[#E6E0D5] bg-[#F5F2ED] rounded-xl focus:border-[#dc2626] focus:bg-white outline-hidden text-sm disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#6E6A60] mb-1">نام خانوادگی *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={!isAdmin}
                className="w-full p-2.5 border border-[#E6E0D5] bg-[#F5F2ED] rounded-xl focus:border-[#dc2626] focus:bg-white outline-hidden text-sm disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#6E6A60] mb-1">سمت سازمانی *</label>
              <input
                type="text"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={!isAdmin}
                className="w-full p-2.5 border border-[#E6E0D5] bg-[#F5F2ED] rounded-xl focus:border-[#dc2626] focus:bg-white outline-hidden text-sm disabled:opacity-50"
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
              <label className="block font-bold text-slate-700 mb-1">تلفن داخلی *</label>
              <input
                type="text"
                required
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
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">پست الکترونیکی *</label>
              <input
                type="email"
                required
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
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="15 اردیبهشت 1370"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">محل استقرار / اتاق</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="دفتر مرکزی - طبقه ۳ - اتاق ۳۰۲"
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">آدرس تصویر آواتار (URL)</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">معرفی کوتاه (Bio)</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
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
              <span>ذخیره تغییرات</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
