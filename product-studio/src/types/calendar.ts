/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekStart = 0 | 1;

/** Date-only value. `iso` is YYYY-MM-DD; no time zone is ever involved. */
export type CalendarDay = {
  iso: string;
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  weekday: Weekday;
  /** Inside the project's start–end range. */
  inRange: boolean;
};

export type CalendarGridCell = {
  day: CalendarDay;
  /** Belongs to the month being displayed (false for leading/trailing days). */
  inMonth: boolean;
};

export type CalendarMonth = {
  key: string; // YYYY-MM
  year: number;
  month: number;
  name: string;
  shortName: string;
  daysInMonth: number;
  /** Weekday of the 1st. */
  firstWeekday: Weekday;
  /** Column index (0-based) of the 1st given the week start. */
  leadingBlanks: number;
  /** Rows actually needed by this month (4, 5 or 6). */
  naturalRows: number;
  /** Rows in `grid` (natural or forced to 6). */
  rows: number;
  grid: CalendarGridCell[][];
  weekdayOrder: Weekday[];
};

export type CalendarWeek = {
  key: string; // start ISO
  startIso: string;
  endIso: string;
  days: CalendarDay[];
  /** Week crosses a month boundary. */
  isPartialMonth: boolean;
  /** Month (YYYY-MM) that owns the week for chronological ordering: month of its first in-range day. */
  ownerMonthKey: string;
};

export type CalendarQuarter = { key: string; year: number; quarter: 1 | 2 | 3 | 4; monthKeys: string[] };
export type CalendarYear = { year: number; isLeap: boolean; monthKeys: string[] };

export type CalendarSettings = {
  startDate: string;
  endDate: string;
  weekStart: WeekStart;
  /** Force 6 rows for every month grid (universal commercial option). */
  sixRowMonths: boolean;
};

export type CalendarData = {
  settings: CalendarSettings;
  years: CalendarYear[];
  quarters: CalendarQuarter[];
  months: CalendarMonth[];
  weeks: CalendarWeek[];
  days: CalendarDay[];
  weekdayNames: string[]; // in weekStart order
  weekdayShortNames: string[];
  weekdayInitials: string[];
};
