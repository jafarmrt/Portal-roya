import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Building2, ChevronLeft, ExternalLink, FileText, LifeBuoy, Newspaper, Pencil, Phone, Search, Users } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { formatDate, toPersianDigits } from '../../lib/jalali';
import { aboutHits, aboutSummary, aboutTopics } from '../../lib/departmentAbout';
import { htmlToText, matches } from '../../lib/search';
import type { DepartmentPage, UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { loadModule } from '../common/ErrorBoundary';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { OwnerSelect } from '../documents/DocumentModals';
import { SystemIcon } from '../systems/SystemIcon';

const RichTextEditor = lazy(loadModule(() => import('../news/RichTextEditor')));

const byName = (a: UserProfile, b: UserProfile) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fa');

/** Portal admins edit every page and choose its head; a department's head edits its own page. */
function useCanEdit() {
  const { can, currentUser } = usePortal();
  return (page: DepartmentPage | undefined) => can('settings.manage') || Boolean(currentUser && page?.headId === currentUser.id);
}

const EditPageModal: React.FC<{ department: string; page?: DepartmentPage; onClose: () => void }> = ({ department, page, onClose }) => {
  const { can, saveDepartmentPage } = usePortal();
  const isAdmin = can('settings.manage');
  const [headId, setHeadId] = useState<string | null>(page?.headId ?? null);
  const [about, setAbout] = useState(page?.about ?? '');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await saveDepartmentPage(department, isAdmin ? { headId, about } : { about });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={`صفحهٔ واحد ${department}`}
      subtitle="آنچه همکاران باید دربارهٔ این واحد بدانند"
      icon={<Pencil className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="department-page-form" disabled={busy} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </>
      }
    >
      <form id="department-page-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="department-head" className={labelClass}>مسئول واحد</label>
          <OwnerSelect id="department-head" value={headId} onChange={setHeadId} emptyLabel="تعیین نشده" disabled={!isAdmin} />
          <p className="text-xs text-muted mt-1">
            {isAdmin ? 'مسئول واحد می‌تواند متن این صفحه را خودش به‌روز کند.' : 'مسئول واحد را ادمین پرتال تعیین می‌کند.'}
          </p>
        </div>
        <div>
          <label htmlFor="department-about" className={labelClass}>برای چه کارهایی به ما مراجعه کنید</label>
          <Suspense fallback={<div className="h-64 rounded-xl border border-line-strong bg-surface animate-pulse" />}>
            <RichTextEditor
              id="department-about"
              value={about}
              placeholder="مثلاً: صدور گواهی اشتغال، ثبت مرخصی و اضافه‌کار، تسویه حساب... ساعت پاسخ‌گویی و راه تماس را هم بنویسید."
              onChange={(html, empty) => setAbout(empty ? '' : html)}
            />
          </Suspense>
        </div>
      </form>
    </Modal>
  );
};

/** What was searched on the list when a department was opened from it, to point at the matching line on its page. */
let openedWithQuery = { department: '', query: '', at: 0 };

/**
 * The department's own text with a row of its topics to jump to, so a long page (like HR's)
 * reads as sections; opened from a search, the first matching line is shown and marked.
 */
