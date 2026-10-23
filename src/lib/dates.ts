// Dates are stored as local YYYY-MM-DD strings. Converting at noon keeps
// daylight-saving changes from moving a date to the day before.

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** The Monday on or before the given date. */
export function startOfWeek(iso: string): string {
  const day = fromISODate(iso).getDay();
  return addDays(iso, -((day + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const weekday = new Intl.DateTimeFormat('en-IE', { weekday: 'long' });
const shortWeekday = new Intl.DateTimeFormat('en-IE', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' });

/** "Today", "Tomorrow", "Yesterday" or the weekday. */
export function relativeDay(iso: string, today = todayISO()): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return weekday.format(fromISODate(iso));
}

/** For use mid-sentence: "today", "tomorrow", "yesterday", or the weekday. */
export function dayInSentence(iso: string, today = todayISO()): string {
  const day = relativeDay(iso, today);
  return day === 'Today' || day === 'Tomorrow' || day === 'Yesterday' ? day.toLowerCase() : day;
}

export function formatWeekday(iso: string, short = false): string {
  return (short ? shortWeekday : weekday).format(fromISODate(iso));
}

/** "23 Oct" */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(fromISODate(iso));
}

/** "20 – 26 Oct" or "27 Oct – 2 Nov" */
export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const start = fromISODate(monday);
  const end = fromISODate(sunday);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} – ${formatDayMonth(sunday)}`;
  return `${formatDayMonth(monday)} – ${formatDayMonth(sunday)}`;
}

/** "5 min ago", "2 h ago", "3 days ago" */
export function timeAgo(isoTime: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(isoTime).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
