import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { PollType } from '../../types';
import { Plus, Trash2, Vote, FileText, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { JalaliDateInput } from '../common/JalaliDateInput';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

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
  const [expiryDate, setExpiryDate] = useState('');
  const [busy, setBusy] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (type === 'multiple_choice' && options.filter(o => o.trim()).length < 2) {
      toast.error('حداقل دو گزینه باید وارد شود.');
      return;
    }

    setBusy(true);
    const ok = await addPoll({
      title,
      description,
      department,
      type,
      expiryDate,
      options: type === 'multiple_choice' ? options.map(o => o.trim()).filter(Boolean) : []
    });
    setBusy(false);
    if (!ok) return;

    onClose();
    setExpiryDate('');
    // Reset form
    setTitle('');
    setDescription('');
    setDepartment('all');
    setType('multiple_choice');
    setOptions(['گزینه ۱', 'گزینه ۲']);
  };

  return (
    <Modal
      title="ایجاد نظرسنجی جدید"
      subtitle="تعریف نظرسنجی با پاسخ‌های چندگزینه‌ای یا متنی آزاد"
      icon={<Vote className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="create-poll" disabled={busy} className={primaryButtonClass}>
            <CheckCircle2 className="w-4 h-4" />
            <span>{busy ? 'در حال انتشار...' : 'انتشار نظرسنجی'}</span>
          </button>
        </>
      }
    >
        {/* Body */}
        <form id="create-poll" onSubmit={handleSubmit} className="space-y-4">
          
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
              <label htmlFor="poll-expiry" className="block text-xs font-bold text-slate-700 mb-1">مهلت پاسخگویی (اختیاری)</label>
              <JalaliDateInput id="poll-expiry" value={expiryDate} onChange={setExpiryDate} />
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

        </form>
    </Modal>
  );
};
