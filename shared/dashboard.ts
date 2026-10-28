// The dashboard cards each colleague may put in their own order (they cannot hide any). On a phone the
// cards are one column in exactly this order; on a computer every card stays in its own part of the
// page (across the top, the wide column or the side column) and follows the same order there.

export type DashboardZone = 'top' | 'main' | 'side';

export const DASHBOARD_ZONE_LABELS: Record<DashboardZone, string> = {
  top: 'بالای صفحه',
  main: 'ستون پهن',
  side: 'ستون کناری',
};

/** The default order, which is also the order on a phone for anyone who has not changed it. */
export const DASHBOARD_LAYOUT = [
  { id: 'myTasks', label: 'کارهای من', zone: 'top' },
  { id: 'todos', label: 'یادداشت کارهای من', zone: 'top' },
  { id: 'anniversary', label: 'تبریک تولد و سالگرد همکاری', zone: 'top' },
  { id: 'news', label: 'آخرین اخبار و اطلاعیه‌ها', zone: 'main' },
  { id: 'systems', label: 'سامانه‌ها', zone: 'top' },
  { id: 'calendar', label: 'تقویم', zone: 'side' },
  { id: 'birthdays', label: 'تولد همکاران', zone: 'side' },
  { id: 'welcome', label: 'خوش‌آمد همکاران جدید', zone: 'main' },
  { id: 'poll', label: 'نظرسنجی ویژه', zone: 'main' },
  { id: 'training', label: 'دورهٔ آموزشی پیش‌رو', zone: 'side' },
  { id: 'mood', label: 'حال‌وهوای روزانه', zone: 'side' },
] as const satisfies readonly { id: string; label: string; zone: DashboardZone }[];

export type DashboardCardKey = (typeof DASHBOARD_LAYOUT)[number]['id'];

const KNOWN = new Set<string>(DASHBOARD_LAYOUT.map((c) => c.id));

/** A saved order cleaned of unknown or repeated cards; cards it does not mention follow in the default order. */
export function dashboardOrder(saved: readonly string[]): DashboardCardKey[] {
  const seen = new Set<string>();
  const mine = saved.filter((id) => KNOWN.has(id) && !seen.has(id) && seen.add(id)) as DashboardCardKey[];
  return [...mine, ...DASHBOARD_LAYOUT.map((c) => c.id).filter((id) => !seen.has(id))];
}
