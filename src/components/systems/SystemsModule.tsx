import React, { useState } from 'react';
import { usePortal } from '../../context/PortalContext';
import { ExternalLink, Database, Globe, CalendarClock, CreditCard, HeadphonesIcon, BookOpen, Settings, Plus, X, Save, Edit, Trash2 } from 'lucide-react';
import { ExternalSystem } from '../../types';

const iconMap: Record<string, React.ElementType> = {
  Database, Globe, CalendarClock, CreditCard, HeadphonesIcon, BookOpen, Settings, ExternalLink
};

export const SystemsModule: React.FC = () => {
  const { currentUser, appSettings, updateSettings } = usePortal();
  const isManager = currentUser?.role === 'manager';
  const [isEditing, setIsEditing] = useState(false);
  
  const defaultSystems: ExternalSystem[] = [
    { id: 'crm', name: 'سیستم CRM راهکاران', description: 'مدیریت ارتباط با مشتریان', iconName: 'Database', url: '#', bgColor: 'bg-red-50', textColor: 'text-red-700' },
    { id: 'automation', name: 'اتوماسیون اداری', description: 'مدیریت مکاتبات', iconName: 'Globe', url: '#', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
    { id: 'attendance', name: 'سیستم حضور و غیاب', description: 'ثبت تردد و مرخصی', iconName: 'CalendarClock', url: '#', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' }
  ];

  const currentSystems = appSettings?.systems && appSettings.systems.length > 0 ? appSettings.systems : defaultSystems;
  const [editedSystems, setEditedSystems] = useState<ExternalSystem[]>(currentSystems);

  const handleSave = () => {
    if (appSettings) {
      updateSettings({ ...appSettings, systems: editedSystems });
    }
    setIsEditing(false);
  };

  const handleAddSystem = () => {
    const newSystem: ExternalSystem = {
      id: Date.now().toString(),
      name: 'سامانه جدید',
      description: 'توضیحات سامانه جدید',
      iconName: 'Settings',
      url: '#',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700'
    };
    setEditedSystems([...editedSystems, newSystem]);
  };

  const handleUpdateSystem = (id: string, field: keyof ExternalSystem, value: string) => {
    setEditedSystems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleRemoveSystem = (id: string) => {
    setEditedSystems(prev => prev.filter(s => s.id !== id));
  };

  const colorOptions = [
    { bg: 'bg-red-50', text: 'text-red-700', label: 'قرمز' },
    { bg: 'bg-blue-50', text: 'text-blue-700', label: 'آبی' },
    { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'سبز' },
    { bg: 'bg-amber-50', text: 'text-amber-700', label: 'زرد' },
    { bg: 'bg-purple-50', text: 'text-purple-700', label: 'بنفش' },
    { bg: 'bg-teal-50', text: 'text-teal-700', label: 'فیروزه‌ای' },
    { bg: 'bg-gray-50', text: 'text-gray-700', label: 'خاکستری' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#2D2D2D]">سامانه‌های سازمانی</h2>
          <p className="text-sm text-[#6E6A60] mt-1">
            دسترسی سریع به نرم‌افزارها و سامانه‌های یکپارچه رویا طرح داخلی
          </p>
        </div>
        {isManager && (
          <div>
            {!isEditing ? (
              <button
                onClick={() => {
                  setEditedSystems(currentSystems);
                  setIsEditing(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E0D5] text-[#2D2D2D] text-sm font-bold rounded-xl hover:bg-[#F5F2ED] transition-colors"
              >
                <Edit className="w-4 h-4" />
                ویرایش سامانه‌ها
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E0D5] text-[#6E6A60] text-sm font-bold rounded-xl hover:bg-[#F5F2ED] transition-colors"
                >
                  <X className="w-4 h-4" />
                  انصراف
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-[#dc2626] text-white text-sm font-bold rounded-xl hover:bg-[#b91c1c] transition-colors shadow-sm shadow-[#dc2626]/20"
                >
                  <Save className="w-4 h-4" />
                  ذخیره تغییرات
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {editedSystems.map((system) => {
              const Icon = iconMap[system.iconName] || Settings;
              return (
                <div key={system.id} className="bg-white rounded-3xl p-6 border border-[#dc2626]/30 shadow-xs relative">
                  <button 
                    onClick={() => handleRemoveSystem(system.id)}
                    className="absolute top-4 left-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف سامانه"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-4 rounded-2xl ${system.bgColor} ${system.textColor}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <input
                          value={system.name}
                          onChange={(e) => handleUpdateSystem(system.id, 'name', e.target.value)}
                          placeholder="نام سامانه"
                          className="w-full px-3 py-2 text-sm font-bold text-[#2D2D2D] border border-[#E6E0D5] rounded-lg focus:border-[#dc2626] outline-hidden"
                        />
                        <input
                          value={system.description}
                          onChange={(e) => handleUpdateSystem(system.id, 'description', e.target.value)}
                          placeholder="توضیحات کوتاه"
                          className="w-full px-3 py-2 text-xs text-[#6E6A60] border border-[#E6E0D5] rounded-lg focus:border-[#dc2626] outline-hidden"
                        />
                        <input
                          value={system.url}
                          onChange={(e) => handleUpdateSystem(system.id, 'url', e.target.value)}
                          placeholder="آدرس لینک (URL)"
                          className="w-full px-3 py-2 text-xs text-blue-600 border border-[#E6E0D5] rounded-lg focus:border-[#dc2626] outline-hidden text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="pt-3 border-t border-[#E6E0D5] grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#6E6A60] mb-1">آیکون</label>
                        <select
                          value={system.iconName}
                          onChange={(e) => handleUpdateSystem(system.id, 'iconName', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-[#F5F2ED] border border-[#E6E0D5] rounded-lg outline-hidden"
                        >
                          {Object.keys(iconMap).map(iconName => (
                            <option key={iconName} value={iconName}>{iconName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#6E6A60] mb-1">رنگ‌بندی</label>
                        <select
                          value={`${system.bgColor}|${system.textColor}`}
                          onChange={(e) => {
                            const [bg, text] = e.target.value.split('|');
                            handleUpdateSystem(system.id, 'bgColor', bg);
                            handleUpdateSystem(system.id, 'textColor', text);
                          }}
                          className="w-full px-3 py-2 text-xs bg-[#F5F2ED] border border-[#E6E0D5] rounded-lg outline-hidden"
                        >
                          {colorOptions.map(opt => (
                            <option key={opt.bg} value={`${opt.bg}|${opt.text}`}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={handleAddSystem}
              className="flex flex-col items-center justify-center gap-3 bg-[#F5F2ED] rounded-3xl p-6 border-2 border-dashed border-[#E6E0D5] text-[#8C867A] hover:bg-white hover:border-[#dc2626] hover:text-[#dc2626] transition-all min-h-[200px]"
            >
              <Plus className="w-8 h-8" />
              <span className="text-sm font-bold">افزودن سامانه جدید</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentSystems.map((system) => {
            const Icon = iconMap[system.iconName] || Settings;
            return (
              <a
                key={system.id}
                href={system.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block bg-white rounded-3xl p-6 border border-[#E6E0D5] hover:border-[#dc2626]/40 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-4 rounded-2xl ${system.bgColor} ${system.textColor} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-[#2D2D2D] group-hover:text-[#dc2626] transition-colors">
                        {system.name}
                      </h3>
                      <ExternalLink className="w-4 h-4 text-[#C5BFC7] group-hover:text-[#dc2626] transition-colors" />
                    </div>
                    <p className="text-xs text-[#6E6A60] mt-2 leading-relaxed">
                      {system.description}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
