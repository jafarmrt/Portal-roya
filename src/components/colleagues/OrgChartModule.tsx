import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Network } from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import type { UserProfile } from '../../types';
import { placeText } from '../../../shared/profile';
import { Avatar } from '../common/Avatar';

interface OrgNode {
  person: UserProfile;
  reports: OrgNode[];
}

/** Builds reporting trees from directManagerId; anyone without an active manager is a root. */
function buildTree(people: UserProfile[]): OrgNode[] {
  const byManager = new Map<string | null, UserProfile[]>();
  const ids = new Set(people.map((p) => p.id));
  for (const p of people) {
    const key = p.directManagerId && ids.has(p.directManagerId) && p.directManagerId !== p.id ? p.directManagerId : null;
    byManager.set(key, [...(byManager.get(key) ?? []), p]);
  }
  const visited = new Set<string>();
  const build = (person: UserProfile): OrgNode => {
    visited.add(person.id);
    const reports = (byManager.get(person.id) ?? []).filter((r) => !visited.has(r.id));
    return { person, reports: reports.map(build) };
  };
  const roots = (byManager.get(null) ?? []).map(build);
  // A reporting cycle leaves people unreached; show them as roots instead of hiding them.
  for (const p of people) if (!visited.has(p.id)) roots.push(build(p));
  return roots;
}

const countAll = (node: OrgNode): number => node.reports.reduce((sum, r) => sum + 1 + countAll(r), 0);

const OrgNodeView: React.FC<{ node: OrgNode; depth: number }> = ({ node, depth }) => {
  const { setActiveTab } = usePortal();
  const [open, setOpen] = useState(depth < 2);
  const { person, reports } = node;
  const total = countAll(node);

  return (
    <li className="space-y-2">
      <div className="flex items-center gap-2">
        {reports.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'بستن زیرمجموعه' : 'باز کردن زیرمجموعه'}
            className="p-1 rounded-lg text-[#6E6A60] hover:bg-[#F5F2ED]"
          >
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <button
          onClick={() => setActiveTab('colleagues', person.id)}
          className="flex items-center gap-3 p-2.5 pl-4 bg-white border border-[#E6E0D5] hover:border-red-600 rounded-2xl text-right transition-colors"
        >
          <Avatar src={person.avatar} firstName={person.firstName} lastName={person.lastName} className="w-10 h-10 rounded-xl text-xs" />
          <span>
            <span className="block text-sm font-bold text-[#2D2D2D]">{person.firstName} {person.lastName}</span>
            <span className="block text-[11px] text-[#6E6A60]">
              {placeText(person)}
              {total > 0 && ` · ${toPersianDigits(total)} نفر زیرمجموعه`}
            </span>
          </span>
        </button>
      </div>
      {open && reports.length > 0 && (
        <ul className="mr-6 pr-4 border-r-2 border-[#E6E0D5] space-y-2">
          {reports.map((r) => <OrgNodeView key={r.person.id} node={r} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
};

export const OrgChartModule: React.FC = () => {
  const { employees, appSettings } = usePortal();
  const [department, setDepartment] = useState('all');

  const active = employees.filter((e) => e.isActive);
  const trees = useMemo(
    () => buildTree(department === 'all' ? active : active.filter((e) => e.department === department)),
    [active, department],
  );
  const departments = [...new Set([...(appSettings?.departments ?? []), ...active.map((e) => e.department)])].filter((d) =>
    d && active.some((e) => e.department === d),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#7f1d1d] text-white rounded-2xl shadow-lg">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#2D2D2D]">چارت سازمانی</h2>
            <p className="text-sm text-[#6E6A60]">بر اساس «مدیر مستقیم» ثبت‌شده در پروفایل همکاران</p>
          </div>
        </div>
        <select
          aria-label="واحد"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="p-2.5 bg-white border border-[#E6E0D5] rounded-xl text-sm font-bold"
        >
          <option value="all">همهٔ واحدها</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="bg-[#FDFBF7] p-4 sm:p-6 rounded-3xl border border-[#E6E0D5] overflow-x-auto">
        {trees.length === 0 ? (
          <p className="text-sm text-[#6E6A60] text-center py-8">همکاری برای نمایش وجود ندارد.</p>
        ) : (
          <ul className="space-y-3 min-w-max">
            {trees.map((t) => <OrgNodeView key={t.person.id} node={t} depth={0} />)}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-[#8C867A]">
        برای اصلاح چارت، کسی که «مدیریت کارکنان» دارد می‌تواند در ویرایش پروفایل هر همکار «مدیر مستقیم» را تغییر دهد.
      </p>
    </div>
  );
};
