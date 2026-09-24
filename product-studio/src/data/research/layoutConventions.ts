/**
 * Internal layout conventions — research sections 1.2.3, 3.2.3, 3.2.4 and the
 * layout-structure observations in 1.1.
 *
 * READ FIRST (from the research): no planner brand publishes internal grid
 * geometry. Every value here is Observed / Estimated unless explicitly marked.
 */
import { m, r } from "./measure";

export const PLANNER_INTERNALS = {
  monthlyTitleZone: r(0.6, 0.9, "in", "observed-estimated"),
  weekdayHeaderRow: r(0.3, 0.4, "in", "observed-estimated"),
  monthlyGridCols: 7,
  /** 6 rows on commercial monthlies — covers all month shapes. */
  monthlyGridRows: 6,
  monthlyCellPadding: r(0.06, 0.12, "in", "observed-estimated"),
  dateNumeralSize: r(10, 14, "pt", "observed-estimated", undefined, "top-left of cell (US ring/disc); some brands top-center"),
  weeklyVerticalSectionsPerDay: 3,
  hourlyTimeColumn: r(0.75, 1.0, "in", "observed-estimated"),
  hourlyRowHeight: r(0.3, 0.6, "in", "observed-estimated", undefined, "hour; half-hour = ½"),
  printablePersonalDailyColumn: m(1.0, "in", "observed-estimated", "etsyPersonalInsert"),
  printableFranklinCompactDailyColumn: m(1.15, "in", "observed-estimated", "etsyPersonalInsert"),
  printableLetterHourlyDayBox: m(1.9, "in", "observed-estimated", "etsyHourlyWeekly"),
  hourlyTimelineTypical: { startHour: 6, endHour: 21, confidence: "observed-estimated" as const, note: "6 AM–9 PM typical" },
  passionPlannerTimeline: { startHour: 6, endHour: 23, stepMinutes: 30, confidence: "observed-estimated" as const, source: "galleonPassion" },
  dailyPlannerTimelineRows: { min: 15, max: 17, confidence: "observed-estimated" as const },
} as const;

/** 3.2.3 Notepad types → geometry. Observed / Estimated. */
export const NOTEPAD_TYPE_GEOMETRY = {
  linedNotes: { header: r(0.6, 1.0, "in", "observed-estimated"), lineSpacing: r(0.28, 0.34, "in", "observed-estimated") },
  toDo: {
    header: r(0.7, 1.0, "in", "observed-estimated"),
    row: r(0.32, 0.4, "in", "observed-estimated"),
    checkbox: r(0.14, 0.18, "in", "observed-estimated"),
    textGap: r(0.1, 0.14, "in", "observed-estimated"),
  },
  grocery: {
    header: m(0.7, "in", "observed-estimated"),
    categorySubhead: m(0.35, "in", "observed-estimated"),
    row: m(0.35, "in", "observed-estimated"),
    checkbox: m(0.16, "in", "observed-estimated"),
  },
  dailyPlannerPad: { header: m(0.8, "in", "observed-estimated"), hourRow: r(0.3, 0.4, "in", "observed-estimated") },
  weeklyPlannerPad: {
    header: m(0.8, "in", "observed-estimated"),
    weekdayRow: m(0.4, "in", "observed-estimated"),
    row: r(1.75, 2.15, "in", "observed-estimated"),
    lineSpacing: m(0.3, "in", "observed-estimated"),
  },
  mealPlanner: {
    header: m(0.8, "in", "observed-estimated"),
    weekdayRow: m(0.4, "in", "observed-estimated"),
    mealRows: { min: 3, max: 4 },
    mealRow: r(0.6, 0.9, "in", "observed-estimated"),
  },
  habitTrackerPad: {
    title: m(0.8, "in", "observed-estimated"),
    dayNumberHeader: m(0.35, "in", "observed-estimated"),
    dayColumn: r(0.2, 0.25, "in", "observed-estimated"),
    habitRow: r(0.3, 0.4, "in", "observed-estimated"),
  },
  meetingNotes: { header: r(1.0, 1.4, "in", "observed-estimated"), lineSpacing: m(0.32, "in", "observed-estimated") },
  brainDump: { header: m(0.6, "in", "observed-estimated") },
  splitColumn: { header: m(0.7, "in", "observed-estimated"), gutter: m(0.25, "in", "observed-estimated"), lineSpacing: m(0.3, "in", "observed-estimated") },
  topPriorities: { header: m(0.8, "in", "observed-estimated"), priorityBox: r(1.0, 1.5, "in", "observed-estimated") },
} as const;

/** 3.2.4 Worksheet / tracker geometry. Observed / Estimated. */
export const WORKSHEET_GEOMETRY = {
  habitDayColumns: { min: 28, max: 31 },
  habitDayColumnWidth: r(0.2, 0.25, "in", "observed-estimated"),
  habitRows: { min: 8, max: 15 },
  habitRowHeight: r(0.3, 0.4, "in", "observed-estimated"),
  habitLabelColumn: r(1.5, 2.0, "in", "observed-estimated"),
  goalBlock: r(1.5, 2.5, "in", "observed-estimated"),
  goalActionRow: m(0.35, "in", "observed-estimated"),
  budgetRow: r(0.3, 0.4, "in", "observed-estimated"),
  budgetCategoryColumn: r(2.0, 2.5, "in", "observed-estimated"),
  budgetAmountColumn: r(1.0, 1.25, "in", "observed-estimated"),
  checkbox: r(0.14, 0.18, "in", "observed-estimated"),
  checkboxTextGap: r(0.1, 0.14, "in", "observed-estimated"),
  checklistRow: r(0.3, 0.4, "in", "observed-estimated"),
  readingTrackerRow: r(0.5, 0.7, "in", "observed-estimated"),
  gratitudeLine: m(0.35, "in", "observed-estimated", undefined, "3–5 lines/day or 1 box 1.5\""),
  prayerTrackerRow: m(0.4, "in", "observed-estimated", undefined, "request/answered columns"),
  worksheetTitleZone: r(0.7, 1.0, "in", "observed-estimated"),
} as const;

/** A7 typography norms — industry convention; no brand publishes a type spec. */
export const TYPOGRAPHY_NORMS = {
  coverTitle: r(24, 36, "pt", "observed-estimated"),
  monthTitle: r(18, 28, "pt", "observed-estimated"),
  weekdayLabel: r(8, 11, "pt", "observed-estimated", undefined, "uppercase, letterspacing 50–250"),
  dateNumeral: r(10, 14, "pt", "observed-estimated"),
  sectionHeading: r(10, 13, "pt", "observed-estimated", undefined, "bold, often small caps"),
  body: r(8, 10, "pt", "observed-estimated"),
  tinyLabel: r(6, 7.5, "pt", "observed-estimated", undefined, "never below 6 pt for print"),
  footer: r(6, 8, "pt", "observed-estimated"),
  timeLabel: r(7, 9, "pt", "observed-estimated", undefined, "right-aligned in time column"),
  /** Hard floor stated by the research: never below 6 pt for print. */
  minimumPrintSize: m(6, "pt", "observed-estimated"),
} as const;
