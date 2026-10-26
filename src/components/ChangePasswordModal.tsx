import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { errorMessage } from '../lib/api';
import { inputClass, labelClass, Modal, primaryButtonClass, secondaryButtonClass } from './common/Modal';

/** Password form used both as a dialog and as the forced first-login screen. */
export const ChangePasswordForm: React.FC<{ onDone?: () => void; onCancel?: () => void }> = ({ onDone, onCancel }) => {
  const { changePassword } = usePortal();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('رمز عبور جدید باید حداقل ۸ کاراکتر باشد.');
    if (next !== repeat) return setError('تکرار رمز عبور با رمز جدید یکسان نیست.');
    setError('');
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success('رمز عبور تغییر کرد.');
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div role="alert" className="p-3 bg-red-50 text-red-800 text-xs font-bold rounded-xl border border-red-200">{error}</div>}
      <div>
        <label htmlFor="pw-current" className={labelClass}>رمز عبور فعلی</label>
        <input id="pw-current" type="password" dir="ltr" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="pw-new" className={labelClass}>رمز عبور جدید (حداقل ۸ کاراکتر)</label>
        <input id="pw-new" type="password" dir="ltr" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="pw-repeat" className={labelClass}>تکرار رمز عبور جدید</label>
        <input id="pw-repeat" type="password" dir="ltr" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryButtonClass}>انصراف</button>}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          <KeyRound className="w-4 h-4" />
          <span>{busy ? 'در حال ذخیره...' : 'تغییر رمز عبور'}</span>
        </button>
      </div>
    </form>
  );
};

export const ChangePasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="تغییر رمز عبور" icon={<KeyRound className="w-5 h-5" />} onClose={onClose} size="md">
    <ChangePasswordForm onDone={onClose} onCancel={onClose} />
  </Modal>
);

export const ForcePasswordChangePage: React.FC = () => {
  const { currentUser, logout } = usePortal();
  return (
    <main className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-[#E6E0D5] p-8 space-y-5">
        <div>
          <h1 className="text-lg font-black text-[#2D2D2D]">{currentUser?.firstName} عزیز، خوش آمدید</h1>
          <p className="text-xs text-[#6E6A60] mt-2 leading-relaxed">
            رمزی که با آن وارد شدید موقت است. لطفاً قبل از ادامه یک رمز عبور شخصی انتخاب کنید.
          </p>
        </div>
        <ChangePasswordForm />
        <button type="button" onClick={() => void logout()} className="text-xs text-[#7A756D] hover:text-red-700 underline">
          خروج
        </button>
      </div>
    </main>
  );
};
