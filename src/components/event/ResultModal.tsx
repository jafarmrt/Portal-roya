import React, { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { EntryPicture, Stepper, api, entryName, useEventAction } from './eventUi';
import { RESULT_UNDO_MS, scoreUnit } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventMatch, EventView } from './types';

interface ResultModalProps {
  view: EventView;
  competition: EventCompetition;
  match: EventMatch;
  /** The score the remote is showing now (it may be ahead of the page by a moment). */
  initialScores?: { a: number; b: number };
  onClose: () => void;
}

/**
 * Enters (or corrects) a match's result: scores with big buttons, penalties or a picked winner when it
 * is level, or «برد فنی» when a side did not come. A result just entered can be taken back for a few seconds.
 */
export const ResultModal: React.FC<ResultModalProps> = ({ view, competition, match, initialScores, onClose }) => {
  const run = useEventAction();
  const formId = useId();
  const correcting = Boolean(match.winnerId);
  const a = competition.entries.find((e) => e.id === match.entryA);
  const b = competition.entries.find((e) => e.id === match.entryB);
  const [scoreA, setScoreA] = useState(initialScores?.a ?? match.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(initialScores?.b ?? match.scoreB ?? 0);
  const [tieA, setTieA] = useState(match.tieA ?? 0);
  const [tieB, setTieB] = useState(match.tieB ?? 0);
  const [winnerId, setWinnerId] = useState<string | null>(correcting ? match.winnerId : null);
  const [walkover, setWalkover] = useState(match.walkover);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const onlyWinner = competition.scoring === 'winner' || walkover;
  const level = !onlyWinner && scoreA === scoreB;
  const penalties = level && competition.tieRule === 'penalties';
  const pickWinner = onlyWinner || (level && !penalties);
  // Later matches already played with this winner are cleared if the winner changes.
  const laterPlayed = correcting && competition.matches.some((m) => m.round > match.round && !m.bye && m.winnerId && (m.entryA === match.winnerId || m.entryB === match.winnerId));

  const ready =
    !saving &&
    (!pickWinner || Boolean(winnerId)) &&
    (!penalties || tieA !== tieB) &&
    (!correcting || reason.trim().length >= 3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    const body = walkover
      ? { walkover: true, winnerId, reason: reason.trim() || undefined }
      : competition.scoring === 'winner'
        ? { winnerId, reason: reason.trim() || undefined }
        : { scoreA, scoreB, tieA: penalties ? tieA : null, tieB: penalties ? tieB : null, winnerId: pickWinner ? winnerId : null, reason: reason.trim() || undefined };
    const result = await run(() => api.post<{ cleared: string[] }>(`/api/event_matches/${match.id}/result`, body));
    setSaving(false);
    if (!result) return;
    onClose();
    if (correcting) {
      toast.success(result.cleared.length > 0 ? `نتیجه اصلاح شد؛ ${toPersianDigits(result.cleared.length)} بازی بعدی دوباره باید بازی شود.` : 'نتیجه اصلاح شد.');
      return;
    }
    // «برگردان» for a moment, in case the wrong match or side was tapped.
    toast(
      (t) => (
        <span className="flex items-center gap-3 text-sm">
          نتیجه ثبت شد.
          <button
            type="button"
            className="font-bold text-amber-300 underline"
            onClick={() => {
              toast.dismiss(t.id);
              void run(() => api.post(`/api/event_matches/${match.id}/undo`), 'نتیجه برگشت.');
            }}
          >
            برگردان
          </button>
        </span>
      ),
      { duration: RESULT_UNDO_MS },
    );
  };

  const side = (entry: typeof a, label: string, value: number, set: (v: number) => void) => (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-2 p-3 rounded-2xl bg-surface">
      <EntryPicture entry={entry} people={view.people} className="w-12 h-12 rounded-2xl text-3xl" />
      <span className="text-sm font-black text-ink text-center truncate max-w-full">{entryName(entry, view.people)}</span>
      {!onlyWinner && <Stepper value={value} onChange={set} label={`${scoreUnit(competition.scoring) || 'امتیاز'} ${label}`} />}
    </div>
  );

  return (
    <Modal
      title={correcting ? 'اصلاح نتیجه' : 'ثبت نتیجه'}
      subtitle={`${competition.title} · ${match.roundName}`}
      icon={<Flag className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={formId} disabled={!ready} className={primaryButtonClass}>
            {walkover ? 'ثبت برد فنی' : 'پایان بازی و ثبت'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="flex gap-2 items-stretch">
          {side(a, 'طرف اول', scoreA, setScoreA)}
          <span className="self-center text-faint font-black">–</span>
          {side(b, 'طرف دوم', scoreB, setScoreB)}
        </div>

        {penalties && (
          <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50 space-y-2">
            <p className="text-xs font-bold text-amber-900">مساوی شد؛ نتیجهٔ پنالتی:</p>
            <div className="flex justify-around">
              <Stepper value={tieA} onChange={setTieA} label="پنالتی طرف اول" />
              <Stepper value={tieB} onChange={setTieB} label="پنالتی طرف دوم" />
            </div>
          </div>
        )}

        {pickWinner && (
          <fieldset>
            <legend className={labelClass}>{walkover ? 'برندهٔ برد فنی (طرفی که آمد)' : level ? (competition.tieRule === 'extra' ? 'مساوی؛ برندهٔ دور اضافه' : 'مساوی؛ برنده') : 'برنده'}</legend>
            <div className="grid grid-cols-2 gap-2">
              {[a, b].map((entry) =>
                entry ? (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setWinnerId(entry.id)}
                    aria-pressed={winnerId === entry.id}
                    className={`p-3 rounded-xl border-2 text-sm font-bold flex items-center gap-2 ${winnerId === entry.id ? 'border-emerald-600 bg-emerald-50' : 'border-line bg-white'}`}
                  >
                    <EntryPicture entry={entry} people={view.people} className="w-7 h-7 rounded-lg text-base" />
                    <span className="truncate">{entryName(entry, view.people)}</span>
                  </button>
                ) : null,
              )}
            </div>
          </fieldset>
        )}

        <label className="flex items-center gap-2 text-xs font-bold text-ink-soft">
          <input type="checkbox" checked={walkover} onChange={(e) => setWalkover(e.target.checked)} className="w-4 h-4 accent-red-700" />
          یک طرف نیامد (برد فنی)
        </label>

        {correcting && (
          <div>
            <label htmlFor={`${formId}-reason`} className={labelClass}>
              دلیل اصلاح (در تاریخچه می‌ماند و بازیکن‌ها می‌بینند)
            </label>
            <input id={`${formId}-reason`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="مثلاً گل دوم اشتباه ثبت شده بود" />
            {laterPlayed && (
              <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-2.5 mt-2">
                اگر برنده عوض شود، نتیجهٔ بازی‌های بعدی این طرف پاک می‌شود و دوباره باید بازی شوند.
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};
