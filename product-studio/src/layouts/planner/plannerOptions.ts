/**
 * PLANNER OPTION ACCESSORS — one place that resolves the planner
 * customization switches, with their legacy defaults.
 *
 * Layer rule: layouts and engines read options only through these accessors,
 * never by branching on raw option fields. The UI writes the raw fields.
 */
import type { LayoutOptions } from "../../types/project";

export type SpreadMode = "preserve" | "continuous";
export type FillerKind = "notes" | "blank";

/** Facing-page behavior: preserve spreads (insert fillers) or flow continuously. */
export function spreadModeOf(o: Pick<LayoutOptions, "spreadMode">): SpreadMode {
  return o.spreadMode ?? "preserve";
}

/** What a required filler page carries. */
export function fillerKindOf(o: Pick<LayoutOptions, "fillerKind">): FillerKind {
  return o.fillerKind ?? "notes";
}

/** Monthly calendar's notes sidebar. Falls back to the legacy master switch. */
export function monthlySidebarOf(o: Pick<LayoutOptions, "monthlySidebar" | "showSidebar">): boolean {
  return o.monthlySidebar ?? o.showSidebar;
}

/** Weekly spread's sidebar. Falls back to the legacy master switch. */
export function weeklySidebarOf(o: Pick<LayoutOptions, "weeklySidebar" | "showSidebar">): boolean {
  return o.weeklySidebar ?? o.showSidebar;
}

/** Weekly spread's extra Notes slot (only relevant when its sidebar is off). */
export function weeklyNotesOf(o: Pick<LayoutOptions, "weeklyNotes">): boolean {
  return o.weeklyNotes ?? true;
}

/** Weekly plan spread's foot sections. */
export function weeklyPlanNotesOf(o: Pick<LayoutOptions, "weeklyPlanNotes">): boolean {
  return o.weeklyPlanNotes ?? true;
}

export function weeklyPlanPrioritiesOf(o: Pick<LayoutOptions, "weeklyPlanPriorities">): boolean {
  return o.weeklyPlanPriorities ?? true;
}
