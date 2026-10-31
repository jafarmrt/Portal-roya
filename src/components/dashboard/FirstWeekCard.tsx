import React, { useState } from 'react';
import { Check, ChevronLeft, Footprints, X } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { aboutMeAnswers } from '../../../shared/aboutMe';
import { extraStepId, FIRST_WEEK_CLOSED, inFirstWeeks } from '../../../shared/firstWeek';
import { managerOf, unitHeads } from '../../../shared/profile';
import { tabOn } from '../../lib/features';
import { toPersianDigits } from '../../lib/jalali';
import { haptic } from '../../lib/feedback';
import { deleteWithUndo } from '../common/UndoToast';
import { EditProfileModal } from '../colleagues/EditProfileModal';

interface Step {
  id: string;
  title: string;
  hint?: string;
  done: boolean;
  /** Ticked by the portal itself (a complete card, no circular waiting), not by hand. */
  auto?: boolean;
  action?: { label: string; run: () => void };
}

/**
 * «هفتهٔ اول من»: what helps a new colleague in their first days, as a short list on their own
 * dashboard. Some steps tick themselves (a complete card, the circulars read); the others are ticked
 * by hand or by opening the page they point to. The administrator's own steps come last. Shown for 30
 * days after the colleague was introduced as a new colleague, until they finish or close it.
 */
