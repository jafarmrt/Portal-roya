import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { inputClass } from '../common/Modal';

interface RoleSelectProps {
  id: string;
  value: string;
  onChange: (roleId: string) => void;
}

/** Role picker for user forms. Only an admin may hand out the admin role. */
export const RoleSelect: React.FC<RoleSelectProps> = ({ id, value, onChange }) => {
  const { roles, isAdmin } = usePortal();
  const options = roles.filter((r) => isAdmin || !r.isAdmin || r.id === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {options.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
};
