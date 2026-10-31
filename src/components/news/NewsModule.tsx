import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FilePen,
  FileText,
  Heart,
  History,
  Megaphone,
  MessageCircleQuestion,
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
import { NewsHistoryModal } from './NewsHistory';
import { NewsQuestions } from './NewsQuestions';
import { NoticePrintModal } from './NoticePrintModal';
import { AddToTodosButton } from '../todos/AddToTodosButton';
import { ReadReceiptsModal } from '../common/ReceiptsModal';
import { PageHeader } from '../common/PageHeader';
import { haptic, pop } from '../../lib/feedback';

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
  const [historyFor, setHistoryFor] = useState<NewsItem | null>(null);
  const [drafts, setDrafts] = useState<NewsItem[]>([]);
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

  // Drafts of all publishers; reloaded whenever the news list changes (a draft saved or published).
  const loadDrafts = useCallback(() => {
    if (!isManager) return Promise.resolve();
    return api.get<NewsItem[]>('/api/news-drafts').then(setDrafts).catch(() => setDrafts([]));
  }, [isManager]);
  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts, news]);

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

  const source = filter === 'drafts' ? drafts : (searchResults ?? news);
  // Circulars still waiting for this person's acknowledgement come first, so they don't sink under newer news.
  const awaitsMyAck = (n: NewsItem) => !isGuest && n.status === 'published' && n.requiresAck && !n.acknowledgedAt;
  const visible = source
    .filter((n) => {
      if (filter === 'all' || filter === 'drafts') return true;
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
    ...(isManager ? [{ id: 'drafts', label: `پیش‌نویس‌ها (${toPersianDigits(drafts.length)})` }] : []),
    ...(appSettings?.newsCategories ?? []).map((c) => ({ id: c, label: c })),
  ];

  const openArticle = (item: NewsItem) => setActiveTab('news', item.id);
  const closeArticle = () => setActiveTab('news');

  return (
    <div className="space-y-6">
      <PageHeader icon={<Newspaper />} title="اخبار و اطلاعیه‌ها" description="بخشنامه‌هایی که تأیید شما را لازم دارند با نشان زرد مشخص شده‌اند.">
        {isManager && (
          <>
            <button onClick={() => setEditor({})} className={primaryButtonClass}>
              <Plus className="w-4 h-4" />
              <span>انتشار خبر یا بخشنامه</span>
            </button>
            <button onClick={() => setBannerOpen(true)} title="پیام کوتاه بالای همهٔ صفحه‌ها، مثلاً قطعی اینترنت" className={secondaryButtonClass}>
              <Megaphone className="w-4 h-4" />
              <span>پیام سراسری</span>
            </button>
          </>
        )}
      </PageHeader>

      <div className="bg-white p-4 rounded-2xl border border-line space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-faint absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در همهٔ اخبار و بخشنامه‌ها..."
            aria-label="جستجو در اخبار"
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-line bg-surface focus:bg-white text-sm outline-hidden focus:border-red-600"
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
                filter === f.id ? 'bg-brand text-white' : 'bg-surface hover:bg-line text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {searching && <p className="text-xs text-muted">در حال جستجو...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-line">
            <Newspaper className="w-10 h-10 text-faint mx-auto mb-2" />
            <p className="text-sm font-bold text-muted">
              {filter === 'drafts' ? 'پیش‌نویسی نیست. در فرم خبر با «ذخیرهٔ پیش‌نویس» متن نیمه‌کاره را نگه دارید.' : searchResults ? 'نتیجه‌ای پیدا نشد.' : 'خبری در این بخش نیست.'}
            </p>
          </div>
        ) : (
          visible.map((article) => (
            <NewsCard
              key={article.id}
              article={article}
              isManager={isManager}
              onOpen={() => (article.status === 'draft' ? setEditor({ item: article }) : openArticle(article))}
              onLike={() => toggleLikeNews(article.id)}
              onEdit={() => setEditor({ item: article })}
              onDelete={() => setConfirmDelete(article)}
              onReceipts={() => setReceiptsFor(article)}
            />
          ))
        )}
      </div>

      {!searchResults && filter !== 'drafts' && newsHasMore && (
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
          onHistory={() => setHistoryFor(selectedArticle)}
        />
      )}

      {editor && <AddNewsModal item={editor.item} onClose={() => setEditor(null)} />}
      {bannerOpen && <BannerEditorModal onClose={() => setBannerOpen(false)} />}
      {receiptsFor && <ReadReceiptsModal item={receiptsFor} onClose={() => setReceiptsFor(null)} />}
      {printFor && <NoticePrintModal item={printFor} onClose={() => setPrintFor(null)} />}
      {historyFor && <NewsHistoryModal item={historyFor} onClose={() => setHistoryFor(null)} />}
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
                  if (confirmDelete.status === 'draft') await loadDrafts();
                  if (focusId === confirmDelete.id) closeArticle();
                }}
                className={primaryButtonClass}
              >
                حذف قطعی
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed">
            {confirmDelete.status === 'draft' ? `پیش‌نویس «${confirmDelete.title}» حذف می‌شود. ادامه می‌دهید؟` : `«${confirmDelete.title}» و آمار خوانده‌شدن آن برای همیشه حذف می‌شود. ادامه می‌دهید؟`}
          </p>
        </Modal>
      )}
    </div>
  );
};

