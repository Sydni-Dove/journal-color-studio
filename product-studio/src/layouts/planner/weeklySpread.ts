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
 *
 * Both pages are ONE connected grid (connectedTracks, zero gap): the grid
 * draws its outer border and one shared rule between neighbouring slots;
 * the header rule and section dividers are drawn once across each run of
 * neighbouring days. Days and sections never draw their own boxes.
 */
import { formatWeekRange, formatWeekRangeShort, MONTH_NAMES, parseIso } from "../../engines/calendar/calendar";
import { distributeEqual } from "../../engines/layout/math";
import { STUDIO_PLANNER, STUDIO_STROKES, STUDIO_WEEKLY_VARIANTS } from "../../presets/studioDefaults";
import type { CalendarDay } from "../../types/calendar";
import type { LayoutRegions } from "../../types/composition";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import type { WordingKey } from "../../types/tokens";
import { connectedTracks, fitHeading, headerTitle, headingFitDiagnostic, pageFrame, PLANNER_GRID_GAP_IN, runsOf, SECTION_TEXT_ANCHORS, section, writingSurface } from "../shared/components";
import { group, lineBoxIn, rule, text } from "../shared/nodes";
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
  // Connected grid: tracks are contiguous (PLANNER_GRID_GAP_IN = 0).
  const slotW = (b.w - (SLOTS_PER_PAGE - 1) * PLANNER_GRID_GAP_IN) / SLOTS_PER_PAGE;
  const sections = Math.max(1, ctx.options.sectionsPerDay);
  const sectionH = (b.h - STUDIO_PLANNER.dayHeader.valueIn) / sections;
  if (slotW + 1e-6 >= V.minSlotW.valueIn && sectionH + 1e-6 >= V.minSectionH.valueIn) {
    return { ok: true, variant: "vertical", variantLabel: "Vertical day columns", sidebarAvailable: true };
  }
  const rowH = (b.h - (SLOTS_PER_PAGE - 1) * PLANNER_GRID_GAP_IN) / SLOTS_PER_PAGE;
  const writingW = b.w - H.dayLabelW.valueIn - s.column;
  if (rowH + 1e-6 >= H.minRowH.valueIn && writingW + 1e-6 >= H.minWritingW.valueIn) {
    return { ok: true, variant: "horizontal", variantLabel: "Horizontal day rows (insert)", sidebarAvailable: true };
  }
  return {
    ok: false,
    reason: `Too small for a weekly spread: day columns would be ${slotW.toFixed(2)}" (min ${V.minSlotW.valueIn}") and day rows ${rowH.toFixed(2)}" (min ${H.minRowH.valueIn}").`,
  };
}

/**
 * Day name (left) + date (right) above the shared header rule, inset from the
 * grid's rules by labelToBorderInset. A slot title (date = null: Notes /
 * sidebar heading) is the positionable "sectionHeading": left / centre / right
 * within its slot plus offsets kept inside the slot's header band.
 */
function headerLabels(id: string, head: Rect, label: string, date: string | null, ctx: LayoutContext, kind = "Section"): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const labelH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  const pad = ctx.spacing.labelToBorderInset;
  const bottom = head.y + head.h - pad;
  if (date === null) {
    const want = ctx.options.textPositions?.sectionHeading;
    const anchor = want && SECTION_TEXT_ANCHORS.includes(want.anchor) ? want.anchor : "above-content-left";
    const align = anchor.endsWith("left") ? "left" : anchor.endsWith("right") ? "right" : "center";
    // A slot heading keeps the section-heading inset from the slot's side rules and the grid's top edge, and
    // sits on the day names' baseline (labelToBorderInset above the header rule). Its wording is user-editable:
    // it is fitted to that area (shared fitHeading) instead of assuming a short word.
    const hin = ctx.spacing.sectionHeadingInset;
    const inner: Rect = { x: head.x + hin, y: head.y + hin, w: head.w - 2 * hin, h: bottom - (head.y + hin) };
    const f = fitHeading(label, "subheading", inner, ctx);
    const h = Math.max(labelH, f.heightIn);
    const dx = Math.max(-inner.w, Math.min(inner.w, want?.offsetXIn ?? 0));
    const y = Math.min(Math.max(bottom - h + (want?.offsetYIn ?? 0), inner.y), bottom - h);
    const node: TextNode = { ...text(`${id}-name`, { x: inner.x + dx, y, w: inner.w, h }, label, "subheading", { component: "SectionHeader", align, vAlign: "bottom", semantic: "sectionHeading" }), placement: { anchor, defaultAnchor: "above-content-left" } };
    if (f.lines.length > 1 || f.sizePt !== ctx.typography.roles.subheading.sizePt || !f.ok) node.fit = { sizePt: f.sizePt, lineHeight: f.lineHeight, lines: f.lines, ...(f.ok ? {} : { failed: true }) };
    return { nodes: [node], diagnostics: f.ok ? [] : [headingFitDiagnostic(node.id, kind, label, "subheading", inner, f, ctx)] };
  }
  return { nodes: [
    text(`${id}-name`, { x: head.x + pad, y: bottom - labelH, w: head.w * 0.62 - pad, h: labelH }, label, "subheading", { component: "SectionHeader", align: "left", vAlign: "bottom" }),
    text(`${id}-date`, { x: head.x + head.w * 0.62, y: bottom - dateH, w: head.w * 0.38 - pad, h: dateH }, date, "date", { component: "SectionHeader", align: "right", vAlign: "bottom" }),
  ], diagnostics: [] };
}

