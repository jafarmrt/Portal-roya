import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { NewsItem } from '../../types';
import { AddNewsModal } from './AddNewsModal';
import {
  Newspaper,
  Plus,
  Pin,
  Heart,
  Calendar,
  User,
  Tag,
  MessageCircle,
  Share2,
  X,
  ChevronLeft
} from 'lucide-react';

export const NewsModule: React.FC = () => {
  const { news, userRole, currentUser, toggleLikeNews, appSettings, isLoggedIn, openLoginModal } = usePortal();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'همه موضوعات' },
    ...(appSettings?.newsCategories || []).map(c => ({ id: c, label: c }))
  ];

  const filteredNews = news.filter(n => {
    if (selectedCategory === 'all') return true;
    return n.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Newspaper className="w-3.5 h-3.5" />
              <span>پرتال خبررسانی و اطلاعیه‌های رسمی سازمان</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">اخبار و اطلاعیه‌های رویا طرح داخلی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              آخرین رویدادهای سازمانی، تغییرات بخشنامه‌ها، محصولات جدید و دستاوردهای رویا طرح داخلی.
            </p>
          </div>

          {userRole === 'manager' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>انتشار خبر جدید</span>
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
                ? 'bg-[#dc2626] text-white shadow-xs'
                : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* News Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredNews.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
            <Newspaper className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#6E6A60]">خبری در این دسته‌بندی یافت نشد.</p>
          </div>
        ) : (
          filteredNews.map((article) => {
            const isLiked = currentUser ? Boolean(article.likedBy?.includes(currentUser.id)) : false;

            return (
              <div
                key={article.id}
                className="bg-white rounded-2xl border border-[#E6E0D5] overflow-hidden hover:border-[#dc2626] hover:shadow-xl transition-all flex flex-col justify-between group"
              >
                {/* Article Image Container */}
                <div className="relative h-48 overflow-hidden bg-[#F5F2ED] cursor-pointer" onClick={() => setSelectedArticle(article)}>
                  <img
                    src={article.image || undefined}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  
                  {/* Category Pill */}
                  <span className="absolute top-3 right-3 px-3 py-1 text-[10px] font-bold bg-[#7f1d1d]/80 text-white backdrop-blur-xs rounded-full">
                    {article.category}
                  </span>

                  {/* Pinned Badge */}
                  {article.isPinned && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold bg-[#dc2626] text-white rounded-full flex items-center gap-1 shadow-md">
                      <Pin className="w-3 h-3 fill-white" />
                      <span>مهم و سنجاق شده</span>
                    </span>
                  )}
                </div>

                {/* Body Content */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] text-[#6E6A60]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#8C867A]" />
                        <span>{article.date}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#8C867A]" />
                        <span>{article.author}</span>
                      </span>
                    </div>

                    <h3
                      onClick={() => setSelectedArticle(article)}
                      className="text-sm font-bold text-[#2D2D2D] hover:text-[#dc2626] transition-colors cursor-pointer leading-snug line-clamp-2"
                    >
                      {article.title}
                    </h3>

                    <p className="text-xs text-[#6E6A60] leading-relaxed line-clamp-3">
                      {article.summary}
                    </p>
                  </div>

                  {/* Footer & Interactions */}
                  <div className="pt-3 border-t border-[#E6E0D5] flex items-center justify-between">
                    <button
                      onClick={() => toggleLikeNews(article.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isLiked 
                          ? 'bg-[#FBF0EC] text-[#D97B5F] border border-[#D97B5F]/30' 
                          : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#6E6A60]'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-[#D97B5F] text-[#D97B5F]' : ''}`} />
                      <span>{article.likesCount} پسند</span>
                    </button>

                    <button
                      onClick={() => setSelectedArticle(article)}
                      className="text-xs font-bold text-[#dc2626] hover:underline flex items-center gap-1"
                    >
                      <span>ادامه مطلب</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Article Detail Reader Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E6E0D5] w-full max-w-3xl overflow-hidden text-right max-h-[90vh] flex flex-col">
            
            {/* Modal Image Header */}
            <div className="relative h-64 sm:h-72 bg-[#7f1d1d]">
              <img
                src={selectedArticle.image || undefined}
                alt={selectedArticle.title}
                className="w-full h-full object-cover opacity-90"
              />
              <button
                onClick={() => setSelectedArticle(null)}
                className="absolute top-4 left-4 p-2 bg-black/40 hover:bg-black/70 text-white rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#7f1d1d] via-[#7f1d1d]/70 to-transparent p-6 text-white">
                <span className="px-3 py-1 text-xs font-bold bg-[#dc2626] text-white rounded-full inline-block mb-2">
                  {selectedArticle.category}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-snug">
                  {selectedArticle.title}
                </h2>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm text-[#2D2D2D] leading-relaxed">
              
              <div className="flex items-center justify-between text-xs text-[#6E6A60] pb-3 border-b border-[#E6E0D5]">
                <div className="flex items-center gap-2">
                  <span>نویسنده: <strong>{selectedArticle.author}</strong> ({selectedArticle.authorRole})</span>
                </div>
                <span>تاریخ انتشار: <strong>{selectedArticle.date}</strong></span>
              </div>

              <div className="p-4 bg-[#F5F2ED] rounded-2xl border-r-4 border-[#dc2626] text-[#2D2D2D] font-semibold leading-relaxed">
                {selectedArticle.summary}
              </div>

              <div className="whitespace-pre-line text-[#2D2D2D] leading-loose">
                {selectedArticle.content}
              </div>

              {selectedArticle.tags && selectedArticle.tags.length > 0 && (
                <div className="pt-4 border-t border-[#E6E0D5] flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-[#8C867A]" />
                  <span className="text-xs font-bold text-[#6E6A60]">برچسب‌ها:</span>
                  {selectedArticle.tags.map((t, idx) => (
                    <span key={idx} className="text-xs px-2.5 py-1 bg-[#F5F2ED] text-[#2D2D2D] rounded-lg">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-[#F5F2ED] border-t border-[#E6E0D5] flex items-center justify-between">
              <button
                onClick={() => toggleLikeNews(selectedArticle.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentUser && selectedArticle.likedBy?.includes(currentUser.id)
                    ? 'bg-[#dc2626] text-white shadow-md'
                    : 'bg-white hover:bg-[#E6E0D5]/50 text-[#2D2D2D] border border-[#E6E0D5]'
                }`}
              >
                <Heart className={`w-4 h-4 ${currentUser && selectedArticle.likedBy?.includes(currentUser.id) ? 'fill-white' : ''}`} />
                <span>پسندیدن این خبر ({selectedArticle.likesCount})</span>
              </button>

              <button
                onClick={() => setSelectedArticle(null)}
                className="px-5 py-2 text-xs font-bold text-[#2D2D2D] bg-white hover:bg-[#E6E0D5]/50 border border-[#E6E0D5] rounded-xl"
              >
                بستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add News Modal */}
      <AddNewsModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

    </div>
  );
};
