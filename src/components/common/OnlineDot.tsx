import React from 'react';

/** A small green dot on a photo: this colleague has the portal open now. */
export const OnlineDot: React.FC<{ className?: string }> = ({ className = '-bottom-0.5 -left-0.5' }) => (
  <span
    className={`absolute ${className} w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white`}
    role="img"
    aria-label="آنلاین"
    title="الان پرتال را باز دارد"
  />
);
