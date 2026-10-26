import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import type { UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { formatDate } from '../../lib/jalali';
import { ModalShell } from '../common/Modal';
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
  Sparkles,
  Trash2
} from 'lucide-react';

interface UserProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onEdit: (user: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onEdit }) => {
  const { currentUser, can, endorseSkill, addWorkExperience, addSkill, removeWorkExperience, removeSkill } = usePortal();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New experience/skill mini-forms inside profile view
  const [isAddingExp, setIsAddingExp] = useState(false);
  const [expCompany, setExpCompany] = useState('');
  const [expRole, setExpRole] = useState('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('تاکنون');
  const [expDesc, setExpDesc] = useState('');

  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [skillName, setSkillName] = useState('');


  const isOwnProfile = currentUser ? currentUser.id === user.id : false;
  const canEdit = isOwnProfile || can('users.manage');

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard access can be blocked on plain-http intranet hosts; the number stays visible.
    }
  };

  const handleAddExpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expCompany.trim() || !expRole.trim()) return;
    await addWorkExperience(user.id, {
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

  const handleAddSkillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    await addSkill(user.id, {
      name: skillName,
      category: 'تخصصی'
    });
    setIsAddingSkill(false);
    setSkillName('');
  };

  return (
    <ModalShell onClose={onClose} size="lg" label={`کارت همکار: ${user.firstName} ${user.lastName}`}>
      {/* Close and edit stay on the panel, outside the scrolling area, so they never scroll away. */}
      <button
        type="button"
        data-close
        onClick={onClose}
        aria-label="بستن"
        className="absolute top-3 left-3 z-10 p-2 text-white/90 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      {canEdit && (
        <button
          onClick={() => {
            onClose();
            onEdit(user);
          }}
          className="absolute top-3 right-3 z-10 px-3 py-1.5 bg-black/25 hover:bg-black/40 text-white text-xs font-bold rounded-xl backdrop-blur-xs flex items-center gap-1.5 transition-all"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>ویرایش پروفایل</span>
        </button>
      )}

      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        {/* Cover banner scrolls together with the avatar that overlaps it, so nothing is cut off. */}
        <div className="h-28 sm:h-32 bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444]" />

        <div className="px-5 sm:px-6 pb-6">
          
          {/* Avatar and Main Info Overlay */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-12 sm:-mt-14 mb-6 pb-4 border-b border-[#E6E0D5]">
            <div className="flex items-start gap-4 min-w-0">
              <Avatar
                src={user.avatar}
                firstName={user.firstName}
                lastName={user.lastName}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white shadow-lg text-2xl"
              />
              <div className="space-y-1 min-w-0 pt-14 sm:pt-16">
                <h2 className="text-xl sm:text-2xl font-black text-[#2D2D2D] break-words">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-xs font-bold text-[#dc2626] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{user.position}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#6E6A60]">
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
                <span>داخلی: <strong dir="ltr">{user.extension || '—'}</strong></span>
                {copiedField === 'داخلی' ? <Check className="w-3 h-3 text-[#991b1b]" /> : <Copy className="w-3 h-3 text-[#8C867A]" />}
              </button>

              <button
                onClick={() => copyToClipboard(user.mobile, 'موبایل')}
                className="px-3 py-2 bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D] rounded-xl text-xs font-bold border border-[#E6E0D5] flex items-center gap-1.5 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#991b1b]" />
                <span dir="ltr">{user.mobile || '—'}</span>
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
                {user.email ? (
                  <a href={`mailto:${user.email}`} dir="ltr" className="font-semibold text-[#2D2D2D] hover:text-[#dc2626] break-all">
                    {user.email}
                  </a>
                ) : (
                  <span className="text-[#8C867A]">—</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-[#8C867A]" />
              <div>
                <span className="text-[#8C867A] text-[10px] block">تاریخ تولد:</span>
                <span className="font-bold text-[#2D2D2D]">{user.birthDate ? formatDate(user.birthDate) : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <UserCheck className="w-4 h-4 text-[#8C867A]" />
              <div>
                <span className="text-[#8C867A] text-[10px] block">مدیر مستقیم:</span>
                <span className="font-bold text-[#2D2D2D]">{user.directManager || '—'}</span>
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

              {canEdit && !isAddingExp && (
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
                      <span className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        {exp.startYear} - {exp.endYear}
                        {canEdit && (
                          <button
                            onClick={() => removeWorkExperience(user.id, exp.id)}
                            aria-label={`حذف سابقهٔ ${exp.company}`}
                            className="p-1 text-slate-400 hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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

              {canEdit && !isAddingSkill && (
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
                    {isOwnProfile ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-slate-500 text-[10px] font-bold" title="تعداد تأییدها">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{skill.endorsements}</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => endorseSkill(user.id, skill.id)}
                        aria-pressed={skill.endorsedByMe}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold border shadow-2xs ${skill.endorsedByMe ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 hover:bg-red-50 border-slate-200'}`}
                        title={skill.endorsedByMe ? 'لغو تأیید' : 'تأیید این مهارت'}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{skill.endorsements}</span>
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => removeSkill(user.id, skill.id)} aria-label={`حذف مهارت ${skill.name}`} className="text-slate-400 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">مهارتی ثبت نشده است.</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#F5F2ED] border-t border-[#E6E0D5] flex justify-end shrink-0">
        <button
          onClick={onClose}
          className="px-5 py-2 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#F5F2ED] border border-[#D9D4CB] rounded-xl transition-colors"
        >
          بستن کارت همکار
        </button>
      </div>
    </ModalShell>
  );
};
