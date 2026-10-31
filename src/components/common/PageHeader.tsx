import React from 'react';

/**
 * The title of a page: a small icon tile, the name and one line about it, with the page's buttons
 * beside it. Only the dashboard has a big coloured welcome; other pages get to the point, so on a
 * phone the search box or the list comes right after the title (the description shows from sm up
 * unless it says something the person needs on a phone too).
 */
export const PageHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Show the description on phones as well (when it carries information, not decoration). */
  descriptionOnPhone?: boolean;
  children?: React.ReactNode;
}> = ({ icon, title, description, descriptionOnPhone, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0 p-2.5 sm:p-3 bg-brand-deep text-white rounded-2xl shadow-sm [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">
        {icon}
      </div>
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-black text-ink">{title}</h1>
        {description && (
          <p className={`${descriptionOnPhone ? '' : 'hidden sm:block '}text-xs sm:text-sm text-muted leading-relaxed max-w-2xl`}>{description}</p>
        )}
      </div>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);
