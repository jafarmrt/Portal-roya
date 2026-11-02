import React, { useId, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { EntryPicture, api, entryName, scoreLine, useEventAction } from './eventUi';
import { OBJECTION_MAX } from '../../../shared/specialEvents';
import type { EventCompetition, EventMatch, EventView } from './types';

/** A player objects to the result of their own match; the jury (or the organizers) decide. */
export const ObjectionModal: React.FC<{ view: EventView; competition: EventCompetition; match: EventMatch; onClose: () => void }> = ({ view, competition, match, onClose }) => {
  const run = useEventAction();
  const formId = useId();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const a = competition.entries.find((e) => e.id === match.entryA);
  const b = competition.entries.find((e) => e.id === match.entryB);
  const deciders = view.event.juryIds.length > 0 ? 'هیئت داوران' : 'برگزارکنندگان';
  const ready = text.trim().length >= 3 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    const ok = await run(() => api.post(`/api/event_matches/${match.id}/objections`, { text: text.trim() }), `اعتراض برای ${deciders} فرستاده شد.`);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title="اعتراض به نتیجه"
      subtitle={`${competition.title} · ${match.roundName}`}
      icon={<MessageSquareWarning className="w-5 h-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={formId} disabled={!ready} className={primaryButtonClass}>
            فرستادن اعتراض
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-surface text-xs font-bold">
          <EntryPicture entry={a} people={view.people} className="w-7 h-7 rounded-lg text-base" />
          <span className="truncate">{entryName(a, view.people)}</span>
          <span className="mx-auto text-ink tabular-nums">{scoreLine(match, competition)}</span>
          {b && <span className="truncate">{entryName(b, view.people)}</span>}
          {b && <EntryPicture entry={b} people={view.people} className="w-7 h-7 rounded-lg text-base" />}
        </div>
        <div>
          <label htmlFor={`${formId}-text`} className={labelClass}>
            چه چیزی درست ثبت نشده؟
          </label>
          <textarea
            id={`${formId}-text`}
            value={text}
            maxLength={OBJECTION_MAX}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
            placeholder="مثلاً گل دقیقهٔ آخر ما شمرده نشد"
          />
        </div>
        <p className="text-[11px] text-muted">{deciders} اعتراض را بررسی می‌کنند و پاسخشان برای شما اعلان می‌شود. اگر نتیجه اصلاح شود، جدول خودش درست می‌شود.</p>
      </form>
    </Modal>
  );
};
