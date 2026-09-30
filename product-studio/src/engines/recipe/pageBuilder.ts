/**
 * PAGE BUILDER — the product's pages grouped the way a planner maker thinks
 * (Cover, Yearly, Monthly, Weekly, Daily, …) and the edits that add a kind of
 * page in the right place without the maker arranging repeating sections.
 *
 * Pure functions over the book structure. They only add or change steps and
 * sections; expansion (order, dates, sides) stays in bookRecipe.ts, geometry
 * in the layouts.
 *
 * Where a kind of page goes:
 *   Front cover   first page of the book
 *   End cover     last page of the book
 *   Monthly       at the start of "Every month"
 *   Weekly        in "Every week" (inside "Every month" when there is one)
 *   Daily         after the weekly pages of each week, else every day of each month
 *   Dividers, notes, journal pages   before the end cover
 */
import { getModule } from "../../presets/modules";
import type { BookGroup, BookNode, BookStep, PageModuleType, RecipeCadence } from "../../types/recipe";
import { bookSteps } from "./bookRecipe";
import { addNode, newSection, newStep, nodeId, updateNode } from "./bookEdit";

export type BuilderCategory = "cover" | "yearly" | "monthly" | "weekly" | "daily" | "journal" | "notes" | "dividers";

export const BUILDER_CATEGORIES: { id: BuilderCategory; label: string; empty: string }[] = [
  { id: "cover", label: "Cover", empty: "Not added" },
  { id: "yearly", label: "Yearly", empty: "Not added" },
  { id: "monthly", label: "Monthly", empty: "Not added" },
  { id: "weekly", label: "Weekly", empty: "Not added" },
  { id: "daily", label: "Daily", empty: "Not added" },
  { id: "journal", label: "Journal & guided pages", empty: "Not added" },
  { id: "notes", label: "Notes & lists", empty: "Not added" },
  { id: "dividers", label: "Dividers & tabs", empty: "Not added" },
];

/** The builder categories a product lists first; the rest are offered under "More kinds of pages" (hybrids). */
export function primaryCategories(productType: string): BuilderCategory[] {
  switch (productType) {
    case "planner":
    case "insert":
    case "deskpad":
      return ["cover", "yearly", "monthly", "weekly", "daily", "notes", "dividers"];
    case "journal":
    case "devotional":
    case "workbook":
    case "notebook":
      return ["cover", "journal", "notes", "dividers"];
    default:
      return ["cover", "journal", "notes", "dividers"];
  }
}

type Period = "none" | "year" | "quarter" | "month" | "week" | "day";
const CADENCE_PERIOD: Partial<Record<RecipeCadence["type"], Period>> = { yearly: "year", quarterly: "quarter", monthly: "month", weekly: "week", daily: "day" };

/** The period a step repeats in: its own cadence, else the nearest repeating section around it. */
export function stepPeriod(step: BookStep, parents: BookGroup[]): Period {
  const own = CADENCE_PERIOD[step.cadence.type] ?? (step.cadence.type === "end-of-period" ? step.cadence.period : undefined);
  if (own) return own;
  for (let i = parents.length - 1; i >= 0; i--) if (parents[i].period) return parents[i].period as Period;
  return "none";
}

/** Which builder category a step is listed under. */
export function categoryOf(step: BookStep, parents: BookGroup[]): BuilderCategory {
  switch (step.module) {
    case "cover-page":
    case "back-cover":
      return "cover";
    case "divider-page":
      return "dividers";
    case "monthly-calendar":
      return "monthly";
    case "weekly-planner":
      return "weekly";
    case "daily-planner":
      return "daily";
    case "notes":
      return "notes";
  }
  switch (stepPeriod(step, parents)) {
    case "day":
      return "daily";
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "quarter":
    case "year":
      return "yearly";
    default:
      return "journal";
  }
}

export type BuilderRow = { step: BookStep; parents: BookGroup[]; category: BuilderCategory };

