import React, { useState } from 'react';
import { Avatar } from '../common/Avatar';
import { matches } from '../../lib/search';
import { toPersianDigits } from '../../lib/jalali';
import { usePortal } from '../../context/PortalContext';
import { NO_DEPARTMENT, NO_POSITION } from '../../../shared/profile';
import { UserProfile } from '../../types';
import { UserProfileModal } from './UserProfileModal';
import { EditProfileModal } from './EditProfileModal';
import { exportPhoneBook, PhoneListPrintModal } from './PhoneListPrintModal';
import {
  Users,
  Search,
  PhoneCall,
  Phone,
  Mail,
  UserCog,
  Copy,
  Check,
  ChevronLeft,
  MapPin,
  Printer,
  Download,
} from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { usePresence } from '../online/usePresence';
import { OnlineDot } from '../common/OnlineDot';
import { telHref } from '../../lib/phone';
import { secondaryButtonClass } from '../common/Modal';

export const ColleaguesDirectory: React.FC = () => {
  const { employees, can, appSettings, departmentPages, focusId, setActiveTab, currentUser, featureOn } = usePortal();
  // Green dot for colleagues who have the portal open (only those who show themselves online, and only
  // for a viewer who shows themselves too; the server decides).
  const { data: presence } = usePresence(!!currentUser && featureOn('onlineColleagues'));
  const onlineIds = new Set((presence?.online ?? []).map((p) => p.id));
  const isManager = can('users.manage');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  // The open profile follows the URL (#colleagues/<id>) so profiles can be linked.
  const selectedUserForView = focusId ? employees.find(e => e.id === focusId) ?? null : null;
  const setSelectedUserForView = (emp: UserProfile | null) => setActiveTab('colleagues', emp?.id ?? null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [copiedExtension, setCopiedExtension] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // The phone book describes people by their place in the organisation, not by what they may do in the portal.
  const unitHeads = new Set(departmentPages.map((p) => p.headId).filter(Boolean));

  // The tabs follow the department list in settings; departments nobody is in are left out.
  const active = employees.filter(emp => emp.isActive);
  const departments = [
    { id: 'all', label: 'همه واحدها', count: active.length },
    ...(appSettings?.departments || [])
      .map(d => ({ id: d, label: d, count: active.filter(emp => emp.department === d).length }))
      .filter(d => d.count > 0),
  ];
  const locations = (appSettings?.locations || [])
    .map(l => ({ id: l, label: l, count: active.filter(emp => emp.location === l).length }))
    .filter(l => l.count > 0);

  const filteredEmployees = employees.filter(emp => {
    // Colleagues who left are managed on the staff page, not listed here.
    if (!emp.isActive) return false;
    const matchesDept = (selectedDept === 'all' || emp.department === selectedDept) && (selectedLocation === 'all' || emp.location === selectedLocation);
    if (!searchQuery.trim()) return matchesDept;
    return matchesDept && matches(
      searchQuery,
      `${emp.firstName} ${emp.lastName}`,
      emp.extension,
      emp.mobile,
      emp.email,
      emp.position,
      ...emp.skills.map(s => s.name),
    );
  });

  const handleCopyExtension = async (ext: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ext);
      setCopiedExtension(ext);
      setTimeout(() => setCopiedExtension(null), 2000);
    } catch {
      // Clipboard needs HTTPS on most browsers; the number stays visible on the card.
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <PageHeader
        icon={<Users />}
        title="همکاران"
        description={`شماره داخلی، موبایل، ایمیل، واحد و مهارت‌های ${toPersianDigits(employees.filter(e => e.isActive).length)} همکار.`}
      >
        <button onClick={() => setPrintOpen(true)} title="فهرست داخلی‌ها برای کنار تلفن‌ها" className={secondaryButtonClass}>
          <Printer className="w-4 h-4" />
          <span>چاپ دفتر تلفن</span>
        </button>
        <button onClick={() => exportPhoneBook(active, appSettings?.departments ?? [])} className={secondaryButtonClass}>
          <Download className="w-4 h-4" />
          <span>خروجی اکسل</span>
        </button>
        {isManager && (
          <button onClick={() => setActiveTab('people')} className={secondaryButtonClass}>
            <UserCog className="w-4 h-4" />
            <span>مدیریت کارکنان</span>
          </button>
        )}
      </PageHeader>

      {/* Search and Department Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-line shadow-xs space-y-3">
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی سریع بر اساس نام همکار، شماره داخلی، موبایل، ایمیل یا سمت سازمانی..."
            aria-label="جستجوی همکاران"
            className="w-full pr-10 pl-4 py-3 text-xs sm:text-sm bg-surface border border-line rounded-xl focus:border-brand focus:bg-white outline-hidden transition-all text-ink placeholder-faint"
          />
          <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-faint" />
        </div>

        {/* Department Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setSelectedDept(dept.id)}
              aria-pressed={selectedDept === dept.id}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                selectedDept === dept.id
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface hover:bg-line text-ink'
              }`}
            >
              {dept.label}
              <span className={`mr-1.5 text-xs ${selectedDept === dept.id ? 'text-white/80' : 'text-faint'}`}>{toPersianDigits(dept.count)}</span>
            </button>
          ))}
        </div>

        {/* Location chips, when colleagues work in more than one place */}
        {locations.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="group" aria-label="محل استقرار">
            <MapPin className="w-3.5 h-3.5 text-faint shrink-0" />
            {[{ id: 'all', label: 'همه محل‌ها', count: active.length }, ...locations].map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id)}
                aria-pressed={selectedLocation === loc.id}
                className={`px-3 py-1 text-xs font-semibold rounded-xl whitespace-nowrap transition-all border ${
                  selectedLocation === loc.id ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white border-line hover:bg-surface text-ink'
                }`}
              >
                {loc.label}
                <span className={`mr-1.5 text-xs ${selectedLocation === loc.id ? 'text-white/80' : 'text-faint'}`}>{toPersianDigits(loc.count)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredEmployees.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-line">
            <Users className="w-10 h-10 text-faint mx-auto mb-2" />
            <p className="text-sm font-bold text-muted">همکاری با این مشخصات یافت نشد.</p>
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedUserForView(emp)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedUserForView(emp); }}
              className="bg-white rounded-2xl border border-line p-5 hover:border-brand hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Top Card Content */}
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <div className="relative shrink-0">
                    <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-14 h-14 rounded-2xl border border-line text-base" />
                    {onlineIds.has(emp.id) && <OnlineDot />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-ink group-hover:text-brand transition-colors truncate">
                      {emp.firstName} {emp.lastName}
                    </h3>
                    <p className="text-xs font-semibold text-muted truncate mt-0.5">
                      {emp.position || NO_POSITION}
                    </p>
                    <span className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-md ${emp.department ? 'bg-surface text-brand-strong' : 'bg-stone-100 text-stone-500'}`}>
                      {emp.department || NO_DEPARTMENT}
                    </span>
                    {unitHeads.has(emp.id) && <span className="inline-block mt-1.5 mr-1 px-2 py-0.5 text-xs font-bold bg-red-50 text-red-800 rounded-md">مسئول واحد</span>}
                    {emp.location && (
                      <span className="flex items-center gap-1 mt-1.5 text-xs text-muted truncate">
                        <MapPin className="w-3 h-3 text-faint shrink-0" />
                        {emp.location}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick contact: only what is filled in; the mobile number calls, the email writes. */}
                {(emp.extension || emp.mobile || emp.email) && (
                  <div className="space-y-2 py-3 border-y border-line text-xs">
                    {emp.extension && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-muted">
                          <PhoneCall className="w-3.5 h-3.5 text-brand" />
                          <span>شماره داخلی:</span>
                        </div>
                        <button
                          onClick={(e) => handleCopyExtension(emp.extension, e)}
                          className="px-2.5 py-1 bg-surface hover:bg-line text-ink rounded-lg text-xs font-bold border border-line flex items-center gap-1 transition-colors"
                          title="کپی شماره داخلی"
                          aria-label={`کپی شماره داخلی ${emp.extension}`}
                        >
                          <span>{emp.extension}</span>
                          {copiedExtension === emp.extension ? (
                            <Check className="w-3 h-3 text-brand-strong" />
                          ) : (
                            <Copy className="w-3 h-3 text-faint" />
                          )}
                        </button>
                      </div>
                    )}

                    {emp.mobile && (
                      <div className="flex items-center justify-between text-muted">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-faint" />
                          <span>تلفن همراه:</span>
                        </div>
                        <a
                          href={telHref(emp.mobile)}
                          onClick={(e) => e.stopPropagation()}
                          dir="ltr"
                          className="font-semibold text-ink hover:text-brand underline-offset-2 hover:underline"
                          title="تماس"
                        >
                          {emp.mobile}
                        </a>
                      </div>
                    )}

                    {emp.email && (
                      <div className="flex items-center justify-between gap-2 text-muted">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Mail className="w-3.5 h-3.5 text-faint" />
                          <span>ایمیل:</span>
                        </div>
                        <a
                          href={`mailto:${emp.email}`}
                          onClick={(e) => e.stopPropagation()}
                          dir="ltr"
                          className="font-medium text-ink hover:text-brand truncate min-w-0 text-xs"
                        >
                          {emp.email}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Skills Preview */}
                {emp.skills && emp.skills.length > 0 && (
                  <div className="pt-3 flex flex-wrap gap-1">
                    {emp.skills.slice(0, 3).map((s) => (
                      <span key={s.id} className="text-xs px-2 py-0.5 bg-surface text-brand-strong rounded-md">
                        {s.name}
                      </span>
                    ))}
                    {emp.skills.length > 3 && (
                      <span className="text-xs px-1.5 py-0.5 text-faint">
                        +{emp.skills.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Footer Action */}
              <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs font-bold text-brand group-hover:translate-x-1 transition-transform">
                <span>مشاهده پروفایل کامل و سوابق</span>
                <ChevronLeft className="w-4 h-4" />
              </div>

            </div>
          ))
        )}
      </div>

      {/* Profile Detail View Modal */}
      {selectedUserForView && <UserProfileModal
        user={selectedUserForView}
        online={onlineIds.has(selectedUserForView.id)}
        onClose={() => setSelectedUserForView(null)}
        onEdit={(usr) => { setSelectedUserForView(null); setSelectedUserForEdit(usr); }}
      />}

      {/* Edit Profile Modal */}
      {selectedUserForEdit && <EditProfileModal
        user={selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
      />}

      {printOpen && <PhoneListPrintModal onClose={() => setPrintOpen(false)} />}
    </div>
  );
};
