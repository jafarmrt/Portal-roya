import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { managerOf, NO_DEPARTMENT, NO_POSITION, unitHeads } from '../../../shared/profile';
import type { UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { formatBirthDay, toPersianDigits } from '../../lib/jalali';
import { IntroduceColleagueModal } from './IntroduceColleagueModal';
import { PersonTrainingsSection } from '../training/PersonTrainingsSection';
import { ModalShell } from '../common/Modal';
import { OnlineDot } from '../common/OnlineDot';
import { telHref } from '../../lib/phone';
import { AboutMeList } from './AboutMeList';
import { aboutMeAnswers } from '../../../shared/aboutMe';
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
  Trash2,
  UserPlus,
  Smile
} from 'lucide-react';
import { featureOn, tabOn } from '../../lib/features';

interface UserProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onEdit: (user: UserProfile) => void;
  /** Has the portal open now (green dot on the photo). */
  online?: boolean;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onEdit, online }) => {
  const { currentUser, can, endorseSkill, addWorkExperience, addSkill, removeWorkExperience, removeSkill, newColleagues, appSettings, setActiveTab, departmentPages, employees } = usePortal();
  // Without a direct manager, the head of the colleague's unit is who they report to.
  const fallback = user.directManagerId ? null : managerOf(user, unitHeads(departmentPages));
  const unitHead = fallback ? employees.find((e) => e.id === fallback.id && e.isActive) : undefined;
  const [introducing, setIntroducing] = useState(false);
  const introduction = newColleagues.find((nc) => nc.userId === user.id);
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
        <div className="h-28 sm:h-32 bg-gradient-to-r from-brand-deep via-brand-strong to-red-500" />

        <div className="px-5 sm:px-6 pb-6">
          
          {/* Avatar and Main Info Overlay */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 -mt-12 sm:-mt-14 mb-6 pb-4 border-b border-line">
            <div className="flex items-start gap-4 min-w-0">
              <div className="relative shrink-0">
                <Avatar
                  src={user.avatar}
                  firstName={user.firstName}
                  lastName={user.lastName}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white shadow-lg text-2xl"
                />
                {online && <OnlineDot className="bottom-1 left-1 !w-4 !h-4" />}
              </div>
              <div className="space-y-1 min-w-0 pt-14 sm:pt-16">
                <h2 className="text-xl sm:text-2xl font-black text-ink break-words">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-xs font-bold text-brand flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{user.position || NO_POSITION}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {appSettings?.departments.includes(user.department) && tabOn(appSettings, 'departments') ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('departments', user.department)}
                      className="flex items-center gap-1 hover:text-brand underline-offset-2 hover:underline"
                      title="صفحهٔ واحد"
                    >
                      <Building2 className="w-3 h-3 text-faint" />
                      <span>بخش: {user.department}</span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-faint" />
                      <span>{user.department ? `بخش: ${user.department}` : NO_DEPARTMENT}</span>
                    </span>
                  )}
                  {user.location && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-faint" />
                        <span>{user.location}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick contact: the extension copies, the mobile calls (and copies); empty ones are left out. */}
            {(user.extension || user.mobile) && (
              <div className="flex flex-wrap items-center gap-2">
                {user.extension && (
                  <button
                    onClick={() => copyToClipboard(user.extension, 'داخلی')}
                    className="px-3 py-2 bg-surface hover:bg-line text-ink rounded-xl text-xs font-bold border border-line flex items-center gap-1.5 transition-colors"
                    title="کپی شماره داخلی"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-brand" />
                    <span>داخلی: <strong dir="ltr">{user.extension}</strong></span>
                    {copiedField === 'داخلی' ? <Check className="w-3 h-3 text-brand-strong" /> : <Copy className="w-3 h-3 text-faint" />}
                  </button>
                )}
                {user.mobile && (
                  <span className="flex items-stretch rounded-xl border border-line bg-surface text-xs font-bold text-ink overflow-hidden">
                    <a href={telHref(user.mobile)} className="px-3 py-2 hover:bg-line flex items-center gap-1.5 transition-colors" title="تماس">
                      <Phone className="w-3.5 h-3.5 text-brand-strong" />
                      <span dir="ltr">{user.mobile}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(user.mobile, 'موبایل')}
                      className="px-2.5 border-r border-line hover:bg-line flex items-center transition-colors"
                      aria-label="کپی شماره همراه"
                      title="کپی شماره همراه"
                    >
                      {copiedField === 'موبایل' ? <Check className="w-3 h-3 text-brand-strong" /> : <Copy className="w-3 h-3 text-faint" />}
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {can('users.manage') && user.isActive && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 p-3 rounded-2xl border border-dashed border-line-strong text-xs">
              <span className="text-muted">
                {introduction ? 'این همکار در داشبورد به عنوان همکار جدید معرفی شده است.' : 'هنوز در داشبورد به عنوان همکار جدید معرفی نشده است.'}
              </span>
              <button type="button" onClick={() => setIntroducing(true)} className="px-3 py-1.5 bg-brand-strong hover:bg-brand-deep text-white font-bold rounded-xl flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                {introduction ? 'ویرایش کارت معرفی' : 'معرفی به عنوان همکار جدید'}
              </button>
            </div>
          )}
          {introducing && <IntroduceColleagueModal colleague={user} card={introduction} onClose={() => setIntroducing(false)} />}

          {/* Email, birthday and manager; a box with nothing in it is left out. */}
          {(() => {
            const birthday = formatBirthDay(user.birthDay);
            const manager = user.directManager || (unitHead ? `${unitHead.firstName} ${unitHead.lastName}` : '');
            if (!user.email && !birthday && !manager) return null;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3 mb-6 p-4 bg-surface rounded-2xl border border-line text-xs">
                {user.email && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Mail className="w-4 h-4 text-faint shrink-0" />
                    <div className="min-w-0">
                      <span className="text-faint text-xs block">پست الکترونیکی:</span>
                      <a href={`mailto:${user.email}`} dir="ltr" className="font-semibold text-ink hover:text-brand break-all">
                        {user.email}
                      </a>
                    </div>
                  </div>
                )}

                {birthday && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-faint shrink-0" />
                    <div>
                      <span className="text-faint text-xs block">زادروز:</span>
                      <span className="font-bold text-ink">
                        {birthday}
                        {isOwnProfile && user.hideBirthday && <span className="font-normal text-faint"> (برای همکاران پنهان)</span>}
                      </span>
                    </div>
                  </div>
                )}

                {manager && (
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-faint shrink-0" />
                    <div>
                      <span className="text-faint text-xs block">مدیر مستقیم:</span>
                      <span className="font-bold text-ink">
                        {manager}
                        {!user.directManager && unitHead && <span className="font-normal text-faint"> (مسئول واحد)</span>}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* A short introduction and «دربارهٔ من»; empty ones are left out (one's own card invites to fill them in). */}
          {(user.bio || isOwnProfile) && (
            <div className="mb-6 space-y-2">
              <h3 className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-red-600" />
                <span>معرفی کوتاه:</span>
              </h3>
              <p className={`text-xs leading-relaxed bg-surface-soft/70 p-4 rounded-2xl border border-line ${user.bio ? 'text-ink-soft' : 'text-faint'}`}>
                {user.bio || 'هنوز معرفی کوتاهی ننوشته‌اید؛ از «ویرایش پروفایل» اضافه کنید.'}
              </p>
            </div>
          )}

          {aboutMeAnswers(user.aboutMe).length > 0 ? (
            <div className="mb-6 space-y-2">
              <h3 className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
                <Smile className="w-4 h-4 text-warm-strong" />
                <span>دربارهٔ من</span>
              </h3>
              <AboutMeList about={user.aboutMe} />
            </div>
          ) : (
            isOwnProfile && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(user);
                }}
                className="mb-6 w-full p-4 rounded-2xl border border-dashed border-warm/40 bg-warm-soft/50 text-right hover:bg-warm-soft transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-warm-strong">
                  <Smile className="w-4 h-4" /> «دربارهٔ من» را پر کنید
                </span>
                <span className="block mt-1 text-xs text-muted leading-relaxed">چند سؤال خودمانی (سرگرمی، غذای محبوب، کتاب پیشنهادی…) تا همکاران شما را بهتر بشناسند. همه دلخواه است.</span>
              </button>
            )
          )}

          {/* Courses: for the colleague themself and the people who run trainings. */}
          {user.hasAccount && (isOwnProfile || can('trainings.manage')) && featureOn(appSettings, 'training') && (
            <PersonTrainingsSection
              userId={user.id}
              own={isOwnProfile}
              onOpen={(id) => {
                onClose();
                setActiveTab('training', id);
              }}
            />
          )}

          {/* Work Experiences Section */}
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-red-600" />
                <span>سوابق شغلی و تجربیات کاری ({toPersianDigits(user.workExperiences?.length || 0)}):</span>
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
                    className="p-2 border border-line-strong rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    required
                    placeholder="سمت / عنوان شغلی"
                    value={expRole}
                    onChange={(e) => setExpRole(e.target.value)}
                    className="p-2 border border-line-strong rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="سال شروع (مثلاً 1398)"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="p-2 border border-line-strong rounded-lg bg-white outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="سال پایان (یا 'تاکنون')"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="p-2 border border-line-strong rounded-lg bg-white outline-hidden"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="توضیح مختصر مسئولیت‌ها..."
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  className="w-full p-2 border border-line-strong rounded-lg bg-white outline-hidden"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingExp(false)}
                    className="px-3 py-1 bg-line text-ink-soft rounded-lg"
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
                  <div key={exp.id} className="p-3.5 bg-surface-soft rounded-xl border border-line space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-ink">
                      <span>{exp.role} - <span className="text-red-700">{exp.company}</span></span>
                      <span className="flex items-center gap-2 text-xs text-muted font-medium">
                        {exp.startYear} - {exp.endYear}
                        {canEdit && (
                          <button
                            onClick={() => removeWorkExperience(user.id, exp.id)}
                            aria-label={`حذف سابقهٔ ${exp.company}`}
                            className="p-1 text-faint hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="text-xs text-ink-soft leading-relaxed pt-1">
                        {exp.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-faint italic">هیچ سابقه شغلی ثبت نشده است.</p>
            )}
          </div>

          {/* Key Skills Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
                <Award className="w-4 h-4 text-red-600" />
                <span>مهارت‌های کلیدی و تاییده‌ها ({toPersianDigits(user.skills?.length || 0)}):</span>
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
              <form onSubmit={handleAddSkillSubmit} className="p-3 bg-surface rounded-xl flex items-center gap-2 text-xs">
                <input
                  type="text"
                  required
                  placeholder="عنوان مهارت (مثلاً 3ds Max، بازرگانی، مدیریت B2B)"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="flex-1 p-1.5 border border-line-strong rounded-lg bg-white outline-hidden"
                />
                <button type="submit" className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg">
                  ثبت
                </button>
                <button type="button" onClick={() => setIsAddingSkill(false)} className="px-2 py-1 text-muted">
                  لغو
                </button>
              </form>
            )}

            {user.skills && user.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-line/80 rounded-xl text-xs font-medium text-ink border border-line transition-colors"
                  >
                    <span>{skill.name}</span>
                    {isOwnProfile ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-muted text-xs font-bold" title="تعداد تأییدها">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{skill.endorsements}</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => endorseSkill(user.id, skill.id)}
                        aria-pressed={skill.endorsedByMe}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-bold border shadow-2xs ${skill.endorsedByMe ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 hover:bg-red-50 border-line'}`}
                        title={skill.endorsedByMe ? 'لغو تأیید' : 'تأیید این مهارت'}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{skill.endorsements}</span>
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => removeSkill(user.id, skill.id)} aria-label={`حذف مهارت ${skill.name}`} className="text-faint hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-faint italic">مهارتی ثبت نشده است.</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface border-t border-line flex justify-end shrink-0">
        <button
          onClick={onClose}
          className="px-5 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl transition-colors"
        >
          بستن کارت همکار
        </button>
      </div>
    </ModalShell>
  );
};
