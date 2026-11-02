import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { featureOn } from '../../lib/features';
import { formatDateTime, toPersianDigits } from '../../lib/jalali';
import {
  type PushInfo,
  currentSubscription,
  disablePushHere,
  enablePush,
  notificationPermission,
  pushSupport,
  setLocalPush,
  subscribeDevice,
} from '../../lib/push';
import { PUSH_CATEGORIES } from '../../../shared/push';
import { primaryButtonClass, secondaryButtonClass } from '../common/Modal';

// Storage can be missing (private windows), so every use is guarded.
const store = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  },
};

/** The colleague turned notifications off on this one device. */
const OFF_KEY = 'roya-portal:push-off';
/** «بعداً» on the one-time question; asked again after two weeks. */
const LATER_KEY = 'roya-portal:push-later';
const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;

const offHere = () => store.get(OFF_KEY) === '1';

/** The colleague's push choices; null while loading or when the part is hidden from them. */
function usePushInfo() {
  const { currentUser, appSettings } = usePortal();
  const on = Boolean(currentUser) && featureOn(appSettings, 'pushNotifications');
  const [info, setInfo] = useState<PushInfo | null>(null);
  const load = useCallback(async () => {
    try {
      setInfo(await api.get<PushInfo>('/api/push'));
    } catch {
      setInfo(null);
    }
  }, []);
  useEffect(() => {
    if (on) void load();
    else setInfo(null);
  }, [on, load, currentUser?.id]);
  return { on, info, setInfo, load };
}

/**
 * Mounted once on every page: keeps the open page's own notifications in step with the colleague's
 * choices, renews this browser's push address, and asks once whether they want notifications here.
 */
