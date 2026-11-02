import React, { useId, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { PeoplePicker } from './PeoplePicker';
import { api, entryName, useEventAction } from './eventUi';
import { BADGE_PREFIX, TEAM_BADGES, TEAM_NAME_MAX, isBadge } from '../../../shared/specialEvents';
import { toPersianDigits } from '../../lib/jalali';
import type { EventCompetition, EventEntry, EventView } from './types';

interface TeamModalProps {
  view: EventView;
  competition: EventCompetition;
  /** A team being changed; without it a new one is signed up. */
  entry?: EventEntry;
  /** An organizer signing up others (a team they are not in, or a colleague alone). */
  forOthers?: boolean;
  onClose: () => void;
}

/** Signs up a team (name, picture, teammates), changes one, or lets an organizer sign up someone else. */
export const TeamModal: React.FC<TeamModalProps> = ({ view, competition, entry, forOthers = false, onClose }) => {
  const { currentUser } = usePortal();
  const run = useEventAction();
  const formId = useId();
  const team = competition.kind === 'team';
  const captain = entry?.captainId ?? (forOthers ? null : currentUser?.id ?? null);
  const [name, setName] = useState(entry?.name ?? '');
  const [image, setImage] = useState(entry?.image || `${BADGE_PREFIX}${TEAM_BADGES[0]}`);
  const [memberIds, setMemberIds] = useState<string[]>(entry ? entry.members.filter((id) => id !== captain) : []);
  const [saving, setSaving] = useState(false);

  // Jurors take part in nothing; nobody is in two entries of one competition.
  const unavailable = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of view.event.juryIds) map.set(id, 'داور رویداد است');
    for (const e of competition.entries) {
      if (e.id === entry?.id) continue;
      for (const id of e.members) map.set(id, `در ${team ? `تیم «${entryName(e, view.people)}»` : 'این مسابقه'} ثبت‌نام کرده`);
    }
    return map;
  }, [view, competition, entry, team]);

  const fixed = captain ? [captain] : [];
  const total = memberIds.length + fixed.length;
  const short = team && total < competition.teamMin;
  const ready = team ? name.trim().length > 0 && total >= 1 : memberIds.length === 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    const body = team ? { name: name.trim(), image, memberIds, ...(forOthers ? { forOthers: true } : {}) } : { memberIds };
    let result: unknown;
    if (entry) {
      result = await run(() => api.patch(`/api/event_entries/${entry.id}`, body), 'تیم به‌روز شد.');
    } else {
      const answer = await run(() => api.post<{ status: string }>(`/api/event_competitions/${competition.id}/entries`, body));
      if (answer) toast.success(answer.status === 'waitlist' ? 'ظرفیت پر بود؛ در فهرست انتظار ثبت شد.' : team ? 'تیم ثبت‌نام شد.' : 'ثبت‌نام انجام شد.');
      result = answer;
    }
    setSaving(false);
    if (result) onClose();
  };

  return (
    <Modal
      title={entry ? `تیم «${entry.name}»` : team ? `ساختن تیم برای «${competition.title}»` : `ثبت‌نام همکار در «${competition.title}»`}
      subtitle={team ? `هر تیم ${toPersianDigits(competition.teamMin)} تا ${toPersianDigits(competition.teamMax)} نفر` : undefined}
      icon={<Users className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            انصراف
          </button>
          <button type="submit" form={formId} disabled={!ready || saving} className={primaryButtonClass}>
            {entry ? 'ذخیره' : 'ثبت‌نام'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        {team && (
          <>
            <div>
              <label htmlFor={`${formId}-name`} className={labelClass}>
                نام تیم
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                maxLength={TEAM_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً هندوانه‌های شب‌زنده‌دار"
                className={inputClass}
              />
            </div>
            <fieldset>
              <legend className={labelClass}>تصویر تیم</legend>
              <div className="flex flex-wrap gap-1.5">
                {TEAM_BADGES.map((b) => {
                  const value = `${BADGE_PREFIX}${b}`;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setImage(value)}
                      aria-pressed={image === value}
                      className={`w-11 h-11 rounded-xl text-2xl border-2 ${image === value ? 'border-red-600 bg-red-50' : 'border-line bg-white hover:bg-surface'}`}
                    >
                      {b}
                    </button>
                  );
                })}
                {image && !isBadge(image) && (
                  <img src={image} alt="تصویر بارگذاری‌شده" className="w-11 h-11 rounded-xl object-cover border-2 border-red-600" />
                )}
              </div>
              <FileUpload className="mt-2" accept={IMAGE_ACCEPT} label="بارگذاری عکس تیم" onUploaded={(f) => setImage(f.url)} />
            </fieldset>
          </>
        )}
        <PeoplePicker
          label={team ? (captain ? 'هم‌تیمی‌ها (شما سرپرست تیم هستید)' : 'اعضای تیم (نفر اول سرپرست است)') : 'همکار'}
          value={memberIds}
          onChange={setMemberIds}
          max={team ? competition.teamMax : 1}
          fixed={fixed}
          unavailable={unavailable}
          hint={team ? 'همکارانی که حساب پرتال ندارند (فقط در دفترچه تلفن) هم قابل افزودن هستند. هر عضو اعلان می‌گیرد و اگر نخواهد می‌تواند خارج شود.' : undefined}
        />
        {short && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            تیم هنوز {toPersianDigits(competition.teamMin - total)} نفر کم دارد. می‌توانید الان ثبت‌نام کنید و تا پایان ثبت‌نام کاملش کنید.
          </p>
        )}
      </form>
    </Modal>
  );
};
