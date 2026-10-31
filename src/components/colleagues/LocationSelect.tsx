import React from 'react';
import { SearchableSelect } from '../common/SearchableSelect';
import { usePortal } from '../../context/PortalContext';
import { inputClass } from '../common/Modal';

/** The colleague's place of work, chosen from the list in settings (or left unknown). */
export const LocationSelect: React.FC<{ id: string; value: string; onChange: (value: string) => void }> = ({ id, value, onChange }) => {
  const { appSettings } = usePortal();
  const options = appSettings?.locations ?? [];
  return (
    <SearchableSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">نامشخص</option>
      {options.map((l) => (
        <option key={l} value={l}>{l}</option>
      ))}
      {/* Kept until the list catches up (it is completed from colleagues' data when the server starts). */}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </SearchableSelect>
  );
};
