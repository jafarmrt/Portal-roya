/**
 * «دربارهٔ من»: a few light, optional questions a colleague may answer about themselves. The answers
 * show on their card and on their new-colleague introduction, so people find something in common.
 * Every question is optional; an empty answer is simply not shown.
 */
export const ABOUT_ME_QUESTIONS = [
  { key: 'freeTime', question: 'در وقت آزاد چه کاری را دوست دارید؟', placeholder: 'مثلاً کوه‌نوردی، آشپزی، عکاسی' },
  { key: 'food', question: 'غذای محبوبتان؟', placeholder: 'مثلاً قورمه‌سبزی' },
  { key: 'recommend', question: 'کتاب، فیلم یا پادکستی که به همکاران پیشنهاد می‌کنید؟', placeholder: '' },
  { key: 'travel', question: 'جایی که دوست دارید دوباره به آن سفر کنید؟', placeholder: '' },
  { key: 'teach', question: 'چیزی که با کمال میل به همکاران یاد می‌دهید؟', placeholder: 'مثلاً میان‌برهای اکسل' },
  { key: 'funFact', question: 'یک چیز جالب دربارهٔ شما که کمتر کسی می‌داند؟', placeholder: '' },
] as const;

export type AboutMeKey = (typeof ABOUT_ME_QUESTIONS)[number]['key'];
export type AboutMe = Partial<Record<AboutMeKey, string>>;

export const ABOUT_ME_KEYS = ABOUT_ME_QUESTIONS.map((q) => q.key) as [AboutMeKey, ...AboutMeKey[]];
export const ABOUT_ME_MAX = 120;

/** The answers that are filled in, in the order of the questions. */
export function aboutMeAnswers(about: AboutMe | null | undefined): { key: AboutMeKey; question: string; answer: string }[] {
  if (!about) return [];
  return ABOUT_ME_QUESTIONS.flatMap((q) => {
    const answer = about[q.key]?.trim();
    return answer ? [{ key: q.key, question: q.question, answer }] : [];
  });
}

/**
 * What is still missing from one's own card, for the private reminder on the dashboard: a photo,
 * an extension, a mobile number and at least one «دربارهٔ من» answer. The share is out of 100.
 */
export function profileCompleteness(e: { avatar: string; extension: string; mobile: string; aboutMe?: AboutMe | null }) {
  const items = [
    { key: 'avatar', label: 'عکس', done: Boolean(e.avatar) },
    { key: 'extension', label: 'شمارهٔ داخلی', done: Boolean(e.extension.trim()) },
    { key: 'mobile', label: 'شمارهٔ همراه', done: Boolean(e.mobile.trim()) },
    { key: 'aboutMe', label: '«دربارهٔ من»', done: aboutMeAnswers(e.aboutMe).length > 0 },
  ] as const;
  const missing = items.filter((i) => !i.done);
  return { percent: Math.round(((items.length - missing.length) / items.length) * 100), missing: missing.map((i) => ({ key: i.key, label: i.label })) };
}