const StatusBadges: React.FC<{ article: NewsItem }> = ({ article }) => (
  <>
    {article.status === 'draft' && (
      <span className="px-2.5 py-1 text-xs font-bold bg-stone-200 text-stone-800 rounded-full flex items-center gap-1">
        <FilePen className="w-3 h-3" /> پیش‌نویس
      </span>
    )}
    {article.status === 'scheduled' && (
      <span className="px-2.5 py-1 text-xs font-bold bg-sky-600 text-white rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" /> زمان‌بندی‌شده: {formatDateTime(article.publishAt)}
      </span>
    )}
    {article.status === 'expired' && <span className="px-2.5 py-1 text-xs font-bold bg-stone-600 text-white rounded-full">منقضی‌شده</span>}
    {article.isUrgent && <span className="px-2.5 py-1 text-xs font-bold bg-red-600 text-white rounded-full">فوری</span>}
    {article.requiresAck && (
      <span className={`px-2.5 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${article.acknowledgedAt ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-amber-950'}`}>
        <FileCheck2 className="w-3 h-3" /> {article.acknowledgedAt ? 'تأیید شده' : 'نیاز به تأیید'}
      </span>
    )}
    {article.requiresAck && !article.acknowledgedAt && <DeadlineBadge article={article} />}
    {article.isPinned && (
      <span className="px-2.5 py-1 text-xs font-bold bg-brand-deep text-white rounded-full flex items-center gap-1">
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
    <span className={`px-2.5 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${tone}`}>
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
  // Drafts have no readers yet.
  const unread = !article.isRead && article.status !== 'draft';
  return (
    <article className={`bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition-all flex flex-col ${unread ? 'border-red-300' : 'border-line'}`}>
      {article.image ? (
        <button type="button" onClick={onOpen} className="relative h-44 overflow-hidden bg-surface" aria-label={article.title}>
          <img src={article.image} alt="" loading="lazy" className="w-full h-full object-cover" />
          {article.category && <span className="absolute top-3 right-3 px-3 py-1 text-xs font-bold bg-brand-deep/85 text-white rounded-full">{article.category}</span>}
        </button>
      ) : (
        <div className="px-5 pt-5">
          {article.category && <span className="px-3 py-1 text-xs font-bold bg-surface text-brand-deep rounded-full">{article.category}</span>}
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5"><StatusBadges article={article} /></div>
          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
            {unread && <span className="w-2 h-2 rounded-full bg-red-600" aria-label="نخوانده" />}
            {article.status === 'draft' ? (
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />آخرین ذخیره: {formatDateTime(article.updatedAt)}</span>
            ) : (
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(article.publishAt)}</span>
            )}
            <span>•</span>
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{article.author}</span>
            {audience && (
              <span className="flex items-center gap-1" title="مخاطبان"><Users className="w-3.5 h-3.5" />{audience}</span>
            )}
          </div>
          <h3>
            <button type="button" onClick={onOpen} className={`text-sm text-right text-ink hover:text-brand leading-snug line-clamp-2 ${unread ? 'font-black' : 'font-bold'}`}>
              {article.title}
            </button>
          </h3>
          <p className="text-xs text-muted leading-relaxed line-clamp-3">{article.summary}</p>
          {article.attachments.length > 0 && (
            <p className="text-xs text-muted flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />{toPersianDigits(article.attachments.length)} پیوست</p>
          )}
          {article.openQuestions > 0 && (
            <button type="button" onClick={onOpen} className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <MessageCircleQuestion className="w-3.5 h-3.5" /> {toPersianDigits(article.openQuestions)} پرسش بی‌پاسخ
            </button>
          )}
        </div>

        {isManager && article.readStats && article.status !== 'draft' && (
          <button type="button" onClick={onReceipts} className="text-xs text-right p-2 bg-surface hover:bg-line rounded-xl flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-red-700" />
            خوانده: {toPersianDigits(article.readStats.read)} از {toPersianDigits(article.readStats.audience)}
            {article.requiresAck && ` • تأیید: ${toPersianDigits(article.readStats.acknowledged)}`}
          </button>
        )}

        <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
          {article.status === 'draft' ? <span /> : <button
            onClick={onLike}
            aria-pressed={article.likedByMe}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              article.likedByMe ? 'bg-warm-soft text-warm-strong border border-warm/30' : 'bg-surface hover:bg-line text-muted'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${article.likedByMe ? 'fill-current' : ''}`} />
            <span>{toPersianDigits(article.likesCount)}</span>
          </button>}
          <div className="flex items-center gap-2 sm:gap-1">
            {isManager && (
              <>
                <button onClick={onEdit} aria-label="ویرایش" className="p-1.5 text-muted hover:text-red-700 rounded-lg hover:bg-surface"><Edit3 className="w-4 h-4" /></button>
                <button onClick={onDelete} aria-label="حذف" className="p-1.5 text-muted hover:text-red-700 rounded-lg hover:bg-surface"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
            <button onClick={onOpen} className="tap-area text-xs font-bold text-brand hover:underline flex items-center gap-1">
              <span>{article.status === 'draft' ? 'ادامهٔ نوشتن' : 'ادامه مطلب'}</span>
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
  onHistory: () => void;
}

const ArticleModal: React.FC<ArticleModalProps> = ({ article, isManager, onClose, onLike, onAcknowledge, onReceipts, onPrint, onHistory }) => {
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
            onClick={(e) => {
              haptic();
              if (!article.likedByMe) pop(e.currentTarget.querySelector('svg'));
              onLike();
            }}
            aria-pressed={article.likedByMe}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${article.likedByMe ? 'bg-brand text-white' : 'bg-white border border-line'}`}
          >
            <Heart className={`w-4 h-4 ${article.likedByMe ? 'fill-white' : ''}`} />
            <span>پسندیدن{article.likesCount > 0 ? ` (${toPersianDigits(article.likesCount)})` : ''}</span>
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
                <button onClick={onHistory} className={secondaryButtonClass}>
                  <History className="w-4 h-4" /> تاریخچهٔ ویرایش
                </button>
              </>
            )}
            {article.status === 'published' && (
              <AddToTodosButton
                type="news"
                id={article.id}
                title={article.requiresAck && !article.acknowledgedAt ? `مطالعه و تأیید: ${article.title}` : article.title}
                dueDate={article.requiresAck && !article.acknowledgedAt ? article.ackDeadline : null}
                className={secondaryButtonClass}
              />
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

        <div className="p-4 bg-surface rounded-2xl border-r-4 border-brand font-semibold">{article.summary}</div>
        <NewsContent content={article.content} format={article.contentFormat} />

        {article.attachments.length > 0 && (
          <div className="pt-4 border-t border-line space-y-2">
            <h4 className="text-xs font-bold text-muted flex items-center gap-1.5"><Paperclip className="w-4 h-4" /> پیوست‌ها</h4>
            {article.attachments.map((a) => (
              <a key={a.url} href={a.url} download={a.name} className="flex items-center justify-between gap-2 p-3 bg-surface hover:bg-line rounded-xl text-xs">
                <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-red-700 shrink-0" /><span className="truncate font-bold">{a.name}</span></span>
                <span className="text-faint whitespace-nowrap">{formatFileSize(a.size)}</span>
              </a>
            ))}
          </div>
        )}

        {article.tags.length > 0 && (
          <div className="pt-4 border-t border-line flex items-center gap-2 flex-wrap text-xs">
            <Tag className="w-4 h-4 text-faint" />
            {article.tags.map((t) => <span key={t} className="px-2.5 py-1 bg-surface rounded-lg">#{t}</span>)}
          </div>
        )}
        {(audience || article.expiresAt || article.editedAt) && (
          <div className="text-xs text-faint space-y-1">
            {audience && <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> مخاطبان: {audience}</p>}
            {article.expiresAt && <p>نمایش تا {formatDate(article.expiresAt)}</p>}
            {article.editedAt && <p>آخرین ویرایش بعد از انتشار: {formatDateTime(article.editedAt)}</p>}
          </div>
        )}
        <NewsQuestions article={article} />
      </div>
    </Modal>
  );
};
