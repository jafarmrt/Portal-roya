import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Edit3,
  FileCheck2,
  FileText,
  Heart,
  Megaphone,
  Newspaper,
  Paperclip,
  Pin,
  Plus,
  Printer,
  Search,
  Tag,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import type { NewsItem } from '../../types';
import { api, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, formatFileSize, toPersianDigits } from '../../lib/jalali';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { BannerEditorModal } from '../common/SiteBanner';
import { AddNewsModal } from './AddNewsModal';
import { audienceSummary, deadlineState, NewsContent } from './NewsBody';
import { NoticePrintModal } from './NoticePrintModal';
import { ReadReceiptsModal } from './ReadReceiptsModal';

type Filter = 'all' | 'unread' | 'ack' | string;

export const NewsModule: React.FC = () => {
  const {
    news, newsHasMore, loadMoreNews, can, appSettings, focusId, setActiveTab, isGuest,
    toggleLikeNews, markNewsRead, acknowledgeNews, deleteNews,
  } = usePortal();
  const isManager = can('news.manage');

  const [editor, setEditor] = useState<{ item?: NewsItem } | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [receiptsFor, setReceiptsFor] = useState<NewsItem | null>(null);
  const [printFor, setPrintFor] = useState<NewsItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NewsItem | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NewsItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // The open article comes from the URL (#news/<id>) so it can be linked from notifications.
  const [fetchedArticle, setFetchedArticle] = useState<NewsItem | null>(null);
  const selectedArticle = useMemo(
    () => (focusId ? news.find((n) => n.id === focusId) ?? searchResults?.find((n) => n.id === focusId) ?? (fetchedArticle?.id === focusId ? fetchedArticle : null) : null),
    [focusId, news, searchResults, fetchedArticle],
  );

  useEffect(() => {
    if (!focusId || news.some((n) => n.id === focusId)) return;
    api.get<NewsItem>(`/api/news/${focusId}`).then(setFetchedArticle).catch(() => setFetchedArticle(null));
  }, [focusId, news]);

  const markedRead = useRef(new Set<string>());
  useEffect(() => {
    if (!selectedArticle || selectedArticle.isRead || selectedArticle.status !== 'published') return;
    if (markedRead.current.has(selectedArticle.id)) return;
    markedRead.current.add(selectedArticle.id);
    void markNewsRead(selectedArticle.id);
  }, [selectedArticle, markNewsRead]);

  // Server-side search covers the whole archive, not only the loaded page.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .get<{ items: NewsItem[] }>(`/api/news?limit=50&q=${encodeURIComponent(q)}`)
        .then((r) => setSearchResults(r.items))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, news]);

  const source = searchResults ?? news;
  // Circulars still waiting for this person's acknowledgement come first, so they don't sink under newer news.
  const awaitsMyAck = (n: NewsItem) => !isGuest && n.status === 'published' && n.requiresAck && !n.acknowledgedAt;
  const visible = source
    .filter((n) => {
      if (filter === 'all') return true;
      if (filter === 'unread') return !n.isRead;
      if (filter === 'ack') return n.requiresAck && !n.acknowledgedAt;
      return n.category === filter;
    })
    .sort((a, b) => Number(awaitsMyAck(b)) - Number(awaitsMyAck(a)));

  const pendingAck = news.filter((n) => n.status === 'published' && n.requiresAck && !n.acknowledgedAt).length;
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'همه' },
    { id: 'unread', label: 'نخوانده' },
    { id: 'ack', label: `بخشنامه‌های تأییدنشده${pendingAck ? ` (${toPersianDigits(pendingAck)})` : ''}` },
    ...(appSettings?.newsCategories ?? []).map((c) => ({ id: c, label: c })),
  ];

  const openArticle = (item: NewsItem) => setActiveTab('news', item.id);
  const closeArticle = () => setActiveTab('news');

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-5 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl sm:text-3xl font-black text-white">اخبار و اطلاعیه‌ها</h1>
            <p className="text-[#F5E9E9] text-xs sm:text-sm max-w-2xl leading-relaxed">
              اطلاعیه‌های رسمی، بخشنامه‌ها، رویدادها و اخبار سازمان. بخشنامه‌هایی که نیاز به تأیید دارند با نشان زرد مشخص شده‌اند.
            </p>
          </div>
          {isManager && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setEditor({})}
                className="px-5 py-3 text-xs font-bold text-[#7f1d1d] bg-white hover:bg-[#FDF2F2] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>انتشار خبر یا بخشنامه</span>
              </button>
              <button
                onClick={() => setBannerOpen(true)}
                title="پیام کوتاه بالای همهٔ صفحه‌ها، مثلاً قطعی اینترنت"
                className="px-4 py-3 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/40 rounded-2xl transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <Megaphone className="w-4 h-4" />
                <span>پیام سراسری</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C867A] absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در همهٔ اخبار و بخشنامه‌ها..."
            aria-label="جستجو در اخبار"
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-[#E6E0D5] bg-[#F5F2ED] focus:bg-white text-sm outline-hidden focus:border-red-600"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="فیلتر اخبار">
          {filters.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                filter === f.id ? 'bg-[#dc2626] text-white' : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {searching && <p className="text-xs text-[#6E6A60]">در حال جستجو...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
            <Newspaper className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#6E6A60]">{searchResults ? 'نتیجه‌ای پیدا نشد.' : 'خبری در این بخش نیست.'}</p>
          </div>
        ) : (
          visible.map((article) => (
            <NewsCard
              key={article.id}
              article={article}
              isManager={isManager}
              onOpen={() => openArticle(article)}
              onLike={() => toggleLikeNews(article.id)}
              onEdit={() => setEditor({ item: article })}
              onDelete={() => setConfirmDelete(article)}
              onReceipts={() => setReceiptsFor(article)}
            />
          ))
        )}
      </div>

      {!searchResults && newsHasMore && (
        <div className="flex justify-center">
          <button
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await loadMoreNews();
              setLoadingMore(false);
            }}
            className={secondaryButtonClass}
          >
            {loadingMore ? 'در حال دریافت...' : 'نمایش اخبار قدیمی‌تر'}
          </button>
        </div>
      )}

      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          isManager={isManager}
          onClose={closeArticle}
          onLike={() => toggleLikeNews(selectedArticle.id)}
          onAcknowledge={() => acknowledgeNews(selectedArticle.id)}
          onReceipts={() => setReceiptsFor(selectedArticle)}
          onPrint={() => setPrintFor(selectedArticle)}
        />
      )}

      {editor && <AddNewsModal item={editor.item} onClose={() => setEditor(null)} />}
      {bannerOpen && <BannerEditorModal onClose={() => setBannerOpen(false)} />}
      {receiptsFor && <ReadReceiptsModal item={receiptsFor} onClose={() => setReceiptsFor(null)} />}
      {printFor && <NoticePrintModal item={printFor} onClose={() => setPrintFor(null)} />}
      {confirmDelete && (
        <Modal
          title="حذف خبر"
          icon={<Trash2 className="w-5 h-5" />}
          size="md"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button onClick={() => setConfirmDelete(null)} className={secondaryButtonClass}>انصراف</button>
              <button
                onClick={async () => {
                  try {
                    await deleteNews(confirmDelete.id);
                  } catch (err) {
                    console.error(errorMessage(err));
                  }
                  setConfirmDelete(null);
                  if (focusId === confirmDelete.id) closeArticle();
                }}
                className={primaryButtonClass}
              >
                حذف قطعی
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed">«{confirmDelete.title}» و آمار خوانده‌شدن آن برای همیشه حذف می‌شود. ادامه می‌دهید؟</p>
        </Modal>
      )}
    </div>
  );
};

