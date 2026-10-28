import { describe, expect, it } from 'vitest';
import { hijriDate, occasionsFor } from '../shared/occasions';

const titles = (y: number, m: number, d: number) => occasionsFor(y, m, d).map((o) => o.title);
const holidays = (y: number, m: number, d: number) => occasionsFor(y, m, d).filter((o) => o.holiday).map((o) => o.title);

describe('built-in calendar occasions', () => {
  it('follows Iran’s official lunar dates for 1405', () => {
    expect(hijriDate(1405, 1, 1)).toEqual({ year: 1447, month: 10, day: 1, estimated: false });
    expect(holidays(1405, 1, 1)).toEqual(['عید نوروز', 'عید سعید فطر']);
    expect(holidays(1405, 4, 3)).toEqual(['تاسوعای حسینی']);
    expect(holidays(1405, 4, 4)).toEqual(['عاشورای حسینی']);
    expect(holidays(1405, 5, 13)).toEqual(['اربعین حسینی']);
    // Safar 1448 has 29 days, so Imam Reza's martyrdom falls on its 29th.
    expect(holidays(1405, 5, 22)).toEqual(['شهادت امام رضا (ع)']);
    expect(holidays(1405, 8, 22)).toEqual(['شهادت حضرت فاطمه زهرا (س)']);
    expect(holidays(1405, 10, 16)).toEqual(['مبعث رسول اکرم (ص)']);
    expect(holidays(1405, 12, 19)).toEqual(['عید سعید فطر']);
    expect(holidays(1405, 12, 20)).toEqual(['تعطیل به مناسبت عید سعید فطر']);
  });

  it('matches the official 1404 calendar too', () => {
    expect(holidays(1404, 1, 11)).toEqual(['عید سعید فطر']);
    expect(holidays(1404, 4, 15)).toEqual(['عاشورای حسینی']);
    expect(holidays(1404, 6, 2)).toEqual(['شهادت امام رضا (ع)']);
    expect(titles(1404, 3, 6)).toContain('شهادت امام محمد تقی (ع)');
  });

  it('counts the official holidays of 1405', () => {
    let count = 0;
    for (let m = 1; m <= 12; m++) {
      const days = m <= 6 ? 31 : m < 12 ? 30 : 29;
      for (let d = 1; d <= days; d++) if (holidays(1405, m, d).length) count++;
    }
    // 27 holiday occasions, with Nowruz and Eid al-Fitr on the same day.
    expect(count).toBe(26);
  });

  it('includes solar, cultural and world days that are not holidays', () => {
    expect(occasionsFor(1405, 2, 12)).toEqual([{ title: 'روز معلم', holiday: false, kind: 'solar', tone: 'normal' }]);
    expect(titles(1405, 9, 30)).toContain('شب یلدا');
    expect(titles(1405, 10, 4)).toContain('میلاد حضرت عیسی مسیح (ع)');
    expect(titles(1405, 12, 25)).toContain('چهارشنبه‌سوری');
    expect(titles(1405, 12, 18)).not.toContain('چهارشنبه‌سوری');
  });

  it('keeps the official month table consistent', () => {
    // Every listed month must last 29 or 30 days.
    for (const [y, m, d] of [[1403, 1, 22], [1404, 1, 11], [1405, 1, 1], [1405, 6, 22]] as const) {
      const h = hijriDate(y, m, d);
      expect(h.day).toBe(1);
      expect(h.estimated).toBe(false);
    }
  });

  it('estimates lunar dates for years without an official table', () => {
    const h = hijriDate(1407, 1, 1);
    expect(h.estimated).toBe(true);
    expect(h.year).toBe(1449);
    // Some lunar holiday still lands in each estimated year.
    let found = 0;
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 29; d++) if (titles(1407, m, d).includes('عاشورای حسینی')) found++;
    expect(found).toBe(1);
  });
});
