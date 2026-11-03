import { mkdirSync } from 'node:fs';
import moment from 'moment-jalaali';
import type { EventView } from '../src/components/event/types';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

// A whole Yalda night, played by a dozen colleagues from the first draft to the memories page, with a
// picture at every step for the guide of the events section. It is not part of the usual run: it builds
// its own users and an active event, so run it alone (GUIDE=1 npx playwright test e2e/guide-yalda.spec.ts).
test.skip(!process.env.GUIDE, 'Only for making the guide: GUIDE=1');
test.use({ actionTimeout: 15_000 });

const DIR = process.env.GUIDE_DIR ?? 'e2e/.guide';
const BASE = 'http://127.0.0.1:4173';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };
const TV = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const COMMON = { baseURL: BASE, locale: 'fa-IR', timezoneId: 'Asia/Tehran' };

const day = (offset: number) => moment().utcOffset(210).add(offset, 'days').format('jYYYY/jMM/jDD');
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

interface Person {
  id: string;
  username: string;
  name: string;
  api: APIRequestContext;
  state: string;
}

async function ok<T = unknown>(res: Awaited<ReturnType<APIRequestContext['post']>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return (res.status() === 204 ? null : res.json()) as Promise<T>;
}

async function shot(target: Page | Locator, name: string) {
  const page = 'page' in target && typeof target.page === 'function' ? target.page() : (target as Page);
  // Pop-up notes would cover what the picture is about.
  await page.addStyleTag({ content: '.portal-toaster{display:none!important}' });
  await page.waitForTimeout(400);
  await target.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' });
}

