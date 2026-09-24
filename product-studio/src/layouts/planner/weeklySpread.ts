/**
 * Weekly vertical spread (Test Product 4) — two pages, 8 equal slots
 * (4 per page): 7 day columns + 1 outer slot.
 *
 *   sidebar ON : verso = [sidebar | Mon Tue Wed]   recto = [Thu Fri Sat Sun]
 *   sidebar OFF: verso = [Mon Tue Wed Thu]         recto = [Fri Sat Sun | notes]
 *
 * The extra slot always sits on the OUTER edge. Every slot on both pages has
 * the same width: colW = (usableW − 3 × gap) / 4, which is identical on verso
 * and recto because binding margins mirror. A diagnostic fires if they ever
 * differ. Day sections follow blueprint B2 (3 sections: morning/afternoon/evening).
 */
import { formatWeekRange, MONTH_NAMES, parseIso } from "../../engines/calendar/calendar";
import { distributeEqual, solveStack } from "../../engines/layout/math";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import type { CalendarDay } from "../../types/calendar";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import type { WordingKey } from "../../types/tokens";
import { headerTitle, pageFrame, section } from "../shared/components";
import { group, lineBoxIn, rule, stackDiagnostic, text } from "../shared/nodes";
import type { LayoutContext, LayoutDefinition } from "../shared/types";

const SLOTS_PER_PAGE = 4;
const SECTION_KEYS: WordingKey[] = ["morning", "afternoon", "evening"];

