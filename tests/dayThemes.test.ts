import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db/index';
import { dayTheme } from '../shared/dayThemes';
import { hijriDate, type Occasion, occasionsFor, occasionTone } from '../shared/occasions';
import { app, createEmployee, resetDatabase, setupAdmin } from './helpers';

const themeOn = (jy: number, jm: number, jd: number, foundingDay = false) =>
  dayTheme({ month: jm, day: jd, occasions: occasionsFor(jy, jm, jd), officialLunar: !hijriDate(jy, jm, jd).estimated, foundingDay });

const occasion = (title: string, holiday: boolean, kind: Occasion['kind'] = 'lunar'): Occasion => ({ title, holiday, kind, tone: occasionTone(title) });

describe('the look of the dashboard on special days', () => {
  it('tells festive days from days of mourning', () => {
    expect(occasionTone('عید نوروز')).toBe('joy');
    expect(occasionTone('ولادت امام علی (ع) و روز پدر')).toBe('joy');
    expect(occasionTone('شب یلدا')).toBe('joy');
    expect(occasionTone('عاشورای حسینی')).toBe('mourning');
    expect(occasionTone('رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)')).toBe('mourning');
    expect(occasionTone('شب قدر')).toBe('mourning');
    expect(occasionTone('روز معلم')).toBe('normal');
    expect(occasionTone('قیام ۱۵ خرداد')).toBe('normal');
  });

  it('marks Nowruz, the first day of each season and Yalda', () => {
    expect(themeOn(1405, 1, 1)).toMatchObject({ key: 'nowruz', effect: 'blossoms', tone: 'joy' });
    expect(themeOn(1405, 1, 13)).toMatchObject({ key: 'sizdah' });
    expect(themeOn(1405, 4, 1)).toMatchObject({ key: 'summer', effect: 'summer' });
    expect(themeOn(1405, 7, 1)).toMatchObject({ key: 'autumn', effect: 'leaves' });
    expect(themeOn(1405, 9, 30)).toMatchObject({ key: 'yalda', effect: 'yalda' });
    expect(themeOn(1405, 10, 1)).toMatchObject({ key: 'winter', effect: 'snow' });
    expect(themeOn(1405, 8, 7)).toBeNull();
  });

  it('celebrates the festive official holidays and the founding day', () => {
    expect(themeOn(1405, 10, 2)).toMatchObject({ key: 'feast', title: 'ولادت امام علی (ع) و روز پدر مبارک', effect: 'lights' });
    expect(themeOn(1405, 12, 20)).toMatchObject({ key: 'feast', title: 'عید سعید فطر مبارک' });
    // An ordinary day of the year that is not a holiday has no theme.
    expect(themeOn(1405, 2, 12)).toBeNull();
    expect(themeOn(1405, 8, 7, true)).toMatchObject({ key: 'founding', effect: 'confetti' });
  });

  it('keeps every festive effect away on days of mourning', () => {
    expect(themeOn(1405, 4, 4)).toMatchObject({ key: 'mourning', title: 'عاشورای حسینی', tone: 'mourning', effect: null });
    // Mourning wins over the founding day too.
    expect(themeOn(1405, 4, 3, true)).toMatchObject({ key: 'mourning', effect: null });
    // A first day of a season on a day of mourning that is not a holiday keeps its banner but has no effect.
    const autumn = dayTheme({ month: 7, day: 1, occasions: [occasion('وفات حضرت معصومه (س)', false)], officialLunar: true, foundingDay: false });
    expect(autumn).toMatchObject({ key: 'autumn', effect: null });
  });

  it('does not trust estimated lunar dates with a festive look, but still respects a possible day of mourning', () => {
    const feast = [occasion('عید سعید غدیر خم', true)];
    expect(dayTheme({ month: 8, day: 10, occasions: feast, officialLunar: false, foundingDay: false })).toBeNull();
    expect(dayTheme({ month: 8, day: 10, occasions: feast, officialLunar: true, foundingDay: false })).toMatchObject({ key: 'feast' });
    const ashura = [occasion('عاشورای حسینی', true)];
    expect(dayTheme({ month: 10, day: 1, occasions: ashura, officialLunar: false, foundingDay: false })).toMatchObject({ key: 'winter', effect: null });
  });

  it('follows a day an admin entered on the calendar page', () => {
    const custom = [occasion('سوگواری ملی', true, 'solar')];
    expect(dayTheme({ month: 8, day: 10, occasions: custom, officialLunar: true, foundingDay: false })).toMatchObject({ key: 'mourning' });
  });
});

describe('the personal switch for the effect', () => {
  let colleague: Awaited<ReturnType<typeof createEmployee>>;

  beforeAll(async () => {
    await resetDatabase();
    const admin = await setupAdmin();
    colleague = await createEmployee(admin, { username: 'theme.colleague' });
  });
  afterAll(() => pool.end());

  it('is on until the colleague switches it off, and stays off', async () => {
    expect((await colleague.agent.get('/api/settings').expect(200)).body.occasionEffects).toBe(true);
    const off = (await colleague.agent.put('/api/settings/occasion-effects').send({ on: false }).expect(200)).body;
    expect(off.occasionEffects).toBe(false);
    expect((await colleague.agent.get('/api/settings').expect(200)).body.occasionEffects).toBe(false);
    await colleague.agent.put('/api/settings/occasion-effects').send({ on: 'yes' }).expect(400);
    await colleague.agent.put('/api/settings/occasion-effects').send({ on: true }).expect(200);
    expect((await colleague.agent.get('/api/settings').expect(200)).body.occasionEffects).toBe(true);
  });

  it('is always on for guests, who cannot change it', async () => {
    expect((await request(app).get('/api/settings').expect(200)).body.occasionEffects).toBe(true);
    await request(app).put('/api/settings/occasion-effects').send({ on: false }).expect(401);
  });
});