const AboutContent: React.FC<{ department: string; html: string }> = ({ department, html }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [topics, setTopics] = useState<{ id: string; text: string }[]>([]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Filled here rather than by React, so the topic ids and the search mark below are not undone by a re-render.
    // The text is cleaned on the server when it is saved, as for news.
    root.innerHTML = html;
    const small = root.querySelectorAll<HTMLElement>('h3');
    const headings = small.length > 0 ? small : root.querySelectorAll<HTMLElement>('h2');
    const found = [...headings]
      .map((h, i) => {
        h.id = `department-topic-${i}`;
        return { id: h.id, text: (h.textContent ?? '').trim() };
      })
      .filter((t) => t.text);
    setTopics(found.length >= 3 ? found : []);

    // The page can mount more than once while it opens, so the search is kept for a few seconds rather than used up.
    const opened = openedWithQuery;
    const query = opened.department === department && Date.now() - opened.at < 5000 ? opened.query : '';
    if (query.trim().length < 2) return;
    const hit = [...root.querySelectorAll<HTMLElement>('li, p, td')].find(
      (el) => !el.querySelector('li, p') && matches(query, el.textContent),
    );
    if (!hit) return;
    const mark = hit.closest('li') ?? hit;
    mark.classList.add('search-hit');
    mark.scrollIntoView({ block: 'center' });
    const timer = window.setTimeout(() => mark.classList.remove('search-hit'), 6000);
    return () => window.clearTimeout(timer);
  }, [department, html]);

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      {topics.length > 0 && (
        <nav aria-label="موضوع‌های این صفحه" className="-mx-1 px-1 flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap">
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => jump(t.id)}
              className="shrink-0 px-3 py-1.5 rounded-full border border-line bg-surface-soft text-xs font-bold text-ink-soft hover:border-red-300 hover:text-red-700 whitespace-nowrap"
            >
              {t.text}
            </button>
          ))}
        </nav>
      )}
      <div ref={ref} className="rich-text text-sm department-about" />
    </>
  );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h3 className="text-sm font-black text-ink flex items-center gap-2">
    <span className="text-red-700">{icon}</span>
    {children}
  </h3>
);

const LinkRow: React.FC<{ title: string; detail: string; onClick: () => void }> = ({ title, detail, onClick }) => (
  <li>
    <button type="button" onClick={onClick} className="w-full text-right flex items-center gap-2 p-2.5 rounded-xl hover:bg-surface">
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-ink truncate">{title}</span>
        {detail && <span className="block text-xs text-faint truncate">{detail}</span>}
      </span>
      <ChevronLeft className="w-4 h-4 text-faint shrink-0" />
    </button>
  </li>
);

