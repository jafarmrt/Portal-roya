import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, todayJalali, toPersianDigits } from '../../lib/jalali';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { AddTrainingModal } from './AddTrainingModal';
import {
  GraduationCap,
  Plus,
  Calendar,
  MapPin,
  CheckCircle2,
  UserCheck,
  BookOpen,
  Trash2
} from 'lucide-react';

export const TrainingModule: React.FC = () => {
  const { trainings, currentUser, userRole, enrollTraining, deleteTraining, appSettings } = usePortal();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const today = todayJalali();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'همه دوره‌ها' },
    ...(appSettings?.trainingCategories || []).map(c => ({ id: c, label: c }))
  ];

  const filteredTrainings = trainings.filter(t => {
    if (selectedCategory === 'all') return true;
    return t.category === selectedCategory;
  });
  // Upcoming courses first (soonest on top), then past ones (most recent on top).
  const upcoming = filteredTrainings.filter((t) => t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = filteredTrainings.filter((t) => t.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const ordered = [...upcoming, ...past];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>پرتال توسعه سرمایه‌های انسانی و آموزش رویا</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">برنامه‌ها و دوره‌های آموزشی سازمانی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              ارتقای مستمر مهارتهای تخصصی، تکنیک‌های طراحی، استانداردهای بین‌المللی پوشش‌های سطح و فنون مذاکره B2B.
            </p>
          </div>

          {userRole === 'manager' && (
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
            const isEnrolled = currentUser ? program.enrolledUserIds.includes(currentUser.id) : false;
            const enrolledCount = program.enrolledUserIds.length;
            const percentage = Math.min(100, Math.round((enrolledCount / program.capacity) * 100));
            const isFull = enrolledCount >= program.capacity;
            const isPast = program.date < today;

            return (
              <div
                key={program.id}
                className="bg-white rounded-2xl border border-[#E6E0D5] overflow-hidden hover:border-[#991b1b] hover:shadow-xl transition-all flex flex-col justify-between"
              >
                {/* Course Cover Image */}
                <div className="relative h-44 overflow-hidden bg-[#F5F2ED] flex items-center justify-center">
                  {program.coverImage ? (
                    <img src={program.coverImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <GraduationCap className="w-12 h-12 text-[#D9D4CB]" />
                  )}
                  {userRole === 'manager' && (
                    <button
                      onClick={() => setPendingDelete({ id: program.id, title: program.title })}
                      aria-label={`حذف دوره ${program.title}`}
                      className="absolute top-3 left-3 p-1.5 bg-white/90 hover:bg-white text-red-700 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                        <span className="text-[#991b1b]">{toPersianDigits(`${enrolledCount} از ${program.capacity} نفر (${percentage}٪)`)}</span>
                      </div>
                      <div className="w-full h-2.5 bg-[#F5F2ED] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#991b1b] to-[#383D33] rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => enrollTraining(program.id)}
                      disabled={isPast || (isFull && !isEnrolled)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        isEnrolled
                          ? 'bg-[#EBF2E8] text-[#991b1b] border border-[#991b1b]/30 hover:bg-[#DEEAD9]'
                          : isFull || isPast
                          ? 'bg-[#F5F2ED] text-[#8C867A] cursor-not-allowed'
                          : 'bg-[#991b1b] hover:bg-[#495040] text-white shadow-md'
                      }`}
                    >
                      {isPast ? (
                        <span>{isEnrolled ? 'برگزار شد (شرکت کردید)' : 'برگزار شد'}</span>
                      ) : isEnrolled ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#991b1b]" />
                          <span>ثبت‌نام شده‌اید (جهت لغو کلیک کنید)</span>
                        </>
                      ) : isFull ? (
                        <span>تکمیل ظرفیت</span>
                      ) : (
                        <>
                          <BookOpen className="w-4 h-4" />
                          <span>ثبت‌نام در کارگاه آموزشی</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

              </div>
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

      <AddTrainingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

    </div>
  );
};
