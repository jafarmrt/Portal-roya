import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { refreshNow, refreshOnNavigation, showUpdateCard, snoozeUpdate, useAppUpdate } from '../../lib/appUpdate';
import { hasUnsavedWork } from '../../lib/unsavedWork';
import type { BuildInfo } from '../../types';
import { WhatsNewModal } from './VersionInfo';

/**
 * «نسخهٔ تازهٔ پرتال آماده است»: shown on a page that was opened before the portal was updated
 * (src/lib/appUpdate.ts finds that out). The card waits in a corner without getting in the way;
 * «تازه‌سازی» loads the new version, after asking once more when something on the page is not saved.
 * Moving to another part of the portal refreshes by itself when nothing is unsaved.
 *
 * `page`: the part of the portal on screen, so a move to another one is noticed (absent on the sign-in page).
 */
export const UpdateNotice: React.FC<{ page?: string }> = ({ page }) => {
  const { available, snoozedUntil } = useAppUpdate();
  const [asking, setAsking] = useState(false);
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The page the person moves to comes from the new version, when nothing would be lost by it.
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    refreshOnNavigation();
  }, [page]);

  // «بعداً» keeps the card away for an hour; then it is back.
  useEffect(() => {
    if (!available || snoozedUntil <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), snoozedUntil - Date.now() + 500);
    return () => window.clearTimeout(timer);
  }, [available, snoozedUntil]);

  if (!available || snoozedUntil > now) return null;

  const refresh = () => {
    if (!asking && hasUnsavedWork()) setAsking(true);
    else refreshNow();
  };
  const later = () => {
    setAsking(false);
    snoozeUpdate();
    setNow(Date.now());
  };
  // The new version's own list of changes, from the server that is running it.
  const whatsNew = () => {
    void api
      .get<BuildInfo>('/api/version')
      .then(setInfo)
      .catch(() => undefined);
  };

  return (
    <>
      <section
        role="status"
        aria-label="نسخهٔ تازهٔ پرتال"
        className="update-notice fixed z-[55] inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-5 lg:bottom-5 lg:w-88 bg-white border border-line-strong rounded-2xl shadow-xl p-4 text-right"
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-brand-soft text-brand-strong flex items-center justify-center" aria-hidden="true">
            <Sparkles className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-sm font-black text-ink">{asking ? 'کار ذخیره‌نشده دارید' : 'نسخهٔ تازهٔ پرتال آماده است'}</h2>
            <p className="text-xs leading-relaxed text-muted">
              {asking
                ? 'چیزی در این صفحه نوشته یا تغییر داده‌اید که هنوز ذخیره نشده و با تازه‌سازی ممکن است از دست برود. اول آن را ذخیره کنید.'
                : 'این صفحه پیش از به‌روزرسانی باز شده است. برای دیدن آخرین تغییرات، آن را تازه کنید.'}
            </p>
          </div>
          {!asking && (
            <button type="button" onClick={later} className="shrink-0 -m-1 p-1.5 rounded-lg text-faint hover:text-ink hover:bg-surface" aria-label="بستن تا یک ساعت دیگر">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {asking ? (
            <>
              <button type="button" onClick={later} className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl">
                بعداً، اول ذخیره می‌کنم
              </button>
              <button type="button" onClick={refresh} className="px-3 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl">
                همین حالا تازه کن
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={refresh} className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                تازه‌سازی
              </button>
              <button type="button" onClick={later} className="px-3 py-2 text-xs font-bold text-ink bg-white hover:bg-surface border border-line-strong rounded-xl">
                بعداً
              </button>
              <button type="button" onClick={whatsNew} className="ms-auto text-xs font-bold text-muted hover:text-ink underline underline-offset-4">
                چه چیزی تازه است؟
              </button>
            </>
          )}
        </div>
      </section>
      {info && <WhatsNewModal info={info} onClose={() => setInfo(null)} />}
    </>
  );
};

/** In the header while the card is put off with «بعداً»: a small reminder that brings it back. */
export const UpdateMark: React.FC = () => {
  const { available, snoozedUntil } = useAppUpdate();
  if (!available || snoozedUntil <= Date.now()) return null;
  return (
    <button
      type="button"
      onClick={showUpdateCard}
      title="نسخهٔ تازهٔ پرتال آماده است"
      aria-label="نسخهٔ تازهٔ پرتال آماده است؛ نمایش"
      className="relative p-2 rounded-xl text-brand-strong hover:bg-surface transition-colors cursor-pointer"
    >
      <RefreshCw className="w-5 h-5" />
      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
    </button>
  );
};
