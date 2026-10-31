import { describe, expect, it } from 'vitest';
import { telHref } from '../src/lib/phone';

describe('calling a colleague from the phone book', () => {
  it('keeps only the digits', () => {
    expect(telHref('0912 345 6789')).toBe('tel:09123456789');
    expect(telHref('0912-345-6789')).toBe('tel:09123456789');
  });

  it('reads Persian and Arabic digits', () => {
    expect(telHref('۰۹۱۲۳۴۵۶۷۸۹')).toBe('tel:09123456789');
    expect(telHref('٠٩١٢٣٤٥٦٧٨٩')).toBe('tel:09123456789');
  });

  it('keeps a country code', () => {
    expect(telHref(' +98 912 345 6789')).toBe('tel:+989123456789');
  });
});
