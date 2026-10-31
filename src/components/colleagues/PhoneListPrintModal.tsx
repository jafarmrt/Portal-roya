import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { downloadCsv } from '../../lib/download';
import { toPersianDigits, todayJalali } from '../../lib/jalali';
import { NO_DEPARTMENT } from '../../../shared/profile';
import type { UserProfile } from '../../types';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { Letterhead, PrintPortal, QrCode } from '../common/PrintSheet';

type GroupBy = 'department' | 'location';

interface Group {
  name: string;
  people: UserProfile[];
}

const byName = (a: UserProfile, b: UserProfile) =>
  `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fa');

/** Active colleagues grouped by department or location, in the order of the lists in settings. */
function groupPeople(people: UserProfile[], key: GroupBy, order: string[]): Group[] {
  const groups = new Map<string, UserProfile[]>();
  for (const p of people) {
    const name = key === 'department' ? p.department || NO_DEPARTMENT : p.location || 'نامشخص';
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : name === 'نامشخص' || name === NO_DEPARTMENT ? Number.MAX_SAFE_INTEGER : order.length);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'fa'))
    .map(([name, list]) => ({ name, people: list.sort(byName) }));
}

/** The phone list as a CSV file that opens in Excel, in the same order as the printed list. */
export function exportPhoneBook(people: UserProfile[], departments: string[]) {
  const rows = groupPeople(people, 'department', departments).flatMap((g) =>
    g.people.map((p) => [p.department, p.firstName, p.lastName, p.position, p.extension, p.mobile, p.email, p.location]),
  );
  downloadCsv(`roya-phone-book-${todayJalali().replace(/\//g, '-')}.csv`, [
    ['واحد', 'نام', 'نام خانوادگی', 'سمت', 'داخلی', 'موبایل', 'ایمیل', 'محل استقرار'],
    ...rows,
  ]);
}

const PhoneListSheet: React.FC<{ groups: Group[]; total: number; showMobile: boolean }> = ({ groups, total, showMobile }) => {
  const url = `${window.location.origin}/#colleagues`;
  return (
    <div className="sheet-page phone-sheet">
      <Letterhead title="دفتر تلفن داخلی" date={new Date().toISOString()} />
      <div className="phone-columns">
        {groups.map((g) => (
          <section key={g.name} className="phone-group">
            <h2>
              {g.name} <span>{toPersianDigits(g.people.length)} نفر</span>
            </h2>
            <table>
              <tbody>
                {g.people.map((p) => (
                  <tr key={p.id}>
                    <td className="phone-name">{p.firstName} {p.lastName}</td>
                    <td className="phone-position">{p.position}</td>
                    <td className="phone-ext" dir="ltr">{p.extension ? toPersianDigits(p.extension) : '—'}</td>
                    {showMobile && <td className="phone-mobile" dir="ltr">{p.mobile ? toPersianDigits(p.mobile) : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <footer className="phone-footer">
        <QrCode value={url} />
        <div>
          {toPersianDigits(total)} همکار. این فهرست از پرتال سازمانی ساخته شده است؛ فهرست به‌روز همیشه در پرتال است:
          <div dir="ltr" className="notice-url">{url}</div>
        </div>
      </footer>
    </div>
  );
};

/** Print the internal phone list (by department or location) for beside the phones, or save it for Excel. */
export const PhoneListPrintModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { employees, appSettings } = usePortal();
  const [groupBy, setGroupBy] = useState<GroupBy>('department');
  const [showMobile, setShowMobile] = useState(false);

  const people = useMemo(() => employees.filter((e) => e.isActive), [employees]);
  const hasMobiles = people.some((p) => p.mobile);
  const groups = useMemo(
    () => groupPeople(people, groupBy, (groupBy === 'department' ? appSettings?.departments : appSettings?.locations) ?? []),
    [people, groupBy, appSettings],
  );

  const choice = <T,>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button
      key={label}
      type="button"
      role="radio"
      aria-checked={value === current}
      onClick={() => set(value)}
      className={`px-3 py-1.5 rounded-xl font-bold border ${value === current ? 'bg-red-700 text-white border-red-700' : 'bg-white border-line-strong'}`}
    >
      {label}
    </button>
  );

  return (
    <Modal
      title="چاپ دفتر تلفن"
      subtitle="فهرست داخلی‌ها برای کنار تلفن‌ها"
      icon={<Printer className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          <button type="button" onClick={() => window.print()} className={primaryButtonClass}>
            <Printer className="w-4 h-4" /> چاپ
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2" role="radiogroup" aria-label="دسته‌بندی">
            {choice<GroupBy>('department', groupBy, setGroupBy, 'به تفکیک واحد')}
            {choice<GroupBy>('location', groupBy, setGroupBy, 'به تفکیک محل استقرار')}
          </div>
          {hasMobiles && (
            <label className="flex items-center gap-1.5 mr-2 cursor-pointer">
              <input type="checkbox" checked={showMobile} onChange={(e) => setShowMobile(e.target.checked)} className="accent-red-700" />
              شمارهٔ همراه هم چاپ شود
            </label>
          )}
        </div>
        <p className="text-xs text-muted">پیش‌نمایش؛ در چاپ به برگه‌های A4 تقسیم می‌شود (برای حدود صد نفر معمولاً دو برگه).</p>
        <div className="sheet-preview-frame">
          <div className="sheet-preview">
            <PhoneListSheet groups={groups} total={people.length} showMobile={showMobile} />
          </div>
        </div>
      </div>
      <PrintPortal>
        <PhoneListSheet groups={groups} total={people.length} showMobile={showMobile} />
      </PrintPortal>
    </Modal>
  );
};
