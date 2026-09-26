/**
 * COMPOSITE BOOK EXPANSION — a nested book structure (sections, period
 * groups, module steps with cadence) + the project's date range → ordered
 * physical pages. It decides ORDER, RECURRENCE and PAGE SIDE only; each
 * layout still solves its own geometry.
 *
 * Scope: every list expands inside a period (the whole range at the top,
 * a month inside "Every Month", a week inside "Every Week"). Cadence is
 * relative to that scope: "once" = once per enclosing period; "weekly" =
 * each week the scope owns (a week belongs to the month of its first day in
 * range, so no week is generated twice).
 *
 * Ordering inside a list: steps that are not periodic keep their place —
 * before the first periodic item = leading, after = trailing — and periodic
 * items (period steps, period groups, end-of-period steps) interleave
 * chronologically: year/quarter/month openers → weeks and days by date →
 * end of month → end of quarter → end of year. "After <step>" steps follow
 * every occurrence of their target in the same section.
 *
 * Paging: a module's start rule (any / recto / verso / spread) is honoured
 * in bound books by inserting ONE intentional, labelled filler page when the
 * next page is on the wrong side. Spreads always open on a verso.
 */
import { formatWeekRange, MONTH_NAMES } from "../calendar/calendar";
import { modulePrompts, moduleTitle, type PeriodKind } from "../../presets/modules";
import type { CalendarData } from "../../types/calendar";
import type { PageSide } from "../../types/geometry";
import type { BookGroup, BookNode, BookStep, PageInstance, PageStartRule, PeriodRef, RecipePeriod } from "../../types/recipe";
import type { ExpandedRecipe, RecipeContext, RecipeDiagnostic } from "./recipe";

export type BookContext = RecipeContext & {
  /** Period a layout needs from its page ("none" = any). */
  layoutPeriod: (layoutId: string) => "none" | "month" | "week" | "day";
  layoutLabel: (layoutId: string) => string;
};

type SortKey = [string, number, string, number];
type Leaf = { step: BookStep; period: PeriodRef; copy: number; path: string; owner: string };
type Item = { leaves: Leaf[]; sort: SortKey | null; order: number };

const PERIODIC_CADENCE = new Set(["yearly", "quarterly", "monthly", "weekly", "daily", "end-of-period"]);
const CADENCE_PERIOD: Record<string, RecipePeriod> = { yearly: "year", quarterly: "quarter", monthly: "month", weekly: "week", daily: "day" };
const PERIOD_LABEL: Record<RecipePeriod | "none", string> = { year: "year", quarter: "quarter", month: "month", week: "week", day: "day", none: "book" };

// ─── Periods ───────────────────────────────────────────────────────────────
export function periodKey(p: PeriodRef): string {
  switch (p.kind) {
    case "none":
      return "once";
    case "copy":
      return `copy${p.index}`;
    case "year":
      return `y${p.year}`;
    case "quarter":
    case "month":
    case "week":
      return p.key;
    case "day":
      return p.iso;
  }
}

const periodKind = (p: PeriodRef): PeriodKind => (p.kind === "none" || p.kind === "copy" ? "none" : p.kind);

export function periodLabel(cal: CalendarData | null, p: PeriodRef): string | undefined {
  if (!cal) return undefined;
  switch (p.kind) {
    case "year":
      return String(p.year);
    case "quarter": {
      const q = cal.quarters.find((x) => x.key === p.key);
      return q ? `Q${q.quarter} ${q.year}` : p.key;
    }
    case "month": {
      const [y, m] = p.key.split("-").map(Number);
      return `${MONTH_NAMES[m - 1]} ${y}`;
    }
    case "week": {
      const w = cal.weeks.find((x) => x.key === p.key);
      return w ? formatWeekRange(w) : p.key;
    }
    case "day":
      return p.iso;
    default:
      return undefined;
  }
}

function monthsIn(cal: CalendarData, scope: PeriodRef): string[] | null {
  switch (scope.kind) {
    case "none":
    case "copy":
      return cal.months.map((m) => m.key);
    case "year":
      return cal.years.find((y) => y.year === scope.year)?.monthKeys ?? [];
    case "quarter":
      return (cal.quarters.find((q) => q.key === scope.key)?.monthKeys ?? []).filter((k) => cal.months.some((m) => m.key === k));
    case "month":
      return [scope.key];
    default:
      return null;
  }
}

