/** Emoji that make a title warmer and stay; any other emoji at the end only repeats the row's icon. */
const WARM = new Set(['🎉', '🎂', '🌷', '👋']);
const TRAILING_EMOJI = /\s*((?:\p{Extended_Pictographic}️?)+)\s*$/u;

/** The title without a trailing category emoji (🗳️, 🎓, 📄…), which the icon beside it already shows. */
export function plainTitle(title: string): string {
  const match = TRAILING_EMOJI.exec(title);
  if (!match) return title;
  const emoji = match[1].replace(/️/g, '');
  if ([...emoji].some((e) => WARM.has(e))) return title;
  return title.slice(0, match.index).trimEnd();
}

export type DayGroup = 'today' | 'yesterday' | 'week' | 'older';

export const DAY_GROUP_LABEL: Record<DayGroup, string> = {
  today: 'امروز',
  yesterday: 'دیروز',
  week: 'این هفته',
  older: 'قبل‌تر',
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which heading a notification falls under, by calendar day on this device. */
export function dayGroup(iso: string, now = new Date()): DayGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  return 'older';
}

/** The list cut into «امروز», «دیروز», «این هفته» and «قبل‌تر», keeping its order; empty groups are left out. */
export function groupByDay<T extends { date: string }>(items: T[], now = new Date()): { key: DayGroup; label: string; items: T[] }[] {
  const order: DayGroup[] = ['today', 'yesterday', 'week', 'older'];
  const groups = new Map<DayGroup, T[]>(order.map((k) => [k, []]));
  for (const item of items) groups.get(dayGroup(item.date, now))!.push(item);
  return order.filter((k) => groups.get(k)!.length > 0).map((k) => ({ key: k, label: DAY_GROUP_LABEL[k], items: groups.get(k)! }));
}