const DepartmentView: React.FC<{ department: string }> = ({ department }) => {
  const { employees, departmentPages, guides, documents, news, appSettings, setActiveTab, systemHref } = usePortal();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const page = departmentPages.find((p) => p.department === department);
  const head = page?.headId ? employees.find((e) => e.id === page.headId) : undefined;
  const members = employees
    .filter((e) => e.isActive && e.department === department)
    .sort((a, b) => Number(b.id === head?.id) - Number(a.id === head?.id) || byName(a, b));
  const memberIds = new Set(members.map((m) => m.id));
  const systems = (appSettings?.systems ?? []).filter((s) => s.department === department && systemHref(s));
  const ownGuides = guides.filter((g) => g.department === department);
  const ownDocuments = documents.filter((d) => d.targetDepartments.includes(department) || d.ownerDepartment === department);
  const ownNews = news
    .filter((n) => n.status === 'published' && (n.targetDepartments.includes(department) || memberIds.has(n.authorId)))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <button onClick={() => setActiveTab('departments')} className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-red-700">
        <ArrowRight className="w-4 h-4" /> همهٔ واحدها
      </button>

      <div className="bg-white rounded-3xl border border-line/70 shadow-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="p-3 bg-brand-deep text-white rounded-2xl shadow-lg w-fit">
          <Building2 className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h2 className="text-xl font-black text-ink">{department}</h2>
          <p className="text-xs text-muted">{toPersianDigits(members.length)} همکار</p>
        </div>
        {head && (
          <button
            type="button"
            onClick={() => setActiveTab('colleagues', head.id)}
            className="flex items-center gap-3 p-2.5 pl-4 rounded-2xl bg-surface-soft border border-line hover:border-red-300 text-right"
          >
            <Avatar src={head.avatar} firstName={head.firstName} lastName={head.lastName} className="w-11 h-11 rounded-full text-sm" />
            <span>
              <span className="block text-xs font-bold text-faint">مسئول واحد</span>
              <span className="block text-sm font-bold text-ink">{head.firstName} {head.lastName}</span>
              {head.extension && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Phone className="w-3 h-3" /> داخلی {toPersianDigits(head.extension)}
                </span>
              )}
            </span>
          </button>
        )}
        {canEdit(page) && (
          <button onClick={() => setEditing(true)} className={secondaryButtonClass}>
            <Pencil className="w-4 h-4" /> ویرایش صفحه
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-3">
            <SectionTitle icon={<Building2 className="w-4 h-4" />}>برای چه کارهایی به ما مراجعه کنید</SectionTitle>
            {page?.about ? (
              <>
                <AboutContent department={department} html={page.about} />
                <p className="text-xs text-faint">به‌روز شده {formatDate(page.updatedAt)}{page.updatedBy && ` · ${page.updatedBy}`}</p>
              </>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                هنوز توضیحی برای این واحد نوشته نشده است.{canEdit(page) && ' با «ویرایش صفحه» بنویسید همکاران برای چه کارهایی به این واحد مراجعه کنند.'}
              </p>
            )}
          </section>

          {ownGuides.length > 0 && (
            <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-2">
              <SectionTitle icon={<LifeBuoy className="w-4 h-4" />}>راهنماها و پرسش‌های رایج</SectionTitle>
              <ul className="divide-y divide-surface">
                {ownGuides.map((g) => (
                  <LinkRow key={g.id} title={g.title} detail={g.summary} onClick={() => setActiveTab('guides', g.id)} />
                ))}
              </ul>
            </section>
          )}

          {ownDocuments.length > 0 && (
            <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-2">
              <SectionTitle icon={<FileText className="w-4 h-4" />}>اسناد و فرم‌ها</SectionTitle>
              <ul className="divide-y divide-surface">
                {ownDocuments.map((d) => (
                  <LinkRow
                    key={d.id}
                    title={d.title}
                    detail={[d.category, d.requiresAck && 'لازم‌الاجرا', d.owner && `مسئول: ${d.owner}`].filter(Boolean).join(' · ')}
                    onClick={() => setActiveTab('documents', d.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {ownNews.length > 0 && (
            <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-2">
              <SectionTitle icon={<Newspaper className="w-4 h-4" />}>آخرین اخبار و اطلاعیه‌ها</SectionTitle>
              <ul className="divide-y divide-surface">
                {ownNews.map((n) => (
                  <LinkRow key={n.id} title={n.title} detail={`${formatDate(n.publishAt)} · ${n.author}`} onClick={() => setActiveTab('news', n.id)} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {systems.length > 0 && (
            <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-2">
              <SectionTitle icon={<ExternalLink className="w-4 h-4" />}>سامانه‌های واحد</SectionTitle>
              <ul className="space-y-1">
                {systems.map((s) => (
                  <li key={s.id}>
                    <a href={systemHref(s)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface">
                      <SystemIcon system={s} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-ink truncate">{s.name}</span>
                        {s.description && <span className="block text-xs text-faint truncate">{s.description}</span>}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-3xl border border-line/70 shadow-card p-5 space-y-2">
            <SectionTitle icon={<Users className="w-4 h-4" />}>همکاران واحد</SectionTitle>
            {members.length === 0 ? (
              <p className="text-xs text-muted">همکاری در این واحد ثبت نشده است.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => setActiveTab('colleagues', m.id)} className="w-full text-right flex items-center gap-3 p-2 rounded-xl hover:bg-surface">
                      <Avatar src={m.avatar} firstName={m.firstName} lastName={m.lastName} className="w-9 h-9 rounded-full text-xs" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                          <span className="truncate">{m.firstName} {m.lastName}</span>
                          {m.id === head?.id && <span className="shrink-0 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-800">مسئول</span>}
                        </span>
                        <span className="block text-xs text-faint truncate">{m.position}</span>
                      </span>
                      {m.extension && <span className="text-xs font-bold text-ink-soft whitespace-nowrap">{toPersianDigits(m.extension)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editing && <EditPageModal department={department} page={page} onClose={() => setEditing(false)} />}
    </div>
  );
};

/** Every department of the organisation, each with a page: what it does, who leads it, its people, guides and systems. */
export const DepartmentsModule: React.FC = () => {
  const { appSettings, employees, departmentPages, guides, focusId, setActiveTab } = usePortal();
  const [query, setQuery] = useState('');
  const departments = appSettings?.departments ?? [];
  const abouts = useMemo(() => new Map(departmentPages.map((p) => [p.department, htmlToText(p.about)])), [departmentPages]);
  const previews = useMemo(
    () => new Map(departmentPages.map((p) => [p.department, { summary: aboutSummary(p.about), topics: aboutTopics(p.about) }])),
    [departmentPages],
  );
  const searching = query.trim().length >= 2;

  if (focusId && departments.includes(focusId)) return <DepartmentView key={focusId} department={focusId} />;

  const visible = departments.filter((d) => !query.trim() || matches(query, d, abouts.get(d)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-deep text-white rounded-2xl shadow-lg">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-ink">واحدهای سازمان</h2>
          <p className="text-sm text-muted">هر واحد چه می‌کند، مسئولش کیست و برای چه کارهایی به آن مراجعه کنید</p>
        </div>
      </div>

      {focusId && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">واحد «{focusId}» در فهرست واحدها نیست؛ شاید نامش تغییر کرده باشد.</p>}

      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          aria-label="جستجو در واحدها"
          placeholder="نام واحد یا کاری که دارید، مثلاً: گواهی اشتغال"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} pr-9`}
        />
      </div>

      {visible.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-line">
          <Building2 className="w-10 h-10 text-faint mx-auto mb-2" />
          <p className="text-sm font-bold text-muted">{departments.length === 0 ? 'هنوز واحدی در تنظیمات تعریف نشده است.' : 'واحدی با این عبارت پیدا نشد.'}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((d) => {
            const page = departmentPages.find((p) => p.department === d);
            const head = page?.headId ? employees.find((e) => e.id === page.headId) : undefined;
            const count = employees.filter((e) => e.isActive && e.department === d).length;
            const guideCount = guides.filter((g) => g.department === d).length;
            const { summary, topics } = previews.get(d) ?? { summary: '', topics: [] };
            const hits = searching && page ? aboutHits(page.about, query) : [];
            const shownTopics = topics.slice(0, 4);
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => {
                    openedWithQuery = { department: d, query: hits.length > 0 ? query : '', at: Date.now() };
                    setActiveTab('departments', d);
                  }}
                  className="w-full h-full text-right bg-white p-5 rounded-3xl border border-line/70 shadow-card hover:border-red-400 hover:shadow-md transition-all flex flex-col gap-3"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-black text-ink">{d}</span>
                    <ChevronLeft className="w-4 h-4 text-faint" />
                  </span>
                  {summary && <span className="text-xs text-ink-soft leading-relaxed line-clamp-3">{summary}</span>}
                  {hits.length > 0 ? (
                    <span className="flex flex-col gap-1.5" aria-label="یافته در صفحهٔ واحد">
                      {hits.map((h) => (
                        <span key={h.text} className="block p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                          {h.text}
                          {h.topic && <span className="block text-amber-800/80 mt-0.5">در «{h.topic}»</span>}
                        </span>
                      ))}
                    </span>
                  ) : (
                    shownTopics.length > 0 && (
                      <span className="flex flex-wrap gap-1.5" aria-label="موضوع‌ها">
                        {shownTopics.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-surface text-xs text-ink-soft max-w-full truncate">{t}</span>
                        ))}
                        {topics.length > shownTopics.length && (
                          <span className="px-2 py-0.5 text-xs text-muted">و {toPersianDigits(topics.length - shownTopics.length)} موضوع دیگر</span>
                        )}
                      </span>
                    )
                  )}
                  <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {head && <span>مسئول: <strong className="text-ink">{head.firstName} {head.lastName}</strong></span>}
                    <span>{toPersianDigits(count)} همکار</span>
                    {guideCount > 0 && <span>{toPersianDigits(guideCount)} راهنما</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