export function builderRows(structure: BookNode[]): BuilderRow[] {
  return bookSteps(structure).map(({ step, parents }) => ({ step, parents, category: categoryOf(step, parents) }));
}

// ─── Finding the right place ───────────────────────────────────────────────
function findGroup(nodes: BookNode[], period: BookGroup["period"]): BookGroup | null {
  for (const n of nodes) {
    if (n.kind !== "group") continue;
    if (n.period === period) return n;
    const inner = findGroup(n.children, period);
    if (inner) return inner;
  }
  return null;
}

const isEndCover = (n: BookNode) => n.kind === "step" && n.module === "back-cover";

/** Insert at the top level, keeping the end cover last. */
function insertBeforeEnd(nodes: BookNode[], node: BookNode): BookNode[] {
  const i = nodes.findIndex(isEndCover);
  return i < 0 ? [...nodes, node] : [...nodes.slice(0, i), node, ...nodes.slice(i)];
}

function prependTo(nodes: BookNode[], groupId: string, node: BookNode): BookNode[] {
  return updateNode(nodes, groupId, (g) => (g.kind === "group" ? { ...g, children: [node, ...g.children] } : g));
}

// ─── Adding pages ──────────────────────────────────────────────────────────
export function addFrontCover(nodes: BookNode[]): BookNode[] {
  return [newStepWith("cover-page", { type: "once" }, { title: "Plan", cover: { subtitle: "WITH PURPOSE" } }), ...nodes];
}

export function addEndCover(nodes: BookNode[]): BookNode[] {
  return [...nodes, newStep("back-cover", { type: "once" })];
}

export function addMonthly(nodes: BookNode[]): BookNode[] {
  const cal = newStep("monthly-calendar", { type: "once" });
  const month = findGroup(nodes, "month");
  if (month) return prependTo(nodes, month.id, cal);
  // A new "Every month" wraps any top-level "Every week", so each month's weeks follow its calendar.
  const week = nodes.find((n): n is BookGroup => n.kind === "group" && n.period === "week");
  const g: BookGroup = { ...newSection("Every Month", "month"), children: week ? [cal, week] : [cal] };
  const rest = week ? nodes.filter((n) => n !== week) : nodes;
  return insertBeforeEnd(rest, g);
}

export function addWeekly(nodes: BookNode[]): BookNode[] {
  const plan = newStep("weekly-planner", { type: "once" });
  const week = findGroup(nodes, "week");
  if (week) return prependTo(nodes, week.id, plan);
  const g: BookGroup = { ...newSection("Every Week", "week"), children: [plan] };
  const month = findGroup(nodes, "month");
  return month ? addNode(nodes, month.id, g) : insertBeforeEnd(nodes, g);
}

export function addDaily(nodes: BookNode[]): BookNode[] {
  const week = findGroup(nodes, "week");
  if (week) return addNode(nodes, week.id, newStep("daily-planner", { type: "daily" }));
  const month = findGroup(nodes, "month");
  if (month) return addNode(nodes, month.id, newStep("daily-planner", { type: "daily" }));
  return insertBeforeEnd(nodes, newStep("daily-planner", { type: "daily" }));
}

/** Year-level pages: goals opening each year, a review closing it. */
export function addYearly(nodes: BookNode[], kind: "goals" | "review"): BookNode[] {
  if (kind === "goals") {
    const i = nodes.findIndex((n) => !(n.kind === "step" && (n.module === "cover-page" || n.module === "divider-page")));
    const step = newStep("goals", { type: "yearly" });
    return i < 0 ? [...nodes, step] : [...nodes.slice(0, i), step, ...nodes.slice(i)];
  }
  return insertBeforeEnd(nodes, newStep("review", { type: "end-of-period", period: "year" }));
}

