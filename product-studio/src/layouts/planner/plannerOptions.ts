/**
 * PLANNER OPTION ACCESSORS — one place that resolves the planner
 * customization switches, with their legacy defaults.
 *
 * Layer rule: layouts and engines read options only through these accessors,
 * never by branching on raw option fields. The UI writes the raw fields.
 */
import type { LayoutOptions } from "../../types/project";
import type { Orientation } from "../../types/geometry";

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

/** The planner sections that can each carry their own page orientation. */
export type PlannerSection = "monthly" | "weekly" | "daily";

/** Which layouts belong to each planner section. */
const SECTION_LAYOUTS: Record<PlannerSection, readonly string[]> = {
  monthly: ["planner-monthly"],
  weekly: ["planner-weekly-spread", "weekly-plan-spread", "weekly-plan-mwg-spread"],
  daily: ["planner-daily", "daily-luxury-execution", "notepad-daily"],
};

const LAYOUT_SECTION = new Map<string, PlannerSection>();
for (const [section, ids] of Object.entries(SECTION_LAYOUTS) as [PlannerSection, readonly string[]][]) {
  for (const id of ids) LAYOUT_SECTION.set(id, section);
}

/** The planner section a layout belongs to, or null for non-planner layouts. */
export function plannerSectionOf(layoutId: string): PlannerSection | null {
  return LAYOUT_SECTION.get(layoutId) ?? null;
}

/**
 * Page orientation for a planner layout: the section's override, or the
 * project's orientation when the section has none.
 */
export function sectionPageOrientationOf(
  o: Pick<LayoutOptions, "plannerPageOrientation">,
  projectOrientation: Orientation,
  layoutId: string,
): Orientation {
  const section = plannerSectionOf(layoutId);
  if (!section) return projectOrientation;
  return o.plannerPageOrientation?.[section] ?? projectOrientation;
}

/** The planner sections actually present in a list of layout ids. */
export function plannerSectionsIn(layoutIds: readonly string[]): PlannerSection[] {
  const seen = new Set<PlannerSection>();
  for (const id of layoutIds) {
    const s = plannerSectionOf(id);
    if (s) seen.add(s);
  }
  return (["monthly", "weekly", "daily"] as PlannerSection[]).filter((s) => seen.has(s));
}

/** Monthly calendar arrangement: the classic grid, or the sideways (bullet-journal) one. */
export type MonthlyArrangement = "classic" | "rotated";

/** How the monthly calendar is arranged. Absent = "rotated" so portrait planners use the wider sideways month by default. */
export function monthlyArrangementOf(o: Pick<LayoutOptions, "monthlyArrangement">): MonthlyArrangement {
  // Explicit classic remains available, but saved projects that predate this
  // option should adopt the intended sideways monthly layout automatically.
  return o.monthlyArrangement === "classic" ? "classic" : "rotated";
}
