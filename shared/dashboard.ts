// The dashboard cards each colleague may put in their own order (they cannot hide any). On a phone the
// cards are one column in exactly this order; on a computer every card stays in its own part of the
// page (across the top, the wide column or the side column) and follows the same order there.

export type DashboardZone = 'top' | 'main' | 'side';

export const DASHBOARD_ZONE_LABELS: Record<DashboardZone, string> = {
  top: 'بالای صفحه',
  main: 'ستون پهن',
  side: 'ستون کناری',
};

/**
 * The built-in order, which is also the order on a phone: the organisation's apps first, then what the
 * person has to do. On a computer the apps run across the top and «کارهای من» and «یادداشت کارهای من»
 * open the side column (the left one, as the page reads right to left).
 */
export const DASHBOARD_LAYOUT = [
  { id: 'systems', label: 'سامانه‌ها', zone: 'top' },
  { id: 'myTasks', label: 'کارهای من', zone: 'side' },
  { id: 'todos', label: 'یادداشت کارهای من', zone: 'side' },
  { id: 'anniversary', label: 'تبریک تولد و سالگرد همکاری', zone: 'top' },
  { id: 'news', label: 'آخرین اخبار و اطلاعیه‌ها', zone: 'main' },
  { id: 'calendar', label: 'تقویم', zone: 'side' },
  { id: 'birthdays', label: 'تولد همکاران', zone: 'side' },
  { id: 'welcome', label: 'خوش‌آمد همکاران جدید', zone: 'main' },
  { id: 'poll', label: 'نظرسنجی ویژه', zone: 'main' },
  { id: 'training', label: 'دورهٔ آموزشی پیش‌رو', zone: 'side' },
  { id: 'mood', label: 'حال‌وهوای روزانه', zone: 'side' },
] as const satisfies readonly { id: string; label: string; zone: DashboardZone }[];

export type DashboardCardKey = (typeof DASHBOARD_LAYOUT)[number]['id'];

const KNOWN = new Set<string>(DASHBOARD_LAYOUT.map((c) => c.id));

const clean = (list: readonly string[]) => {
  const seen = new Set<string>();
  return list.filter((id) => KNOWN.has(id) && !seen.has(id) && seen.add(id)) as DashboardCardKey[];
};

/**
 * A saved order cleaned of unknown or repeated cards; cards it does not mention follow in the
 * fallback order (the administrator's order for everyone, itself completed by the built-in one).
 */
export function dashboardOrder(saved: readonly string[], fallback: readonly string[] = []): DashboardCardKey[] {
  const base = [...clean(fallback), ...DASHBOARD_LAYOUT.map((c) => c.id)];
  return clean([...saved, ...base]);
}
