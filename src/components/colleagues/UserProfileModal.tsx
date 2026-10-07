import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import {
  X,
  Phone,
  PhoneCall,
  Mail,
  Calendar,
  Building2,
  MapPin,
  Briefcase,
  Award,
  ThumbsUp,
  Plus,
  UserCheck,
  Edit3,
  Copy,
  Check,
  Sparkles
} from 'lucide-react';

interface UserProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onEdit: (user: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onEdit }) => {
  const { currentUser, userRole, endorseSkill, addWorkExperience, addSkill } = usePortal();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New experience/skill mini-forms inside profile view
  const [isAddingExp, setIsAddingExp] = useState(false);
  const [expCompany, setExpCompany] = useState('');
  const [expRole, setExpRole] = useState('');
  const [expStart, setExpStart] = useState('1398');
  const [expEnd, setExpEnd] = useState('1401');
  const [expDesc, setExpDesc] = useState('');

  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillCat, setSkillCat] = useState('تخصصی');


  const isOwnProfile = currentUser ? currentUser.id === user.id : false;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAddExpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expCompany.trim() || !expRole.trim()) return;
    addWorkExperience(user.id, {
      company: expCompany,
      role: expRole,
      startYear: expStart,
      endYear: expEnd,
      description: expDesc
    });
    setIsAddingExp(false);
    setExpCompany('');
    setExpRole('');
    setExpDesc('');
  };

  const handleAddSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    addSkill(user.id, {
      name: skillName,
      category: skillCat
    });
    setIsAddingSkill(false);
    setSkillName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden text-right">
        
        {/* Cover Header Banner */}
        <div className="h-32 bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {(isOwnProfile || userRole === 'manager') && (
            <button
              onClick={() => {
                onClose();
                onEdit(user);
              }}
              className="absolute top-4 right-4 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl backdrop-blur-xs flex items-center gap-1.5 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>ویرایش پروفایل</span>
            </button>
          )}
        </div>

        {/* Profile Details Container */}
        <div className="px-6 pb-6 pt-0 relative max-h-[75vh] overflow-y-auto">
          
          {/* Avatar and Main Info Overlay */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-16 mb-6 pb-4 border-b border-[#E6E0D5]">
            <div className="flex items-end gap-4">
              <img
                src={user.avatar || undefined}
                alt={`${user.firstName} ${user.lastName}`}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white shadow-lg bg-white"
              />
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-[#2D2D2D]">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-xs font-bold text-[#dc2626] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{user.position}</span>
                </p>
                <div className="flex items-center gap-2 text-[11px] text-[#6E6A60]">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-[#8C867A]" />
                    <span>بخش: {user.department}</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#8C867A]" />
                    <span>{user.location || 'دفتر مرکزی'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Contact Badge Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => copyToClipboard(user.extension, 'داخلی')}
                className="px-3 py-2 bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D] rounded-xl text-xs font-bold border border-[#E6E0D5] flex items-center gap-1.5 transition-colors"
                title="شماره داخلی همکار"
              >
                <PhoneCall className="w-3.5 h-3.5 text-[#dc2626]" />
                <span>داخلی: <strong>{user.extension}</strong></span>
                {copiedField === 'داخلی' ? <Check className="w-3 h-3 text-[#991b1b]" /> : <Copy className="w-3 h-3 text-[#8C867A]" />}
              </button>

              <button
                onClick={() => copyToClipboard(user.mobile, 'موبایل')}
                className="px-3 py-2 bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D] rounded-xl text-xs font-bold border border-[#E6E0D5] flex items-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#991b1b]" />
                <span>{user.mobile}</span>
                {copiedField === 'موبایل' ? <Check className="w-3 h-3 text-[#991b1b]" /> : <Copy className="w-3 h-3 text-[#8C867A]" />}
              </button>
            </div>
          </div>

          {/* Quick Contact & Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 bg-[#F5F2ED] rounded-2xl border border-[#E6E0D5] text-xs">
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-[#8C867A]" />
              <div>
                <span className="text-[#8C867A] text-[10px] block">پست الکترونیکی:</span>
                <a href={`mailto:${user.email}`} className="font-semibold text-[#2D2D2D] hover:text-[#dc2626]">
                  {user.email}
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-[#8C867A]" />
              <div>
                <span className="text-[#8C867A] text-[10px] block">تاریخ تولد:</span>
                <span className="font-bold text-[#2D2D2D]">{user.birthDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <UserCheck className="w-4 h-4 text-[#8C867A]" />
              <div>
                <span className="text-[#8C867A] text-[10px] block">مدیر مستقیم:</span>
                <span className="font-bold text-[#2D2D2D]">{user.directManager || 'مدیریت ارشد'}</span>
              </div>
            </div>
          </div>

          {/* Bio / About section */}
          <div className="mb-6 space-y-2">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-red-600" />
              <span>معرفی کوتاه و درباره همکار:</span>
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
              {user.bio || 'توضیحات معرفی ثبت نشده است.'}
            </p>
          </div>

          {/* Work Experiences Section */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-red-600" />
                <span>سوابق شغلی و تجربیات کاری ({user.workExperiences?.length || 0}):</span>
              </h3>

              {(isOwnProfile || userRole === 'manager') && !isAddingExp && (
                <button
                  onClick={() => setIsAddingExp(true)}
                  className="text-xs text-red-600 hover:underline font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن سابقه شغلی</span>
                </button>
              )}
            </div>

            {/* Inline Add Exp Form */}
            {isAddingExp && (
              <form onSubmit={handleAddExpSubmit} className="p-4 bg-red-50/50 rounded-2xl border border-red-200 space-y-3 text-xs">
                <h4 className="font-bold text-red-800">افزودن سابقه شغلی جدید:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="نام شرکت / سازمان"
                    value={expCompany}
                    onChange={(e) => setExpCompany(e.target.value)}
                    className="p-2 border border-slate-300 rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="سمت / عنوان شغلی"
                    value={expRole}
                    onChange={(e) => setExpRole(e.target.value)}
                    className="p-2 border border-slate-300 rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="سال شروع (مثلاً 1398)"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="p-2 border border-slate-300 rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="سال پایان (یا 'تاکنون')"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="p-2 border border-slate-300 rounded-lg bg-white outline-hidden"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="توضیح مختصر مسئولیت‌ها..."
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white outline-hidden"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingExp(false)}
                    className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1 bg-red-600 text-white font-bold rounded-lg"
                  >
                    ذخیره
                  </button>
                </div>
              </form>
            )}

            {user.workExperiences && user.workExperiences.length > 0 ? (
              <div className="space-y-2.5">
                {user.workExperiences.map((exp) => (
                  <div key={exp.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span>{exp.role} - <span className="text-red-700">{exp.company}</span></span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {exp.startYear} - {exp.endYear}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                        {exp.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">هیچ سابقه شغلی ثبت نشده است.</p>
            )}
          </div>

          {/* Key Skills Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-red-600" />
                <span>مهارت‌های کلیدی و تاییده‌ها ({user.skills?.length || 0}):</span>
              </h3>

              {(isOwnProfile || userRole === 'manager') && !isAddingSkill && (
                <button
                  onClick={() => setIsAddingSkill(true)}
                  className="text-xs text-red-600 hover:underline font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن مهارت</span>
                </button>
              )}
            </div>

            {/* Add skill inline form */}
            {isAddingSkill && (
              <form onSubmit={handleAddSkillSubmit} className="p-3 bg-slate-100 rounded-xl flex items-center gap-2 text-xs">
                <input
                  type="text"
                  required
                  placeholder="عنوان مهارت (مثلاً 3ds Max، بازرگانی، مدیریت B2B)"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="flex-1 p-1.5 border border-slate-300 rounded-lg bg-white outline-hidden"
                />
                <button type="submit" className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg">
                  ثبت
                </button>
                <button type="button" onClick={() => setIsAddingSkill(false)} className="px-2 py-1 text-slate-500">
                  لغو
                </button>
              </form>
            )}

            {user.skills && user.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-xs font-medium text-slate-800 border border-slate-200 transition-colors"
                  >
                    <span>{skill.name}</span>
                    <button
                      onClick={() => endorseSkill(user.id, skill.id)}
                      className="flex items-center gap-1 px-1.5 py-0.5 bg-white text-red-600 hover:bg-red-50 rounded-lg text-[10px] font-bold border border-slate-200 shadow-2xs"
                      title="تایید مهارت توسط همکار"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>{skill.endorsements}</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">مهارتی ثبت نشده است.</p>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors"
          >
            بستن کارت همکار
          </button>
        </div>

      </div>
    </div>
  );
};
