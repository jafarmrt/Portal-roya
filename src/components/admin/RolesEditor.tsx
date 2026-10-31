import React, { useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { PERMISSIONS } from '../../../shared/permissions';
import { usePortal } from '../../context/PortalContext';
import { toPersianDigits } from '../../lib/jalali';
import type { Permission, RoleInfo } from '../../types';
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';
import { useUnsavedChanges } from './unsavedChanges';

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

const RoleCard: React.FC<{ role: RoleInfo }> = ({ role }) => {
  const { saveRole, deleteRole } = usePortal();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [permissions, setPermissions] = useState<Permission[]>(role.permissions);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== role.name || description.trim() !== role.description || !sameSet(permissions, role.permissions);
  useUnsavedChanges(`role-${role.id}`, dirty);

  const toggle = (key: Permission) =>
    setPermissions((list) => (list.includes(key) ? list.filter((p) => p !== key) : [...list, key]));

  const save = async () => {
    setBusy(true);
    await saveRole({
      id: role.id,
      name: name.trim(),
      description: description.trim(),
      // The admin role always has every permission, so its list is never sent.
      ...(role.isAdmin ? {} : { permissions }),
    });
    setBusy(false);
  };

  return (
    <section className="bg-white p-5 rounded-3xl border border-line/70 shadow-card space-y-3 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <label htmlFor={`role-name-${role.id}`} className={labelClass}>نام سطح دسترسی</label>
            <input id={`role-name-${role.id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`role-desc-${role.id}`} className={labelClass}>توضیح</label>
            <input id={`role-desc-${role.id}`} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>
        </div>
        <span className="shrink-0 px-2 py-1 text-xs font-bold bg-surface text-muted rounded-lg">
          {toPersianDigits(role.memberCount)} همکار
        </span>
      </div>

      {role.isAdmin ? (
        <p className="flex items-center gap-2 p-3 bg-brand-soft text-brand-strong rounded-xl text-xs font-bold">
          <Lock className="w-4 h-4 shrink-0" />
          ادمین پرتال همیشه همهٔ دسترسی‌ها را دارد و تنها سطحی است که می‌تواند سطح‌های دسترسی را تنظیم کند.
        </p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">دسترسی‌های {role.name}</legend>
          {PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-start gap-2 p-2 rounded-xl hover:bg-surface cursor-pointer">
              <input type="checkbox" checked={permissions.includes(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 accent-red-700" />
              <span>
                <span className="block text-xs font-bold text-ink">{p.label}</span>
                <span className="block text-xs text-faint">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {!role.isSystem ? (
          <button
            type="button"
            disabled={busy || role.memberCount > 0}
            title={role.memberCount > 0 ? 'ابتدا سطح دسترسی همکاران این گروه را تغییر دهید' : undefined}
            onClick={async () => {
              if (!window.confirm(`سطح دسترسی «${role.name}» حذف شود؟`)) return;
              setBusy(true);
              await deleteRole(role.id);
              setBusy(false);
            }}
            className="flex items-center gap-1 text-xs font-bold text-red-700 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" /> حذف
          </button>
        ) : (
          <span className="text-xs text-faint">سطح پایه</span>
        )}
        {dirty && (
          <button type="button" disabled={busy || !name.trim()} onClick={save} className={primaryButtonClass}>
            {busy ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        )}
      </div>
    </section>
  );
};

const NewRoleForm: React.FC = () => {
  const { saveRole } = usePortal();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        if (await saveRole({ name: name.trim(), description: '', permissions: [] })) setName('');
        setBusy(false);
      }}
      className="flex gap-2"
    >
      <input aria-label="نام سطح دسترسی جدید" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="نام سطح دسترسی جدید، مثلاً «خوانندهٔ صندوق منابع انسانی»" className={inputClass} />
      <button type="submit" disabled={busy || !name.trim()} className={`${secondaryButtonClass} whitespace-nowrap`}>
        <Plus className="w-4 h-4" /> افزودن سطح دسترسی
      </button>
    </form>
  );
};

export const RolesEditor: React.FC = () => {
  const { roles } = usePortal();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-strong mt-0.5 shrink-0" />
        <div>
          <h3 className="text-base font-black text-ink">سطح‌های دسترسی</h3>
          <p className="text-xs text-muted">
            سطح دسترسی یعنی کارهایی که هر همکار در پرتال اجازه دارد، نه جایگاه سازمانی او (آن «سمت» و «واحد» است). هر همکار با حساب پرتال یک سطح دسترسی دارد که در مدیریت کارکنان (ویرایش همکار) تعیین می‌شود. تغییر دسترسی‌های یک سطح بلافاصله برای همهٔ همکاران آن سطح اعمال می‌شود.
          </p>
        </div>
      </div>
      <NewRoleForm />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {roles.map((r) => (
          <RoleCard key={`${r.id}-${r.name}-${r.description}-${r.permissions.join(',')}`} role={r} />
        ))}
      </div>
    </div>
  );
};
