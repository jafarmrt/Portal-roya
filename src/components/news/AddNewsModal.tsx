import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { NewsItem } from '../../types';
import { X, Newspaper, CheckCircle2, Image as ImageIcon, Tag } from 'lucide-react';

interface AddNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddNewsModal: React.FC<AddNewsModalProps> = ({ isOpen, onClose }) => {
  const { addNews, appSettings } = usePortal();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>(appSettings?.newsCategories[0] || 'اخبار سازمان');
  const [image, setImage] = useState('https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&auto=format&fit=crop&q=80');
  const [tagsStr, setTagsStr] = useState('اخبار, رویا طرح داخلی');
  const [isPinned, setIsPinned] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || !content.trim()) return;

    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);

    addNews({
      title,
      summary,
      content,
      category,
      image,
      tags,
      isPinned
    });

    onClose();
    setTitle('');
    setSummary('');
    setContent('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">انتشار خبر یا اطلاعیه جدید</h3>
              <p className="text-xs text-slate-500">ارسال اطلاعیه‌های اداری، رویدادها و اخبار سازمانی</p>
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
            <label className="block font-bold text-slate-700 mb-1">عنوان خبر / اطلاعیه *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان جذاب و دقیق خبر..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">دسته‌بندی موضوعی</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:bg-white focus:border-[#dc2626] outline-hidden text-sm"
              >
                {appSettings?.newsCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">برچسب‌ها (کلمات کلیدی با ویرگول)</label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="محصول جدید, ساعات کاری, شوروم"
                className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">آدرس تصویر خبر (URL)</label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">خلاصه خبر (چکیده) *</label>
            <textarea
              rows={2}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="توضیح کوتاه ۱ الی ۲ خطی برای نمایش در کارت..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">متن کامل خبر / اطلاعیه *</label>
            <textarea
              rows={5}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="متن کامل خبر، جزییات، مصوبه‌ها و نکات مهم..."
              className="w-full p-2.5 border border-slate-300 rounded-xl focus:border-red-500 outline-hidden"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 pt-2">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span>سنجاق کردن خبر در بالای فهرست (Pinned)</span>
          </label>

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
              <span>انتشار خبر</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
