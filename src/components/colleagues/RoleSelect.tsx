import React from 'react';
import { coversRole } from '../../../shared/permissions';
import { usePortal } from '../../context/PortalContext';
import { inputClass } from '../common/Modal';

/**
 * Whether the signed-in colleague may give a role, or change the account of someone who holds it:
 * admins always, others only for roles whose every permission they hold. The server checks the same.
 */
export function useCoversRole() {
  const { roles, currentUser } = usePortal();
  return (roleId: string) =>
    Boolean(currentUser) && coversRole(currentUser!, roles.find((r) => r.id === roleId) ?? { id: roleId, permissions: [] });
}

interface RoleSelectProps {
  id: string;
  value: string;
  onChange: (roleId: string) => void;
  disabled?: boolean;
}

/** Role picker for user forms. It offers only the roles the signed-in colleague may give. */
export const RoleSelect: React.FC<RoleSelectProps> = ({ id, value, onChange, disabled }) => {
  const { roles } = usePortal();
  const covers = useCoversRole();
  const options = roles.filter((r) => r.id === value || covers(r.id));
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputClass}>
      {options.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
};

/** One line under the picker on what the chosen access level allows (its description in settings). */
export const RoleHint: React.FC<{ roleId: string }> = ({ roleId }) => {
  const { roles } = usePortal();
  const description = roles.find((r) => r.id === roleId)?.description;
  return description ? <p className="mt-1 text-[11px] text-[#6E6A60] leading-relaxed">{description}</p> : null;
};
