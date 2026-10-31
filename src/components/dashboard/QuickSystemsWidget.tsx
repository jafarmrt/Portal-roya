import React from 'react';
import { usePortal } from '../../context/PortalContext';
import { ExternalLink, LayoutGrid, Settings2 } from 'lucide-react';
import type { ExternalSystem } from '../../types';
import { SystemIcon } from '../systems/SystemIcon';

/** Why an app has no link here: none was entered, or it only opens inside the company. */
export const missingLinkMessage = (system: ExternalSystem) =>
  (system.url && system.url !== '#') || system.externalUrl ? 'این سامانه فقط از داخل شرکت باز می‌شود' : 'آدرس این سامانه هنوز ثبت نشده است';

/**
 * One organisation app as a launch tile; opens in a new tab so the portal stays open. The link is the
 * inside or internet address depending on where the visitor is; `href` overrides it (sign-in page).
 */
export const SystemTile: React.FC<{ system: ExternalSystem; href?: string; compact?: boolean; onLaunch?: () => void }> = ({ system, href, compact, onLaunch }) => {
  const { systemHref } = usePortal();
  const link = href ?? systemHref(system);
  const ready = Boolean(link);
  return (
    <a
      href={ready ? link : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!ready}
      title={ready ? `${system.name} (در زبانهٔ جدید باز می‌شود)` : missingLinkMessage(system)}
      onClick={(e) => {
        if (!ready) e.preventDefault();
        else onLaunch?.();
      }}
      className={`group flex items-center gap-2.5 rounded-2xl border transition-all min-w-0 ${compact ? 'p-2.5' : 'p-3'} ${
        ready
          ? 'bg-white border-line hover:border-brand hover:shadow-md focus-visible:border-brand'
          : 'bg-surface/60 border-dashed border-line-strong opacity-70 cursor-not-allowed'
      }`}
    >
      <SystemIcon system={system} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs sm:text-sm font-bold text-ink group-hover:text-brand transition-colors line-clamp-2 leading-snug">{system.name}</span>
        {!compact && system.description && <span className="block text-xs text-muted truncate">{system.description}</span>}
      </span>
      {ready && <ExternalLink className="w-3.5 h-3.5 text-faint group-hover:text-brand shrink-0 hidden sm:block" />}
    </a>
  );
};

/** All organisation apps, shown right under the welcome banner so nobody has to scroll for them. */
export const QuickSystemsWidget: React.FC = () => {
  const { setActiveTab, appSettings, can } = usePortal();
  const systems = appSettings?.systems ?? [];
  if (systems.length === 0) return null;

  return (
    <section aria-labelledby="quick-systems-title" className="bg-white rounded-3xl p-4 sm:p-5 border border-line/70 shadow-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quick-systems-title" className="flex items-center gap-2 text-sm font-black text-ink">
          <span className="p-1.5 bg-brand-deep text-white rounded-lg"><LayoutGrid className="w-4 h-4" /></span>
          سامانه‌های سازمان
        </h2>
        <button onClick={() => setActiveTab('systems')} className="tap-area text-xs font-bold text-brand hover:underline flex items-center gap-1">
          {can('systems.manage') && <Settings2 className="w-3.5 h-3.5" />}
          {can('systems.manage') ? 'مدیریت سامانه‌ها' : 'همه سامانه‌ها'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
        {systems.map((system) => <SystemTile key={system.id} system={system} compact />)}
      </div>
    </section>
  );
};
