/**
 * CALENDAR ENGINE — the only place dates are calculated.
 *
 * Pure date-only arithmetic on UTC day numbers, so no local time zone or DST
 * transition can shift a date. Layouts consume CalendarData; they never
 * compute dates themselves.
 */
import type {
  CalendarData,
  CalendarDay,
  CalendarGridCell,
  CalendarMonth,
  CalendarQuarter,
  CalendarSettings,
  CalendarWeek,
  CalendarYear,
  Weekday,
  WeekStart,
} from "../../types/calendar";

const MS_PER_DAY = 86_400_000;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const year = +m[1], month = +m[2], day = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new Error(`Invalid calendar date: ${iso}`);
  return { year, month, day };
}

/** Days since 1970-01-01 (UTC). */
export function dayNumber(iso: string): number {
  const { year, month, day } = parseIso(iso);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromDayNumber(n: number): string {
  const d = new Date(n * MS_PER_DAY);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

export function weekdayOf(iso: string): Weekday {
  // 1970-01-01 was a Thursday (4).
  return ((((dayNumber(iso) + 4) % 7) + 7) % 7) as Weekday;
}

/** Column (0–6) of a weekday given the week start. */
export function weekdayColumn(weekday: Weekday, weekStart: WeekStart): number {
  return (weekday - weekStart + 7) % 7;
}

export function startOfWeek(iso: string, weekStart: WeekStart): string {
  return addDays(iso, -weekdayColumn(weekdayOf(iso), weekStart));
}

export function weekdayOrder(weekStart: WeekStart): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart + i) % 7) as Weekday);
}

function makeDay(iso: string, rangeStart: number, rangeEnd: number): CalendarDay {
  const { year, month, day } = parseIso(iso);
  const n = dayNumber(iso);
  return { iso, year, month, day, weekday: weekdayOf(iso), inRange: n >= rangeStart && n <= rangeEnd };
}

export function buildMonth(
  year: number,
  month: number,
  weekStart: WeekStart,
  sixRows: boolean,
  rangeStart = -Infinity,
  rangeEnd = Infinity,
): CalendarMonth {
  const first = toIso(year, month, 1);
  const dim = daysInMonth(year, month);
  const firstWeekday = weekdayOf(first);
  const leadingBlanks = weekdayColumn(firstWeekday, weekStart);
  const naturalRows = Math.ceil((leadingBlanks + dim) / 7);
  const rows = sixRows ? 6 : naturalRows;
  const gridStart = addDays(first, -leadingBlanks);
  const grid: CalendarGridCell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CalendarGridCell[] = [];
    for (let c = 0; c < 7; c++) {
      const iso = addDays(gridStart, r * 7 + c);
      const day = makeDay(iso, rangeStart, rangeEnd);
      row.push({ day, inMonth: day.month === month && day.year === year });
    }
    grid.push(row);
  }
  return {
    key: `${pad(year, 4)}-${pad(month)}`,
    year,
    month,
    name: MONTH_NAMES[month - 1],
    shortName: MONTH_NAMES[month - 1].slice(0, 3),
    daysInMonth: dim,
    firstWeekday,
    leadingBlanks,
    naturalRows,
    rows,
    grid,
    weekdayOrder: weekdayOrder(weekStart),
  };
}

export function validateCalendarSettings(s: CalendarSettings): string[] {
  const errors: string[] = [];
  try {
    parseIso(s.startDate);
  } catch {
    errors.push(`Start date "${s.startDate}" is not a valid date.`);
  }
  try {
    parseIso(s.endDate);
  } catch {
    errors.push(`End date "${s.endDate}" is not a valid date.`);
  }
  if (!errors.length && dayNumber(s.endDate) < dayNumber(s.startDate)) errors.push("End date is before start date.");
  if (!errors.length && dayNumber(s.endDate) - dayNumber(s.startDate) > 366 * 5) errors.push("Date range longer than 5 years.");
  return errors;
}