/** Periods of `kind` that belong to `scope` (each exactly once). */
export function periodsWithin(cal: CalendarData, scope: PeriodRef, kind: RecipePeriod): PeriodRef[] {
  const top = scope.kind === "none" || scope.kind === "copy";
  if (scope.kind === kind) return [scope];
  const months = monthsIn(cal, scope);
  switch (kind) {
    case "year":
      return top ? cal.years.map((y) => ({ kind: "year", year: y.year })) : [];
    case "quarter":
      if (top) return cal.quarters.map((q) => ({ kind: "quarter", key: q.key }));
      return scope.kind === "year" ? cal.quarters.filter((q) => q.year === scope.year).map((q) => ({ kind: "quarter", key: q.key })) : [];
    case "month":
      return months ? months.map((key) => ({ kind: "month", key })) : [];
    case "week":
      if (!months) return [];
      return cal.weeks.filter((w) => months.includes(w.ownerMonthKey)).map((w) => ({ kind: "week", key: w.key }));
    case "day": {
      if (scope.kind === "week") return (cal.weeks.find((w) => w.key === scope.key)?.days ?? []).filter((d) => d.inRange).map((d) => ({ kind: "day", iso: d.iso }));
      if (!months) return [];
      return cal.days.filter((d) => d.inRange && months.includes(d.iso.slice(0, 7))).map((d) => ({ kind: "day", iso: d.iso }));
    }
  }
}

function startKey(cal: CalendarData, p: PeriodRef): SortKey {
  switch (p.kind) {
    case "year": {
      const m = cal.years.find((y) => y.year === p.year)!.monthKeys.find((k) => cal.months.some((x) => x.key === k)) ?? `${p.year}-01`;
      return [m, 0, `${m}-01`, 0];
    }
    case "quarter": {
      const m = cal.quarters.find((q) => q.key === p.key)!.monthKeys.find((k) => cal.months.some((x) => x.key === k))!;
      return [m, 0, `${m}-01`, 1];
    }
    case "month":
      return [p.key, 0, `${p.key}-01`, 2];
    case "week": {
      const w = cal.weeks.find((x) => x.key === p.key)!;
      return [w.ownerMonthKey, 1, w.startIso, 3];
    }
    case "day":
      return [p.iso.slice(0, 7), 1, p.iso, 4];
    default:
      return ["", 0, "", 0];
  }
}

function endKey(cal: CalendarData, p: PeriodRef): SortKey {
  const inRange = (keys: string[]) => keys.filter((k) => cal.months.some((x) => x.key === k));
  switch (p.kind) {
    case "week": {
      const w = cal.weeks.find((x) => x.key === p.key)!;
      return [w.ownerMonthKey, 1, `${w.endIso}~`, 3];
    }
    case "month":
      return [p.key, 2, "", 0];
    case "quarter":
      return [inRange(cal.quarters.find((q) => q.key === p.key)!.monthKeys).at(-1)!, 3, "", 0];
    case "year":
      return [inRange(cal.years.find((y) => y.year === p.year)!.monthKeys).at(-1)!, 4, "", 0];
    default:
      return ["~", 9, "", 0];
  }
}

const cmp = (a: Item, b: Item): number => {
  const x = a.sort!, y = b.sort!;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return a.order - b.order;
};

// ─── Expansion ─────────────────────────────────────────────────────────────
const isPeriodic = (n: BookNode) => (n.kind === "group" ? !!n.period : PERIODIC_CADENCE.has(n.cadence.type));

function copiesOf(step: BookStep, diags: RecipeDiagnostic[]): number {
  const c = step.copies ?? 1;
  if (!Number.isInteger(c) || c < 1) {
    diags.push({ severity: "error", itemId: step.id, message: `"${step.title ?? step.module}": copies must be a positive whole number (got ${c}).` });
    return 0;
  }
  return c;
}

function leavesFor(step: BookStep, period: PeriodRef, path: string, n: number, base = 0): Leaf[] {
  return Array.from({ length: n }, (_, i) => ({ step, period, copy: base + i, path, owner: step.id }));
}

