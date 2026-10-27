import moment from 'moment-jalaali';

/** One calendar entry as an iCalendar file (RFC 5545) that Outlook and phone calendars open. */
export interface IcsEvent {
  id: string;
  title: string;
  /** Jalali YYYY/MM/DD. */
  date: string;
  /** HH:mm; without it the event lasts the whole day. */
  time?: string | null;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string;
}

// Iran has kept +03:30 all year since 2022, so one fixed offset describes Tehran time.
const TEHRAN = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Tehran',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0330',
  'TZOFFSETTO:+0330',
  'TZNAME:+0330',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

/** Folds a line at 75 octets without splitting a character; continuation lines start with a space. */
export function foldLine(line: string) {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function eventToIcs(event: IcsEvent, now = new Date()) {
  const day = moment(event.date, 'jYYYY/jMM/jDD');
  const ymd = day.format('YYYYMMDD');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roya Portal//FA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (event.time) lines.push(...TEHRAN);
  lines.push('BEGIN:VEVENT', `UID:${event.id}@roya-portal`, `DTSTAMP:${stamp(now)}`);
  if (event.time) {
    const start = moment(`${day.format('YYYY-MM-DD')} ${event.time}`, 'YYYY-MM-DD HH:mm');
    // Without an end time a meeting is shown as one hour long.
    const end = event.endTime && event.endTime > event.time ? moment(`${day.format('YYYY-MM-DD')} ${event.endTime}`, 'YYYY-MM-DD HH:mm') : start.clone().add(1, 'hour');
    lines.push(`DTSTART;TZID=Asia/Tehran:${start.format('YYYYMMDD[T]HHmm00')}`, `DTEND;TZID=Asia/Tehran:${end.format('YYYYMMDD[T]HHmm00')}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${day.clone().add(1, 'day').format('YYYYMMDD')}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  const description = [event.description, event.url].filter(Boolean).join('\n\n');
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.time) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(event.title)}`, 'TRIGGER:-PT30M', 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