/** Pages added to every month: goals at its start, a review or notes at its end. */
export function addToEachMonth(nodes: BookNode[], kind: "goals" | "review" | "notes"): BookNode[] {
  let out = nodes;
  let month = findGroup(out, "month");
  if (!month) {
    out = addMonthly(out);
    month = findGroup(out, "month")!;
  }
  if (kind === "goals") {
    const g = month;
    const calIndex = g.children.findIndex((n) => n.kind === "step" && n.module === "monthly-calendar");
    const step = newStep("goals", { type: "once" });
    return updateNode(out, g.id, (x) => (x.kind === "group" ? { ...x, children: [...x.children.slice(0, calIndex + 1), step, ...x.children.slice(calIndex + 1)] } : x));
  }
  if (kind === "review") return addNode(out, month.id, newStep("review", { type: "end-of-period", period: "month" }));
  return addNode(out, month.id, newStepWith("notes", { type: "end-of-period", period: "month" }, { title: "Notes" }));
}

export type WeeklyJournalKind = "reflection" | "scripture" | "meeting-with-god" | "custom";

export const WEEKLY_JOURNAL: { id: WeeklyJournalKind; label: string; hint: string }[] = [
  { id: "reflection", label: "Simple reflection", hint: "What happened, what I noticed, what I carry forward." },
  { id: "scripture", label: "Scripture + reflection", hint: "A scripture, what it says to me, and my prayer." },
  { id: "meeting-with-god", label: "Meeting With God", hint: "Open writing, What did God say?, and your response — on two facing pages." },
  { id: "custom", label: "Custom", hint: "A page you fill with your own sections." },
];

/**
 * A guided journal with every week, placed after that week's weekly pages
 * ("after"), or — for Meeting With God beside a Weekly Plan — on the weekly
 * spread's facing page ("same-spread").
 */
export function addToEachWeek(nodes: BookNode[], kind: WeeklyJournalKind, placement: "after" | "same-spread" = "after"): BookNode[] {
  let out = nodes;
  let weekly = builderRows(out).find((r) => r.step.module === "weekly-planner");
  if (!weekly) {
    out = addWeekly(out);
    weekly = builderRows(out).find((r) => r.step.module === "weekly-planner")!;
  }
  if (placement === "same-spread" && kind === "meeting-with-god") {
    return updateNode(out, weekly.step.id, (n) => ({ ...n, layoutId: "weekly-plan-mwg-spread" }) as BookNode);
  }
  const after: RecipeCadence = { type: "after-module", moduleId: weekly.step.id };
  const step =
    kind === "meeting-with-god"
      ? newStepWith("meeting-with-god", after, { layoutId: "meeting-with-god-spread" })
      : kind === "reflection"
        ? newStepWith("reflection", after, {})
        : kind === "scripture"
          ? newStepWith("guided", after, { title: "Scripture + Reflection", prompts: ["Scripture", "What is God saying to me?", "My prayer"] })
          : newStepWith("custom", after, { layoutId: "guided-page", title: "Weekly Journal", promptSet: { blocks: [] } });
  const parent = weekly.parents.at(-1);
  if (parent) return addNode(out, parent.id, step);
  // The weekly step is at the top level: its guided journal sits beside it there.
  const i = out.findIndex((n) => n.id === weekly!.step.id);
  return [...out.slice(0, i + 1), step, ...out.slice(i + 1)];
}

export function addDivider(nodes: BookNode[], title = "Section", tab = true): BookNode[] {
  return insertBeforeEnd(nodes, newStepWith("divider-page", { type: "once" }, { title, cover: tab ? { tab: { show: true, style: "rounded" } } : {} }));
}

export function addPageOfType(nodes: BookNode[], module: PageModuleType): BookNode[] {
  return insertBeforeEnd(nodes, newStep(module));
}

function newStepWith(module: PageModuleType, cadence: RecipeCadence, extra: Partial<BookStep>): BookStep {
  const m = getModule(module);
  return { kind: "step", id: nodeId("s"), module, layoutId: m.layouts[0], cadence, ...extra };
}
