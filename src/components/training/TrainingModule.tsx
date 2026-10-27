import React, { useEffect, useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, formatFileSize, todayJalali, toPersianDigits } from '../../lib/jalali';
import type { TrainingProgram } from '../../types';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AddTrainingModal } from './AddTrainingModal';
import { EnrollmentsModal } from './EnrollmentsModal';
import { TrainingFeedbackModal } from './TrainingFeedbackModal';
import {
  GraduationCap,
  Plus,
  Calendar,
  MapPin,
  CheckCircle2,
  UserCheck,
  BookOpen,
  Trash2,
  Pencil,
  Users,
  Hourglass,
  FileText,
  MessageSquareHeart
} from 'lucide-react';

export const TrainingModule: React.FC = () => {
  const { trainings, currentUser, can, enrollTraining, leaveTraining, deleteTraining, appSettings, focusId } = usePortal();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const today = todayJalali();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enrollmentsId, setEnrollmentsId] = useState<string | null>(null);
  const editing = trainings.find((t) => t.id === editingId);
  const enrollmentsFor = trainings.find((t) => t.id === enrollmentsId);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const feedbackFor = trainings.find((t) => t.id === feedbackId);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  /** The people who run trainings, and the course's own instructor. */
  const runs = (t: TrainingProgram) => can('trainings.manage') || (currentUser !== null && t.instructorId === currentUser.id);
  /** Took part (signed up and not marked absent), so may give feedback once the course has taken place. */
  const tookPart = (t: TrainingProgram) => t.myStatus === 'enrolled' && t.myAttended !== false && t.date <= today;
  const isMine = (t: TrainingProgram) => t.myStatus !== null || (currentUser !== null && t.instructorId === currentUser.id);

  const categories = [
    { id: 'all', label: 'همه دوره‌ها' },
    ...(currentUser ? [{ id: 'mine', label: `دوره‌های من (${toPersianDigits(trainings.filter(isMine).length)})` }] : []),
    ...(appSettings?.trainingCategories || []).map(c => ({ id: c, label: c }))
  ];

  const filteredTrainings = trainings.filter(t => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'mine') return isMine(t);
    return t.category === selectedCategory;
  });

  // A course linked from a notification, "my tasks" or a profile (#training/<id>): scroll to it, and
  // ask for feedback when the course has taken place and this person has not given it yet.
  const loaded = trainings.length > 0;
  useEffect(() => {
    if (!focusId) return;
    setSelectedCategory('all');
    requestAnimationFrame(() => document.getElementById(`training-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    const training = trainings.find((t) => t.id === focusId);
    if (training && tookPart(training) && !training.myFeedback) setFeedbackId(training.id);
    // Only when the link changes, not on every refresh of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, loaded]);
  // Upcoming courses first (soonest on top), then past ones (most recent on top).
  const upcoming = filteredTrainings.filter((t) => t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = filteredTrainings.filter((t) => t.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const ordered = [...upcoming, ...past];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>پرتال توسعه سرمایه‌های انسانی و آموزش رویا</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white">برنامه‌ها و دوره‌های آموزشی سازمانی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              ارتقای مستمر مهارتهای تخصصی، تکنیک‌های طراحی، استانداردهای بین‌المللی پوشش‌های سطح و فنون مذاکره B2B.
            </p>
          </div>

          {can('trainings.manage') && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف دوره آموزشی جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] shadow-xs flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-[#991b1b] text-white shadow-xs'
                : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Course Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTrainings.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
            <GraduationCap className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#6E6A60]">دوره‌ای در این بخش یافت نشد.</p>
          </div>
        ) : (
          ordered.map((program) => {
            const isEnrolled = program.myStatus === 'enrolled';
            const isWaiting = program.myStatus === 'waitlist';
            const enrolledCount = program.enrolledUserIds.length;
            const percentage = Math.min(100, Math.round((enrolledCount / program.capacity) * 100));
            const isFull = enrolledCount >= program.capacity;
            const isPast = program.date < today;
            // On the day itself, sign-ups are settled once the instructor has taken attendance.
            const attendanceTaken = isEnrolled && program.myAttended != null;

            return (
              <article
                key={program.id}
                id={`training-${program.id}`}
                aria-label={program.title}
                className={`bg-white rounded-2xl border overflow-hidden hover:border-[#991b1b] hover:shadow-xl transition-all flex flex-col justify-between ${focusId === program.id ? 'border-[#991b1b] ring-2 ring-red-200' : 'border-[#E6E0D5]'}`}
              >
                {/* Course Cover Image */}
                <div className="relative h-44 overflow-hidden bg-[#F5F2ED] flex items-center justify-center">
                  {program.coverImage ? (
                    <img src={program.coverImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <GraduationCap className="w-12 h-12 text-[#D9D4CB]" />
                  )}
                  {can('trainings.manage') && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <button
                        onClick={() => setEditingId(program.id)}
                        aria-label={`ویرایش دوره ${program.title}`}
                        title="ویرایش دوره"
                        className="p-1.5 bg-white/90 hover:bg-white text-[#2D2D2D] rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ id: program.id, title: program.title })}
                        aria-label={`حذف دوره ${program.title}`}
                        title="حذف دوره"
                        className="p-1.5 bg-white/90 hover:bg-white text-red-700 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <span className="absolute top-3 right-3 px-3 py-1 text-[10px] font-bold bg-[#7f1d1d]/80 text-white backdrop-blur-xs rounded-full">
                    {program.category}
                  </span>
                </div>

                {/* Course Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-[#2D2D2D] leading-snug">
                      {program.title}
                    </h3>

                    <p className="text-xs text-[#6E6A60] leading-relaxed line-clamp-3">
                      {program.description}
                    </p>

                    {/* Metadata */}
                    <div className="space-y-1.5 pt-2 text-xs text-[#6E6A60]">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-[#991b1b]" />
                        <span>مدرس: <strong>{program.instructor}</strong>{program.instructorRole && ` (${program.instructorRole})`}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-[#991b1b]" />
                        <span>تاریخ: {formatDate(program.date)}{program.time && ` | ساعت: ${toPersianDigits(program.time)}`}{program.duration && ` | ${program.duration}`}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#991b1b]" />
                        <span>مکان: {program.location || '—'}</span>
                      </div>
                      {program.prerequisites && (
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 text-[#991b1b]" />
                          <span>پیش‌نیاز: {program.prerequisites}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Capacity Progress Bar & Enrollment Button */}
                  <div className="space-y-3 pt-3 border-t border-[#E6E0D5]">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                        <span className="text-[#6E6A60]">تکمیل ظرفیت ثبت‌نام:</span>
                        {runs(program) ? (
                          <button
                            onClick={() => setEnrollmentsId(program.id)}
                            className="text-[#991b1b] hover:underline flex items-center gap-1"
                            title="دیدن فهرست ثبت‌نام‌شده‌ها"
                          >
                            <Users className="w-3.5 h-3.5" />
                            {toPersianDigits(`${enrolledCount} از ${program.capacity} نفر (${percentage}٪)`)}
                          </button>
                        ) : (
                          <span className="text-[#991b1b]">{toPersianDigits(`${enrolledCount} از ${program.capacity} نفر (${percentage}٪)`)}</span>
                        )}
                      </div>
                      <div className="w-full h-2.5 bg-[#F5F2ED] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#991b1b] to-[#383D33] rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      {program.waitlistCount > 0 && (
                        <p className="mt-1 text-[11px] text-[#6E6A60] flex items-center gap-1">
                          <Hourglass className="w-3 h-3" /> {toPersianDigits(program.waitlistCount)} نفر در لیست انتظار
                        </p>
                      )}
                    </div>

                    {program.materials.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-[#6E6A60]">جزوه و اسلایدها:</p>
                        <ul className="space-y-1">
                          {program.materials.map((m) => (
                            <li key={m.url}>
                              <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-[#991b1b] hover:underline">
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{m.name}</span>
                                <span className="text-[10px] font-normal text-[#8C867A] shrink-0">{formatFileSize(m.size)}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {runs(program) && (
                      <button
                        type="button"
                        onClick={() => setEnrollmentsId(program.id)}
                        className="w-full py-2 px-4 rounded-xl text-xs font-bold border border-[#D9D4CB] hover:border-[#991b1b] text-[#2D2D2D] flex items-center justify-center gap-1.5"
                      >
                        <Users className="w-4 h-4 text-[#991b1b]" />
                        {isPast || program.date === today ? 'حضور و غیاب، جزوه و نظرها' : 'شرکت‌کننده‌ها و جزوه'}
                        {program.feedbackCount ? <span className="text-[10px] text-[#6E6A60]">({toPersianDigits(program.feedbackCount)} نظر)</span> : null}
                      </button>
                    )}

                    {currentUser && tookPart(program) && (
                      <button
                        type="button"
                        onClick={() => setFeedbackId(program.id)}
                        className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${program.myFeedback ? 'text-[#6E6A60] hover:underline' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'}`}
                      >
                        <MessageSquareHeart className="w-4 h-4" />
                        {program.myFeedback ? 'نظر شما ثبت شد (تغییر نظر)' : 'دوره چطور بود؟ نظر بدهید'}
                      </button>
                    )}

                    <button
                      onClick={() => (isEnrolled || isWaiting ? leaveTraining(program.id) : enrollTraining(program.id))}
                      disabled={isPast || attendanceTaken || !currentUser}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        isPast || attendanceTaken
                          ? 'bg-[#F5F2ED] text-[#8C867A] cursor-not-allowed'
                          : isEnrolled
                          ? 'bg-[#EBF2E8] text-[#991b1b] border border-[#991b1b]/30 hover:bg-[#DEEAD9]'
                          : isWaiting
                          ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                          : isFull
                          ? 'bg-white text-[#991b1b] border border-[#991b1b] hover:bg-[#FDF2F2]'
                          : 'bg-[#991b1b] hover:bg-[#495040] text-white shadow-md'
                      }`}
                    >
                      {isPast ? (
                        <span>
                          {isEnrolled
                            ? program.myAttended === true
                              ? 'برگزار شد (حاضر بودید)'
                              : program.myAttended === false
                                ? 'برگزار شد (غایب ثبت شدید)'
                                : 'برگزار شد (ثبت‌نام کرده بودید)'
                            : 'برگزار شد'}
                        </span>
                      ) : attendanceTaken ? (
                        <span>{program.myAttended ? 'حضور شما ثبت شد' : 'غایب ثبت شدید'}</span>
                      ) : isEnrolled ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#991b1b]" />
                          <span>ثبت‌نام شده‌اید (جهت لغو کلیک کنید)</span>
                        </>
                      ) : isWaiting ? (
                        <>
                          <Hourglass className="w-4 h-4" />
                          <span>نفر {toPersianDigits(program.myWaitlistPosition ?? 1)} لیست انتظار (برای خروج کلیک کنید)</span>
                        </>
                      ) : isFull ? (
                        <>
                          <Hourglass className="w-4 h-4" />
                          <span>ظرفیت پر است؛ رفتن به لیست انتظار</span>
                        </>
                      ) : (
                        <>
                          <BookOpen className="w-4 h-4" />
                          <span>ثبت‌نام در کارگاه آموزشی</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

              </article>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <Modal
          title="حذف دورهٔ آموزشی"
          icon={<Trash2 className="w-5 h-5" />}
          onClose={() => setPendingDelete(null)}
          size="md"
          footer={
            <>
              <button onClick={() => setPendingDelete(null)} className={secondaryButtonClass}>انصراف</button>
              <button
                onClick={async () => {
                  await deleteTraining(pendingDelete.id);
                  setPendingDelete(null);
                }}
                className={primaryButtonClass}
              >
                حذف
              </button>
            </>
          }
        >
          <p>دورهٔ «{pendingDelete.title}» و ثبت‌نام‌های آن حذف می‌شود. ادامه می‌دهید؟</p>
        </Modal>
      )}

      {isAddModalOpen && <AddTrainingModal onClose={() => setIsAddModalOpen(false)} />}
      {editing && <AddTrainingModal key={editing.id} training={editing} onClose={() => setEditingId(null)} />}
      {enrollmentsFor && <EnrollmentsModal training={enrollmentsFor} onClose={() => setEnrollmentsId(null)} />}
      {feedbackFor && <TrainingFeedbackModal training={feedbackFor} onClose={() => setFeedbackId(null)} />}

    </div>
  );
};