function expandList(nodes: BookNode[], scope: PeriodRef, path: string, ctx: BookContext, diags: RecipeDiagnostic[]): Leaf[] {
  const cal = ctx.calendar;
  const items: Item[] = [];
  const scopeLabel = PERIOD_LABEL[periodKind(scope) as RecipePeriod | "none"];
  nodes.forEach((node, order) => {
    if (node.kind === "group") {
      items.push(...expandGroup(node, scope, path, order, ctx, diags));
      return;
    }
    const step = node;
    const n = copiesOf(step, diags);
    if (!n) return;
    const c = step.cadence;
    switch (c.type) {
      case "once":
        items.push({ leaves: leavesFor(step, scope, path, n), sort: null, order });
        return;
      case "copies":
        if (!Number.isInteger(c.count) || c.count < 1) {
          diags.push({ severity: "error", itemId: step.id, message: `Copy count must be a positive whole number (got ${c.count}).` });
          return;
        }
        // Outside any period, each copy is its own numbered copy (as flat recipes always numbered them).
        items.push({
          leaves: scope.kind === "none" ? Array.from({ length: c.count * n }, (_, i): Leaf => ({ step, period: { kind: "copy", index: i }, copy: 0, path, owner: step.id })) : leavesFor(step, scope, path, c.count * n),
          sort: null,
          order,
        });
        return;
      case "after-module":
        return; // placed after its target below
      case "end-of-period": {
        if (!cal) return void diags.push({ severity: "error", itemId: step.id, message: `"End of ${c.period}" needs the project's date range.` });
        const periods = periodsWithin(cal, scope, c.period);
        if (!periods.length) diags.push({ severity: "error", itemId: step.id, message: `"End of ${c.period}" has no ${c.period}s inside this ${scopeLabel} section.` });
        for (const p of periods) items.push({ leaves: leavesFor(step, p, path, n), sort: endKey(cal, p), order });
        return;
      }
      default: {
        const kind = CADENCE_PERIOD[c.type];
        if (!cal) return void diags.push({ severity: "error", itemId: step.id, message: `"Every ${kind}" needs the project's date range.` });
        const periods = periodsWithin(cal, scope, kind);
        if (!periods.length) diags.push({ severity: "error", itemId: step.id, message: `"Every ${kind}" has no ${kind}s inside this ${scopeLabel} section.` });
        for (const p of periods) items.push({ leaves: leavesFor(step, p, path, n), sort: startKey(cal, p), order });
      }
    }
  });

  // Leading non-periodic items, periodic items in date order, trailing non-periodic items.
  const firstPeriodic = nodes.findIndex(isPeriodic);
  let ordered: Item[];
  if (firstPeriodic < 0) ordered = items;
  else {
    const lead = items.filter((i) => !i.sort && i.order < firstPeriodic);
    const mid = items.filter((i) => i.sort).sort(cmp);
    const tail = items.filter((i) => !i.sort && i.order > firstPeriodic);
    ordered = [...lead, ...mid, ...tail];
  }
  let leaves = ordered.flatMap((i) => i.leaves);

  // "After <step>": follow every occurrence (a run of copies) of the target in this section.
  for (const node of nodes) {
    if (node.kind !== "step" || node.cadence.type !== "after-module") continue;
    const target = node.cadence.moduleId;
    const n = copiesOf(node, diags);
    if (!n) continue;
    if (!nodes.some((x) => x.id === target)) {
      diags.push({ severity: "error", itemId: node.id, message: `"${node.title ?? node.module}" follows a page that is not in the same section.` });
      continue;
    }
    if (target === node.id) {
      diags.push({ severity: "error", itemId: node.id, message: `"${node.title ?? node.module}" cannot follow itself.` });
      continue;
    }
    const out: Leaf[] = [];
    for (let i = 0; i < leaves.length; i++) {
      out.push(leaves[i]);
      const endOfRun = leaves[i].owner === target && (i + 1 >= leaves.length || leaves[i + 1].owner !== target || leaves[i + 1].period !== leaves[i].period || leaves[i + 1].copy === 0);
      if (endOfRun) out.push(...leavesFor(node, leaves[i].period, path, n).map((l) => ({ ...l, path: `${path}>${periodKey(leaves[i].period)}` })));
    }
    leaves = out;
  }
  return leaves;
}

function expandGroup(g: BookGroup, scope: PeriodRef, path: string, order: number, ctx: BookContext, diags: RecipeDiagnostic[]): Item[] {
  if (!g.period) return [{ leaves: expandList(g.children, scope, `${path}/${g.id}`, ctx, diags), sort: null, order }];
  const cal = ctx.calendar;
  if (!cal) {
    diags.push({ severity: "error", itemId: g.id, message: `"Every ${g.period}" needs the project's date range.` });
    return [];
  }
  const periods = periodsWithin(cal, scope, g.period);
  if (!periods.length) diags.push({ severity: "error", itemId: g.id, message: `"Every ${g.period}" has no ${g.period}s inside this ${PERIOD_LABEL[periodKind(scope) as RecipePeriod | "none"]} section.` });
  return periods.map((p) => ({ leaves: expandList(g.children, p, `${path}/${periodKey(p)}`, ctx, diags), sort: startKey(cal, p), order }));
}

