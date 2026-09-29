/**
 * PAGE MODULE REGISTRY — what a page is FOR, separate from how it is laid
 * out. A module names its purpose, the layouts that can realise it, its
 * default cadence / start rule, and its period-aware title and prompts.
 *
 *   Meeting With God  → Guided page · Lined journal page · (future: prompt
 *                       sidebar, two-column conversation, …)
 *   Weekly planner    → Weekly spread · Weekly plan + Meeting With God spread
 *   Daily planner     → Daily planner (choose sections) · Luxury Daily Execution (Letter)
 *
 * Only modules with a real layout are registered; the PageModuleType union
 * already reserves the rest (tracker, worksheet, …) for later layouts.
 */
import type { CadenceKind, PageModuleType, PageStartRule, RecipeCadence, RecipePeriod } from "../types/recipe";

export type PeriodKind = RecipePeriod | "none";

export type PageModuleDefinition = {
  type: PageModuleType;
  label: string;
  /** Layouts that can realise this purpose (first = default). */
  layouts: string[];
  defaultCadence: RecipeCadence;
  /** Cadences that make sense for this purpose (the Book Structure editor offers only these). */
  cadences: CadenceKind[];
  /** Title per period the page belongs to (falls back to `none`). */
  titles: Partial<Record<PeriodKind, string>> & { none: string };
  /** Guided prompts per period (falls back to `none`). */
  prompts: Partial<Record<PeriodKind, string[]>> & { none: string[] };
  /** Side a single page of this purpose starts on unless the step says otherwise (default "any"). */
  defaultStart?: PageStartRule;
};

const GUIDED = ["guided-page", "journal-lined"];

/**
 * Supported cadences per page PURPOSE — declared, never assumed. A page you
 * can meaningfully repeat every day (a devotional, a journal page, a prayer
 * page, a tracker) supports "daily"; a calendar or a planning page is tied to
 * its own period (a monthly calendar is never daily; a weekly planner is
 * weekly; the daily planner is dated to a day). Unregistered purposes
 * (tracker, worksheet, …) are declared too, ready for their layouts.
 */
const EVERY_CADENCE: CadenceKind[] = ["once", "copies", "daily", "weekly", "monthly", "quarterly", "yearly", "after-module", "end-of-period"];
export const MODULE_CADENCES: Record<PageModuleType, CadenceKind[]> = {
  // A cover or a divider opens the book or a section: placed once where it sits.
  "cover-page": ["once"],
  "back-cover": ["once"],
  "divider-page": ["once"],
  "monthly-calendar": ["once", "monthly"],
  "weekly-planner": ["once", "weekly"],
  "daily-planner": ["daily"],
  "meeting-with-god": EVERY_CADENCE,
  "lined-journal": EVERY_CADENCE,
  "dot-journal": EVERY_CADENCE,
  "blank-journal": EVERY_CADENCE,
  notes: EVERY_CADENCE,
  prayer: EVERY_CADENCE,
  reflection: EVERY_CADENCE,
  devotional: EVERY_CADENCE,
  guided: EVERY_CADENCE,
  worksheet: EVERY_CADENCE,
  tracker: EVERY_CADENCE,
  custom: EVERY_CADENCE,
  // Direction-setting pages: set once or per long period, never daily.
  vision: ["once", "copies", "yearly", "quarterly"],
  mission: ["once", "copies", "yearly"],
  goals: ["once", "copies", "weekly", "monthly", "quarterly", "yearly", "after-module", "end-of-period"],
  "project-planning": ["once", "copies", "weekly", "monthly", "quarterly", "after-module"],
  // Reviews close a period (week and longer); a daily look-back is a Reflection page.
  review: ["once", "copies", "weekly", "monthly", "quarterly", "yearly", "after-module", "end-of-period"],
};

/** Whether a module supports a cadence kind. */
export const supportsCadence = (type: PageModuleType, kind: CadenceKind) => MODULE_CADENCES[type].includes(kind);