/**
 * Vertical day column inside the connected grid. The column draws NO border:
 * its left/right edges are the grid's shared rules, the header rule and the
 * section dividers are drawn once per run of neighbouring days by the page.
 */
function dayColumn(id: string, rect: Rect, day: CalendarDay, weekdayName: string, ctx: LayoutContext): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const head = { ...rect, h: STUDIO_PLANNER.dayHeader.valueIn };
  const body = { ...rect, y: rect.y + head.h, h: rect.h - head.h };
  const nodes: LayoutNode[] = [group(id, "Section", rect), ...headerLabels(id, head, weekdayName, String(day.day), ctx).nodes];
  const n = Math.max(1, ctx.options.sectionsPerDay);
  const rows = distributeEqual(body.y, body.h, n, PLANNER_GRID_GAP_IN);
  const diagnostics: LayoutDiagnostic[] = [];
  rows.starts.forEach((y, i) => {
    const title = n === 3 ? ctx.wording[SECTION_KEYS[i]] : "";
    const sec = section(`${id}-s${i}`, { x: body.x, y, w: body.w, h: rows.size }, title, ctx, "surface", { padded: true, titleRole: "label" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  });
  return { nodes, diagnostics };
}

/** Horizontal day row inside the connected grid (label column | writing). */
function dayRow(id: string, rect: Rect, day: CalendarDay, weekdayName: string, ctx: LayoutContext): LayoutNode[] {
  const s = ctx.spacing;
  const labelW = STUDIO_WEEKLY_VARIANTS.horizontal.dayLabelW.valueIn;
  const labelRect = { x: rect.x, y: rect.y, w: labelW, h: rect.h };
  const writing = { x: rect.x + labelW + s.column, y: rect.y + s.boxPadding, w: rect.w - labelW - s.column - s.boxPadding, h: rect.h - 2 * s.boxPadding };
  const nameH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  return [
    group(id, "Section", rect),
    text(`${id}-name`, { x: labelRect.x + s.labelToBorderInset, y: labelRect.y + s.labelToBorderInset, w: labelW - 2 * s.labelToBorderInset, h: nameH }, weekdayName, "subheading", { component: "SectionHeader", vAlign: "top" }),
    text(`${id}-date`, { x: labelRect.x + s.labelToBorderInset, y: labelRect.y + s.labelToBorderInset + nameH, w: labelW - 2 * s.labelToBorderInset, h: dateH }, String(day.day), "date", { component: "SectionHeader", vAlign: "top" }),
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
      const title = p === 0
        ? headerTitle(`wk${p}-header`, ctx, frame.zones, "weekOf", weekLabel, "weekTitle", "header-left")
        : headerTitle(`wk${p}-header`, ctx, frame.zones, "monthYear", monthLabel, "weekTitle", "header-right");
      const nodes: LayoutNode[] = [...frame.nodes, ...title.nodes];
      const diagnostics = [...frame.diagnostics, ...title.diagnostics];
      const grid = connectedTracks(`wk${p}-grid`, frame.body, SLOTS_PER_PAGE, horizontal ? "rows" : "columns");
      const tracks = grid.tracks;
      sizes.push(tracks.size);
      nodes.push(...grid.nodes);
      const isDay = (i: number) => slots[p][i].kind === "day";
      const strokePt = STUDIO_STROKES.gridRulePt;
      const headH = STUDIO_PLANNER.dayHeader.valueIn;
      slots[p].forEach((slot, i) => {
        const r = grid.trackRects[i];
        if (slot.kind === "day") {
          const id = `wk${p}-d${slot.index}`;
          if (horizontal) nodes.push(...dayRow(id, r, week.days[slot.index], names[slot.index], ctx));
          else {
            const d = dayColumn(id, r, week.days[slot.index], names[slot.index], ctx);
            nodes.push(...d.nodes);
            diagnostics.push(...d.diagnostics);
          }
          return;
        }
        // The outer slot (sidebar or notes) is a track of the same grid.
        const sidebar = ctx.options.showSidebar;
        const sid = sidebar ? `wk${p}-sidebar` : `wk${p}-notes`;
        const title = sidebar ? ctx.wording[ctx.options.sidebarContent] : ctx.wording.notes;
        const content = sidebar ? "checklist" : "surface";
        if (sidebar) nodes.push(group(`wk${p}-sidebar-bounds`, "Sidebar", r));
        if (horizontal) {
          const sec = section(sid, r, title, ctx, content, { padded: true, titleRole: "subheading", semantic: "sectionHeading", headingKind: sidebar ? "Sidebar" : "Notes" });
          nodes.push(...sec.nodes);
          diagnostics.push(...sec.diagnostics);
        } else {
          // Title sits in the shared header row, content below the header rule.
          const head = { ...r, h: headH };
          const sec = section(sid, { ...r, y: r.y + headH, h: r.h - headH }, "", ctx, content, { padded: true });
          const heading = headerLabels(sid, head, title, null, ctx, sidebar ? "Sidebar" : "Notes");
          nodes.push(...heading.nodes, ...sec.nodes);
          diagnostics.push(...heading.diagnostics, ...sec.diagnostics);
        }
      });
      const b = frame.body;
      if (horizontal) {
        // One label-column rule per run of neighbouring day rows.
        const x = b.x + STUDIO_WEEKLY_VARIANTS.horizontal.dayLabelW.valueIn;
        runsOf(SLOTS_PER_PAGE, isDay).forEach(([a, z], k) =>
          nodes.push(rule(`wk${p}-label-rule${k}`, x, tracks.starts[a], x, tracks.starts[z] + tracks.size, { strokePt, component: "Grid" })),
        );
      } else {
        // The header row is one rule across the whole grid.
        nodes.push(rule(`wk${p}-head-rule`, b.x, b.y + headH, b.x + b.w, b.y + headH, { strokePt: STUDIO_STROKES.headerRulePt, component: "Grid" }));
        // Section dividers: one rule per boundary per run of neighbouring days.
        const n = Math.max(1, ctx.options.sectionsPerDay);
        const secRows = distributeEqual(b.y + headH, b.h - headH, n, PLANNER_GRID_GAP_IN);
        runsOf(SLOTS_PER_PAGE, isDay).forEach(([a, z], k) => {
          for (let j = 1; j < n; j++) {
            const y = secRows.starts[j];
            nodes.push(rule(`wk${p}-sec${j}-run${k}`, tracks.starts[a], y, tracks.starts[z] + tracks.size, y, { strokePt, component: "Grid" }));
          }
        });
      }
      const metrics: LayoutMetric[] = [
        { label: "Variant", value: horizontal ? 1 : 0, unit: "count", provenance: { geometryClass: "studio-recommended", basis: fit.variantLabel } },
        { label: "Week title zone", value: STUDIO_PLANNER.weeklyTitle.valueIn, unit: "in", provenance: STUDIO_PLANNER.weeklyTitle.provenance },
        horizontal
          ? { label: "Day row height = H / 4 (connected grid)", value: tracks.size, unit: "in", provenance: { geometryClass: "user-design", basis: `${frame.body.h.toFixed(3)} / 4, zero internal gap` } }
          : { label: "Slot width = W / 4 (connected grid)", value: tracks.size, unit: "in", provenance: { geometryClass: "user-design", basis: `${frame.body.w.toFixed(3)} / 4, zero internal gap` } },
      ];
      if (!horizontal) metrics.push({ label: "Sections per day", value: ctx.options.sectionsPerDay, unit: "count", provenance: { geometryClass: "user-design", basis: "blueprint B2 default 3" } });
      const regions: LayoutRegions = { mainContent: frame.body, calendar: frame.body };
      const extra = slots[p].findIndex((x) => x.kind === "extra");
      if (extra >= 0) {
        const r = grid.trackRects[extra];
        if (ctx.options.showSidebar) regions.sidebar = r;
        if (!ctx.options.showSidebar || ctx.options.sidebarContent === "notes") regions.notes = r;
      }
      return { nodes, diagnostics, metrics, regions };
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
