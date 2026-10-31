import { describe, expect, it } from 'vitest';
import { dayGroup, groupByDay, plainTitle } from '../src/components/notifications/notificationList';

describe('the notifications page', () => {
  it('drops an emoji that only repeats the icon', () => {
    expect(plainTitle('نظرسنجی جدید 🗳️')).toBe('نظرسنجی جدید');
    expect(plainTitle('جلسه در تقویم 📅')).toBe('جلسه در تقویم');
    expect(plainTitle('دوره آموزشی جدید 🎓')).toBe('دوره آموزشی جدید');
    expect(plainTitle('بدون ایموجی')).toBe('بدون ایموجی');
  });

  it('keeps the warm ones', () => {
    expect(plainTitle('تولدتان مبارک! 🎉')).toBe('تولدتان مبارک! 🎉');
    expect(plainTitle('امروز تولد همکارمان است 🎂')).toBe('امروز تولد همکارمان است 🎂');
  });

  it('puts each notification under its day', () => {
    const now = new Date(2026, 9, 31, 9, 0);
    expect(dayGroup(new Date(2026, 9, 31, 0, 5).toISOString(), now)).toBe('today');
    expect(dayGroup(new Date(2026, 9, 30, 23, 50).toISOString(), now)).toBe('yesterday');
    expect(dayGroup(new Date(2026, 9, 26, 12, 0).toISOString(), now)).toBe('week');
    expect(dayGroup(new Date(2026, 9, 20, 12, 0).toISOString(), now)).toBe('older');
  });

  it('keeps the order and leaves out empty days', () => {
    const now = new Date(2026, 9, 31, 9, 0);
    const list = [
      { id: 'a', date: new Date(2026, 9, 31, 8, 0).toISOString() },
      { id: 'b', date: new Date(2026, 9, 31, 7, 0).toISOString() },
      { id: 'c', date: new Date(2026, 9, 10, 7, 0).toISOString() },
    ];
    const groups = groupByDay(list, now);
    expect(groups.map((g) => g.label)).toEqual(['امروز', 'قبل‌تر']);
    expect(groups[0].items.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
