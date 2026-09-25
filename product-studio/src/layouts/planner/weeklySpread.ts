/**
 * Weekly spread — size-aware family over two pages (8 slots: 7 days + 1
 * outer slot for the sidebar or notes).
 *
 *   vertical    day COLUMNS, 4 per page, B2 sections (morning/afternoon/
 *               evening). Needs ≥ 0.95" per column.
 *   horizontal  day ROWS, 4 per page, day label column + writing surface.
 *               Used on inserts too narrow for columns (Franklin Compact,
 *               Filofax Personal).
 *
 *   sidebar ON : verso = [sidebar, Mon, Tue, Wed]   recto = [Thu … Sun]
 *   sidebar OFF: verso = [Mon … Thu]                recto = [Fri, Sat, Sun, notes]
 * The extra slot always sits on the OUTER edge. Slots are equal on both pages.
 */
import { formatWeekRange, formatWeekRangeShort, MONTH_NAMES, parseIso } from "../../engines/calendar/calendar";
import { distributeEqual, solveStack } from "../../engines/layout/math";
import { STUDIO_PLANNER, STUDIO_STROKES, STUDIO_WEEKLY_VARIANTS } from "../../presets/studioDefaults";
import type { CalendarDay } from "../../types/calendar";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import type { WordingKey } from "../../types/tokens";
import { headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { box, group, lineBoxIn, rule, stackDiagnostic, text } from "../shared/nodes";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";

const SLOTS_PER_PAGE = 4;
const SECTION_KEYS: WordingKey[] = ["morning", "afternoon", "evening"];

type Body = { w: number; h: number };
function bodySize(ctx: FitContext): Body {
  const s = ctx.spacing;
  const footer = ctx.options.showFooter || ctx.options.showPageNumbers ? lineBoxIn(ctx.typography, "footer") + s.footerGap : 0;
  return {
    w: ctx.page.usableWidthIn - 2 * s.page,
    h: ctx.page.usableHeightIn - 2 * s.page - STUDIO_PLANNER.weeklyTitle.valueIn - s.headerGap - footer,
  };
}

export function fitWeekly(ctx: FitContext): FitResult {
  const s = ctx.spacing;
  const b = bodySize(ctx);
  const V = STUDIO_WEEKLY_VARIANTS.vertical, H = STUDIO_WEEKLY_VARIANTS.horizontal;
  const slotW = (b.w - (SLOTS_PER_PAGE - 1) * s.column) / SLOTS_PER_PAGE;
  const sections = Math.max(1, ctx.options.sectionsPerDay);
  const sectionH = (b.h - STUDIO_PLANNER.dayHeader.valueIn - s.row - (sections - 1) * s.row) / sections;
  if (slotW + 1e-6 >= V.minSlotW.valueIn && sectionH + 1e-6 >= V.minSectionH.valueIn) {
    return { ok: true, variant: "vertical", variantLabel: "Vertical day columns", sidebarAvailable: true };
  }
  const rowH = (b.h - (SLOTS_PER_PAGE - 1) * s.row) / SLOTS_PER_PAGE;
  const writingW = b.w - H.dayLabelW.valueIn - s.column;
  if (rowH + 1e-6 >= H.minRowH.valueIn && writingW + 1e-6 >= H.minWritingW.valueIn) {
    return { ok: true, variant: "horizontal", variantLabel: "Horizontal day rows (insert)", sidebarAvailable: true };
  }
  return {
    ok: false,
    reason: `Too small for a weekly spread: day columns would be ${slotW.toFixed(2)}" (min ${V.minSlotW.valueIn}") and day rows ${rowH.toFixed(2)}" (min ${H.minRowH.valueIn}").`,
  };
}

function dayHeaderNodes(id: string, head: Rect, weekdayName: string, day: CalendarDay, ctx: LayoutContext): LayoutNode[] {
  const labelH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  const pad = ctx.spacing.boxPadding / 2;
  const bottom = head.y + head.h;
  return [
    text(`${id}-name`, { x: head.x + pad, y: bottom - labelH, w: head.w * 0.62 - pad, h: labelH }, weekdayName, "subheading", { component: "SectionHeader", align: "left", vAlign: "bottom" }),
    text(`${id}-date`, { x: head.x + head.w * 0.62, y: bottom - dateH, w: head.w * 0.38 - pad, h: dateH }, String(day.day), "date", { component: "SectionHeader", align: "right", vAlign: "bottom" }),
    rule(`${id}-rule`, head.x, bottom, head.x + head.w, bottom, { strokePt: STUDIO_STROKES.headerRulePt }),
  ];
}

function dayColumn(id: string, rect: Rect, day: CalendarDay, weekdayName: string, ctx: LayoutContext): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing;
  const st = solveStack(rect.y, rect.h, [
    { id: "head", kind: "fixed", size: STUDIO_PLANNER.dayHeader.valueIn },
    { id: "body", kind: "elastic", min: 0 },
  ], s.row);
  const head = { ...rect, y: st.byId.head.start, h: st.byId.head.size };
  const body = { ...rect, y: st.byId.body.start, h: st.byId.body.size };
  const nodes: LayoutNode[] = [group(id, "Section", rect), ...dayHeaderNodes(id, head, weekdayName, day, ctx)];
  const n = Math.max(1, ctx.options.sectionsPerDay);
  const rows = distributeEqual(body.y, body.h, n, s.row);
  const diagnostics: LayoutDiagnostic[] = [...stackDiagnostic(st, id, "Day header")];
  rows.starts.forEach((y, i) => {
    const title = n === 3 ? ctx.wording[SECTION_KEYS[i]] : "";
    const sec = section(`${id}-s${i}`, { x: body.x, y, w: body.w, h: rows.size }, title, ctx, "surface", { boxed: true, titleRole: "label" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  });
  return { nodes, diagnostics };
}

function dayRow(id: string, rect: Rect, day: CalendarDay, weekdayName: string, ctx: LayoutContext): LayoutNode[] {
  const s = ctx.spacing;
  const labelW = STUDIO_WEEKLY_VARIANTS.horizontal.dayLabelW.valueIn;
  const labelRect = { x: rect.x, y: rect.y, w: labelW, h: rect.h };
  const writing = { x: rect.x + labelW + s.column, y: rect.y + s.boxPadding, w: rect.w - labelW - s.column - s.boxPadding, h: rect.h - 2 * s.boxPadding };
  const nameH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  return [
    group(id, "Section", rect),
    box(`${id}-box`, rect, { component: "Section", strokePt: STUDIO_STROKES.boxRulePt }),
    text(`${id}-name`, { x: labelRect.x + s.boxPadding, y: labelRect.y + s.boxPadding, w: labelW - 2 * s.boxPadding, h: nameH }, weekdayName, "subheading", { component: "SectionHeader", vAlign: "top" }),
    text(`${id}-date`, { x: labelRect.x + s.boxPadding, y: labelRect.y + s.boxPadding + nameH, w: labelW - 2 * s.boxPadding, h: dateH }, String(day.day), "date", { component: "SectionHeader", vAlign: "top" }),
    rule(`${id}-divider`, rect.x + labelW, rect.y, rect.x + labelW, rect.y + rect.h, { strokePt: STUDIO_STROKES.gridRulePt }),
    ...writingSurface(`${id}-surface`, writing, ctx),
  ];
}

export const weeklySpread: LayoutDefinition = {
  id: "planner-weekly-spread",
  label: "Weekly Spread",
  family: "planner",
  description: "Two-page week: vertical day columns, or horizontal day rows on small inserts.",
  pages: 2,
  period: "week",
  capability: {
    supportedProductTypes: ["planner", "insert", "custom"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
    supportsLineStyle: true,
    supportsSidebar: true,
    supportsDatePlacement: false,
    supportsSectionsPerDay: true,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: true,
    usesWeekStart: true,
    wordingKeys: ["weekOf", "notes", "morning", "afternoon", "evening"],
    repeats: ["every-week"],
    defaultRepeat: "every-week",
  },
  fit: fitWeekly,
  solve(ctx): SolvedPage[] {
    if (ctx.period.kind !== "week" || !ctx.calendar) throw new Error("Weekly Spread needs a date range and repeats every week.");
    const weekKey = ctx.period.key;
    const week = ctx.calendar.weeks.find((w) => w.key === weekKey);
    if (!week) throw new Error(`Week ${weekKey} not in calendar.`);
    const s = ctx.spacing;
    const names = ctx.calendar.weekdayShortNames;
    const fit = fitWeekly({ page: ctx.pages[0], spacing: s, typography: ctx.typography, options: ctx.options });
    if (!fit.ok) {
      return ctx.pages.map(() => ({ nodes: [], metrics: [], diagnostics: [{ severity: "error" as const, rule: "layout-incompatible", componentId: "planner-weekly-spread", message: fit.reason }] }));
    }
    const horizontal = fit.variant === "horizontal";

    type Slot = { kind: "day"; index: number } | { kind: "extra" };
    const days: Slot[] = week.days.map((_, i) => ({ kind: "day", index: i }));
    const slots: Slot[][] = ctx.options.showSidebar
      ? [[{ kind: "extra" }, ...days.slice(0, 3)], days.slice(3)]
      : [days.slice(0, 4), [...days.slice(4), { kind: "extra" }]];

    const start = parseIso(week.startIso);
    const end = parseIso(week.endIso);
    // The insert (horizontal) variant is designed with compact titles: short
    // range on the verso, short month(s) + year on the recto.
    const month = (m: number) => (horizontal ? MONTH_NAMES[m - 1].slice(0, 3) : MONTH_NAMES[m - 1]);
    const monthLabel = start.month === end.month ? `${month(start.month)} ${start.year}` : `${month(start.month)} / ${month(end.month)} ${end.year}`;
    const weekLabel = horizontal ? formatWeekRangeShort(week) : `${ctx.wording.weekOf} ${formatWeekRange(week)}`;

    const sizes: number[] = [];
    const pages = [0, 1].map((p): SolvedPage => {
      const frame = pageFrame(ctx, p, { headerH: STUDIO_PLANNER.weeklyTitle.valueIn });
      const title = p === 0 ? weekLabel : monthLabel;
      const nodes: LayoutNode[] = [...frame.nodes, ...headerTitle(`wk${p}-header`, frame.header, title, "weekTitle", p === 0 ? "left" : "right")];
      const diagnostics = [...frame.diagnostics];
      const tracks = horizontal
        ? distributeEqual(frame.body.y, frame.body.h, SLOTS_PER_PAGE, s.row)
        : distributeEqual(frame.body.x, frame.body.w, SLOTS_PER_PAGE, s.column);
      sizes.push(tracks.size);
      nodes.push(group(`wk${p}-grid`, "Grid", frame.body, horizontal ? { rowEdges: tracks.edges } : { columnEdges: tracks.edges }));
      slots[p].forEach((slot, i) => {
        const r: Rect = horizontal
          ? { x: frame.body.x, y: tracks.starts[i], w: frame.body.w, h: tracks.size }
          : { x: tracks.starts[i], y: frame.body.y, w: tracks.size, h: frame.body.h };
        if (slot.kind === "day") {
          const id = `wk${p}-d${slot.index}`;
          if (horizontal) nodes.push(...dayRow(id, r, week.days[slot.index], names[slot.index], ctx));
          else {
            const d = dayColumn(id, r, week.days[slot.index], names[slot.index], ctx);
            nodes.push(...d.nodes);
            diagnostics.push(...d.diagnostics);
          }
        } else if (ctx.options.showSidebar) {
          const sb = section(`wk${p}-sidebar`, r, ctx.wording[ctx.options.sidebarContent], ctx, "checklist", { boxed: true });
          nodes.push(group(`wk${p}-sidebar-bounds`, "Sidebar", r), ...sb.nodes);
          diagnostics.push(...sb.diagnostics);
        } else {
          const nt = section(`wk${p}-notes`, r, ctx.wording.notes, ctx, "surface", { boxed: true });
          nodes.push(...nt.nodes);
          diagnostics.push(...nt.diagnostics);
        }
      });
      const metrics: LayoutMetric[] = [
        { label: "Variant", value: horizontal ? 1 : 0, unit: "count", provenance: { geometryClass: "studio-recommended", basis: fit.variantLabel } },
        { label: "Week title zone", value: STUDIO_PLANNER.weeklyTitle.valueIn, unit: "in", provenance: STUDIO_PLANNER.weeklyTitle.provenance },
        horizontal
          ? { label: "Day row height = (H − 3·gap) / 4", value: tracks.size, unit: "in", provenance: { geometryClass: "user-design", basis: `(${frame.body.h.toFixed(3)} − 3 × ${s.row}) / 4` } }
          : { label: "Slot width = (W − 3·gap) / 4", value: tracks.size, unit: "in", provenance: { geometryClass: "user-design", basis: `(${frame.body.w.toFixed(3)} − 3 × ${s.column}) / 4` } },
      ];
      if (!horizontal) metrics.push({ label: "Sections per day", value: ctx.options.sectionsPerDay, unit: "count", provenance: { geometryClass: "user-design", basis: "blueprint B2 default 3" } });
      return { nodes, diagnostics, metrics };
    });

    if (Math.abs(sizes[0] - sizes[1]) > 1e-4) {
      pages[1].diagnostics.push({
        severity: "error",
        rule: "equal-columns",
        componentId: "wk-grid",
        message: `Day slots differ between pages (${sizes[0].toFixed(4)}" vs ${sizes[1].toFixed(4)}"). Margins do not mirror for this binding/profile.`,
        measurement: { actualIn: Math.abs(sizes[0] - sizes[1]), limitIn: 0 },
      });
    }
    return pages;
  },
};
