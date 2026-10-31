const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

/**
 * A `tel:` link for a number as people type it ("0912 345 6789", "۰۹۱۲-۳۴۵-۶۷۸۹", "+98 912…"):
 * Persian and Arabic digits become Latin and everything but digits and a leading + is dropped.
 */
export function telHref(number: string): string {
  const latin = number.replace(/[۰-۹٠-٩]/g, (d) => String(PERSIAN.includes(d) ? PERSIAN.indexOf(d) : ARABIC.indexOf(d)));
  const trimmed = latin.trim();
  const digits = trimmed.replace(/\D/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
