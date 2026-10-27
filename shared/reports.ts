// Reports for the people who hold reports.view: how far announcements reach and how colleagues
// take part. The server works the numbers out; the client only lays them out and exports them.

/** Colleagues who have not used the portal for this many days are listed in the reports. */
export const IDLE_DAYS = 30;

/** Announcements younger than this are left out of "most and least read": they are still being read. */
export const RANK_MIN_AGE_DAYS = 3;
/** Items for fewer people than this say little about reach, so they are not ranked either. */
export const RANK_MIN_AUDIENCE = 3;

export interface NewsReportItem {
  id: string;
  title: string;
  category: string;
  author: string;
  publishAt: string;
  requiresAck: boolean;
  /** Active colleagues with an account the item was meant for, without its author. */
  audience: number;
  read: number;
  acknowledged: number;
  /** Average minutes from publishing to opening, over those who opened it; null when nobody did. */
  avgReadMinutes: number | null;
}

/** Reads summed over a group of items (a department's people, a category, everything). */
export interface NewsReportGroup {
  name: string;
  items: number;
  audience: number;
  read: number;
  /** The same for the items that asked for confirmation. */
  ackAudience: number;
  acknowledged: number;
  avgReadMinutes: number | null;
  /** Half the reads came sooner than this. */
  medianReadMinutes: number | null;
}

export interface NewsReport {
  items: NewsReportItem[];
  departments: NewsReportGroup[];
  categories: NewsReportGroup[];
  totals: NewsReportGroup;
}

export interface IdlePerson {
  id: string;
  name: string;
  department: string;
  position: string;
  /** null: has not signed in since the account was made. */
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PollParticipation {
  id: string;
  title: string;
  createdAt: string;
  open: boolean;
  audience: number;
  responses: number;
}

export interface TrainingParticipation {
  id: string;
  title: string;
  date: string;
  capacity: number;
  enrolled: number;
  waitlist: number;
  attended: number;
  absent: number;
  feedback: number;
  /** Average 1–5 ratings from the course survey; null without answers. */
  satisfaction: number | null;
  usefulness: number | null;
}

export interface ParticipationGroup {
  name: string;
  /** Active colleagues with an account. */
  staff: number;
  pollAudience: number;
  pollResponses: number;
  /** Colleagues who signed up for at least one course. */
  trainingPeople: number;
  enrollments: number;
  attended: number;
  absent: number;
}

export interface ParticipationReport {
  polls: PollParticipation[];
  trainings: TrainingParticipation[];
  departments: ParticipationGroup[];
  totals: ParticipationGroup & {
    waitlist: number;
    feedback: number;
    satisfaction: number | null;
    usefulness: number | null;
  };
}

export interface ReportOverview {
  from: string;
  to: string;
  news: NewsReport;
  participation: ParticipationReport;
  idle: IdlePerson[];
}

/** The short record of a month that the portal keeps and sends to the people who see reports. */
export interface MonthlySummary {
  month: string; // Jalali YYYY/MM
  from: string;
  to: string;
  news: {
    items: number;
    readPercent: number | null;
    avgReadMinutes: number | null;
    ackPercent: number | null;
    bestDepartment: { name: string; percent: number } | null;
    worstDepartment: { name: string; percent: number } | null;
    topItem: { id: string; title: string; percent: number } | null;
    lowItem: { id: string; title: string; percent: number } | null;
  };
  participation: {
    polls: number;
    responsePercent: number | null;
    trainings: number;
    participants: number;
    attendancePercent: number | null;
    satisfaction: number | null;
  };
  /** Colleagues who had not used the portal for IDLE_DAYS when the summary was made. */
  idle: number;
}

export interface StoredMonthlySummary extends MonthlySummary {
  createdAt: string;
}

/** Whole percent, or null when there is nothing to count. */
export function percentOf(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

/**
 * The most and least read announcements, leaving out recent ones and those for a handful of
 * people. The two lists never share an item.
 */
export function rankItems(items: NewsReportItem[], now = new Date(), size = 5) {
  const cutoff = now.getTime() - RANK_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const eligible = items.filter((i) => i.audience >= RANK_MIN_AUDIENCE && new Date(i.publishAt).getTime() <= cutoff);
  const rate = (i: NewsReportItem) => i.read / i.audience;
  const sorted = [...eligible].sort((a, b) => rate(b) - rate(a) || b.audience - a.audience);
  const topCount = Math.min(size, Math.ceil(sorted.length / 2));
  const lowCount = Math.min(size, sorted.length - topCount);
  return { top: sorted.slice(0, topCount), low: sorted.slice(sorted.length - lowCount).reverse() };
}

/** Groups with the highest and lowest read rate, among those large enough to compare. */
export function departmentExtremes(groups: NewsReportGroup[]) {
  const eligible = groups.filter((g) => g.audience >= RANK_MIN_AUDIENCE);
  if (eligible.length < 2) return { best: null, worst: null };
  const sorted = [...eligible].sort((a, b) => b.read / b.audience - a.read / a.audience);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}