// ─── Paging ────────────────────────────────────────────────────────────────
export function expandBook(structure: BookNode[], ctx: BookContext): ExpandedRecipe {
  const diagnostics: RecipeDiagnostic[] = [];
  const leaves = expandList(structure, { kind: "none" }, "", ctx, diagnostics);
  const pages: PageInstance[] = [];
  const seen = new Set<string>();
  let pageNumber = 1;
  let fillers = 0;
  const sideOf = (n: number): PageSide => (ctx.paged ? (n % 2 === 1 ? "recto" : "verso") : "single");
  const badPeriod = new Set<string>();

  for (const leaf of leaves) {
    const { step, period } = leaf;
    const need = ctx.layoutPeriod(step.layoutId);
    if (need !== "none" && period.kind !== need) {
      if (!badPeriod.has(step.id)) {
        badPeriod.add(step.id);
        diagnostics.push({
          severity: "error",
          itemId: step.id,
          message: `"${ctx.layoutLabel(step.layoutId)}" needs a ${need}: place it in "Every ${need}" or set it to repeat every ${need} (it is in a ${period.kind === "none" || period.kind === "copy" ? "one-off" : period.kind} position).`,
        });
      }
      continue;
    }
    const n = ctx.pagesPerInstance(step.layoutId);
    const start: PageStartRule = step.start ?? (n === 2 ? "spread" : "any");
    if (n === 2 && start !== "spread" && start !== "verso") {
      diagnostics.push({ severity: "error", itemId: step.id, message: `"${ctx.layoutLabel(step.layoutId)}" is a two-page spread; it must start on a left-hand page (start rule "${start}").` });
    }
    const wantVerso = start === "spread" || start === "verso" || n === 2;
    const wrongSide = ctx.paged && ((wantVerso && pageNumber % 2 === 1) || (start === "recto" && pageNumber % 2 === 0));
    const kind = periodKind(period);
    const title = step.title ?? moduleTitle(step.module, kind);
    const subtitle = periodLabel(ctx.calendar, period);
    if (wrongSide) {
      pages.push({
        key: `filler:${fillers++}`,
        recipeItemId: step.id,
        layoutId: ctx.fillerLayoutId,
        period: { kind: "none" },
        pageNumber,
        side: sideOf(pageNumber),
        filler: true,
        fillerReason: `Keeps ${step.module === "weekly-planner" && subtitle ? `the week of ${subtitle}` : `“${title}”${subtitle ? ` (${subtitle})` : ""}`} ${n === 2 ? "on one open spread" : `on a ${wantVerso ? "left" : "right"}-hand page`}.`,
      });
      pageNumber++;
    }
    const base = `${step.id}@${leaf.path}:${periodKey(period)}#${leaf.copy}`;
    if (seen.has(base)) diagnostics.push({ severity: "error", itemId: step.id, message: `"${title}" is generated twice for ${subtitle ?? periodKey(period)}.` });
    seen.add(base);
    for (let part = 0; part < n; part++) {
      pages.push({
        key: n === 2 ? `${base}:${part}` : base,
        recipeItemId: step.id,
        layoutId: step.layoutId,
        period,
        spreadPart: n === 2 ? (part as 0 | 1) : undefined,
        pageNumber,
        side: sideOf(pageNumber),
        module: { type: step.module, title, subtitle, prompts: step.prompts ?? modulePrompts(step.module, kind) },
      });
      pageNumber++;
    }
  }
  if (fillers) diagnostics.push({ severity: "info", itemId: "recipe", message: `${fillers} intentional notes page(s) inserted so modules start on their required side.` });
  if (!pages.length) diagnostics.push({ severity: "warning", itemId: "recipe", message: "This book structure produces no pages yet." });
  return { pages, diagnostics, pageCount: pages.length };
}

/** Every step in a structure (depth-first), with the sections it sits in. */
export function bookSteps(nodes: BookNode[], parents: BookGroup[] = []): { step: BookStep; parents: BookGroup[] }[] {
  return nodes.flatMap((n) => (n.kind === "step" ? [{ step: n, parents }] : bookSteps(n.children, [...parents, n])));
}
