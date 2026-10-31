import React, { useState } from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { usePortal } from '../../context/PortalContext';
import { ExternalLink, Plus, X, Save, Edit, Trash2, ChevronUp, ChevronDown, ImageOff } from 'lucide-react';
import { ExternalSystem } from '../../types';
import { FileUpload, IMAGE_ACCEPT } from '../common/FileUpload';
import { iconMap, SystemIcon } from './SystemIcon';
import { missingLinkMessage } from '../dashboard/QuickSystemsWidget';
import { isInsideOnlyUrl } from '../../../shared/systemLinks';

const iconLabels: Record<string, string> = {
  Database: 'پایگاه داده / CRM', Globe: 'وب / اتوماسیون', CalendarClock: 'حضور و غیاب', CreditCard: 'مالی و پرداخت',
  HeadphonesIcon: 'پشتیبانی', BookOpen: 'آموزش / دانش', Settings: 'تنظیمات', ExternalLink: 'لینک عمومی',
  Mail: 'ایمیل', Users: 'منابع انسانی', Calculator: 'حسابداری', Package: 'انبار', Truck: 'حمل و تأمین',
  FileText: 'اسناد و نامه‌ها', ShoppingCart: 'فروش / خرید', Phone: 'تلفن و ارتباطات', Briefcase: 'پروژه‌ها',
};

/** What colleagues outside the company get for this app, under the internet address field. */
function externalHint(system: ExternalSystem) {
  const internal = system.url && system.url !== '#' ? system.url.trim() : '';
  if (system.externalUrl?.trim()) return 'همکارانی که از بیرون شرکت وصل می‌شوند به این آدرس می‌روند.';
  if (!internal) return 'خالی بگذارید اگر سامانه از بیرون شرکت در دسترس نیست.';
  if (isInsideOnlyUrl(internal)) return 'خالی است؛ چون آدرس داخلی فقط در شرکت کار می‌کند، این سامانه بیرون از شرکت نشان داده نمی‌شود.';
  return 'خالی است؛ بیرون از شرکت هم همان آدرس داخلی باز می‌شود.';
}

