import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Undo2 } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';
import { withdrawThanks } from './thanksStore';

const fa = toPersianDigits;

/**
 * «پس گرفتن» of a recognition or a «من هم», with the time left for it. Once the time is over it shows
 * `after` instead (nothing by default).
 */
export const Withdraw: React.FC<{ id: string; until: string | null; done: string; after?: React.ReactNode; small?: boolean }> = ({ id, until, done, after = null, small }) => {
  const end = until ? new Date(until).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (end <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [end]);
  const seconds = Math.max(0, Math.round((end - now) / 1000));
  if (seconds <= 0) return <>{after}</>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void withdrawThanks(id).then((ok) => {
          if (ok) toast.success(done);
          else setBusy(false);
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-white hover:bg-surface text-xs font-bold text-ink ${small ? 'px-2 py-1' : 'px-3 py-1.5'}`}
    >
      <Undo2 className="w-3.5 h-3.5" />
      پس گرفتن
      <span className="tabular-nums text-faint">
        {fa(Math.floor(seconds / 60))}:{fa(String(seconds % 60).padStart(2, '0'))}
      </span>
    </button>
  );
};