function dayColumn(id: string, rect: Rect, day: CalendarDay, weekdayName: string, ctx: LayoutContext): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing;
  const st = solveStack(rect.y, rect.h, [
    { id: "head", kind: "fixed", size: STUDIO_PLANNER.dayHeader.valueIn },
    { id: "body", kind: "elastic", min: 0 },
  ], s.row);
  const head = { ...rect, y: st.byId.head.start, h: st.byId.head.size };
  const body = { ...rect, y: st.byId.body.start, h: st.byId.body.size };
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  const labelH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  const bottom = head.y + head.h;
  nodes.push(
    text(`${id}-name`, { x: head.x, y: bottom - labelH, w: head.w * 0.62, h: labelH }, weekdayName, "subheading", { component: "SectionHeader", align: "left", vAlign: "bottom" }),
    text(`${id}-date`, { x: head.x + head.w * 0.62, y: bottom - dateH, w: head.w * 0.38, h: dateH }, String(day.day), "date", { component: "SectionHeader", align: "right", vAlign: "bottom" }),
    rule(`${id}-rule`, head.x, bottom, head.x + head.w, bottom, { strokePt: STUDIO_STROKES.headerRulePt }),
  );
  const n = Math.max(1, ctx.options.sectionsPerDay);
  const rows = distributeEqual(body.y, body.h, n, s.row);
  const diagnostics: LayoutDiagnostic[] = [...stackDiagnostic(st, id, "Day header")];
  rows.starts.forEach((y, i) => {
    const title = n === 3 ? ctx.wording[SECTION_KEYS[i]] : "";
    const sec = section(`${id}-s${i}`, { x: body.x, y, w: body.w, h: rows.size }, title, ctx, "lines", { boxed: true, titleRole: "label" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  });
  return { nodes, diagnostics };
}

export const weeklySpread: LayoutDefinition = {
  id: "planner-weekly-spread",
  label: "Weekly Vertical Spread",
  family: "planner",
  description: "Two-page week: 7 equal day columns + outer sidebar/notes slot, 3 sections per day.",
  pages: 2,
  period: "week",
  solve(ctx): SolvedPage[] {
    if (ctx.period.kind !== "week" || !ctx.calendar) throw new Error("planner-weekly-spread requires a week period and calendar data.");
    const weekKey = ctx.period.key;
    const week = ctx.calendar.weeks.find((w) => w.key === weekKey);
    if (!week) throw new Error(`Week ${weekKey} not in calendar.`);
    const s = ctx.spacing;
    const names = ctx.calendar.weekdayShortNames;

    type Slot = { kind: "day"; index: number } | { kind: "extra" };
    const days: Slot[] = week.days.map((_, i) => ({ kind: "day", index: i }));
    const slots: Slot[][] = ctx.options.showSidebar
      ? [[{ kind: "extra" }, ...days.slice(0, 3)], days.slice(3)]
      : [days.slice(0, 4), [...days.slice(4), { kind: "extra" }]];

    const start = parseIso(week.startIso);
    const end = parseIso(week.endIso);
    const monthLabel =
      start.month === end.month ? `${MONTH_NAMES[start.month - 1]} ${start.year}` : `${MONTH_NAMES[start.month - 1]} / ${MONTH_NAMES[end.month - 1]} ${end.year}`;

    const widths: number[] = [];
    const pages = [0, 1].map((p): SolvedPage => {
      const frame = pageFrame(ctx, p, { headerH: STUDIO_PLANNER.weeklyTitle.valueIn, footer: ctx.options.showPageNumbers });
      const title = p === 0 ? `${ctx.wording.weekOf} ${formatWeekRange(week)}` : monthLabel;
      const nodes: LayoutNode[] = [...frame.nodes, ...headerTitle(`wk${p}-header`, frame.header, title, "weekTitle", p === 0 ? "left" : "right")];
      const diagnostics = [...frame.diagnostics];
      const cols = distributeEqual(frame.body.x, frame.body.w, SLOTS_PER_PAGE, s.column);
      widths.push(cols.size);
      nodes.push(group(`wk${p}-grid`, "Grid", frame.body, { columnEdges: cols.edges }));
      slots[p].forEach((slot, i) => {
        const r: Rect = { x: cols.starts[i], y: frame.body.y, w: cols.size, h: frame.body.h };
        if (slot.kind === "day") {
          const d = dayColumn(`wk${p}-d${slot.index}`, r, week.days[slot.index], names[slot.index], ctx);
          nodes.push(...d.nodes);
          diagnostics.push(...d.diagnostics);
        } else if (ctx.options.showSidebar) {
          const sb = section(`wk${p}-sidebar`, r, ctx.wording[ctx.options.sidebarContent], ctx, "checklist", { boxed: true });
          nodes.push(group(`wk${p}-sidebar-bounds`, "Sidebar", r), ...sb.nodes);
          diagnostics.push(...sb.diagnostics);
        } else {
          const nt = section(`wk${p}-notes`, r, ctx.wording.notes, ctx, "lines", { boxed: true });
          nodes.push(...nt.nodes);
          diagnostics.push(...nt.diagnostics);
        }
      });
      const metrics: LayoutMetric[] = [
        { label: "Week title zone", value: STUDIO_PLANNER.weeklyTitle.valueIn, unit: "in", provenance: STUDIO_PLANNER.weeklyTitle.provenance },
        { label: "Day header", value: STUDIO_PLANNER.dayHeader.valueIn, unit: "in", provenance: STUDIO_PLANNER.dayHeader.provenance },
        { label: "Slot width = (W − 3·gap) / 4", value: cols.size, unit: "in", provenance: { geometryClass: "user-design", basis: `(${frame.body.w.toFixed(3)} − 3 × ${s.column}) / 4` } },
        { label: "Sections per day", value: ctx.options.sectionsPerDay, unit: "count", provenance: { geometryClass: "user-design", basis: "blueprint B2 default 3" } },
      ];
      return { nodes, diagnostics, metrics };
    });

    if (Math.abs(widths[0] - widths[1]) > 1e-4) {
      pages[1].diagnostics.push({
        severity: "error",
        rule: "equal-columns",
        componentId: "wk-grid",
        message: `Day columns differ between pages (${widths[0].toFixed(4)}" vs ${widths[1].toFixed(4)}"). Margins do not mirror for this binding/profile.`,
        measurement: { actualIn: Math.abs(widths[0] - widths[1]), limitIn: 0 },
      });
    }
    return pages;
  },
};