export const PushPrompt: React.FC = () => {
  const { on, info } = usePushInfo();
  const [permission, setPermission] = useState(notificationPermission);
  const [later, setLater] = useState(() => Number(store.get(LATER_KEY) || 0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocalPush(on && !!info && !offHere(), info?.muted ?? []);
    // Permission is already given: make sure this browser is subscribed for whoever is signed in now.
    if (on && info && !offHere() && notificationPermission() === 'granted') void subscribeDevice(info.publicKey).catch(() => undefined);
  }, [on, info]);

  const support = pushSupport();
  const visible = on && !!info && support === 'ok' && permission === 'default' && !offHere() && Date.now() - later > ASK_AGAIN_MS;
  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePush(info.publicKey);
      setPermission(result);
      if (result === 'granted') {
        setLocalPush(true, info.muted);
        toast.success('از این به بعد اعلان‌های پرتال روی همین دستگاه هم می‌آید.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="bg-brand-soft border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm">
        <BellRing className="w-4 h-4 shrink-0 text-brand-strong" />
        <p className="flex-1 min-w-[12rem] font-bold text-ink leading-relaxed">
          اعلان‌های پرتال روی همین {/Android|iPhone|iPad/.test(navigator.userAgent) ? 'گوشی' : 'کامپیوتر'} هم بیاید؟ حتی وقتی پرتال باز نیست.
        </p>
        <button type="button" onClick={() => void enable()} disabled={busy} className={`${primaryButtonClass} !py-1.5`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          روشن کردن
        </button>
        <button
          type="button"
          onClick={() => {
            const now = Date.now();
            store.set(LATER_KEY, String(now));
            setLater(now);
          }}
          className="p-1 rounded-lg hover:bg-white/60 text-muted"
          aria-label="بعداً"
          title="بعداً"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/** «اعلان روی گوشی و کامپیوتر» on the notifications page: this device, the kinds, a test message. */
export const PushSettingsPanel: React.FC = () => {
  const { on, info, setInfo, load } = usePushInfo();
  const [permission, setPermission] = useState(notificationPermission);
  const [here, setHere] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    void currentSubscription()
      .then((sub) => setHere(Boolean(sub) && !offHere()))
      .catch(() => setHere(false));
  }, [on, info]);

  if (!on || !info) return null;
  const support = pushSupport();
  const muted = new Set(info.muted);
  // The local layer works without a push address (e.g. while the push service cannot be reached).
  const enabledHere = permission === 'granted' && !offHere();

  const enable = async () => {
    setBusy('enable');
    try {
      store.set(OFF_KEY, null);
      const result = await enablePush(info.publicKey);
      setPermission(result);
      if (result === 'granted') {
        setLocalPush(true, info.muted);
        setHere(Boolean(await currentSubscription()));
        await load();
        toast.success('اعلان‌ها روی این دستگاه روشن شد.');
      } else if (result === 'denied') {
        toast.error('مرورگر اجازهٔ اعلان را نداد. از تنظیمات مرورگر، اعلان این سایت را مجاز کنید.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    setBusy('disable');
    try {
      store.set(OFF_KEY, '1');
      setLocalPush(false, info.muted);
      await disablePushHere();
      setHere(false);
      await load();
      toast.success('اعلان‌ها روی این دستگاه خاموش شد. زنگولهٔ پرتال مثل قبل کار می‌کند.');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (id: string, wanted: boolean) => {
    const next = wanted ? info.muted.filter((m) => m !== id) : [...info.muted, id];
    setInfo({ ...info, muted: next });
    try {
      const saved = await api.put<{ muted: string[] }>('/api/push/me', { muted: next });
      setInfo((prev) => (prev ? { ...prev, muted: saved.muted } : prev));
      setLocalPush(enabledHere, saved.muted);
    } catch (err) {
      toast.error(errorMessage(err));
      void load();
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const result = await api.post<{ devices: number; sent: number; failed: number }>('/api/push/test');
      if (result.devices === 0) toast.error('هنوز هیچ دستگاهی برای اعلان ثبت نشده است.');
      else if (result.sent > 0) toast.success(`اعلان آزمایشی به ${toPersianDigits(result.sent)} دستگاه فرستاده شد.`);
      else toast.error('اعلان آزمایشی نرسید. ممکن است سرور پرتال به اینترنت راه نداشته باشد.');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  let state: React.ReactNode;
  if (support === 'install-first') {
    state = 'روی آیفون، اول پرتال را روی صفحهٔ اصلی نصب کنید (پایین صفحه: «نصب پرتال روی گوشی») و از همان‌جا باز کنید؛ بعد این‌جا روشنش کنید. iOS باید ۱۶.۴ یا بالاتر باشد.';
  } else if (support === 'insecure') {
    state = 'این دستگاه پرتال را با نشانی امن (https://portal.royaco.com) باز نکرده است؛ اعلان فقط با نشانی امن کار می‌کند.';
  } else if (support === 'unsupported') {
    state = 'این مرورگر اعلان سیستمی را پشتیبانی نمی‌کند. Chrome یا Edge را امتحان کنید.';
  } else if (permission === 'denied') {
    state = 'اجازهٔ اعلان در این مرورگر بسته شده است. روی قفل کنار نشانی سایت بزنید، «Notifications» را «Allow» کنید و صفحه را دوباره باز کنید.';
  } else if (enabledHere) {
    state = here
      ? 'روی این دستگاه روشن است؛ حتی وقتی پرتال بسته است اعلان می‌آید.'
      : 'روی این دستگاه روشن است، ولی فعلاً فقط وقتی پرتال در یکی از زبانه‌ها باز است (حتی پشت پنجره‌های دیگر).';
  } else {
    state = 'روی این دستگاه خاموش است.';
  }

  return (
    <section aria-labelledby="push-settings-title" className="bg-white p-4 sm:p-5 rounded-2xl border border-line shadow-xs space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-brand-soft flex items-center justify-center">
          <BellRing className="w-4 h-4 text-brand-strong" />
        </div>
        <div className="flex-1 min-w-[12rem] space-y-1">
          <h2 id="push-settings-title" className="text-sm font-bold text-ink">اعلان روی گوشی و کامپیوتر</h2>
          <p className="text-xs text-muted leading-relaxed">{state}</p>
        </div>
        {support === 'ok' && permission !== 'denied' && (
          <div className="flex flex-wrap gap-2">
            {enabledHere ? (
              <>
                <button type="button" onClick={() => void test()} disabled={busy !== null} className={secondaryButtonClass}>
                  {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  اعلان آزمایشی
                </button>
                <button type="button" onClick={() => void disable()} disabled={busy !== null} className={secondaryButtonClass}>
                  خاموش کردن روی این دستگاه
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void enable()} disabled={busy !== null} className={primaryButtonClass}>
                {busy === 'enable' && <Loader2 className="w-4 h-4 animate-spin" />}
                روشن کردن روی این دستگاه
              </button>
            )}
          </div>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-ink-soft mb-2">کدام اعلان‌ها روی گوشی و کامپیوتر بیاید (روی همهٔ دستگاه‌های شما)</legend>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
          {PUSH_CATEGORIES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input type="checkbox" checked={!muted.has(c.id)} onChange={(e) => void toggle(c.id, e.target.checked)} className="accent-red-700" />
              {c.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-faint">زنگولهٔ بالای صفحه همیشه همهٔ اعلان‌ها را دارد.</p>
      </fieldset>

      {info.devices.length > 0 && (
        <p className="text-xs text-muted">
          دستگاه‌های ثبت‌شده: {info.devices.map((d) => d.device || 'مرورگر').join('، ')}
        </p>
      )}

      {info.status && (
        <div className="text-xs text-muted bg-surface rounded-xl p-3 space-y-1">
          <p className="font-bold text-ink-soft">وضعیت برای مدیر</p>
          <p>
            {toPersianDigits(info.status.people)} همکار با {toPersianDigits(info.status.devices)} دستگاه اعلان بیرون از پرتال را روشن کرده‌اند.
          </p>
          <p>آخرین ارسال موفق: {info.status.lastOkAt ? formatDateTime(info.status.lastOkAt) : 'از آخرین راه‌اندازی سرور، هنوز نه'}</p>
          {info.status.lastError && (
            <p className="text-warm">
              آخرین خطا ({formatDateTime(info.status.lastError.at)}): <span dir="ltr">{info.status.lastError.message}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
};