export const PAGE_MODULES: PageModuleDefinition[] = [
  // Covers and dividers open on a right-hand page, as in a bound book: a divider never
  // prints on the back of the previous one, and its tab sits on the outer edge.
  { type: "cover-page", label: "Cover & Divider Pages · Cover / title page", layouts: ["cover-page"], defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["cover-page"], titles: { none: "Plan" }, prompts: { none: [] }, defaultStart: "recto" },
  { type: "back-cover", label: "Cover & Divider Pages · End cover (back)", layouts: ["back-cover-page"], defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["back-cover"], titles: { none: "" }, prompts: { none: [] }, defaultStart: "verso" },
  { type: "divider-page", label: "Cover & Divider Pages · Section divider / tab page", layouts: ["divider-page"], defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["divider-page"], titles: { none: "Prayer" }, prompts: { none: [] }, defaultStart: "recto" },
  { type: "monthly-calendar", label: "Monthly calendar", layouts: ["planner-monthly"], defaultCadence: { type: "monthly" }, cadences: MODULE_CADENCES["monthly-calendar"], titles: { none: "Month" }, prompts: { none: [] } },
  {
    type: "weekly-planner",
    label: "Weekly planner",
    layouts: ["planner-weekly-spread", "weekly-plan-spread", "weekly-plan-mwg-spread"],
    defaultCadence: { type: "weekly" }, cadences: MODULE_CADENCES["weekly-planner"],
    titles: { none: "Week" },
    prompts: { none: [] },
  },
  { type: "daily-planner", label: "Daily planner", layouts: ["planner-daily", "daily-luxury-execution"], defaultCadence: { type: "daily" }, cadences: MODULE_CADENCES["daily-planner"], titles: { none: "Day" }, prompts: { none: [] } },
  {
    type: "meeting-with-god",
    label: "Meeting With God",
    layouts: [...GUIDED, "meeting-with-god-spread"],
    defaultCadence: { type: "weekly" }, cadences: MODULE_CADENCES["meeting-with-god"],
    titles: { none: "Meeting With God" },
    prompts: { none: ["Time with God", "What did God say?", "Response / action steps"] },
  },
  { type: "lined-journal", label: "Journal page", layouts: ["journal-lined"], defaultCadence: { type: "copies", count: 1 }, cadences: MODULE_CADENCES["lined-journal"], titles: { none: "Journal" }, prompts: { none: [] } },
  { type: "notes", label: "Notes page", layouts: ["notes-page"], defaultCadence: { type: "copies", count: 1 }, cadences: MODULE_CADENCES["notes"], titles: { none: "Notes" }, prompts: { none: [] } },
  { type: "prayer", label: "Prayer", layouts: GUIDED, defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["prayer"], titles: { none: "Prayer" }, prompts: { none: ["Praise & thanksgiving", "Requests", "Answers"] } },
  { type: "vision", label: "Vision", layouts: GUIDED, defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["vision"], titles: { none: "Vision" }, prompts: { none: ["What God has shown me", "Where I am going", "What it will look like"] } },
  { type: "mission", label: "Mission", layouts: GUIDED, defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["mission"], titles: { none: "Mission" }, prompts: { none: ["My assignment", "Who I serve", "How I carry it out"] } },
  { type: "goals", label: "Goals", layouts: GUIDED, defaultCadence: { type: "once" }, cadences: MODULE_CADENCES["goals"], titles: { none: "Goals", month: "Monthly Goals", quarter: "Quarterly Goals", year: "Goals for the Year" }, prompts: { none: ["Spiritual", "Personal & family", "Work & ministry", "First steps"] } },
  {
    type: "review",
    label: "Review",
    layouts: GUIDED,
    defaultCadence: { type: "end-of-period", period: "month" }, cadences: MODULE_CADENCES["review"],
    titles: { none: "Review", week: "Weekly Review", month: "Monthly Review", quarter: "Quarterly Review", year: "Year in Review" },
    prompts: {
      none: ["What went well?", "What did I learn?", "What carries forward?"],
      week: ["Wins", "Lessons", "Next week"],
      month: ["What did God say this month?", "What did I accomplish?", "What carries forward?"],
      quarter: ["Assessment", "Look back", "Look forward"],
      year: ["What did God say this year?", "What was accomplished?", "What is next?"],
    },
  },
  { type: "reflection", label: "Reflection", layouts: GUIDED, defaultCadence: { type: "copies", count: 1 }, cadences: MODULE_CADENCES["reflection"], titles: { none: "Reflection" }, prompts: { none: ["What happened", "What I noticed", "What I will carry forward"] } },
  {
    type: "devotional",
    label: "Devotional",
    layouts: GUIDED,
    defaultCadence: { type: "daily" },
    cadences: MODULE_CADENCES.devotional,
    titles: { none: "Devotional" },
    prompts: { none: ["Scripture", "What is God saying?", "Prayer", "Today I will"] },
  },
  { type: "guided", label: "Guided Lined Page (prompts + writing lines)", layouts: GUIDED, defaultCadence: { type: "copies", count: 1 }, cadences: MODULE_CADENCES.guided, titles: { none: "Guided Page" }, prompts: { none: ["Prompt 1", "Prompt 2", "Prompt 3"] } },
  { type: "custom", label: "Custom page", layouts: ["guided-page", "journal-lined", "notes-page"], defaultCadence: { type: "copies", count: 1 }, cadences: MODULE_CADENCES["custom"], titles: { none: "Custom Page" }, prompts: { none: [] } },
];

export function getModule(type: PageModuleType): PageModuleDefinition {
  return PAGE_MODULES.find((m) => m.type === type) ?? PAGE_MODULES[PAGE_MODULES.length - 1];
}

/** Where a single page of this purpose starts when its step sets no side. */
export function moduleStart(type: PageModuleType): PageStartRule {
  return getModule(type).defaultStart ?? "any";
}

export function moduleTitle(type: PageModuleType, period: PeriodKind): string {
  const m = getModule(type);
  return m.titles[period] ?? m.titles.none;
}

export function modulePrompts(type: PageModuleType, period: PeriodKind): string[] {
  const m = getModule(type);
  return m.prompts[period] ?? m.prompts.none;
}
