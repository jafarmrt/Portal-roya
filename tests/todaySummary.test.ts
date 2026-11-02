import { describe, expect, it } from 'vitest';
import { greetingFor, todaySummary } from '../src/components/dashboard/todaySummary';

const none = { dueNotes: 0, pendingAcks: 0, eventsToday: [], birthdaysToday: [] };

describe('the welcome line on the dashboard', () => {
  it('greets by the time of day', () => {
    expect(greetingFor(7)).toBe('صبح بخیر');
    expect(greetingFor(13)).toBe('ظهر بخیر');
    expect(greetingFor(17)).toBe('عصر بخیر');
    expect(greetingFor(22)).toBe('شب بخیر');
    expect(greetingFor(3)).toBe('شب بخیر');
  });

  it('says nothing when nothing is waiting', () => {
    expect(todaySummary(none)).toEqual([]);
  });

  it('puts circulars first and keeps to four parts', () => {
    const parts = todaySummary({
      dueNotes: 2,
      pendingAcks: 1,
      eventsToday: [{ title: 'جلسهٔ ماهانه', time: '10:00' }, { title: 'ناهار', time: '' }],
      birthdaysToday: ['ندا کریمی', 'علی رضایی'],
    });
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('۱ بخشنامه منتظر تأیید شما');
    expect(parts[1]).toBe('۲ برنامه در تقویم امروز');
    expect(parts[2]).toBe('۲ یادداشت برای امروز');
  });

  it('counts work handed over in one part, right after circulars', () => {
    expect(todaySummary({ ...none, tasksWaiting: 2 })).toEqual(['۲ کار ارجاعی منتظر پاسخ شما']);
    expect(todaySummary({ ...none, tasksDue: 1 })).toEqual(['۱ کار ارجاعی برای امروز']);
    const parts = todaySummary({
      ...none,
      pendingAcks: 1,
      tasksWaiting: 2,
      tasksDue: 1,
      dueNotes: 3,
      eventsToday: [{ title: 'جلسهٔ ماهانه', time: '' }],
      birthdaysToday: ['ندا کریمی'],
    });
    expect(parts).toEqual(['۱ بخشنامه منتظر تأیید شما', '۲ کار ارجاعی منتظر پاسخ و ۱ کار برای امروز', 'جلسهٔ ماهانه', '۳ یادداشت برای امروز']);
  });

  it('gives the time of a single event', () => {
    expect(todaySummary({ ...none, eventsToday: [{ title: 'جلسهٔ ماهانه', time: '10:00' }] })).toEqual(['جلسهٔ ماهانه ساعت ۱۰:۰۰']);
  });

  it('names one birthday and counts the rest', () => {
    expect(todaySummary({ ...none, birthdaysToday: ['ندا کریمی', 'علی رضایی'] })).toEqual(['تولد ندا کریمی و ۱ همکار دیگر 🎂']);
  });
});
