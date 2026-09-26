/**
 * PAGE MODULE REGISTRY — what a page is FOR, separate from how it is laid
 * out. A module names its purpose, the layouts that can realise it, its
 * default cadence / start rule, and its period-aware title and prompts.
 *
 *   Meeting With God  → Guided page · Lined journal page · (future: prompt
 *                       sidebar, two-column conversation, …)
 *   Weekly planner    → Weekly spread · Weekly plan + Meeting With God spread
 *
 * Only modules with a real layout are registered; the PageModuleType union
 * already reserves the rest (tracker, …) for later layouts.
 */
import type { PageModuleType, RecipeCadence, RecipePeriod } from "../types/recipe";

export type PeriodKind = RecipePeriod | "none";

export type PageModuleDefinition = {
  type: PageModuleType;
  label: string;
  /** Layouts that can realise this purpose (first = default). */
  layouts: string[];
  defaultCadence: RecipeCadence;
  /** Title per period the page belongs to (falls back to `none`). */
  titles: Partial<Record<PeriodKind, string>> & { none: string };
  /** Guided prompts per period (falls back to `none`). */
  prompts: Partial<Record<PeriodKind, string[]>> & { none: string[] };
};

const GUIDED = ["guided-page", "journal-lined"];

export const PAGE_MODULES: PageModuleDefinition[] = [
  { type: "daily-planner", label: "Daily planner", layouts: ["planner-daily"], defaultCadence: { type: "daily" }, titles: { none: "Daily Plan" }, prompts: { none: [] } },
  { type: "monthly-calendar", label: "Monthly calendar", layouts: ["planner-monthly"], defaultCadence: { type: "monthly" }, titles: { none: "Month" }, prompts: { none: [] } },
  {
    type: "weekly-planner",
    label: "Weekly planner",
    layouts: ["planner-weekly-spread", "weekly-plan-mwg-spread"],
    defaultCadence: { type: "weekly" },
    titles: { none: "Week" },
    prompts: { none: [] },
  },
  {
    type: "meeting-with-god",
    label: "Meeting With God",
    layouts: GUIDED,
    defaultCadence: { type: "weekly" },
    titles: { none: "Meeting With God" },
    prompts: { none: ["Time with God", "What did God say?", "Response / action steps"] },
  },
  { type: "lined-journal", label: "Journal page", layouts: ["journal-lined"], defaultCadence: { type: "copies", count: 1 }, titles: { none: "Journal" }, prompts: { none: [] } },
  { type: "notes", label: "Notes page", layouts: ["notes-page"], defaultCadence: { type: "copies", count: 1 }, titles: { none: "Notes" }, prompts: { none: [] } },
  { type: "prayer", label: "Prayer", layouts: GUIDED, defaultCadence: { type: "once" }, titles: { none: "Prayer" }, prompts: { none: ["Praise & thanksgiving", "Requests", "Answers"] } },
  { type: "vision", label: "Vision", layouts: GUIDED, defaultCadence: { type: "once" }, titles: { none: "Vision" }, prompts: { none: ["What God has shown me", "Where I am going", "What it will look like"] } },
  { type: "mission", label: "Mission", layouts: GUIDED, defaultCadence: { type: "once" }, titles: { none: "Mission" }, prompts: { none: ["My assignment", "Who I serve", "How I carry it out"] } },
  { type: "goals", label: "Goals", layouts: GUIDED, defaultCadence: { type: "once" }, titles: { none: "Goals", month: "Monthly Goals", quarter: "Quarterly Goals", year: "Goals for the Year" }, prompts: { none: ["Spiritual", "Personal & family", "Work & ministry", "First steps"] } },
  {
    type: "review",
    label: "Review",
    layouts: GUIDED,
    defaultCadence: { type: "end-of-period", period: "month" },
    titles: { none: "Review", week: "Weekly Review", month: "Monthly Review", quarter: "Quarterly Review", year: "Year in Review" },
    prompts: {
      none: ["What went well?", "What did I learn?", "What carries forward?"],
      week: ["Wins", "Lessons", "Next week"],
      month: ["What did God say this month?", "What did I accomplish?", "What carries forward?"],
      quarter: ["Assessment", "Look back", "Look forward"],
      year: ["What did God say this year?", "What was accomplished?", "What is next?"],
    },
  },
  { type: "reflection", label: "Reflection", layouts: GUIDED, defaultCadence: { type: "copies", count: 1 }, titles: { none: "Reflection" }, prompts: { none: ["What happened", "What I noticed", "What I will carry forward"] } },
  { type: "custom", label: "Custom page", layouts: ["guided-page", "journal-lined", "notes-page"], defaultCadence: { type: "copies", count: 1 }, titles: { none: "Notes" }, prompts: { none: ["Notes"] } },
];

export function getModule(type: PageModuleType): PageModuleDefinition {
  return PAGE_MODULES.find((m) => m.type === type) ?? PAGE_MODULES[PAGE_MODULES.length - 1];
}

export function moduleTitle(type: PageModuleType, period: PeriodKind): string {
  const m = getModule(type);
  return m.titles[period] ?? m.titles.none;
}

export function modulePrompts(type: PageModuleType, period: PeriodKind): string[] {
  const m = getModule(type);
  return m.prompts[period] ?? m.prompts.none;
}
