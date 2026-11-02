import { describe, expect, it } from 'vitest';
import { aboutHits, aboutSummary, aboutTopics } from '../src/lib/departmentAbout';

// Shaped like the HR page: a title, a greeting, an introduction, topics with lists and a table.
const HR = [
  '<h2>واحد منابع انسانی؛ همراه شما از روز اول</h2>',
  '<p>همکار گرامی، سلام 🌱</p>',
  '<p>واحد منابع انسانی جایی است که می‌توانید برای هر سؤال یا کاری که به شما مربوط است، به آن سر بزنید و ما کنار شما هستیم.</p>',
  '<h2>برای چه کارهایی به ما مراجعه کنید؟</h2>',
  '<h3>📄 قرارداد و پرونده پرسنلی</h3>',
  '<ul><li><p>عقد و تمدید قرارداد و پرسش دربارهٔ مفاد آن که می‌تواند جملهٔ بلندی باشد تا خلاصه نشود</p></li></ul>',
  '<h3>✉️ گواهی‌ها و نامه‌ها</h3>',
  '<ul><li><p>گواهی اشتغال به کار و سابقهٔ کار</p></li><li><p>نامهٔ کسر از حقوق و معرفی به بانک برای وام یا ضمانت</p></li></ul>',
  '<h3>🎁 رفاه و رویدادها</h3>',
  '<ul><li><p>تسهیلات و وام‌های رفاهی</p></li></ul>',
  '<table><tbody><tr><th><p>نام</p></th></tr><tr><td><p>مسئول گواهی اشتغال و نامه‌ها</p></td></tr></tbody></table>',
].join('');

describe('department page text', () => {
  it('summarises with the introduction, not the title, greeting or a list item', () => {
    expect(aboutSummary(HR)).toMatch(/^واحد منابع انسانی جایی است/);
    expect(aboutSummary('<ul><li><p>یک کار بسیار طولانی که در فهرست آمده و نباید خلاصهٔ کارت باشد</p></li></ul>')).toMatch(/^یک کار/);
    expect(aboutSummary('<p>کوتاه</p>')).toBe('کوتاه');
    expect(aboutSummary('')).toBe('');
    const long = aboutSummary(`<p>${'کلمه '.repeat(100)}</p>`, 50);
    expect(long.length).toBeLessThanOrEqual(51);
    expect(long.endsWith('…')).toBe(true);
  });

  it('lists the small headings as topics, or the big ones when there are none', () => {
    expect(aboutTopics(HR)).toEqual(['📄 قرارداد و پرونده پرسنلی', '✉️ گواهی‌ها و نامه‌ها', '🎁 رفاه و رویدادها']);
    expect(aboutTopics('<h2>الف</h2><p>x</p><h2>ب</h2>')).toEqual(['الف', 'ب']);
    expect(aboutTopics('<p>بدون عنوان</p>')).toEqual([]);
  });

  it('finds the lines a search is about, with the topic above each', () => {
    expect(aboutHits(HR, 'وام')).toEqual([
      { text: 'نامهٔ کسر از حقوق و معرفی به بانک برای وام یا ضمانت', topic: '✉️ گواهی‌ها و نامه‌ها' },
      { text: 'تسهیلات و وام‌های رفاهی', topic: '🎁 رفاه و رویدادها' },
    ]);
    // Arabic «ي» in the query still matches; each line is listed once.
    expect(aboutHits(HR, 'گواهي اشتغال', 5).map((h) => h.text)).toEqual(['گواهی اشتغال به کار و سابقهٔ کار', 'مسئول گواهی اشتغال و نامه‌ها']);
    expect(aboutHits(HR, 'کار', 2)).toHaveLength(2);
    expect(aboutHits(HR, 'و')).toEqual([]);
    expect(aboutHits(HR, 'x')).toEqual([]);
  });
});
