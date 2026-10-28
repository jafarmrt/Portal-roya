import React from 'react';
import type { PresenceInfo } from '../../types';

/** The two personal switches of «همکاران آنلاین», shown in the card and in the person's profile. */
export const OnlineChoices: React.FC<{
  me: PresenceInfo['me'];
  onChange: (choice: Partial<PresenceInfo['me']>) => void;
}> = ({ me, onChange }) => (
  <div className="space-y-1">
    <label className="flex items-center gap-1.5 text-[11px] text-[#6E6A60] cursor-pointer">
      <input type="checkbox" checked={!me.showOnline} onChange={(e) => onChange({ showOnline: !e.target.checked })} className="accent-red-700" />
      مرا آنلاین نشان نده (آن وقت فهرست همکاران آنلاین را هم نمی‌بینم)
    </label>
    <label className="flex items-center gap-1.5 text-[11px] text-[#6E6A60] cursor-pointer">
      <input type="checkbox" checked={!me.acceptKudos} onChange={(e) => onChange({ acceptKudos: !e.target.checked })} className="accent-red-700" />
      همکاران برایم ایموجی نفرستند
    </label>
  </div>
);
