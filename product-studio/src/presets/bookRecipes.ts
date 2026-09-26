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

/** Meetings With God planner — the motivating structure (not its old design). */
export function meetingsWithGodBook(): BookNode[] {
  const spread = step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-mwg-spread" });
  return [
    section("Front Matter", [step("mission"), step("vision"), step("goals")]),
    section(
      "Every Month",
      [
        step("monthly-calendar", { type: "once" }),
        section("Every Week", [spread, step("lined-journal", { type: "after-module", moduleId: spread.id }, { copies: 2 })], "week"),
        step("review", { type: "end-of-period", period: "month" }),
      ],
      "month",
    ),
    step("review", { type: "end-of-period", period: "quarter" }),
  ];
}

export const BOOK_PRESETS: { id: string; label: string; build: () => BookNode[] }[] = [
  { id: "meetings-with-god", label: "Meetings With God planner (plan + journal)", build: meetingsWithGodBook },
  {
    id: "planner-journal",
    label: "Monthly + weekly planner with journal pages",
    build: () => [section("Every Month", [step("monthly-calendar", { type: "once" }), section("Every Week", [step("weekly-planner", { type: "once" }), step("lined-journal", { type: "once" })], "week")], "month")],
  },
];