/** Elements wider than a phone's screen (they make the phone zoom the whole page out). */
async function overflow(page: Page, where: string) {
  const wide = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1); })
      .slice(0, 8)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 80)} [${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}] «${(el.textContent ?? '').slice(0, 40)}»`);
  });
  if (wide.length) console.log(`OVERFLOW at ${where}:\n  ${wide.join('\n  ')}`);
  // Nothing may make the page itself wider than the phone (decorations and scrolling rows are clipped).
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), where).toBe(0);
}

/** A square picture drawn in the browser: an emoji on a soft background (childhood photos, jury photos). */
async function picture(page: Page, emoji: string, bg: string) {
  const data = await page.evaluate(([e, b]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const g = c.getContext('2d')!;
    g.fillStyle = b;
    g.fillRect(0, 0, 400, 400);
    g.font = '240px "Noto Color Emoji"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(e, 200, 220);
    return c.toDataURL('image/png');
  }, [emoji, bg]);
  return Buffer.from(data.split(',')[1], 'base64');
}

async function upload(api: APIRequestContext, buffer: Buffer, name: string) {
  const res = await ok<{ url: string }>(await api.post('/api/uploads', { multipart: { file: { name, mimeType: 'image/png', buffer } } }));
  return res.url;
}

test('guide: a whole Yalda night with screenshots', async ({ browser, playwright }) => {
  test.setTimeout(15 * 60_000);
  mkdirSync(DIR, { recursive: true });
  const admin = await playwright.request.newContext({ baseURL: BASE, storageState: 'e2e/.auth/admin.json' });
  await ok(await admin.put('/api/settings', { data: { departments: ['فناوری اطلاعات', 'فروش', 'تولید', 'منابع انسانی', 'مالی'] } }));

  // ── The colleagues ──
  const people: Record<string, Person> = {};
  const add = async (username: string, firstName: string, lastName: string, department: string, position: string) => {
    const created = await ok<{ employee: { id: string }; temporaryPassword: string }>(
      await admin.post('/api/employees', { data: { username, firstName, lastName, position, department, role: 'employee' } }),
    );
    const api = await playwright.request.newContext({ baseURL: BASE });
    await ok(await api.post('/api/auth/login', { data: { username, password: created.temporaryPassword } }));
    await ok(await api.post('/api/auth/change-password', { data: { currentPassword: created.temporaryPassword, newPassword: `${username}-Pass-123` } }));
    const state = `e2e/.auth/guide-${username}.json`;
    await api.storageState({ path: state });
    people[username] = { id: created.employee.id, username, name: `${firstName} ${lastName}`, api, state };
  };
  await add('negar', 'نگار', 'رضایی', 'منابع انسانی', 'کارشناس منابع انسانی');
  await add('ali', 'علی', 'کریمی', 'مالی', 'مدیر مالی');
  await add('maryam', 'مریم', 'حسینی', 'تولید', 'سرپرست تولید');
  await add('reza', 'رضا', 'محمدی', 'فناوری اطلاعات', 'کارشناس شبکه');
  await add('amir', 'امیر', 'نوری', 'فروش', 'کارشناس فروش');
  await add('zahra', 'زهرا', 'کاظمی', 'مالی', 'حسابدار');
  await add('hossein', 'حسین', 'موسوی', 'تولید', 'تکنسین');
  await add('leila', 'لیلا', 'صادقی', 'فروش', 'کارشناس بازاریابی');
  await add('mehdi', 'مهدی', 'جعفری', 'فناوری اطلاعات', 'برنامه‌نویس');
  await add('nima', 'نیما', 'رستمی', 'تولید', 'اپراتور');
  await add('parisa', 'پریسا', 'یزدانی', 'منابع انسانی', 'کارشناس آموزش');
  const saraApi = await playwright.request.newContext({ baseURL: BASE, storageState: 'e2e/.auth/employee.json' });
  const saraMe = await ok<{ user: { id: string } }>(await saraApi.get('/api/auth/me'));
  people.sara = { id: saraMe.user.id, username: 'sara', name: 'سارا احمدی', api: saraApi, state: 'e2e/.auth/employee.json' };
  const P = people;
  const players = ['sara', 'amir', 'zahra', 'hossein', 'leila', 'mehdi', 'nima', 'parisa'];

  const open = async (b: Browser, state: string, kind: typeof PHONE | typeof DESK) => {
    const ctx: BrowserContext = await b.newContext({ ...COMMON, ...kind, storageState: state });
    const page = await ctx.newPage();
    page.on('dialog', (d) => void d.accept());
    return page;
  };
  const current = async (api: APIRequestContext = admin) => ok<EventView>(await api.get('/api/special_events/current'));

  // ══ 1. The portal admin makes the draft ══
  const boss = await open(browser, 'e2e/.auth/admin.json', DESK);
  await boss.goto('/#event');
  await expect(boss.getByRole('heading', { name: 'رویداد ویژهٔ تازه' })).toBeVisible();
  await boss.getByLabel('محل برنامه').fill('سالن اجتماعات، طبقهٔ پنجم');
  await boss.getByLabel(/چند خط دربارهٔ برنامه/).fill('بلندترین شب سال را کنار هم جشن می‌گیریم: مسابقه، فال حافظ، آش و انار و کلی خنده. از همین امروز ثبت‌نام کنید!');
  await shot(boss, '01-admin-create-form');
  await boss.getByRole('button', { name: 'ساختن پیش‌نویس' }).click();
  await expect(boss.getByText('پیش‌نویس؛ همکاران هنوز نمی‌بینند')).toBeVisible();
  await shot(boss, '02-admin-draft');

  let view = await current();
  const ev = view.event.id as string;
  const adminId = view.event.organizerIds[0] as string;

  // Organizers and the jury, with a photo for each juror.
  const juryPhotos: Record<string, string> = {};
  for (const [u, emoji, bg] of [['ali', '🧔', '#fde68a'], ['maryam', '👩', '#fbcfe8'], ['reza', '👨‍💻', '#bfdbfe']] as const) {
    juryPhotos[P[u].id] = await upload(admin, await picture(boss, emoji, bg), `${u}.png`);
  }
  await ok(await admin.patch(`/api/special_events/${ev}`, {
    data: { organizerIds: [adminId, P.negar.id], juryIds: [P.ali.id, P.maryam.id, P.reza.id], juryHeadId: P.ali.id, juryPhotos },
  }));
  await boss.reload();
  await boss.getByRole('tab', { name: 'تنظیمات' }).click();
  await expect(boss.getByText('علی کریمی').first()).toBeVisible();
  await shot(boss, '03-admin-settings');
  await shot(boss.locator('section', { has: boss.getByRole('heading', { name: 'برگزارکنندگان' }) }).last(), '03c-admin-organizers');
  await shot(boss.locator('section', { has: boss.getByRole('heading', { name: /هیئت داوران/ }) }).last(), '03d-admin-jury');
  await boss.screenshot({ path: `${DIR}/03b-admin-settings-full.png`, fullPage: true });

  // ══ 2. The organizer sets up the competitions and the night ══
  const org = await open(browser, P.negar.state, DESK);
  await org.goto('/#event');
  await expect(org.getByRole('heading', { name: 'الان چه کنم؟' })).toBeVisible();
  await org.getByRole('button', { name: 'مسابقهٔ تازه' }).click();
  const form = org.getByRole('dialog', { name: 'مسابقهٔ تازه' });
  await form.getByLabel('نام مسابقه').fill('فیفا');
  await shot(form, '04-org-competition-form');
  await org.keyboard.press('Escape');
  await expect(form).toBeHidden();

  await ok(await P.negar.api.post(`/api/special_events/${ev}/competitions`, {
    data: {
      title: 'فیفا', icon: '⚽', rules: 'هر بازی ۶ دقیقه؛ اگر مساوی شد پنالتی. بازی‌های روز در اتاق VIP، فینال روی صحنه.',
      kind: 'individual', capacity: 8, scoring: 'goals', tieRule: 'penalties', thirdPlace: false, stagePolicy: 'final', format: 'knockout',
      dayPlace: 'اتاق VIP', dayStart: '10:00', slotMinutes: 20,
    },
  }));
  await ok(await P.negar.api.post(`/api/special_events/${ev}/competitions`, {
    data: {
      title: 'پانتومیم', icon: '🎭', rules: 'هر تیم ۲ دقیقه وقت دارد کلمه‌ها را بی‌صدا نشان دهد؛ هر کلمه‌ای که هم‌تیمی‌ها حدس بزنند یک امتیاز.',
      kind: 'team', teamMin: 2, teamMax: 3, capacity: 4, scoring: 'points', tieRule: 'organizer', stagePolicy: 'all', format: 'ranking', rankBy: 'high',
      words: ['کرسی', 'انار', 'هندوانه', 'فال حافظ', 'آجیل', 'شب چله', 'مادربزرگ', 'قصه‌گویی', 'برف', 'لبو'],
    },
  }));
  view = await current(P.negar.api);
  const fifaId = view.competitions.find((c) => c.title === 'فیفا')!.id as string;
  const pantoId = view.competitions.find((c) => c.title === 'پانتومیم')!.id as string;

  // «انتخاب‌های یلدا»
  for (const a of [
    { title: 'خوش‌تیپ‌ترین', icon: '🕴️', description: 'همکاری که همیشه مرتب و شیک است.' },
    { title: 'همیشه پایه', icon: '🙌', description: 'همکاری که در هر برنامه‌ای اول از همه می‌گوید «من هستم».' },
  ]) await ok(await P.negar.api.post(`/api/special_events/${ev}/awards`, { data: a }));

  // The night: schedule, the quiz everyone answers, «چند دانه؟».
  await ok(await P.negar.api.put(`/api/special_events/${ev}/schedule`, {
    data: { items: [
      { time: '15:00', title: 'خوش‌آمد و چای و آجیل' },
      { time: '15:30', title: 'فینال فیفا روی صحنه' },
      { time: '16:00', title: 'پانتومیم تیمی' },
      { time: '16:45', title: 'مسابقهٔ همه با گوشی' },
      { time: '17:15', title: 'این بچه کیه؟ و فال حافظ' },
      { time: '17:45', title: 'اعلام انتخاب‌های یلدا' },
      { time: '18:00', title: 'گردونهٔ شانس و شام' },
    ] },
  }));
  await ok(await P.negar.api.put(`/api/special_events/${ev}/quiz_questions`, {
    data: { questions: [
      { text: 'شب یلدا بین کدام دو ماه است؟', options: ['آذر و دی', 'آبان و آذر', 'دی و بهمن', 'مهر و آبان'], correct: 0, seconds: 20 },
      { text: 'کدام میوه نماد شب یلداست؟', options: ['سیب', 'انار', 'پرتقال', 'موز'], correct: 1, seconds: 15 },
      { text: 'دیوان حافظ چند غزل دارد (نزدیک‌ترین)؟', options: ['۱۰۰', '۲۵۰', '۵۰۰', '۱۰۰۰'], correct: 2, seconds: 20 },
    ] },
  }));
  await ok(await P.negar.api.put(`/api/special_events/${ev}/guess_question`, { data: { question: 'انار روی میز چند دانه دارد؟' } }));

  await org.reload();
  await expect(org.getByRole('heading', { name: 'فیفا' })).toBeVisible();
  await shot(org, '05-org-competitions');
  await org.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  await org.screenshot({ path: `${DIR}/06-org-desk-before.png`, fullPage: true });

  // The rehearsal: the page as it will look on the night, without anyone else seeing it.
  await boss.reload();
  await boss.getByRole('tab', { name: 'تنظیمات' }).click();
  await boss.getByLabel('امتحان صفحه در مرحلهٔ').selectOption('live');
  await boss.getByRole('tab', { name: 'مسابقه‌ها' }).click();
  await shot(boss, '07-admin-rehearsal-live');
  await boss.getByRole('tab', { name: 'تنظیمات' }).click();
  await boss.getByLabel('امتحان صفحه در مرحلهٔ').selectOption('');

  // Switched on for everyone.
  await shot(boss.getByRole('button', { name: 'فعال کن' }).locator('xpath=ancestor::section[1]'), '08-admin-activate');
  await boss.getByRole('button', { name: 'فعال کن' }).click();
  await expect(boss.getByText('پیش‌نویس؛ همکاران هنوز نمی‌بینند')).toBeHidden();
  await shot(boss, '09-admin-active');

  // ══ 3. Signup days: colleagues on their phones ══
  const sara = await open(browser, P.sara.state, PHONE);
  await sara.goto('/');
  await sara.waitForTimeout(1500);
  await shot(sara, '10-phone-dashboard');
  await sara.goto('/#event');
  await expect(sara.getByRole('heading', { name: 'فیفا' })).toBeVisible();
  await shot(sara, '11-phone-event-top');
  const fifaCard = sara.locator('article', { has: sara.getByRole('heading', { name: 'فیفا' }) });
  await fifaCard.scrollIntoViewIfNeeded();
  await shot(fifaCard, '12-phone-fifa-card');
  await fifaCard.getByRole('button', { name: 'ثبت‌نام می‌کنم' }).click();
  await expect(fifaCard.getByText('شما ثبت‌نام کرده‌اید')).toBeVisible();
  await shot(fifaCard, '13-phone-fifa-signed');
  for (const u of players.filter((x) => x !== 'sara')) {
    await ok(await P[u].api.post(`/api/event_competitions/${fifaId}/entries`, { data: {} }));
  }

  // A team for the pantomime.
  const hossein = await open(browser, P.hossein.state, PHONE);
  await hossein.goto('/#event');
  const pantoCard = hossein.locator('article', { has: hossein.getByRole('heading', { name: 'پانتومیم' }) });
  await pantoCard.getByRole('button', { name: /ساختن تیم/ }).click();
  const teamModal = hossein.getByRole('dialog', { name: /ساختن تیم/ });
  await teamModal.getByLabel(/نام تیم/).fill('کرسی‌نشین‌ها');
  await shot(teamModal, '14-phone-team-modal');
  await hossein.keyboard.press('Escape');
  await ok(await P.hossein.api.post(`/api/event_competitions/${pantoId}/entries`, { data: { name: 'کرسی‌نشین‌ها', memberIds: [P.mehdi.id, P.sara.id] } }));
  await ok(await P.zahra.api.post(`/api/event_competitions/${pantoId}/entries`, { data: { name: 'انارهای خندان', memberIds: [P.leila.id, P.parisa.id] } }));
  await ok(await P.amir.api.post(`/api/event_competitions/${pantoId}/entries`, { data: { name: 'هندوانه‌ها', memberIds: [P.nima.id] } }));
  await hossein.reload();
  await pantoCard.scrollIntoViewIfNeeded();
  await shot(pantoCard, '15-phone-panto-teams');
  await hossein.context().close();

  // «انتخاب‌های یلدا»: Sara nominates on her phone; others too.
  view = await current(P.sara.api);
  const handsome = view.awards.find((a) => a.title === 'خوش‌تیپ‌ترین')!.id as string;
  const always = view.awards.find((a) => a.title === 'همیشه پایه')!.id as string;
  await sara.reload();
  const award = sara.getByRole('article', { name: 'خوش‌تیپ‌ترین' });
  await award.scrollIntoViewIfNeeded();
  await award.getByRole('button', { name: 'معرفی نامزد' }).click();
  const nominate = sara.getByRole('dialog', { name: /خوش‌تیپ‌ترین/ });
  await nominate.getByLabel(/همکار/).fill('امیر');
  await nominate.getByRole('button', { name: /امیر نوری/ }).click();
  await nominate.getByLabel(/یک جمله برای داوران/).fill('همیشه کت‌وشلوار و لبخند');
  await shot(nominate, '16-phone-nominate');
  await nominate.getByRole('button', { name: 'ثبت معرفی' }).click();
  await expect(award).toContainText('معرفی شما: امیر نوری');
  await shot(sara.locator('#event-awards'), '17-phone-awards');
  const nominations: [string, string, string, string][] = [
    ['zahra', handsome, 'amir', 'خوش‌پوش‌ترین همکار فروش'],
    ['leila', handsome, 'mehdi', 'همیشه اتوکشیده'],
    ['nima', handsome, 'amir', 'کراواتش حرف ندارد'],
    ['parisa', handsome, 'hossein', 'لباس کارش هم شیک است'],
    ['mehdi', handsome, 'leila', 'سلیقه‌اش عالی است'],
    ['amir', always, 'parisa', 'برای هر برنامه‌ای اول داوطلب می‌شود'],
    ['sara', always, 'parisa', 'همیشه پایه'],
    ['hossein', always, 'zahra', 'از کوه تا فوتبال هست'],
    ['nima', always, 'hossein', 'هیچ وقت نه نمی‌گوید'],
    ['leila', always, 'zahra', 'انرژی تیم'],
    ['mehdi', always, 'nima', 'همیشه حاضر'],
  ];
  for (const [by, awardId, nominee, reason] of nominations) {
    await ok(await P[by].api.put(`/api/event_awards/${awardId}/nomination`, { data: { nomineeId: P[nominee].id, reason } }));
  }

  // The fun tab: fal, a wish, a childhood photo, a song, an idea.
  await sara.getByRole('tab', { name: 'فال، آرزو، آهنگ' }).click();
  const fal = sara.getByRole('region', { name: 'فال حافظ' });
  await fal.getByRole('button', { name: 'نیت کردم، فال بگیر' }).click();
  await expect(fal.getByRole('button', { name: 'نیت کردم، فال بگیر' })).toBeHidden();
  await sara.waitForTimeout(800);
  await shot(fal, '18-phone-fal');
  const wishes = sara.locator('#event-wishes');
  await wishes.getByLabel('آرزوی شما').fill('سالی پر از سلامتی و خنده برای همهٔ همکاران');
  await wishes.getByRole('button', { name: 'ثبت آرزو' }).click();
  await expect(wishes).toContainText('سالی پر از سلامتی');
  await shot(wishes, '19-phone-wish');
  const kid = sara.locator('#event-kid');
  await kid.locator('input[type=file]').setInputFiles({ name: 'kid.png', mimeType: 'image/png', buffer: await picture(sara, '👧', '#fecdd3') });
  await expect(kid).toContainText('عکس شما رسیده');
  await shot(kid, '20-phone-kid-photo');
  await sara.getByLabel('نام آهنگ').fill('شب یلدا');
  await sara.getByLabel('خواننده').fill('ابی');
  await sara.getByRole('button', { name: 'پیشنهاد آهنگ' }).click();
  await expect(sara.getByRole('list', { name: /فهرست آهنگ‌ها/ })).toContainText('شب یلدا');

  for (const [u, text, anonymous] of [
    ['amir', 'امسال همه به آرزوهایشان برسند', false],
    ['zahra', 'سلامتی خانواده‌ها', true],
    ['leila', 'سالی پر از فروش و موفقیت برای رویا', false],
    ['mehdi', 'کمتر باگ، بیشتر خنده 😄', false],
    ['nima', 'برف بیاید و جادهٔ شمال باز باشد', false],
  ] as const) await ok(await P[u].api.post(`/api/special_events/${ev}/wishes`, { data: { text, anonymous } }));
  for (const [u, emoji, bg] of [['amir', '👦', '#bae6fd'], ['zahra', '👶', '#fef3c7'], ['mehdi', '🧒', '#d9f99d'], ['leila', '👧', '#e9d5ff']] as const) {
    const url = await upload(P[u].api, await picture(sara, emoji, bg), `${u}-kid.png`);
    await ok(await P[u].api.put(`/api/special_events/${ev}/kid_photo`, { data: { url } }));
  }
  view = await current(P.amir.api);
  const song1 = view.songs[0]?.id;
  await ok(await P.amir.api.post(`/api/special_events/${ev}/songs`, { data: { title: 'گل سنگم', artist: 'بنان' } }));
  await ok(await P.zahra.api.post(`/api/special_events/${ev}/songs`, { data: { title: 'یلدا', artist: 'همایون شجریان' } }));
  view = await current(P.leila.api);
  for (const u of ['leila', 'nima', 'parisa', 'mehdi']) for (const s of view.songs.slice(0, u === 'mehdi' ? 1 : 2)) await P[u].api.put(`/api/event_songs/${s.id}/vote`, { data: { on: true } }).catch(() => null);
  void song1;
  await ok(await P.parisa.api.post(`/api/special_events/${ev}/ideas`, { data: { kind: 'food', text: 'آش رشته و لبو برای همه', anonymous: false } })).catch(() => null);
  await ok(await P.mehdi.api.post(`/api/special_events/${ev}/ideas`, { data: { kind: 'show', text: 'یک دور شاهنامه‌خوانی کوتاه', anonymous: true } })).catch(() => null);
  await sara.reload();
  await sara.getByRole('tab', { name: 'فال، آرزو، آهنگ' }).click();
  await sara.screenshot({ path: `${DIR}/21-phone-fun-full.png`, fullPage: true });

  // «چند دانه؟»
  for (const [u, value] of [['sara', 540], ['amir', 612], ['zahra', 480], ['hossein', 700], ['leila', 590], ['mehdi', 655], ['nima', 400], ['parisa', 620]] as const) {
    await ok(await P[u].api.put(`/api/special_events/${ev}/guess`, { data: { value } }));
  }
  await sara.getByRole('tab', { name: 'مسابقه‌ها' }).click();
  const guess = sara.locator('#event-guess');
  await guess.scrollIntoViewIfNeeded();
  await shot(guess, '22-phone-guess');

  // ══ 4. The organizer's desk during signup: wishes to approve, the shortlist ══
  await org.reload();
  await org.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  await org.screenshot({ path: `${DIR}/23-org-desk-signup.png`, fullPage: true });
  const moderation = org.locator('section', { has: org.getByRole('heading', { name: /آرزوهای یلدا/ }) });
  await moderation.scrollIntoViewIfNeeded();
  await shot(moderation, '23b-org-wishes-moderation');
  view = await current(P.negar.api);
  for (const w of view.wishes.waiting) {
    await ok(await P.negar.api.patch(`/api/event_wishes/${w.id}`, { data: { status: w.text.includes('باگ') ? 'hidden' : 'approved' } }));
  }
  await ok(await P.negar.api.post(`/api/special_events/${ev}/awards/shortlist`));
  await ok(await P.negar.api.post(`/api/special_events/${ev}/awards/publish`));
  await org.reload();
  await org.getByRole('tab', { name: 'مسابقه‌ها' }).click();
  const orgAwards = org.locator('#event-awards');
  await orgAwards.scrollIntoViewIfNeeded();
  await shot(orgAwards, '24-org-awards-shortlist');

  // The jury votes in secret.
  const juror = await open(browser, P.ali.state, DESK);
  await juror.goto('/#event');
  await expect(juror.getByRole('heading', { name: 'الان چه کنم؟' })).toBeVisible();
  await shot(juror, '25-jury-page');
  const jAward = juror.getByRole('article', { name: 'خوش‌تیپ‌ترین' });
  await jAward.scrollIntoViewIfNeeded();
  await shot(jAward, '26-jury-vote-before');
  for (const [u, a, n] of [['ali', handsome, 'amir'], ['maryam', handsome, 'amir'], ['reza', handsome, 'mehdi'], ['ali', always, 'parisa'], ['maryam', always, 'zahra'], ['reza', always, 'parisa']] as const) {
    await ok(await P[u].api.put(`/api/event_awards/${a}/vote`, { data: { nomineeId: P[n].id } }));
  }
  await juror.reload();
  await jAward.scrollIntoViewIfNeeded();
  await shot(jAward, '27-jury-vote-after');

  // ══ 5. Bracket days: the draw, the bracket on the phone, a prediction ══
  await ok(await admin.patch(`/api/special_events/${ev}`, { data: { signupEnd: day(-1), programDate: day(1), programTime: '15:00', showUntil: day(4) } }));
  await org.reload();
  await org.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  for (const title of ['فیفا', 'پانتومیم']) {
    const controls = org.locator('li', { has: org.getByText(title, { exact: true }) }).first();
    const drawBtn = controls.getByRole('button', { name: 'قرعه‌کشی' });
    if (await drawBtn.isVisible().catch(() => false)) await drawBtn.click();
    await expect(controls.getByRole('button', { name: 'انتشار جدول' })).toBeVisible();
    if (title === 'فیفا') await shot(org, '28-org-draw');
    await controls.getByRole('button', { name: 'انتشار جدول' }).click();
    await expect(controls.getByText('جدول منتشر شده')).toBeVisible();
  }
  await org.screenshot({ path: `${DIR}/29-org-desk-published.png`, fullPage: true });

  await sara.reload();
  await sara.getByRole('tab', { name: 'مسابقه‌ها' }).click();
  await fifaCard.scrollIntoViewIfNeeded();
  await shot(fifaCard, '30-phone-bracket');
  const predict = sara.locator('#event-predict');
  if (await predict.count()) {
    await predict.scrollIntoViewIfNeeded();
    await shot(predict, '31-phone-predict');
  }
  view = await current(P.negar.api);
  const fifaView = () => view.competitions.find((c) => c.id === fifaId)!;
  // Everyone guesses the final's winner of every first-round match.
  for (const m of fifaView().matches.filter((x) => x.round === 1 && !x.bye)) {
    for (const u of ['zahra', 'leila', 'parisa', 'maryam'].filter((x) => P[x])) {
      await P[u].api.put(`/api/event_matches/${m.id}/prediction`, { data: { pick: Math.random() < 0.5 ? m.entryA : m.entryB } }).catch(() => null);
    }
  }

  // Quarter finals during the day in the VIP room: the organizer records them.
  const firstRound = fifaView().matches.filter((x) => x.round === 1 && !x.bye);
  const scores = [[3, 1], [2, 2, 4, 3], [1, 0], [0, 2]];
  for (const [i, m] of firstRound.entries()) {
    if (i === 0) continue;
    const [a, b, ta, tb] = scores[i];
    await ok(await P.negar.api.post(`/api/event_matches/${m.id}/result`, { data: { scoreA: a, scoreB: b, ...(ta !== undefined ? { tieA: ta, tieB: tb } : {}) } }));
  }
  // The first one from the desk, to show the result window.
  await org.reload();
  await org.getByRole('tab', { name: 'مسابقه‌ها' }).click();
  const orgFifa = org.locator('article', { has: org.getByRole('heading', { name: 'فیفا' }) });
  await orgFifa.getByRole('button', { name: /ثبت یا اصلاح نتیجه/ }).first().click();
  const result = org.getByRole('dialog', { name: 'ثبت نتیجه' });
  await expect(result).toBeVisible();
  const plus = result.getByRole('button', { name: /یکی بیشتر/ });
  for (const n of [0, 0, 0, 1]) await plus.nth(n).click();
  await shot(result, '32-org-result-modal');
  await result.getByRole('button', { name: /^پایان بازی و ثبت/ }).click();
  await expect(result).toBeHidden();
  await shot(orgFifa, '33-org-fifa-after-round1');

  // A player who lost objects from her phone; the jury decides.
  view = await current(P.negar.api);
  const lostMatch = fifaView().matches.find((m) => m.round === 1 && m.done && !m.bye && m.winnerId)!;
  const loserEntry = lostMatch.winnerId === lostMatch.entryA ? lostMatch.entryB : lostMatch.entryA;
  const loserId = fifaView().entries.find((e) => e.id === loserEntry)!.members[0];
  const loserUser = Object.values(P).find((p) => p.id === loserId)!;
  const loser = await open(browser, loserUser.state, PHONE);
  await loser.goto('/#event');
  const lFifa = loser.locator('article', { has: loser.getByRole('heading', { name: 'فیفا' }) });
  await lFifa.getByRole('button', { name: /ثبت یا اصلاح نتیجه/ }).first().click();
  const objection = loser.getByRole('dialog', { name: 'اعتراض به نتیجه' });
  await objection.getByRole('textbox').fill('دستهٔ من وسط بازی قطع شد و گل دوم در همان لحظه خورد؛ لطفاً بررسی کنید.');
  await shot(loser, '34-phone-objection');
  await objection.getByRole('button', { name: 'فرستادن اعتراض' }).click();
  await expect(objection).toBeHidden();
  await loser.context().close();

  await juror.reload();
  await juror.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  const objections = juror.locator('#event-objections');
  await objections.getByPlaceholder(/پاسخ داوران/).fill('فیلم بازی را دیدیم؛ قطعی دسته بعد از گل بود. نتیجه درست است.');
  await objections.scrollIntoViewIfNeeded();
  await shot(objections, '35-jury-objection');
  await objections.getByRole('button', { name: 'رد' }).click();
  await expect(objections).toContainText('رد شد');
  await shot(objections, '36-jury-objection-decided');

  // ══ 6. The night ══
  await ok(await admin.patch(`/api/special_events/${ev}`, { data: { signupEnd: day(-2), programDate: day(0), programTime: '00:00', showUntil: day(3) } }));
  view = await current(P.negar.api);
  // Semi-finals were played in the afternoon.
  for (const m of fifaView().matches.filter((x) => x.round === 2)) {
    await ok(await P.negar.api.post(`/api/event_matches/${m.id}/result`, { data: { scoreA: 2, scoreB: 1 } }));
  }

  // The big screen in the hall, paired with a code from the remote on the organizer's phone.
  const tvCtx = await browser.newContext({ ...COMMON, ...TV, storageState: { cookies: [], origins: [] } });
  const tv = await tvCtx.newPage();
  await tv.goto('/#screen');
  const code = tv.getByText(/^[۰-۹]{4}$/);
  await expect(code).toBeVisible();
  await shot(tv, '40-tv-code');
  const remote = await open(browser, P.negar.state, PHONE);
  await remote.goto('/#event');
  await remote.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
  await remote.getByLabel('کد صفحهٔ بزرگ').fill(latin(await code.innerText()));
  const pairCard = remote.locator('section, form', { has: remote.getByLabel('کد صفحهٔ بزرگ') }).last();
  await pairCard.scrollIntoViewIfNeeded();
  await shot(pairCard, '41-remote-pair');
  await remote.getByRole('button', { name: 'وصل کن' }).click();
  await expect(tv.getByRole('heading', { name: /شب یلدا/ })).toBeVisible();
  await tv.waitForTimeout(1500);
  await shot(tv, '42-tv-welcome');
  await remote.getByText(/صفحهٔ بزرگ الان چه نشان دهد/).scrollIntoViewIfNeeded();
  await shot(remote, '43-remote-top');
  await overflow(remote, 'remote after pairing');
  await remote.screenshot({ path: `${DIR}/44-remote-full.png`, fullPage: true });

  const screen = async (data: Record<string, unknown>, name: string, wait = 1500) => {
    await ok(await P.negar.api.put(`/api/special_events/${ev}/screen`, { data }));
    await tv.waitForTimeout(wait);
    await shot(tv, name);
  };
  await screen({ scene: 'jury' }, '45-tv-jury');
  await screen({ scene: 'schedule' }, '46-tv-schedule');
  await screen({ scene: 'bracket', competitionId: fifaId }, '47-tv-bracket');

  // The final on stage, scored live from the remote.
  view = await current(P.negar.api);
  const final = fifaView().matches.find((m) => m.round === fifaView().rounds && !m.third)!;
  await screen({ scene: 'match', competitionId: fifaId, matchId: final.id }, '48-tv-final-start');
  await ok(await P.negar.api.post(`/api/event_matches/${final.id}/live`, { data: { scoreA: 2, scoreB: 1 } }));
  await ok(await P.negar.api.post(`/api/special_events/${ev}/screen/timer`, { data: { action: 'start', durationSec: 360 } }));
  await tv.waitForTimeout(2500);
  await shot(tv, '49-tv-final-live');
  await remote.reload();
  await remote.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
  await remote.waitForTimeout(800);
  await shot(remote, '50-remote-final');
  await overflow(remote, 'remote during the final');
  await remote.getByRole('button', { name: 'پایان بازی و ثبت نتیجه' }).scrollIntoViewIfNeeded();
  await remote.evaluate(() => window.scrollBy(0, 120));
  await shot(remote, '50b-remote-score');
  await ok(await P.negar.api.post(`/api/special_events/${ev}/screen/timer`, { data: { action: 'reset' } }));
  await ok(await P.negar.api.post(`/api/event_matches/${final.id}/result`, { data: { scoreA: 3, scoreB: 1 } }));
  await screen({ scene: 'champion', competitionId: fifaId }, '51-tv-champion', 2500);
  await screen({ scene: 'predictors' }, '52-tv-predictors');

  // The pantomime: each team on stage, a word card on the organizer's phone.
  view = await current(P.negar.api);
  const panto = view.competitions.find((c) => c.id === pantoId)!;
  await remote.reload();
  await remote.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
  await remote.getByLabel('مسابقه (برای جدول، بازی و قهرمان)').selectOption({ label: '🎭 پانتومیم' });
  const firstTeam = panto.entries.find((e) => e.id === panto.matches[0].entryA)!;
  await remote.getByRole('button', { name: new RegExp(firstTeam.name) }).first().click();
  const words = remote.getByLabel('کارت کلمه');
  await words.getByRole('button', { name: 'کلمهٔ بعدی' }).click();
  await words.scrollIntoViewIfNeeded();
  await shot(remote, '53-remote-word-card');
  await overflow(remote, 'remote word card');
  await tv.waitForTimeout(1200);
  await shot(tv, '54-tv-panto');
  const pantoScores = [6, 4, 5];
  view = await current(P.negar.api);
  for (const [i, m] of view.competitions.find((c) => c.id === pantoId)!.matches.entries()) {
    await ok(await P.negar.api.post(`/api/event_matches/${m.id}/result`, { data: { value: pantoScores[i] ?? 3, scoreA: pantoScores[i] ?? 3 } }));
  }
  await screen({ scene: 'bracket', competitionId: pantoId }, '55-tv-panto-ranking');

  // The quiz everyone answers on their phone.
  await ok(await P.negar.api.post(`/api/special_events/${ev}/quiz/next`));
  await tv.waitForTimeout(1500);
  await shot(tv, '56-tv-quiz');
  await sara.reload();
  await expect(sara.locator('#event-quiz')).toBeVisible();
  await shot(sara, '57-phone-quiz');
  view = await current(P.sara.api);
  const qid = view.quiz.current!.id;
  await sara.locator('#event-quiz').getByRole('button').filter({ hasText: 'آذر و دی' }).click();
  for (const [u, c] of [['amir', 0], ['zahra', 0], ['hossein', 1], ['leila', 0], ['mehdi', 2], ['nima', 0], ['parisa', 3]] as const) {
    await P[u].api.put(`/api/event_quiz/${qid}/answer`, { data: { choice: c } }).catch(() => null);
  }
  await ok(await P.negar.api.post(`/api/special_events/${ev}/quiz/reveal`));
  await tv.waitForTimeout(1500);
  await shot(tv, '58-tv-quiz-answer');
  await sara.waitForTimeout(1500);
  await shot(sara.locator('#event-quiz'), '59-phone-quiz-result');
  await screen({ scene: 'quizboard' }, '60-tv-quizboard');

  // «چند دانه؟» answered.
  await ok(await P.negar.api.post(`/api/special_events/${ev}/guess_reveal`, { data: { answer: 613 } }));
  await screen({ scene: 'guess' }, '61-tv-guess', 2500);

  // «این بچه کیه؟»
  view = await current(P.negar.api);
  const photoId = view.kid.photos.find((p) => p.employeeId === P.amir.id)!.id as string;
  await ok(await P.negar.api.post(`/api/event_kid_photos/${photoId}/show`));
  await tv.waitForTimeout(2000);
  await shot(tv, '62-tv-kid');
  await sara.reload();
  await expect(sara.locator('#event-kid-guess')).toBeVisible();
  await shot(sara.locator('#event-kid-guess'), '63-phone-kid-guess');
  view = await current(P.amir.api);
  const kidNow = view.kid.current!;
  await sara.locator('#event-kid-guess').getByRole('button', { name: 'امیر نوری' }).click().catch(() => null);
  for (const u of ['hossein', 'nima', 'parisa', 'zahra', 'leila']) {
    await P[u].api.put(`/api/event_kid_photos/${kidNow.id}/guess`, { data: { pick: kidNow.options[Math.floor(Math.random() * kidNow.options.length)] } }).catch(() => null);
  }
  await ok(await P.negar.api.post(`/api/event_kid_photos/${kidNow.id}/reveal`));
  await tv.waitForTimeout(2000);
  await shot(tv, '64-tv-kid-reveal');

  // Hafez for the hall, the wishes wall.
  await ok(await P.negar.api.post(`/api/special_events/${ev}/fal`)).catch(() => null);
  await screen({ scene: 'fal', falIndex: 3 }, '65-tv-fal');
  await screen({ scene: 'wishes' }, '66-tv-wishes', 2500);

  // The envelopes of «انتخاب‌های یلدا».
  await ok(await P.negar.api.post(`/api/special_events/${ev}/awards/close`));
  await screen({ scene: 'envelope', awardId: handsome }, '67-tv-envelope-sealed', 2000);
  await ok(await P.ali.api.post(`/api/event_awards/${handsome}/reveal`));
  await tv.waitForTimeout(5000);
  await shot(tv, '68-tv-envelope-open');

  // The wheel of fortune over everyone who took part.
  await ok(await P.negar.api.post(`/api/special_events/${ev}/wheel/spin`, { data: { prize: 'یک جعبه گز اصفهان' } }));
  await tv.waitForTimeout(1500);
  await shot(tv, '69-tv-wheel-spinning');
  await tv.waitForTimeout(7500);
  await shot(tv, '70-tv-wheel-winner');
  await remote.reload();
  await remote.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
  const wheelRemote = remote.getByRole('region', { name: /گردونهٔ شانس/ });
  await wheelRemote.scrollIntoViewIfNeeded();
  await shot(wheelRemote, '71-remote-wheel');
  await screen({ scene: 'break', caption: '۱۰ دقیقه استراحت؛ چای و آجیل سر میز' }, '72-tv-break');

  // ══ 7. After the night ══
  await org.reload();
  await org.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  await org.getByRole('button', { name: 'ساختن پیش‌نویس خبر پایانی' }).click();
  await expect(org.getByRole('button', { name: 'به‌روز کردن پیش‌نویس' })).toBeVisible();
  await shot(org.getByRole('button', { name: 'به‌روز کردن پیش‌نویس' }).locator('xpath=ancestor::section[1]'), '73-org-closing-card');
  await boss.goto('/#event');
  await boss.reload();
  await boss.getByRole('tab', { name: 'میز برگزارکننده' }).click();
  await boss.getByRole('button', { name: 'دیدن پیش‌نویس در اخبار' }).click();
  const article = boss.getByRole('dialog');
  await expect(article.getByRole('heading', { name: /^گزارش / })).toBeVisible();
  await shot(boss, '73b-admin-closing-news');

  await ok(await admin.patch(`/api/special_events/${ev}`, { data: { signupEnd: day(-3), programDate: day(-1), programTime: '15:00', showUntil: day(2) } }));
  await sara.reload();
  await sara.getByRole('tab', { name: 'مسابقه‌ها' }).click().catch(() => null);
  await sara.waitForTimeout(1000);
  await shot(sara, '74-phone-memories');
  await sara.screenshot({ path: `${DIR}/75-phone-memories-full.png`, fullPage: true });
  const champion = Object.values(P).find((p) => p.id === (view.competitions.find((c) => c.id === fifaId)?.champion ?? ''));
  void champion;
  await sara.goto('/#directory');
  await sara.waitForTimeout(1500);
  await shot(sara, '76-phone-directory');

  await tvCtx.close();
});
