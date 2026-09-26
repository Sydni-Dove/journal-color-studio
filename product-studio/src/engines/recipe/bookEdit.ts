/**
 * Pure book-structure edits (the Book Structure panel is a thin UI over
 * these) and the lightweight generated-pages OUTLINE used for navigation —
 * text rows only, so a 300-page book never renders 300 previews.
 */
import type { ExpandedRecipe } from "./recipe";
import type { BookGroup, BookNode, BookStep, PageInstance, ProductRecipe, RecipeCadence, RecipeItem, RepeatRule } from "../../types/recipe";
import { getModule } from "../../presets/modules";

let seq = 0;
export const nodeId = (p: string) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`;

export function mapNodes(nodes: BookNode[], fn: (n: BookNode) => BookNode): BookNode[] {
  return nodes.map((n) => {
    const m = fn(n);
    return m.kind === "group" ? { ...m, children: mapNodes(m.children, fn) } : m;
  });
}

export function updateNode(nodes: BookNode[], id: string, patch: (n: BookNode) => BookNode): BookNode[] {
  return mapNodes(nodes, (n) => (n.id === id ? patch(n) : n));
}

export function removeNode(nodes: BookNode[], id: string): BookNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => (n.kind === "group" ? { ...n, children: removeNode(n.children, id) } : n));
}

/** Move a node up / down among its siblings. */
export function moveNode(nodes: BookNode[], id: string, dir: -1 | 1): BookNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return nodes;
    const next = [...nodes];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  return nodes.map((n) => (n.kind === "group" ? { ...n, children: moveNode(n.children, id, dir) } : n));
}

/** Deep copy with fresh ids; "after" references inside the copy follow the copied steps. */
export function cloneNode(n: BookNode): BookNode {
  const ids = new Map<string, string>();
  const collect = (x: BookNode) => {
    ids.set(x.id, nodeId(x.kind === "group" ? "g" : "s"));
    if (x.kind === "group") x.children.forEach(collect);
  };
  collect(n);
  const copy = (x: BookNode): BookNode => {
    if (x.kind === "group") return { ...x, id: ids.get(x.id)!, children: x.children.map(copy) };
    const c = x.cadence;
    return { ...x, id: ids.get(x.id)!, cadence: c.type === "after-module" && ids.has(c.moduleId) ? { ...c, moduleId: ids.get(c.moduleId)! } : c };
  };
  return copy(n);
}

/** Duplicate a node right after itself. */
export function duplicateNode(nodes: BookNode[], id: string): BookNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) return [...nodes.slice(0, i + 1), cloneNode(nodes[i]), ...nodes.slice(i + 1)];
  return nodes.map((n) => (n.kind === "group" ? { ...n, children: duplicateNode(n.children, id) } : n));
}

/** Append a node to a section (null = the top level). */
export function addNode(nodes: BookNode[], parentId: string | null, node: BookNode): BookNode[] {
  if (parentId === null) return [...nodes, node];
  return mapNodes(nodes, (n) => (n.id === parentId && n.kind === "group" ? { ...n, children: [...n.children, node] } : n));
}

export function newStep(module: BookStep["module"], cadence?: RecipeCadence): BookStep {
  const m = getModule(module);
  return { kind: "step", id: nodeId("s"), module, layoutId: m.layouts[0], cadence: cadence ?? m.defaultCadence };
}

export function newSection(label: string, period?: BookGroup["period"]): BookGroup {
  return { kind: "group", id: nodeId("g"), label, period, children: [] };
}

const MODULE_FOR_LAYOUT: Record<string, BookStep["module"]> = {
  "planner-monthly": "monthly-calendar",
  "planner-daily": "daily-planner",
  "planner-weekly-spread": "weekly-planner",
  "weekly-plan-mwg-spread": "weekly-planner",
  "journal-lined": "lined-journal",
  "notes-page": "notes",
  "guided-page": "custom",
};

function cadenceOf(r: RepeatRule): RecipeCadence {
  switch (r.kind) {
    case "count":
      return { type: "copies", count: r.count };
    case "every-year":
      return { type: "yearly" };
    case "every-quarter":
      return { type: "quarterly" };
    case "every-month":
      return { type: "monthly" };
    case "every-week":
      return { type: "weekly" };
    case "every-day":
      return { type: "daily" };
    default:
      return { type: "once" };
  }
}

/**
 * The flat step list as an equivalent book structure (same steps, same ids,
 * same cadence) — the starting point when an existing project opens the
 * Book Structure editor. "As listed" ordering becomes one section per step.
 */
export function structureFromItems(recipe: ProductRecipe): BookNode[] {
  const step = (it: RecipeItem): BookStep => ({ kind: "step", id: it.id, module: MODULE_FOR_LAYOUT[it.layoutId] ?? "custom", layoutId: it.layoutId, cadence: cadenceOf(it.repeat), ...(it.label ? { title: it.label } : {}) });
  if (recipe.ordering === "sequential") return recipe.items.map((it) => ({ kind: "group", id: `g-${it.id}`, label: "", children: [step(it)] }));
  return recipe.items.map(step);
}

// ─── Outline ────────────────────────────────────────────────────────────────
export type OutlineRow =
  | { kind: "heading"; label: string }
  | { kind: "pages"; from: number; to: number; index: number; label: string; detail?: string; filler: boolean; stepId: string };

const monthOf = (p: PageInstance, weeks: Map<string, string>): string | null =>
  p.period.kind === "month" ? p.period.key : p.period.kind === "week" ? (weeks.get(p.period.key) ?? null) : p.period.kind === "day" ? p.period.iso.slice(0, 7) : null;

function rowLabel(p: PageInstance, layoutLabel: (id: string) => string): { label: string; detail?: string } {
  if (p.filler) return { label: "Notes", detail: p.fillerReason ?? "Keeps the next spread on a left-hand page" };
  const m = p.module;
  if (!m) return { label: layoutLabel(p.layoutId) };
  if (m.type === "monthly-calendar") return { label: m.subtitle ?? m.title, detail: layoutLabel(p.layoutId) };
  if (m.type === "weekly-planner") return { label: m.subtitle ? `Week of ${m.subtitle}` : m.title, detail: layoutLabel(p.layoutId) };
  return { label: m.title, detail: m.subtitle };
}

/** Consecutive pages of one step occurrence become one row; month headings separate the months. */
export function bookOutline(recipe: ExpandedRecipe, layoutLabel: (id: string) => string, weekOwner: Map<string, string>, monthName: (key: string) => string): OutlineRow[] {
  const rows: OutlineRow[] = [];
  let month: string | null = null;
  const pages = recipe.pages;
  for (let i = 0; i < pages.length; ) {
    const p = pages[i];
    const base = p.key.replace(/:[01]$/, "").replace(/#\d+$/, "");
    let j = i + 1;
    while (j < pages.length && !p.filler && !pages[j].filler && pages[j].recipeItemId === p.recipeItemId && pages[j].key.replace(/:[01]$/, "").replace(/#\d+$/, "") === base) j++;
    const m = monthOf(p, weekOwner);
    if (m && m !== month) {
      rows.push({ kind: "heading", label: monthName(m) });
      month = m;
    }
    const { label, detail } = rowLabel(p, layoutLabel);
    const copies = new Set(pages.slice(i, j).map((x) => x.key.replace(/:[01]$/, ""))).size;
    rows.push({ kind: "pages", from: p.pageNumber, to: pages[j - 1].pageNumber, index: i, label: copies > 1 ? `${label} × ${copies}` : label, detail, filler: !!p.filler, stepId: p.recipeItemId });
    i = j;
  }
  return rows;
}
