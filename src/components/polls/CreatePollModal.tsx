import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { PollType } from '../../types';
import { X, Plus, Trash2, HelpCircle, Vote, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({ isOpen, onClose }) => {
  const { addPoll, appSettings } = usePortal();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('all');
  const [type, setType] = useState<PollType>('multiple_choice');
  const [expiryDate, setExpiryDate] = useState('1403/06/30');
  const [options, setOptions] = useState<string[]>(['گزینه ۱', 'گزینه ۲']);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, `گزینه ${options.length + 1}`]);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, idx) => idx !== index));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    if (type === 'multiple_choice' && options.filter(o => o.trim()).length < 2) {
      toast.error('حداقل دو گزینه باید وارد شود.');
      return;
    }

    addPoll({
      title,
      description,
      department,
      type,
      expiryDate,
      options: type === 'multiple_choice' ? options : []
    });

    onClose();
    // Reset form
    setTitle('');
    setDescription('');
    setDepartment('all');
    setType('multiple_choice');
    setOptions(['گزینه ۱', 'گزینه ۲']);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">ایجاد نظرسنجی جدید</h3>
              <p className="text-xs text-slate-500">تعریف نظرسنجی با پاسخ‌های چندگزینه‌ای یا متنی آزاد</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عنوان نظرسنجی <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: نظرسنجی تعیین زمان کارگاه آموزشی یا منوی غذایی"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-hidden"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              توضیحات و اهداف <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیح مختصری درباره هدف نظرسنجی و راهنمای شرکت در آن برای همکاران..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-hidden"
            />
          </div>

          {/* Department & Type Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">دپارتمان هدف</label>
              <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
            >
              <option value="all">همه سازمان (عمومی)</option>
              {appSettings?.departments.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ مهلت پاسخگویی</label>
              <input
                type="text"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                placeholder="1403/06/30"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>
          </div>

          {/* Poll Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">نوع نظرسنجی و نحوه پاسخگویی</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('multiple_choice')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'multiple_choice'
                    ? 'border-red-600 bg-red-50 text-red-700 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Vote className="w-5 h-5 mb-1" />
                <span>گزینه‌ای (پیش‌فرض)</span>
                <span className="text-[10px] text-slate-400 font-normal mt-0.5">انتخاب از بین گزینه‌ها</span>
              </button>

              <button
                type="button"
                onClick={() => setType('free_text')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'free_text'
                    ? 'border-red-600 bg-red-50 text-red-700 shadow-xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <FileText className="w-5 h-5 mb-1" />
                <span>پاسخ متنی آزاد (ناشناس)</span>
                <span className="text-[10px] text-slate-400 font-normal mt-0.5">ارسال نظر متنی ناشناس</span>
              </button>
            </div>
          </div>

          {/* Dynamic Options if Multiple Choice */}
          {type === 'multiple_choice' && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">گزینه‌های پاسخ</label>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs text-red-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن گزینه جدید</span>
                </button>
              </div>

              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-bold w-6 text-center">{index + 1}.</span>
                  <input
                    type="text"
                    required
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`متن گزینه ${index + 1}`}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:border-red-500 outline-hidden"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      title="حذف گزینه"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>انتشار نظرسنجی</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