export const SystemsModule: React.FC = () => {
  const { can, appSettings, updateSettings, systemHref, companyNetwork, visitorAddress } = usePortal();
  const isManager = can('systems.manage');
  const [isEditing, setIsEditing] = useState(false);
  
  const currentSystems = appSettings?.systems ?? [];
  const [editedSystems, setEditedSystems] = useState<ExternalSystem[]>(currentSystems);

  const handleSave = async () => {
    if (await updateSettings({ systems: editedSystems })) setIsEditing(false);
  };

  const handleAddSystem = () => {
    const newSystem: ExternalSystem = {
      id: Date.now().toString(),
      name: 'سامانه جدید',
      description: 'توضیحات سامانه جدید',
      iconName: 'Settings',
      imageUrl: '',
      url: '',
      externalUrl: '',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700'
    };
    setEditedSystems([...editedSystems, newSystem]);
  };

  const handleUpdateSystem = (id: string, field: keyof ExternalSystem, value: string) => {
    setEditedSystems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleMoveSystem = (index: number, delta: number) => {
    setEditedSystems(prev => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
          <h2 className="text-2xl font-black text-ink">سامانه‌های سازمانی</h2>
          <p className="text-sm text-muted mt-1">
            دسترسی سریع به نرم‌افزارها و سامانه‌های یکپارچه رویا طرح داخلی
          </p>
          {!companyNetwork && (
            <p className="text-xs text-amber-800 font-bold mt-1">شما از بیرون شرکت وصل شده‌اید؛ لینک‌ها به آدرس‌های اینترنتی سامانه‌ها می‌روند.</p>
          )}
        </div>
        {isManager && (
          <div>
            {!isEditing ? (
              <button
                onClick={() => {
                  setEditedSystems(currentSystems);
                  setIsEditing(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-line text-ink text-sm font-bold rounded-xl hover:bg-surface transition-colors"
              >
                <Edit className="w-4 h-4" />
                ویرایش سامانه‌ها
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-line text-muted text-sm font-bold rounded-xl hover:bg-surface transition-colors"
                >
                  <X className="w-4 h-4" />
                  انصراف
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand-hover transition-colors shadow-sm shadow-brand/20"
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
          {/* So a manager can check, e.g. from a phone on mobile data, how the portal sees this connection. */}
          <p className="text-xs text-muted bg-surface rounded-xl px-3 py-2" dir="rtl">
            پرتال این اتصال را <strong className="text-ink">{companyNetwork ? 'داخل شرکت' : 'بیرون شرکت'}</strong> می‌بیند
            {visitorAddress && (
              <>
                {' '}(آدرس شما از نگاه پرتال: <span dir="ltr" className="font-mono">{visitorAddress}</span>)
              </>
            )}
            . اگر از اینترنت وصل هستید ولی اینجا «داخل شرکت» نوشته شده، روتر آدرس بازدیدکننده‌ها را عوض می‌کند و لینک‌های داخلی باز می‌شوند.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {editedSystems.map((system, index) => {
              return (
                <div key={system.id} className="bg-white rounded-3xl p-6 pt-12 border border-brand/30 shadow-xs relative">
                  <div className="absolute top-3 left-3 flex items-center gap-1">
                    <button type="button" onClick={() => handleMoveSystem(index, -1)} disabled={index === 0} className="p-2 text-muted hover:bg-surface rounded-lg disabled:opacity-30" title="جابه‌جایی به جلو" aria-label={`انتقال ${system.name} به جلو`}>
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleMoveSystem(index, 1)} disabled={index === editedSystems.length - 1} className="p-2 text-muted hover:bg-surface rounded-lg disabled:opacity-30" title="جابه‌جایی به عقب" aria-label={`انتقال ${system.name} به عقب`}>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSystem(system.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف سامانه"
                      aria-label={`حذف ${system.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="absolute top-4 right-6 text-xs font-bold text-faint">ترتیب نمایش: {index + 1}</span>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <SystemIcon system={system} size="md" />
                      <div className="flex-1 space-y-3">
                        <input
                          value={system.name}
                          onChange={(e) => handleUpdateSystem(system.id, 'name', e.target.value)}
                          placeholder="نام سامانه"
                          className="w-full px-3 py-2 text-sm font-bold text-ink border border-line rounded-lg focus:border-brand outline-hidden"
                        />
                        <input
                          value={system.description}
                          onChange={(e) => handleUpdateSystem(system.id, 'description', e.target.value)}
                          placeholder="توضیحات کوتاه"
                          className="w-full px-3 py-2 text-xs text-muted border border-line rounded-lg focus:border-brand outline-hidden"
                        />
                        <div>
                          <label htmlFor={`system-url-${system.id}`} className="block text-xs font-bold text-muted mb-1">آدرس داخل شرکت</label>
                          <input
                            id={`system-url-${system.id}`}
                            value={system.url === '#' ? '' : system.url}
                            onChange={(e) => handleUpdateSystem(system.id, 'url', e.target.value)}
                            placeholder="مثلاً http://192.168.0.30 یا http://crm.roya.local"
                            className="w-full px-3 py-2 text-xs text-blue-600 border border-line rounded-lg focus:border-brand outline-hidden text-left"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label htmlFor={`system-external-${system.id}`} className="block text-xs font-bold text-muted mb-1">آدرس بیرون از شرکت (اینترنت)</label>
                          <input
                            id={`system-external-${system.id}`}
                            value={system.externalUrl ?? ''}
                            onChange={(e) => handleUpdateSystem(system.id, 'externalUrl', e.target.value)}
                            placeholder="مثلاً https://crm.royaco.com"
                            className="w-full px-3 py-2 text-xs text-blue-600 border border-line rounded-lg focus:border-brand outline-hidden text-left"
                            dir="ltr"
                          />
                          <p className="mt-1 text-xs text-faint leading-relaxed">{externalHint(system)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-line grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-muted mb-1">آیکون</label>
                        <SearchableSelect
                          value={system.iconName}
                          onChange={(e) => handleUpdateSystem(system.id, 'iconName', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg outline-hidden"
                        >
                          {Object.keys(iconMap).map(iconName => (
                            <option key={iconName} value={iconName}>{iconLabels[iconName] ?? iconName}</option>
                          ))}
                        </SearchableSelect>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-muted mb-1">رنگ‌بندی</label>
                        <SearchableSelect
                          value={`${system.bgColor}|${system.textColor}`}
                          onChange={(e) => {
                            const [bg, text] = e.target.value.split('|');
                            handleUpdateSystem(system.id, 'bgColor', bg);
                            handleUpdateSystem(system.id, 'textColor', text);
                          }}
                          className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg outline-hidden"
                        >
                          {colorOptions.map(opt => (
                            <option key={opt.bg} value={`${opt.bg}|${opt.text}`}>{opt.label}</option>
                          ))}
                        </SearchableSelect>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label htmlFor={`system-department-${system.id}`} className="block text-xs font-bold text-muted mb-1">واحد مسئول</label>
                        <SearchableSelect
                          id={`system-department-${system.id}`}
                          value={system.department ?? ''}
                          onChange={(e) => handleUpdateSystem(system.id, 'department', e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-surface border border-line rounded-lg outline-hidden"
                        >
                          <option value="">بدون واحد</option>
                          {[...new Set([...(appSettings?.departments ?? []), ...(system.department ? [system.department] : [])])].map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </SearchableSelect>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-muted">تصویر یا لوگو (اختیاری):</span>
                      <FileUpload
                        accept={IMAGE_ACCEPT}
                        label={system.imageUrl ? 'تغییر تصویر' : 'بارگذاری تصویر'}
                        onUploaded={(f) => handleUpdateSystem(system.id, 'imageUrl', f.url)}
                      />
                      {system.imageUrl && (
                        <button
                          type="button"
                          onClick={() => handleUpdateSystem(system.id, 'imageUrl', '')}
                          className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1.5"
                        >
                          <ImageOff className="w-4 h-4" /> حذف تصویر و استفاده از آیکون
                        </button>
                      )}
                      <p className="w-full text-xs text-faint">اگر تصویر بگذارید به‌جای آیکون نمایش داده می‌شود. تصویر مربعی (مثلاً ۲۵۶×۲۵۶) با فرمت PNG، JPG یا WebP بهتر دیده می‌شود.</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              onClick={handleAddSystem}
              className="flex flex-col items-center justify-center gap-3 bg-surface rounded-3xl p-6 border-2 border-dashed border-line text-faint hover:bg-white hover:border-brand hover:text-brand transition-all min-h-[200px]"
            >
              <Plus className="w-8 h-8" />
              <span className="text-sm font-bold">افزودن سامانه جدید</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentSystems.map((system) => {
            const link = systemHref(system);
            const ready = Boolean(link);
            return (
              <a
                key={system.id}
                href={ready ? link : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!ready}
                onClick={(e) => { if (!ready) e.preventDefault(); }}
                className={`group block bg-white rounded-3xl p-6 border transition-all ${ready ? 'border-line hover:border-brand/40 hover:shadow-lg' : 'border-dashed border-line-strong opacity-70 cursor-not-allowed'}`}
              >
                <div className="flex items-start gap-4">
                  <SystemIcon system={system} size="lg" className="group-hover:scale-110 transition-transform" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-ink group-hover:text-brand transition-colors">
                        {system.name}
                      </h3>
                      <ExternalLink className="w-4 h-4 text-subtle group-hover:text-brand transition-colors" />
                    </div>
                    <p className="text-xs text-muted mt-2 leading-relaxed">
                      {system.description}
                    </p>
                    {!ready && (
                      <p className="text-xs text-amber-700 font-bold mt-2">
                        {missingLinkMessage(system)}{isManager ? ' (آدرس‌ها را از «ویرایش سامانه‌ها» وارد کنید)' : ''}.
                      </p>
                    )}
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
