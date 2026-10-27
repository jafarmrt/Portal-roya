import { IDLE_DAYS, percentOf, type ReportOverview } from '../../../shared/reports';
import { downloadCsv } from '../../lib/download';
import { toJalali } from '../../lib/jalali';

const n = (value: number | null) => (value === null ? '' : String(value));
const jalaliDay = (iso: string) => toJalali(iso);

/** Saves the whole report of a range as one CSV that Excel opens, one table under another. */
export function exportReport(report: ReportOverview) {
  const { news, participation, idle } = report;
  const rows: string[][] = [
    [`گزارش پرتال رویا از ${report.from} تا ${report.to}`],
    [],
    ['اطلاعیه‌ها'],
    ['عنوان', 'دسته', 'نویسنده', 'تاریخ انتشار', 'مخاطب', 'خوانده', 'درصد خوانده‌شدن', 'بخشنامه', 'تأیید', 'میانگین زمان تا خواندن (دقیقه)'],
    ...news.items.map((i) => [
      i.title,
      i.category,
      i.author,
      jalaliDay(i.publishAt),
      n(i.audience),
      n(i.read),
      n(percentOf(i.read, i.audience)),
      i.requiresAck ? 'بله' : 'خیر',
      i.requiresAck ? n(i.acknowledged) : '',
      n(i.avgReadMinutes),
    ]),
    [],
    ['خوانده‌شدن به تفکیک واحد'],
    ['واحد', 'مخاطب', 'خوانده', 'درصد خوانده‌شدن', 'مخاطب بخشنامه', 'تأیید', 'میانگین زمان تا خواندن (دقیقه)'],
    ...[...news.departments, news.totals].map((d) => [
      d.name,
      n(d.audience),
      n(d.read),
      n(percentOf(d.read, d.audience)),
      n(d.ackAudience),
      n(d.acknowledged),
      n(d.avgReadMinutes),
    ]),
    [],
    ['خوانده‌شدن به تفکیک دسته'],
    ['دسته', 'اطلاعیه', 'مخاطب', 'خوانده', 'درصد خوانده‌شدن', 'میانگین زمان تا خواندن (دقیقه)'],
    ...news.categories.map((c) => [c.name, n(c.items), n(c.audience), n(c.read), n(percentOf(c.read, c.audience)), n(c.avgReadMinutes)]),
    [],
    ['مشارکت به تفکیک واحد'],
    ['واحد', 'همکاران', 'مخاطب نظرسنجی', 'پاسخ', 'درصد پاسخ', 'شرکت‌کننده در دوره', 'ثبت‌نام', 'حاضر', 'غایب'],
    ...[...participation.departments, participation.totals].map((d) => [
      d.name,
      n(d.staff),
      n(d.pollAudience),
      n(d.pollResponses),
      n(percentOf(d.pollResponses, d.pollAudience)),
      n(d.trainingPeople),
      n(d.enrollments),
      n(d.attended),
      n(d.absent),
    ]),
    [],
    ['نظرسنجی‌ها'],
    ['عنوان', 'تاریخ', 'وضعیت', 'مخاطب', 'پاسخ', 'درصد پاسخ'],
    ...participation.polls.map((p) => [p.title, jalaliDay(p.createdAt), p.open ? 'باز' : 'بسته', n(p.audience), n(p.responses), n(percentOf(p.responses, p.audience))]),
    [],
    ['دوره‌ها'],
    ['عنوان', 'تاریخ', 'ظرفیت', 'ثبت‌نام', 'لیست انتظار', 'حاضر', 'غایب', 'نظرها', 'رضایت (از ۵)', 'سودمندی (از ۵)'],
    ...participation.trainings.map((t) => [
      t.title,
      t.date,
      n(t.capacity),
      n(t.enrolled),
      n(t.waitlist),
      n(t.attended),
      n(t.absent),
      n(t.feedback),
      n(t.satisfaction),
      n(t.usefulness),
    ]),
    [],
    [`همکارانی که ${IDLE_DAYS} روز به پرتال سر نزده‌اند`],
    ['نام', 'واحد', 'سمت', 'آخرین حضور'],
    ...idle.map((p) => [p.name, p.department, p.position, p.lastSeenAt ? jalaliDay(p.lastSeenAt) : 'ثبت نشده']),
  ];
  downloadCsv(`roya-report-${report.from.replace(/\//g, '-')}-${report.to.replace(/\//g, '-')}.csv`, rows);
}