const StatusBadges: React.FC<{ article: NewsItem }> = ({ article }) => (
  <>
    {article.status === 'scheduled' && (
      <span className="px-2.5 py-1 text-[10px] font-bold bg-sky-600 text-white rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" /> زمان‌بندی‌شده: {formatDateTime(article.publishAt)}
      </span>
    )}
    {article.status === 'expired' && <span className="px-2.5 py-1 text-[10px] font-bold bg-stone-600 text-white rounded-full">منقضی‌شده</span>}
    {article.isUrgent && <span className="px-2.5 py-1 text-[10px] font-bold bg-red-600 text-white rounded-full">فوری</span>}
    {article.requiresAck && (
      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${article.acknowledgedAt ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-amber-950'}`}>
        <FileCheck2 className="w-3 h-3" /> {article.acknowledgedAt ? 'تأیید شده' : 'نیاز به تأیید'}
      </span>
    )}
    {article.requiresAck && !article.acknowledgedAt && <DeadlineBadge article={article} />}
    {article.isPinned && (
      <span className="px-2.5 py-1 text-[10px] font-bold bg-[#7f1d1d] text-white rounded-full flex items-center gap-1">
        <Pin className="w-3 h-3" /> سنجاق‌شده
      </span>
    )}
  </>
);

/** "تا ۱۰ آبان" on a circular this person still has to acknowledge; red on the last day and after. */
const DeadlineBadge: React.FC<{ article: NewsItem }> = ({ article }) => {
  const state = deadlineState(article);
  if (state === 'none') return null;
  const tone = state === 'open' ? 'bg-white text-amber-900 border border-amber-300' : 'bg-red-700 text-white';
  return (
    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${tone}`}>
      <AlarmClock className="w-3 h-3" />
      {state === 'overdue' ? `مهلت تأیید گذشته (${formatDate(article.ackDeadline!)})` : `مهلت تأیید: ${formatDate(article.ackDeadline!)}`}
    </span>
  );
};

interface NewsCardProps {
  article: NewsItem;
  isManager: boolean;
  onOpen: () => void;
  onLike: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReceipts: () => void;
}

const NewsCard: React.FC<NewsCardProps> = ({ article, isManager, onOpen, onLike, onEdit, onDelete, onReceipts }) => {
  const { roleName } = usePortal();
  const audience = audienceSummary(article, roleName);
  return (
    <article className={`bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition-all flex flex-col ${article.isRead ? 'border-[#E6E0D5]' : 'border-red-300'}`}>
      {article.image ? (
        <button type="button" onClick={onOpen} className="relative h-44 overflow-hidden bg-[#F5F2ED]" aria-label={article.title}>
          <img src={article.image} alt="" loading="lazy" className="w-full h-full object-cover" />
          <span className="absolute top-3 right-3 px-3 py-1 text-[10px] font-bold bg-[#7f1d1d]/85 text-white rounded-full">{article.category}</span>
        </button>
      ) : (
        <div className="px-5 pt-5">
          <span className="px-3 py-1 text-[10px] font-bold bg-[#F5F2ED] text-[#7f1d1d] rounded-full">{article.category}</span>
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5"><StatusBadges article={article} /></div>
          <div className="flex items-center gap-2 text-[11px] text-[#6E6A60] flex-wrap">
            {!article.isRead && <span className="w-2 h-2 rounded-full bg-red-600" aria-label="نخوانده" />}
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(article.publishAt)}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{article.author}</span>
            {audience && (
              <span className="flex items-center gap-1" title="مخاطبان"><Users className="w-3.5 h-3.5" />{audience}</span>
            )}
          </div>
          <h3>
            <button type="button" onClick={onOpen} className={`text-sm text-right text-[#2D2D2D] hover:text-[#dc2626] leading-snug line-clamp-2 ${article.isRead ? 'font-bold' : 'font-black'}`}>
              {article.title}
            </button>
          </h3>
          <p className="text-xs text-[#6E6A60] leading-relaxed line-clamp-3">{article.summary}</p>
          {article.attachments.length > 0 && (
            <p className="text-[11px] text-[#6E6A60] flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />{toPersianDigits(article.attachments.length)} پیوست</p>
          )}
        </div>

        {isManager && article.readStats && (
          <button type="button" onClick={onReceipts} className="text-[11px] text-right p-2 bg-[#F5F2ED] hover:bg-[#E6E0D5] rounded-xl flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-red-700" />
            خوانده: {toPersianDigits(article.readStats.read)} از {toPersianDigits(article.readStats.audience)}
            {article.requiresAck && ` • تأیید: ${toPersianDigits(article.readStats.acknowledged)}`}
          </button>
        )}

        <div className="pt-3 border-t border-[#E6E0D5] flex items-center justify-between gap-2">
          <button
            onClick={onLike}
            aria-pressed={article.likedByMe}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              article.likedByMe ? 'bg-[#FBF0EC] text-[#C2553A] border border-[#D97B5F]/30' : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#6E6A60]'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${article.likedByMe ? 'fill-current' : ''}`} />
            <span>{toPersianDigits(article.likesCount)}</span>
          </button>
          <div className="flex items-center gap-1">
            {isManager && (
              <>
                <button onClick={onEdit} aria-label="ویرایش" className="p-1.5 text-[#6E6A60] hover:text-red-700 rounded-lg hover:bg-[#F5F2ED]"><Edit3 className="w-4 h-4" /></button>
                <button onClick={onDelete} aria-label="حذف" className="p-1.5 text-[#6E6A60] hover:text-red-700 rounded-lg hover:bg-[#F5F2ED]"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
            <button onClick={onOpen} className="text-xs font-bold text-[#dc2626] hover:underline flex items-center gap-1">
              <span>ادامه مطلب</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

interface ArticleModalProps {
  article: NewsItem;
  isManager: boolean;
  onClose: () => void;
  onLike: () => void;
  onAcknowledge: () => void;
  onReceipts: () => void;
  onPrint: () => void;
}

const ArticleModal: React.FC<ArticleModalProps> = ({ article, isManager, onClose, onLike, onAcknowledge, onReceipts, onPrint }) => {
  const { roleName } = usePortal();
  const audience = audienceSummary(article, roleName);
  const deadline = deadlineState(article);
  return (
    <Modal
      title={article.title}
      subtitle={`${article.category} • ${article.author}${article.authorRole ? ` (${article.authorRole})` : ''} • ${formatDate(article.publishAt)}`}
      icon={<Newspaper className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={onLike}
            aria-pressed={article.likedByMe}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${article.likedByMe ? 'bg-[#dc2626] text-white' : 'bg-white border border-[#E6E0D5]'}`}
          >
            <Heart className={`w-4 h-4 ${article.likedByMe ? 'fill-white' : ''}`} />
            <span>پسندیدن ({toPersianDigits(article.likesCount)})</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && (
              <>
                <button onClick={onPrint} className={secondaryButtonClass} title="برگهٔ A4 با کد QR برای تابلو اعلانات">
                  <Printer className="w-4 h-4" /> چاپ برای تابلو
                </button>
                <button onClick={onReceipts} className={secondaryButtonClass}>
                  <BarChart3 className="w-4 h-4" /> چه کسانی خوانده‌اند؟
                </button>
              </>
            )}
            <button onClick={onClose} className={secondaryButtonClass}>بستن</button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm leading-loose">
        <div className="flex flex-wrap gap-1.5"><StatusBadges article={article} /></div>
        {article.image && <img src={article.image} alt="" className="w-full max-h-80 object-cover rounded-2xl" />}

        {article.requiresAck && (
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${article.acknowledgedAt ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
            {article.acknowledgedAt ? (
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> مطالعهٔ این بخشنامه را در {formatDateTime(article.acknowledgedAt)} تأیید کرده‌اید.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> این بخشنامه نیاز به تأیید مطالعه دارد.
                  </p>
                  {deadline !== 'none' && (
                    <p className={`text-xs flex items-center gap-1.5 ${deadline === 'open' ? 'text-amber-900' : 'text-red-700 font-bold'}`}>
                      <AlarmClock className="w-4 h-4" />
                      {deadline === 'overdue'
                        ? `مهلت تأیید (${formatDate(article.ackDeadline!)}) گذشته است؛ لطفاً هر چه زودتر تأیید کنید.`
                        : `لطفاً تا پایان ${formatDate(article.ackDeadline!)} تأیید کنید.`}
                    </p>
                  )}
                </div>
                {article.status === 'published' && (
                  <button onClick={onAcknowledge} className={primaryButtonClass}>
                    <FileCheck2 className="w-4 h-4" /> مطالعه کردم و آگاه هستم
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="p-4 bg-[#F5F2ED] rounded-2xl border-r-4 border-[#dc2626] font-semibold">{article.summary}</div>
        <NewsContent content={article.content} format={article.contentFormat} />

        {article.attachments.length > 0 && (
          <div className="pt-4 border-t border-[#E6E0D5] space-y-2">
            <h4 className="text-xs font-bold text-[#6E6A60] flex items-center gap-1.5"><Paperclip className="w-4 h-4" /> پیوست‌ها</h4>
            {article.attachments.map((a) => (
              <a key={a.url} href={a.url} download={a.name} className="flex items-center justify-between gap-2 p-3 bg-[#F5F2ED] hover:bg-[#E6E0D5] rounded-xl text-xs">
                <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-red-700 shrink-0" /><span className="truncate font-bold">{a.name}</span></span>
                <span className="text-[#8C867A] whitespace-nowrap">{formatFileSize(a.size)}</span>
              </a>
            ))}
          </div>
        )}

        {article.tags.length > 0 && (
          <div className="pt-4 border-t border-[#E6E0D5] flex items-center gap-2 flex-wrap text-xs">
            <Tag className="w-4 h-4 text-[#8C867A]" />
            {article.tags.map((t) => <span key={t} className="px-2.5 py-1 bg-[#F5F2ED] rounded-lg">#{t}</span>)}
          </div>
        )}
        {(audience || article.expiresAt) && (
          <div className="text-[11px] text-[#8C867A] space-y-1">
            {audience && <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> مخاطبان: {audience}</p>}
            {article.expiresAt && <p>نمایش تا {formatDate(article.expiresAt)}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
};