export function buildCalendar(settings: CalendarSettings): CalendarData {
  const errors = validateCalendarSettings(settings);
  if (errors.length) throw new Error(errors.join(" "));
  const { weekStart, sixRowMonths } = settings;
  const startN = dayNumber(settings.startDate);
  const endN = dayNumber(settings.endDate);

  const days: CalendarDay[] = [];
  for (let n = startN; n <= endN; n++) days.push(makeDay(fromDayNumber(n), startN, endN));

  // Months touched by the range.
  const months: CalendarMonth[] = [];
  const s = parseIso(settings.startDate);
  const e = parseIso(settings.endDate);
  for (let y = s.year, mo = s.month; y < e.year || (y === e.year && mo <= e.month); mo === 12 ? (y++, (mo = 1)) : mo++) {
    months.push(buildMonth(y, mo, weekStart, sixRowMonths, startN, endN));
  }

  // Weeks overlapping the range (full 7-day weeks; out-of-range days flagged).
  const weeks: CalendarWeek[] = [];
  for (let ws = dayNumber(startOfWeek(settings.startDate, weekStart)); ws <= endN; ws += 7) {
    const wDays = Array.from({ length: 7 }, (_, i) => makeDay(fromDayNumber(ws + i), startN, endN));
    const firstIn = wDays.find((d) => d.inRange) ?? wDays[0];
    weeks.push({
      key: wDays[0].iso,
      startIso: wDays[0].iso,
      endIso: wDays[6].iso,
      days: wDays,
      isPartialMonth: wDays[0].month !== wDays[6].month,
      ownerMonthKey: `${pad(firstIn.year, 4)}-${pad(firstIn.month)}`,
    });
  }

  const yearsSet = [...new Set(months.map((m) => m.year))];
  const years: CalendarYear[] = yearsSet.map((year) => ({
    year,
    isLeap: isLeapYear(year),
    monthKeys: months.filter((m) => m.year === year).map((m) => m.key),
  }));

  const quarters: CalendarQuarter[] = [];
  for (const m of months) {
    const q = (Math.floor((m.month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    const key = `${m.year}-Q${q}`;
    let entry = quarters.find((x) => x.key === key);
    if (!entry) quarters.push((entry = { key, year: m.year, quarter: q, monthKeys: [] }));
    entry.monthKeys.push(m.key);
  }

  const order = weekdayOrder(weekStart);
  return {
    settings,
    years,
    quarters,
    months,
    weeks,
    days,
    weekdayNames: order.map((d) => WEEKDAY_NAMES[d]),
    weekdayShortNames: order.map((d) => WEEKDAY_NAMES[d].slice(0, 3)),
    weekdayInitials: order.map((d) => WEEKDAY_NAMES[d][0]),
  };
}

// ─── Cache: identical settings return the identical object ────────────────
const cache = new Map<string, CalendarData>();
export function getCalendar(settings: CalendarSettings): CalendarData {
  const key = `${settings.startDate}|${settings.endDate}|${settings.weekStart}|${settings.sixRowMonths}`;
  let data = cache.get(key);
  if (!data) {
    data = buildCalendar(settings);
    if (cache.size > 32) cache.clear();
    cache.set(key, data);
  }
  return data;
}

/** Human date label helpers (layout wording). */
export function formatWeekRange(week: CalendarWeek): string {
  const a = parseIso(week.startIso);
  const b = parseIso(week.endIso);
  const left = `${MONTH_NAMES[a.month - 1].slice(0, 3)} ${a.day}`;
  const right = a.month === b.month ? `${b.day}` : `${MONTH_NAMES[b.month - 1].slice(0, 3)} ${b.day}`;
  return a.year === b.year ? `${left} – ${right}, ${b.year}` : `${left}, ${a.year} – ${right}, ${b.year}`;
}

export function formatLongDate(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return `${WEEKDAY_NAMES[weekdayOf(iso)]}, ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}