export const FirstWeekCard: React.FC = () => {
  const { currentUser, newColleagues, news, employees, departmentPages, appSettings, featureOn, setActiveTab, setFirstWeekDone } = usePortal();
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!currentUser || !appSettings || !featureOn('firstWeek') || hidden) return null;
  const intro = newColleagues.find((nc) => nc.userId === currentUser.id);
  const done = appSettings.firstWeekDone ?? [];
  if (!inFirstWeeks(intro?.createdAt) || done.includes(FIRST_WEEK_CLOSED)) {
    return editing ? <EditProfileModal user={currentUser} onClose={() => setEditing(false)} /> : null;
  }

  const mark = (id: string, on = true) => {
    const next = on ? [...new Set([...done, id])] : done.filter((d) => d !== id);
    if (next.length !== done.length) void setFirstWeekDone(next);
  };
  const go = (id: string, tab: Parameters<typeof setActiveTab>[0], focus?: string) => () => {
    mark(id);
    setActiveTab(tab, focus);
  };

  const pendingAcks = news.filter((n) => n.status === 'published' && n.requiresAck && !n.acknowledgedAt).length;
  const reportsTo = managerOf(currentUser, unitHeads(departmentPages));
  const manager = reportsTo ? employees.find((e) => e.id === reportsTo.id && e.isActive) : undefined;
  const unitPage = currentUser.department && tabOn(appSettings, 'departments') && appSettings.departments.includes(currentUser.department);

  const steps: Step[] = [
    {
      id: 'card',
      title: 'کارت همکاری‌تان را کامل کنید',
      hint: 'عکس، شمارهٔ داخلی و همراه، تا همکاران شما را بشناسند و پیدا کنند.',
      done: Boolean(currentUser.avatar && currentUser.extension.trim() && currentUser.mobile.trim()),
      auto: true,
      action: { label: 'ویرایش کارت', run: () => setEditing(true) },
    },
    {
      id: 'aboutMe',
      title: 'به چند سؤال «دربارهٔ من» جواب دهید',
      hint: 'سرگرمی، غذای محبوب، کتاب پیشنهادی…؛ سرِ صحبت با همکاران تازه.',
      done: aboutMeAnswers(currentUser.aboutMe).length > 0,
      auto: true,
      action: { label: 'جواب دادن', run: () => setEditing(true) },
    },
    {
      id: 'circulars',
      title: 'بخشنامه‌های لازم‌الاجرا را بخوانید و تأیید کنید',
      hint: pendingAcks > 0 ? `${toPersianDigits(pendingAcks)} بخشنامه منتظر شماست.` : undefined,
      done: pendingAcks === 0,
      auto: true,
      action: pendingAcks > 0 ? { label: 'رفتن به بخشنامه‌ها', run: () => setActiveTab('news') } : undefined,
    },
    ...(manager
      ? [
          {
            id: 'manager',
            title: `با ${manager.firstName} ${manager.lastName}، ${reportsTo?.viaUnit ? 'مسئول واحدتان' : 'مدیر مستقیمتان'}، آشنا شوید`,
            done: done.includes('manager'),
            action: { label: 'دیدن کارت', run: go('manager', 'colleagues', manager.id) },
          },
        ]
      : []),
    {
      id: 'unit',
      title: currentUser.department ? `همکاران واحد ${currentUser.department} را بشناسید` : 'همکارانتان را بشناسید',
      done: done.includes('unit'),
      action: { label: unitPage ? 'صفحهٔ واحد' : 'دفتر تلفن', run: unitPage ? go('unit', 'departments', currentUser.department) : go('unit', 'colleagues') },
    },
    {
      id: 'systems',
      title: 'سامانه‌های سازمان را ببینید',
      hint: 'اتوماسیون، ایمیل و بقیهٔ سامانه‌ها از یک جا باز می‌شوند.',
      done: done.includes('systems'),
      action: { label: 'سامانه‌ها', run: go('systems', 'systems') },
    },
    ...(featureOn('guides')
      ? [{ id: 'guides', title: 'راهنماها و پرسش‌های رایج را مرور کنید', done: done.includes('guides'), action: { label: 'راهنماها', run: go('guides', 'guides') } }]
      : []),
    ...(appSettings.firstWeekSteps ?? []).map((text) => {
      const id = extraStepId(text);
      return { id, title: text, done: done.includes(id) };
    }),
  ];
  const count = steps.filter((s) => s.done).length;
  const allDone = count === steps.length;

  const close = () =>
    deleteWithUndo({
      message: 'فهرست «هفتهٔ اول من» بسته شد.',
      hide: () => setHidden(true),
      restore: () => setHidden(false),
      commit: () => setFirstWeekDone([...done, FIRST_WEEK_CLOSED]),
    });

  return (
    <>
      <section className="relative bg-white border border-warm/30 shadow-card rounded-3xl p-4 sm:p-5 space-y-3" aria-labelledby="first-week-title">
        <button type="button" onClick={close} aria-label="بستن فهرست هفتهٔ اول" title="بستن" className="absolute top-3 left-3 p-1.5 rounded-lg text-faint hover:text-ink hover:bg-surface">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 pl-8">
          <div className="p-2 rounded-xl bg-warm-soft text-warm-strong shrink-0">
            <Footprints className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="first-week-title" className="text-base font-black text-ink">هفتهٔ اول من</h2>
            <p className="text-xs text-muted">
              {allDone ? 'همه را انجام دادید؛ به رویا خوش آمدید 🎉' : `${toPersianDigits(count)} از ${toPersianDigits(steps.length)} کار روزهای اول`}
            </p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-surface-strong overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-warm transition-[width] duration-500" style={{ width: `${(count / steps.length) * 100}%` }} />
        </div>

        <ul className="space-y-1" aria-label="کارهای هفتهٔ اول">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-surface-soft">
              <button
                type="button"
                role="checkbox"
                aria-checked={step.done}
                aria-label={step.title}
                disabled={step.auto}
                title={step.auto ? 'خودش تیک می‌خورد' : undefined}
                onClick={() => {
                  haptic();
                  mark(step.id, !step.done);
                }}
                className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                  step.done ? 'bg-warm border-warm text-white' : 'border-line-strong bg-white enabled:hover:border-warm'
                } disabled:cursor-default`}
              >
                {step.done && <Check className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold leading-relaxed ${step.done ? 'text-faint line-through' : 'text-ink'}`}>{step.title}</p>
                {step.hint && !step.done && <p className="text-xs text-muted leading-relaxed">{step.hint}</p>}
              </div>
              {step.action && !step.done && (
                <button type="button" onClick={step.action.run} className="shrink-0 flex items-center gap-0.5 text-xs font-bold text-warm-strong hover:underline whitespace-nowrap">
                  {step.action.label}
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {allDone && (
          <button type="button" onClick={close} className="w-full py-2 rounded-xl bg-warm-soft hover:bg-warm/20 text-warm-strong text-xs font-bold transition-colors">
            بستن فهرست
          </button>
        )}
      </section>
      {editing && <EditProfileModal user={currentUser} onClose={() => setEditing(false)} />}
    </>
  );
};
