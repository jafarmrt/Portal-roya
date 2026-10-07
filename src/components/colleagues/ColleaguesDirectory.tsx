import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { UserProfile } from '../../types';
import { UserProfileModal } from './UserProfileModal';
import { EditProfileModal } from './EditProfileModal';
import { AddEmployeeModal } from './AddEmployeeModal';
import {
  Users,
  Search,
  PhoneCall,
  Phone,
  Mail,
  UserPlus,
  Building2,
  Copy,
  Check,
  ChevronLeft,
  Sparkles,
  MapPin,
  ExternalLink
} from 'lucide-react';

export const ColleaguesDirectory: React.FC = () => {
  const { employees, userRole, currentUser, appSettings } = usePortal();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedUserForView, setSelectedUserForView] = useState<UserProfile | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [copiedExtension, setCopiedExtension] = useState<string | null>(null);

  const departments = [
    { id: 'all', label: 'همه دپارتمان‌ها' },
    ...(appSettings?.departments || []).map(d => ({ id: d, label: d }))
  ];

  const filteredEmployees = employees.filter(emp => {
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
    
    if (!searchQuery.trim()) return matchesDept;

    const q = searchQuery.trim().toLowerCase();
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const matchesQuery = fullName.includes(q) ||
      emp.extension.includes(q) ||
      emp.mobile.includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.position.toLowerCase().includes(q) ||
      emp.skills.some(s => s.name.toLowerCase().includes(q));

    return matchesDept && matchesQuery;
  });

  const handleCopyExtension = (ext: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ext);
    setCopiedExtension(ext);
    setTimeout(() => setCopiedExtension(null), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-[#7f1d1d] via-[#991b1b] to-[#ef4444] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#dc2626]/30 text-[#E6E0D5] text-xs font-semibold border border-[#dc2626]/40">
              <Users className="w-3.5 h-3.5" />
              <span>دفترچه تلفن و بانک اطلاعاتی همکاران رویا طرح داخلی</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">معرفی همکاران و سیستم ارتباطات داخلی</h1>
            <p className="text-[#E6E0D5] text-xs sm:text-sm max-w-2xl leading-relaxed">
              دسترسی سریع به شماره تلفن داخلی، موبایل، ایمیل، دپارتمان، سوابق شغلی و مهارتهای کلیدی کلیه همکاران شرکت.
            </p>
          </div>

          {userRole === 'manager' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-2xl shadow-lg transition-all flex items-center gap-2 whitespace-nowrap self-start sm:self-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>ثبت همکار جدید</span>
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
              onClick={() => setSelectedUserForView(emp)}
              className="bg-white rounded-2xl border border-[#E6E0D5] p-5 hover:border-[#dc2626] hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Top Card Content */}
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <img
                    src={emp.avatar || undefined}
                    alt={`${emp.firstName} ${emp.lastName}`}
                    className="w-14 h-14 rounded-2xl object-cover border border-[#E6E0D5] group-hover:scale-105 transition-transform"
                  />
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
                    <button
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
                    </button>
                  </div>

                  {/* Mobile Row */}
                  <div className="flex items-center justify-between text-[#6E6A60]">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#8C867A]" />
                      <span>تلفن همراه:</span>
                    </div>
                    <span className="font-semibold text-[#2D2D2D]">{emp.mobile}</span>
                  </div>

                  {/* Email Row */}
                  <div className="flex items-center justify-between text-[#6E6A60] truncate">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#8C867A]" />
                      <span>ایمیل:</span>
                    </div>
                    <span className="font-medium text-[#2D2D2D] truncate max-w-[140px] text-[11px]">{emp.email}</span>
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
        onEdit={(usr) => setSelectedUserForEdit(usr)}
      />}

      {/* Edit Profile Modal */}
      {selectedUserForEdit && <EditProfileModal
        user={selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
      />}

      {/* Add Employee Modal */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

    </div>
  );
};
