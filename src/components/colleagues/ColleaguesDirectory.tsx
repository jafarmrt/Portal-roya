import React, { useState } from 'react';
import { Avatar } from '../common/Avatar';
import { matches } from '../../lib/search';
import { toPersianDigits } from '../../lib/jalali';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import { UserProfileModal } from './UserProfileModal';
import { EditProfileModal } from './EditProfileModal';
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
} from 'lucide-react';

export const ColleaguesDirectory: React.FC = () => {
  const { employees, can, roleName, appSettings, focusId, setActiveTab } = usePortal();
  const isManager = can('users.manage');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  // The open profile follows the URL (#colleagues/<id>) so profiles can be linked.
  const selectedUserForView = focusId ? employees.find(e => e.id === focusId) ?? null : null;
  const setSelectedUserForView = (emp: UserProfile | null) => setActiveTab('colleagues', emp?.id ?? null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [copiedExtension, setCopiedExtension] = useState<string | null>(null);

  const departments = [
    { id: 'all', label: 'همه دپارتمان‌ها' },
    ...(appSettings?.departments || []).map(d => ({ id: d, label: d }))
  ];

  const filteredEmployees = employees.filter(emp => {
    // Colleagues who left are managed on the staff page, not listed here.
    if (!emp.isActive) return false;
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
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
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Users className="w-3.5 h-3.5" />
              <span>دفترچه تلفن و بانک اطلاعاتی همکاران رویا طرح داخلی</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white">معرفی همکاران و سیستم ارتباطات داخلی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              شماره داخلی، موبایل، ایمیل، واحد، سوابق شغلی و مهارت‌های همکاران. {toPersianDigits(employees.filter(e => e.isActive).length)} همکار فعال.
            </p>
          </div>

          {isManager && (
            <button
              onClick={() => setActiveTab('people')}
              className="self-start sm:self-auto px-5 py-3 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/30 rounded-2xl transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <UserCog className="w-4 h-4" />
              <span>مدیریت کارکنان</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Department Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E6E0D5] shadow-xs space-y-3">
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی سریع بر اساس نام همکار، شماره داخلی، موبایل، ایمیل یا سمت سازمانی..."
            aria-label="جستجوی همکاران"
            className="w-full pr-10 pl-4 py-3 text-xs sm:text-sm bg-[#F5F2ED] border border-[#E6E0D5] rounded-xl focus:border-[#dc2626] focus:bg-white outline-hidden transition-all text-[#2D2D2D] placeholder-[#8C867A]"
          />
          <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-[#8C867A]" />
        </div>

        {/* Department Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setSelectedDept(dept.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                selectedDept === dept.id
                  ? 'bg-[#dc2626] text-white shadow-xs'
                  : 'bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D]'
              }`}
            >
              {dept.label}
            </button>
          ))}
        </div>

      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredEmployees.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 py-12 text-center bg-white rounded-2xl border border-dashed border-[#E6E0D5]">
            <Users className="w-10 h-10 text-[#8C867A] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#6E6A60]">همکاری با این مشخصات یافت نشد.</p>
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedUserForView(emp)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedUserForView(emp); }}
              className="bg-white rounded-2xl border border-[#E6E0D5] p-5 hover:border-[#dc2626] hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Top Card Content */}
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <Avatar src={emp.avatar} firstName={emp.firstName} lastName={emp.lastName} className="w-14 h-14 rounded-2xl border border-[#E6E0D5] text-base" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#2D2D2D] group-hover:text-[#dc2626] transition-colors truncate">
                      {emp.firstName} {emp.lastName}
                    </h3>
                    <p className="text-xs font-semibold text-[#6E6A60] truncate mt-0.5">
                      {emp.position}
                    </p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-medium bg-[#F5F2ED] text-[#991b1b] rounded-md">
                      {emp.department}
                    </span>
                    {emp.role !== 'employee' && <span className="inline-block mt-1.5 mr-1 px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-800 rounded-md">{roleName(emp.role)}</span>}
                  </div>
                </div>

                {/* Quick Contact Rows */}
                <div className="space-y-2 py-3 border-y border-[#E6E0D5] text-xs">
                  {/* Extension Row with Copy Button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[#6E6A60]">
                      <PhoneCall className="w-3.5 h-3.5 text-[#dc2626]" />
                      <span>شماره داخلی:</span>
                    </div>
                    {emp.extension ? <button
                      onClick={(e) => handleCopyExtension(emp.extension, e)}
                      className="px-2.5 py-1 bg-[#F5F2ED] hover:bg-[#E6E0D5] text-[#2D2D2D] rounded-lg text-xs font-bold border border-[#E6E0D5] flex items-center gap-1 transition-colors"
                      title="کپی شماره داخلی"
                    >
                      <span>{emp.extension}</span>
                      {copiedExtension === emp.extension ? (
                        <Check className="w-3 h-3 text-[#991b1b]" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#8C867A]" />
                      )}
                    </button> : <span className="text-[#A8A295]">—</span>}
                  </div>

                  {/* Mobile Row */}
                  <div className="flex items-center justify-between text-[#6E6A60]">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#8C867A]" />
                      <span>تلفن همراه:</span>
                    </div>
                    <span dir="ltr" className="font-semibold text-[#2D2D2D]">{emp.mobile || '—'}</span>
                  </div>

                  {/* Email Row */}
                  <div className="flex items-center justify-between text-[#6E6A60] truncate">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#8C867A]" />
                      <span>ایمیل:</span>
                    </div>
                    <span dir="ltr" className="font-medium text-[#2D2D2D] truncate max-w-[140px] text-[11px]">{emp.email || '—'}</span>
                  </div>

                </div>

                {/* Skills Preview */}
                {emp.skills && emp.skills.length > 0 && (
                  <div className="pt-3 flex flex-wrap gap-1">
                    {emp.skills.slice(0, 3).map((s) => (
                      <span key={s.id} className="text-[10px] px-2 py-0.5 bg-[#F5F2ED] text-[#991b1b] rounded-md">
                        {s.name}
                      </span>
                    ))}
                    {emp.skills.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-[#8C867A]">
                        +{emp.skills.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Footer Action */}
              <div className="mt-4 pt-3 border-t border-[#E6E0D5] flex items-center justify-between text-xs font-bold text-[#dc2626] group-hover:translate-x-1 transition-transform">
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
        onClose={() => setSelectedUserForView(null)}
        onEdit={(usr) => { setSelectedUserForView(null); setSelectedUserForEdit(usr); }}
      />}

      {/* Edit Profile Modal */}
      {selectedUserForEdit && <EditProfileModal
        user={selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
      />}

    </div>
  );
};
