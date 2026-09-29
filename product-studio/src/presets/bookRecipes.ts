/**
 * Book structures (composite recipes). These are STRUCTURES — which modules,
 * in what order, how often — never page designs: every step names a
 * purpose (module) and a layout the user can swap.
 */
import type { BookGroup, BookNode, BookStep, PageModuleType, RecipeCadence } from "../types/recipe";
import { getModule } from "./modules";

let seq = 0;
const uid = (p: string) => `${p}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function step(module: PageModuleType, cadence?: RecipeCadence, extra: Partial<BookStep> = {}): BookStep {
  const m = getModule(module);
  return { kind: "step", id: extra.id ?? uid("s"), module, layoutId: m.layouts[0], cadence: cadence ?? m.defaultCadence, ...extra };
}

export function section(label: string, children: BookNode[], period?: BookGroup["period"], id?: string): BookGroup {
  return { kind: "group", id: id ?? uid("g"), label, period, children };
}

/** A complete book opens with its front cover and closes with its end cover. */
export function withCovers(body: BookNode[]): BookNode[] {
  return [step("cover-page", { type: "once" }, { title: "Plan", cover: { subtitle: "WITH PURPOSE" } }), ...body, step("back-cover", { type: "once" })];
}

/** Meetings With God planner — the motivating structure (not its old design). */
export function meetingsWithGodBook(includeDaily = false): BookNode[] {
  const plan = step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-spread" });
  const spread = step("meeting-with-god", { type: "once" }, { layoutId: "meeting-with-god-spread" });
  return withCovers([
    section("Front Matter", [step("mission"), step("vision"), step("goals")]),
    section(
      "Every Month",
      [
        step("monthly-calendar", { type: "once" }),
        section("Every Week", [plan, spread, step("lined-journal", { type: "after-module", moduleId: spread.id }, { copies: 2 }), ...(includeDaily ? [step("daily-planner")] : [])], "week"),
        step("review", { type: "end-of-period", period: "month" }),
      ],
      "month",
    ),
    step("review", { type: "end-of-period", period: "quarter" }),
  ]);
}

/**
 * Daily planner book: front matter, then each month — its calendar, each week's
 * plan spread and Meeting With God spread followed by that week's daily pages —
 * and a monthly review.
 */
export function dailyPlannerBook(): BookNode[] {
  const plan = step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-spread" });
  const spread = step("meeting-with-god", { type: "once" }, { layoutId: "meeting-with-god-spread" });
  return withCovers([
    section("Front Matter", [step("mission"), step("vision"), step("goals")]),
    section(
      "Every Month",
      [step("monthly-calendar", { type: "once" }), section("Every Week", [plan, spread, step("daily-planner", { type: "daily" })], "week"), step("review", { type: "end-of-period", period: "month" })],
      "month",
    ),
  ]);
}

export const BOOK_PRESETS: { id: string; label: string; build: () => BookNode[] }[] = [
  { id: "meetings-with-god", label: "Meetings With God Planner", build: meetingsWithGodBook },
  { id: "meetings-with-god-daily", label: "Meetings With God Planner + Daily Pages", build: () => meetingsWithGodBook(true) },
  { id: "daily-planner", label: "Daily Planner + Meetings With God", build: dailyPlannerBook },
  {
    id: "planner-journal",
    label: "Monthly + Weekly Journal Planner",
    build: () => withCovers([section("Every Month", [step("monthly-calendar", { type: "once" }), section("Every Week", [step("weekly-planner", { type: "once" }), step("lined-journal", { type: "once" })], "week")], "month")]),
  },
];

/** Optional coordinating set; never added to existing recipes automatically. */
export function neutralLuxeDividers(): BookNode[] {
  const names = ["Prayer", "Vision", "Plan", "Schedule", "Work", "Home", "Wellness", "Finances", "Notes"];
  const subtitles = ["Draw near", "See clearly", "Make a way", "Be steady", "Build well", "Cultivate peace", "Care for you", "Be a good steward", "Ideas & extras"];
  const colors = ["secondary", "primary", "decorativeAccent", "decorHighlight", "secondary", "secondary", "primary", "accent", "text"] as const;
  return [step("cover-page", { type: "once" }, { title: "Plan", cover: { subtitle: "WITH PURPOSE" } }), ...names.map((title, i) => step("divider-page", { type: "once" }, { title, cover: { subtitle: subtitles[i], tab: { show: true, style: "rounded", color: colors[i], leopard: i === 4 } } }))];
}
