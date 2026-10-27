import type { CalendarEvent, DepartmentPage, Guide, NewsItem, Poll, PortalDocument, SearchResultItem, TrainingProgram, UserProfile } from '../types';
import { normalizeForSearch } from '../../shared/search';
import { formatDate } from './jalali';

interface SearchSources {
  employees: UserProfile[];
  news: NewsItem[];
  polls: Poll[];
  trainings: TrainingProgram[];
  calendarEvents: CalendarEvent[];
  documents: PortalDocument[];
  guides: Guide[];
  departmentPages: DepartmentPage[];
  /** The department list from the settings. */
  departments: string[];
}

export { normalizeForSearch };

/** The words of editor HTML, for searching and short previews. */
export function htmlToText(html: string) {
  return html
    .replace(/<\/(p|h\d|li|tr|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function matches(query: string, ...fields: (string | null | undefined)[]) {
  const q = normalizeForSearch(query.trim());
  return fields.some((f) => normalizeForSearch(f).includes(q));
}

export function buildSearchResults(query: string, s: SearchSources): SearchResultItem[] {
  if (!query || query.trim().length < 2) return [];
  const results: SearchResultItem[] = [];

  for (const emp of s.employees) {
    if (!emp.isActive) continue;
    if (!matches(query, `${emp.firstName} ${emp.lastName}`, emp.extension, emp.mobile, emp.email, emp.position, emp.department, ...emp.skills.map((sk) => sk.name))) continue;
    results.push({
      id: `res-emp-${emp.id}`,
      type: 'همکاران',
      title: `${emp.firstName} ${emp.lastName}`,
      subtitle: `${emp.position} | ${emp.department}`,
      snippet: [emp.extension && `داخلی: ${emp.extension}`, emp.mobile && `همراه: ${emp.mobile}`, emp.email].filter(Boolean).join(' | '),
      targetTab: 'colleagues',
      targetId: emp.id,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    });
  }

  for (const n of s.news) {
    if (!matches(query, n.title, n.summary, n.contentFormat === 'html' ? htmlToText(n.content) : n.content, n.category, ...n.tags)) continue;
    const isNotice = n.requiresAck || n.isUrgent;
    results.push({
      id: `res-news-${n.id}`,
      type: isNotice ? 'اطلاعیه' : 'اخبار',
      title: n.title,
      subtitle: `نویسنده: ${n.author} | ${formatDate(n.publishAt)}`,
      snippet: n.summary,
      targetTab: 'news',
      targetId: n.id,
      badgeColor: isNotice ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300',
      date: n.publishAt,
    });
  }

  for (const p of s.polls) {
    if (!matches(query, p.title, p.description, ...p.options.map((o) => o.text))) continue;
    results.push({
      id: `res-poll-${p.id}`,
      type: 'نظرسنجی',
      title: p.title,
      subtitle: `نوع: ${p.type === 'multiple_choice' ? 'گزینه‌ای' : 'پاسخ متنی آزاد'}${p.expiryDate ? ` | مهلت: ${formatDate(p.expiryDate)}` : ''}`,
      snippet: p.description,
      targetTab: 'polls',
      targetId: p.id,
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    });
  }

  for (const tr of s.trainings) {
    if (!matches(query, tr.title, tr.description, tr.instructor, tr.category)) continue;
    results.push({
      id: `res-tr-${tr.id}`,
      type: 'آموزش',
      title: tr.title,
      subtitle: `مدرس: ${tr.instructor} | تاریخ: ${formatDate(tr.date)}${tr.time ? ` (ساعت ${tr.time})` : ''}`,
      snippet: tr.description,
      targetTab: 'training',
      targetId: tr.id,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
      date: tr.date,
    });
  }

  for (const cal of s.calendarEvents) {
    if (!matches(query, cal.title, cal.description)) continue;
    results.push({
      id: `res-cal-${cal.id}`,
      type: 'تقویم',
      title: cal.title,
      subtitle: `تاریخ: ${formatDate(cal.date)}${cal.time ? ` (${cal.time})` : ''}`,
      snippet: cal.description,
      targetTab: 'calendar',
      targetId: cal.id,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      date: cal.date,
    });
  }

  for (const doc of s.documents) {
    if (!matches(query, doc.title, doc.description, doc.category, doc.fileName, doc.owner)) continue;
    results.push({
      id: `res-doc-${doc.id}`,
      type: 'اسناد',
      title: doc.title,
      subtitle: [doc.category, doc.requiresAck && 'لازم‌الاجرا', formatDate(doc.updatedAt), doc.owner && `مسئول: ${doc.owner}`].filter(Boolean).join(' | '),
      snippet: doc.description || doc.fileName,
      targetTab: 'documents',
      targetId: doc.id,
      badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
    });
  }

  for (const g of s.guides) {
    const text = htmlToText(g.content);
    if (!matches(query, g.title, g.summary, g.category, g.department, g.owner, text)) continue;
    results.push({
      id: `res-guide-${g.id}`,
      type: 'راهنما',
      title: g.title,
      subtitle: [g.category, g.department, g.owner && `مسئول: ${g.owner}`].filter(Boolean).join(' | '),
      snippet: g.summary || text.slice(0, 200),
      targetTab: 'guides',
      targetId: g.id,
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    });
  }

  for (const department of s.departments) {
    const page = s.departmentPages.find((p) => p.department === department);
    const about = page ? htmlToText(page.about) : '';
    if (!matches(query, department, about)) continue;
    results.push({
      id: `res-dept-${department}`,
      type: 'واحد',
      title: department,
      subtitle: 'صفحهٔ واحد',
      snippet: about.slice(0, 200),
      targetTab: 'departments',
      targetId: department,
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    });
  }

  return results;
}
