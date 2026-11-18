import React from 'react';
import { History } from 'lucide-react';

/**
 * Above a form that came back with what the person had written before and not sent (src/lib/drafts.ts):
 * says so, and offers to start from an empty form.
 */
export const DraftNote: React.FC<{ onDiscard: () => void; children?: React.ReactNode }> = ({ onDiscard, children }) => (
  <p className="flex flex-wrap items-center gap-2 p-3 rounded-xl text-xs leading-relaxed bg-sky-50 text-sky-900 border border-sky-200" role="status">
    <History className="w-4 h-4 shrink-0" />
    <span className="flex-1 min-w-40">{children ?? 'نوشتهٔ قبلی شما که فرستاده نشده بود، برگردانده شد.'}</span>
    <button type="button" onClick={onDiscard} className="font-bold underline underline-offset-2 hover:text-sky-700">
      پاک کن
    </button>
  </p>
);
