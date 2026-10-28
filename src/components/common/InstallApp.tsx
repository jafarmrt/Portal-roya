import React, { useState, useSyncExternalStore } from 'react';
import { Smartphone } from 'lucide-react';
import { installState, isAndroid, isIos, promptInstall, subscribeInstall } from '../../lib/pwa';
import { Modal, primaryButtonClass } from './Modal';


/** An English menu item inside the Persian steps, kept left-to-right. */
const En: React.FC<{ children: string }> = ({ children }) => <bdi dir="ltr" className="font-semibold">{children}</bdi>;

const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="list-decimal pr-5 space-y-1.5 leading-relaxed text-[#4B4740]">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ol>
);

const InstallGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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
            <h4 className="font-black text-[#2D2D2D] mb-2">آیفون و آیپد</h4>
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
            <h4 className="font-black text-[#2D2D2D] mb-2">اندروید</h4>
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
            <h4 className="font-black text-[#2D2D2D] mb-2">رایانه</h4>
            <p className="leading-relaxed text-[#4B4740]">در Chrome یا Edge، آیکون نصب در انتهای نوار نشانی یا منوی مرورگر ← «نصب پرتال» را بزنید.</p>
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

/** Footer link that installs the portal as an app, or explains how; hidden inside the installed app. */
export const InstallApp: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, installState);
  const [open, setOpen] = useState(false);
  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          // Chrome offers its own dialog when it can install the full app; otherwise the steps are shown.
          if (canPrompt && (await promptInstall())) return;
          setOpen(true);
        }}
        className={`tap-area inline-flex items-center gap-1.5 underline-offset-4 hover:underline hover:text-white ${className}`}
      >
        <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
        نصب پرتال روی گوشی
      </button>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </>
  );
};
