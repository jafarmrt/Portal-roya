import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortal } from '../../context/PortalContext';
import { formatDate } from '../../lib/jalali';

/**
 * What the browser prints while it is mounted: everything else on the page is hidden when printing
 * (see .print-sheet in index.css). Nothing of it shows on screen.
 */
export const PrintPortal: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) =>
  createPortal(
    <div className={`print-sheet ${className}`} dir="rtl">
      {children}
    </div>,
    document.body,
  );

/** The Roya heading of a printed page, with the company logo from settings when there is one. */
export const Letterhead: React.FC<{ title: string; date?: string }> = ({ title, date }) => {
  const { logoSrc } = usePortal();
  return (
    <header className="sheet-letterhead">
      <div>
        {logoSrc ? (
          <img className="sheet-logo" src={logoSrc} alt="لوگوی شرکت" />
        ) : (
          <div className="sheet-wordmark" dir="ltr">ROYA <span>SURFACE CENTER</span></div>
        )}
        <div className="sheet-company">رویا طرح داخلی</div>
      </div>
      <div className="sheet-letterhead-side">
        <div className="sheet-letterhead-title">{title}</div>
        {date && <div>{formatDate(date)}</div>}
      </div>
    </header>
  );
};

/** A QR code (SVG) for a link; the encoder is loaded only when a page with a code is opened. */
export const QrCode: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }))
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  // The SVG is generated here from the link, not taken from user input.
  return <div className={`sheet-qr ${className}`} aria-label="کد QR" role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
};
