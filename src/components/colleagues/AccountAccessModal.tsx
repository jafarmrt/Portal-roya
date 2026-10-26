import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, ShieldOff } from 'lucide-react';
import { usePortal, type AccountInput, type SignInMethod } from '../../context/PortalContext';
import type { UserProfile } from '../../types';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { RoleSelect } from './RoleSelect';

/** Shows a one-time password so the manager can hand it to the colleague. */
export const TemporaryPasswordNotice: React.FC<{ username?: string; password: string }> = ({ username, password }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-xs">
      <p className="font-bold text-amber-900 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> این رمز فقط یک بار نمایش داده می‌شود</p>
      <p className="text-amber-900 leading-relaxed">آن را به همکار بدهید. در اولین ورود از او خواسته می‌شود رمز شخصی انتخاب کند.</p>
      <div className="flex flex-wrap items-center gap-2">
        {username && <code dir="ltr" className="px-2 py-1 bg-white rounded-lg border border-amber-200">{username}</code>}
        <code dir="ltr" className="px-2 py-1 bg-white rounded-lg border border-amber-200 font-bold select-all">{password}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // The code above is selectable as a fallback.
            }
          }}
          className={secondaryButtonClass}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} کپی رمز
        </button>
      </div>
    </div>
  );
};

/** Username, role and sign-in method of a portal account; shared by the add form and the access dialog. */
export const AccountFields: React.FC<{ idPrefix: string; value: AccountInput; onChange: (value: AccountInput) => void }> = ({
  idPrefix,
  value,
  onChange,
}) => {
  const { directoryLogin } = usePortal();
  const set = <K extends keyof AccountInput>(key: K, v: AccountInput[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${idPrefix}-username`} className={labelClass}>نام کاربری (انگلیسی) *</label>
          <input
            id={`${idPrefix}-username`}
            required
            dir="ltr"
            pattern="[a-zA-Z0-9._\-]{3,40}"
            title="حروف انگلیسی، عدد و . _ - (۳ تا ۴۰ کاراکتر)"
            placeholder="m.rezaei"
            value={value.username}
            onChange={(e) => set('username', e.target.value)}
            className={`${inputClass} text-left`}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-role`} className={labelClass}>نقش</label>
          <RoleSelect id={`${idPrefix}-role`} value={value.role} onChange={(role) => set('role', role)} />
        </div>
      </div>
      {directoryLogin ? (
        <fieldset className="space-y-1.5">
          <legend className={labelClass}>روش ورود</legend>
          {([
            ['ldap', 'با نام کاربری و رمز ویندوز (اکتیو دایرکتوری)', 'نام کاربری باید همان نام ورود ویندوز باشد. رمزی ساخته نمی‌شود.'],
            ['local', 'با رمز پرتال', 'یک رمز موقت ساخته می‌شود که همکار در اولین ورود عوض می‌کند.'],
          ] as [SignInMethod, string, string][]).map(([method, label, hint]) => (
            <label key={method} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name={`${idPrefix}-signin`} checked={value.signIn === method} onChange={() => set('signIn', method)} className="accent-red-700 mt-0.5" />
              <span><strong>{label}</strong><span className="block text-[11px] text-[#6E6A60]">{hint}</span></span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-[11px] text-[#6E6A60]">یک رمز موقت ساخته می‌شود که همکار در اولین ورود عوض می‌کند.</p>
      )}
    </div>
  );
};

/** What the manager tells the colleague once an account exists. */
export const AccountCreatedNotice: React.FC<{ username: string; temporaryPassword: string | null }> = ({ username, temporaryPassword }) =>
  temporaryPassword ? (
    <TemporaryPasswordNotice username={username} password={temporaryPassword} />
  ) : (
    <p className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs leading-relaxed">
      همکار با نام کاربری <code dir="ltr" className="px-1.5 py-0.5 bg-white rounded">{username}</code> و رمز ویندوز خودش وارد پرتال می‌شود.
    </p>
  );

/** Gives a phone-book-only colleague a portal account, or takes an account away. */
export const AccountAccessModal: React.FC<{ user: UserProfile; onClose: () => void }> = ({ user, onClose }) => {
  const { grantAccess, revokeAccess, directoryLogin } = usePortal();
  const [account, setAccount] = useState<AccountInput>({
    username: user.username,
    role: 'employee',
    signIn: directoryLogin ? 'ldap' : 'local',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ temporaryPassword: string | null } | null>(null);
  const name = `${user.firstName} ${user.lastName}`;

  if (done) {
    return (
      <Modal title="دسترسی پورتال داده شد" subtitle={name} icon={<CheckCircle2 className="w-5 h-5" />} onClose={onClose} size="md" footer={<button onClick={onClose} className={primaryButtonClass}>بستن</button>}>
        <AccountCreatedNotice username={account.username.trim().toLowerCase()} temporaryPassword={done.temporaryPassword} />
      </Modal>
    );
  }

  if (user.hasAccount) {
    const revoke = async () => {
      setBusy(true);
      const ok = await revokeAccess(user.id);
      setBusy(false);
      if (ok) onClose();
    };
    return (
      <Modal
        title="برداشتن دسترسی پورتال"
        subtitle={name}
        icon={<ShieldOff className="w-5 h-5" />}
        onClose={onClose}
        size="md"
        footer={
          <>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
            <button type="button" onClick={revoke} disabled={busy} className={primaryButtonClass}>
              <ShieldOff className="w-4 h-4" /> {busy ? 'در حال انجام...' : 'برداشتن دسترسی'}
            </button>
          </>
        }
      >
        <div className="space-y-2 text-xs leading-relaxed text-[#4B4740]">
          <p>{name} دیگر نمی‌تواند وارد پرتال شود و اعلانی دریافت نمی‌کند، ولی در دفتر تلفن، چارت سازمانی و کارت‌های تولد باقی می‌ماند.</p>
          <p>نقش او به «کارشناس» برمی‌گردد. نام کاربری <code dir="ltr">{user.username}</code> نگه داشته می‌شود تا اگر بعداً دوباره دسترسی دادید همان باشد.</p>
          <p className="text-[#6E6A60]">اگر همکار از شرکت رفته است، به جای این کار او را در ویرایش پروفایل غیرفعال کنید تا همه‌جا پنهان شود.</p>
        </div>
      </Modal>
    );
  }

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await grantAccess(user.id, { ...account, username: account.username.trim().toLowerCase() });
    setBusy(false);
    if (result) setDone(result);
  };

  return (
    <Modal
      title="دادن دسترسی پورتال"
      subtitle={name}
      icon={<KeyRound className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="submit" form="grant-access" disabled={busy} className={primaryButtonClass}>
            <KeyRound className="w-4 h-4" /> {busy ? 'در حال ثبت...' : 'دادن دسترسی'}
          </button>
        </>
      }
    >
      <form id="grant-access" onSubmit={grant} className="space-y-4">
        <p className="text-xs text-[#6E6A60] leading-relaxed">همه مشخصات فعلی {name} سر جایش می‌ماند؛ فقط امکان ورود به پرتال اضافه می‌شود.</p>
        <AccountFields idPrefix="grant" value={account} onChange={setAccount} />
      </form>
    </Modal>
  );
};
