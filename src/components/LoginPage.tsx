import React, { useEffect, useId, useState } from 'react';
import { LayoutGrid, LogIn, Lock, User } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { api, errorMessage } from '../lib/api';
import { isTouchScreen } from '../lib/touch';
import type { ExternalSystem } from '../types';
import { SystemTile } from './dashboard/QuickSystemsWidget';
import { RoyaLogo } from './common/RoyaLogo';
import { ModalCloseButton, ModalShell } from './common/Modal';

/** Persian letters or digits: the phone's keyboard was left on Persian (usernames and AD passwords are English). */
const PERSIAN_KEYBOARD = /[\u0600-\u06FF]/;

const KeyboardHint: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} role="status" className="mt-1.5 text-xs font-bold text-amber-800 leading-relaxed">
    {children}
  </p>
);

/** Username/password form shared by the full login page and the guest sign-in dialog. */
const LoginForm: React.FC = () => {
  const { login, directoryLogin } = usePortal();
  const id = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const persianName = PERSIAN_KEYBOARD.test(username);
  const persianPassword = PERSIAN_KEYBOARD.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-4">
      {error && (
        <div role="alert" className="p-3 bg-danger-50 text-danger-800 text-xs font-bold rounded-xl border border-danger-200">
          {error}
        </div>
      )}

      <div>
        <label htmlFor={`${id}-username`} className="block text-xs font-bold text-ink-soft mb-1">نام کاربری</label>
        <div className="relative">
          <input
            id={`${id}-username`}
            type="text"
            autoComplete="username"
            // Phones would otherwise write «Ali.rezaei» or «ali. rezaei».
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!isTouchScreen()}
            required
            dir="ltr"
            aria-describedby={persianName ? `${id}-username-hint` : undefined}
            placeholder={directoryLogin ? 'مثلاً ali.rezaei' : undefined}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full pl-3 pr-10 py-3 rounded-xl border border-line-strong text-sm focus:border-red-700 focus:ring-2 focus:ring-red-700/20 outline-hidden text-left"
          />
          <User className="w-4 h-4 text-faint absolute right-3 top-3.5" />
        </div>
        {persianName && (
          <KeyboardHint id={`${id}-username-hint`}>نام کاربری با حروف انگلیسی است؛ صفحه‌کلید را انگلیسی کنید.</KeyboardHint>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-password`} className="block text-xs font-bold text-ink-soft mb-1">رمز عبور</label>
        <div className="relative">
          <input
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            aria-describedby={persianPassword ? `${id}-password-hint` : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-3 pr-10 py-3 rounded-xl border border-line-strong text-sm focus:border-red-700 focus:ring-2 focus:ring-red-700/20 outline-hidden text-left"
          />
          <Lock className="w-4 h-4 text-faint absolute right-3 top-3.5" />
        </div>
        {persianPassword && (
          <KeyboardHint id={`${id}-password-hint`}>
            در رمز، حرف یا عدد فارسی هست. اگر رمز شما انگلیسی است، صفحه‌کلید را انگلیسی کنید.
          </KeyboardHint>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 bg-brand-strong hover:bg-brand-deep text-white rounded-xl text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <LogIn className="w-4 h-4" />
        <span>{isSubmitting ? 'در حال بررسی...' : 'ورود'}</span>
      </button>

      <p className="text-xs text-muted text-center leading-relaxed">
        {directoryLogin
          ? 'با همان نام کاربری و رمز ورود به ویندوز (حساب سازمانی) وارد شوید. برای فراموشی رمز با واحد فناوری اطلاعات تماس بگیرید.'
          : 'حساب پرتال را ادمین پرتال یا کارگزینی می‌سازد. اگر رمز خود را فراموش کرده‌اید، از مدیر بخواهید آن را بازنشانی کند.'}
      </p>
    </form>
  );
};

/**
 * The organisation's apps for visitors who are not signed in (e.g. from the internet, where news and
 * files stay closed). The server sends each with the address that works where the visitor is.
 */
const SignedOutApps: React.FC = () => {
  const [apps, setApps] = useState<ExternalSystem[]>([]);
  useEffect(() => {
    api.get<ExternalSystem[]>('/api/system/apps').then(setApps, () => setApps([]));
  }, []);
  if (apps.length === 0) return null;

  return (
    <section aria-labelledby="signed-out-apps" className="w-full max-w-md bg-white rounded-3xl border border-line p-5 space-y-3">
      <div>
        <h2 id="signed-out-apps" className="flex items-center gap-2 text-sm font-black text-ink">
          <LayoutGrid className="w-4 h-4 text-brand-strong" /> سامانه‌های سازمان
        </h2>
        <p className="text-xs text-muted mt-1">بدون ورود به پرتال هم می‌توانید این سامانه‌ها را باز کنید.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {apps.map((app) => <SystemTile key={app.id} system={app} href={app.url} compact />)}
      </div>
    </section>
  );
};

export const LoginPage: React.FC = () => (
  <main className="min-h-screen bg-page flex flex-col items-center justify-center gap-4 p-4" dir="rtl">
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-line overflow-hidden">
      <div className="px-8 pt-8 pb-5 border-b border-line">
        <RoyaLogo size="md" />
        <h1 className="text-xl font-black mt-5 text-ink">ورود به پرتال</h1>
        <p className="text-xs text-muted mt-1">برای مشاهدهٔ اخبار، اطلاعیه‌ها و همکاران وارد شوید.</p>
      </div>
      <LoginForm />
    </div>
    <SignedOutApps />
  </main>
);

/** Sign-in dialog for guests; opens when they try to comment, vote, like or open personal pages. */
export const LoginModal: React.FC = () => {
  const { loginPrompt, closeLoginPrompt } = usePortal();
  const titleId = useId();
  if (!loginPrompt) return null;

  return (
    <ModalShell onClose={closeLoginPrompt} size="sm" labelledBy={titleId}>
      <div className="px-6 pt-6 pb-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
        <div>
          <h2 id={titleId} className="text-lg font-black text-ink">ورود به پرتال</h2>
          <p className="text-xs text-muted mt-1 leading-relaxed">{loginPrompt}</p>
        </div>
        <ModalCloseButton onClose={closeLoginPrompt} />
      </div>
      <div className="overflow-y-auto overscroll-contain min-h-0">
        <LoginForm />
      </div>
    </ModalShell>
  );
};
