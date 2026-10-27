import React, { useEffect, useState } from 'react';
import { usePortal } from '../../context/PortalContext';

interface RoyaLogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/** The company logo an admin uploaded in settings, or the built-in ROYA wordmark. */
export const RoyaLogo: React.FC<RoyaLogoProps> = ({ className = '', size = 'md' }) => {
  const { logoSrc } = usePortal();
  // A logo file that fails to load (e.g. deleted from the server) falls back to the wordmark.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoSrc]);

  // Brand color #E30613 / #D32F2F
  const dimensions = {
    sm: { height: 'h-8' },
    md: { height: 'h-10' },
    lg: { height: 'h-14' },
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {logoSrc && !failed ? (
        <img
          src={logoSrc}
          alt="لوگوی شرکت"
          className={`${dimensions.height} w-auto max-w-[140px] sm:max-w-[200px] object-contain`}
          onError={() => setFailed(true)}
        />
      ) : (
        /* Precision Vector Emblem matching ROYA Surface Center emblem typography */
        <div className={`flex flex-col justify-center ${dimensions.height}`}>
          <div className="flex items-baseline font-serif tracking-widest text-[#dc2626] leading-none font-bold text-xl sm:text-3xl">
            <span>ROYA</span>
          </div>
          <div className="text-[9px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.25em] whitespace-nowrap text-[#991b1b] font-sans font-semibold -mt-0.5">
            Surface Center
          </div>
        </div>
      )}

      {/* Persian Subtitle Tag */}
      <div className="hidden sm:flex flex-col border-r-2 border-[#E6E0D5] pr-3 mr-1 text-right">
        <span className="text-xs font-bold text-[#2D2D2D] leading-tight">پرتال سازمانی</span>
        <span className="text-[11px] text-[#6E6A60]">رویا طرح داخلی</span>
      </div>
    </div>
  );
};
