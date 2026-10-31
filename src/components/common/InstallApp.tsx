import React, { useState, useSyncExternalStore } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { installState, isAndroid, isIos, promptInstall, subscribeInstall } from '../../lib/pwa';
import { isTouchScreen } from '../../lib/touch';
import { Modal, primaryButtonClass } from './Modal';


/** An English menu item inside the Persian steps, kept left-to-right. */
const En: React.FC<{ children: string }> = ({ children }) => <bdi dir="ltr" className="font-semibold">{children}</bdi>;

const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="list-decimal pr-5 space-y-1.5 leading-relaxed text-ink-soft">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ol>
);

export const InstallGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { workerState } = useSyncExternalStore(subscribeInstall, installState);
  const ios = isIos();
  const android = isAndroid();

  return (
    <Modal
      title="نصب پرتال روی گوشی"
      subtitle="یک آیکون روی صفحهٔ اصلی، مثل بقیهٔ برنامه‌ها"
      icon={<Smartphone className="w-5 h-5" />}
      size="md"
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className={primaryButtonClass}>متوجه شدم</button>}
    >
      <div className="space-y-5 text-sm">
        {(ios || !android) && (
          <section>
            <h4 className="font-black text-ink mb-2">آیفون و آیپد</h4>
            <Steps
              items={[
                'پرتال را در Safari باز کنید.',
                <>دکمهٔ اشتراک‌گذاری (مربع با فلش رو به بالا، پایین صفحه) را بزنید.</>,
                <>«افزودن به صفحهٔ اصلی» و بعد «افزودن» را بزنید (در منوی انگلیسی: <En>Add to Home Screen</En> و <En>Add</En>).</>,
              ]}
            />
          </section>
        )}
        {(android || !ios) && (
          <section>
            <h4 className="font-black text-ink mb-2">اندروید</h4>
            <Steps
              items={[
                'پرتال را در Chrome باز کنید.',
                <>منوی سه‌نقطهٔ بالای صفحه (⋮) را بزنید.</>,
                <>«نصب برنامه» یا «افزودن به صفحهٔ اصلی» را بزنید (در منوی انگلیسی: <En>Install app</En> یا <En>Add to Home screen</En>).</>,
              ]}
            />
          </section>
        )}
        {!ios && !android && (
          <section>
            <h4 className="font-black text-ink mb-2">رایانه</h4>
            <p className="leading-relaxed text-ink-soft">در Chrome یا Edge، آیکون نصب در انتهای نوار نشانی یا منوی مرورگر ← «نصب پرتال» را بزنید.</p>
          </section>
        )}
        {workerState === 'shortcut' && (
          <p className="text-xs leading-relaxed bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">
            گواهی امنیتی (HTTPS) پرتال هنوز کامل نشده است؛ برای همین گوشی فعلاً به جای برنامهٔ کامل یک میان‌بر می‌سازد که پرتال را
            در مرورگر باز می‌کند. کار با آن فرقی نمی‌کند. وقتی HTTPS کامل شد، میان‌بر را پاک کنید و دوباره نصب کنید تا پرتال
            تمام‌صفحه و مثل برنامه باز شود.
          </p>
        )}
      </div>
    </Modal>
  );
};

/** Chrome's own install dialog when it can install the full app; otherwise the steps for this device. */
function useInstall() {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const [open, setOpen] = useState(false);
  const start = async () => {
    if (canPrompt && (await promptInstall())) return;
    setOpen(true);
  };
  const guide = open ? <InstallGuide onClose={() => setOpen(false)} /> : null;
  return { installed, start, guide };
}

/** Footer button that installs the portal as an app, or explains how; hidden inside the installed app. */
export const InstallApp: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { installed, start, guide } = useInstall();
  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        className={`tap-area mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-brand-deep font-bold border border-line shadow-xs hover:bg-surface-strong ${className}`}
      >
        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
        نصب پرتال روی گوشی
      </button>
      {guide}
    </>
  );
};

const INVITE_KEY = 'portal:install-invite';
/** «بعداً» hides the invitation for this long. */
export const INVITE_SNOOZE_DAYS = 14;

const inviteSnoozed = () => {
  try {
    return Date.now() - Number(localStorage.getItem(INVITE_KEY) ?? 0) < INVITE_SNOOZE_DAYS * 864e5;
  } catch {
    return false;
  }
};

/**
 * A card at the top of the dashboard on phones that invites the colleague to put the portal on the
 * home screen. «بعداً» hides it for two weeks on this phone; inside the installed app it never shows.
 */
export const InstallInvite: React.FC = () => {
  const { installed, start, guide } = useInstall();
  const [hidden, setHidden] = useState(() => !isTouchScreen() || inviteSnoozed());
  if (installed || (hidden && !guide)) return guide;

  const later = () => {
    try {
      localStorage.setItem(INVITE_KEY, String(Date.now()));
    } catch {
      // Without storage it comes back on the next visit.
    }
    setHidden(true);
  };

  return (
    <>
      {!hidden && !installed && (
        <section
          aria-label="نصب پرتال روی گوشی"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-gray-800 to-brand-deep text-white p-4 shadow-lg"
        >
          <div className="absolute -left-8 -top-10 w-36 h-36 rounded-full bg-white/10 pointer-events-none" aria-hidden="true" />
          <button
            type="button"
            onClick={later}
            aria-label="بستن دعوت نصب"
            className="absolute top-2 left-2 p-1.5 rounded-lg text-white/70 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative flex items-center gap-3">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white p-1.5 shadow-md animate-[install-nudge_2.4s_ease-in-out_3] motion-reduce:animate-none">
              <img src="/icon-192.png" alt="" className="w-full h-full rounded-xl" />
            </div>
            <div className="min-w-0 pl-6">
              <h3 className="text-sm font-black">پرتال را روی گوشی‌تان نصب کنید</h3>
              <p className="text-xs leading-relaxed text-white/80 mt-0.5">
                یک آیکون روی صفحهٔ اصلی گوشی، مثل بقیهٔ برنامه‌ها؛ اخبار و اطلاعیه‌ها با یک لمس دم دست شماست.
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => void start()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-white text-brand-deep text-sm font-black shadow-md active:scale-[0.98]"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              نصب پرتال
            </button>
            <button type="button" onClick={later} className="px-4 py-2.5 rounded-2xl text-xs font-bold text-white/85 border border-white/30 hover:bg-white/10">
              بعداً
            </button>
          </div>
        </section>
      )}
      {guide}
    </>
  );
};
