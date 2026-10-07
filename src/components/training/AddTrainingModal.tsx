import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { TrainingProgram } from '../../types';
import { X, GraduationCap, CheckCircle2, Calendar, Clock, MapPin, Users } from 'lucide-react';

interface AddTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddTrainingModal: React.FC<AddTrainingModalProps> = ({ isOpen, onClose }) => {
  const { addTraining, appSettings } = usePortal();

  const [title, setTitle] = useState('');
  const [instructor, setInstructor] = useState('');
  const [instructorRole, setInstructorRole] = useState('مدرس مدعو');
  const [date, setDate] = useState('1403/06/15');
  const [time, setTime] = useState('09:00 الی ۱۲:۰۰');
  const [duration, setDuration] = useState('۳ ساعت');
  const [location, setLocation] = useState('سالن همایش‌های دفتر مرکزی');
  const [capacity, setCapacity] = useState(25);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(appSettings?.trainingCategories[0] || 'نرم‌افزار');
  const [prerequisites, setPrerequisites] = useState('ویژه کلیه همکاران رویا طرح داخلی');
  const [coverImage, setCoverImage] = useState('https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !instructor.trim() || !description.trim()) return;

    addTraining({
      title,
      instructor,
      instructorRole,
      date,
      time,
      duration,
      location,
      capacity,
      description,
      category,
      prerequisites,
      coverImage
    });

    onClose();
    setTitle('');
    setInstructor('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">تعریف برنامه یا کارگاه آموزشی جدید</h3>
              <p className="text-xs text-slate-500">برنامه‌ریزی دوره‌های ارتقای مهارت پرسنل رویا</p>
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
          
          <div>
            <label className="block font-bold text-slate-700 mb-1">عنوان دوره آموزشی *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان دوره آموزشی..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">نام مدرس *</label>
              <input
                type="text"
                required
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="دکتر معمارزاده"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">سمت / تخصص مدرس</label>
              <input
                type="text"
                value={instructorRole}
                onChange={(e) => setInstructorRole(e.target.value)}
                placeholder="استاد دانشگاه و مشاور معماری"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">تاریخ برگزاری *</label>
              <input
                type="text"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="1403/06/15"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">ساعت برگزاری</label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="09:00 الی ۱۲:۰۰"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">ظرفیت شرکت‌کنندگان</label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">دسته‌بندی آموزشی</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
              >
                {appSettings?.trainingCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">محل برگزاری</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="سالن همایش‌های دفتر مرکزی"
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">توضیحات و سرفصل‌های دوره *</label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحات کامل دوره..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">پیش‌نیازها و مخاطبین هدف</label>
            <input
              type="text"
              value={prerequisites}
              onChange={(e) => setPrerequisites(e.target.value)}
              placeholder="مناسب برای دپارتمان طراحی و فروش"
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-blue-500 outline-hidden"
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
              className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>انتشار دوره آموزشی</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
