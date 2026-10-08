/**
 * Lined journal page (Test Product 2) and generic writing page.
 * Blueprint reference J-B1: first line 1.0" from top, last line ≤ 0.75" from
 * bottom, lines = floor(region ÷ spacing). The region is solved from
 * PageGeometry + header/footer zones; the line count is never specified.
 */
import { fitCount } from "../../engines/layout/math";
import { fillWritingRegion, lineSpacingIn } from "../../engines/patterns/patterns";
import { STUDIO_JOURNAL } from "../../presets/studioDefaults";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { headerTitle, pageFrame, positionText } from "../shared/components";
import { rule } from "../shared/nodes";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import { monthlyTitleHeight } from "../planner/monthlyCalendar";
import { minimumAreaFit, type LayoutCapability, type LayoutContext, type LayoutDefinition } from "../shared/types";

const WRITING_PAGE: Omit<LayoutCapability, "wordingKeys" | "supportedProductTypes"> = {
  supportsPatterns: ["ruled", "margin-ruled", "dot-grid", "graph-grid", "blank"],
  supportsLineStyle: true,
  supportsSidebar: false,
  supportsDatePlacement: false,
  supportsSectionsPerDay: false,
  supportsWritingRows: false,
  supportsPageNumbers: true,
  supportsFooter: true,
  requiresCalendar: false,
  usesWeekStart: false,
  repeats: ["count", "once", "repeated-sheet"],
  defaultRepeat: "count",
};

function writingPage(ctx: LayoutContext, heading: string | null): SolvedPage {
  const g = ctx.pages[0];
  // The heading zone ends where the first writing row begins (J-B1/J-B4: 0.5" zone).
  const headerH = STUDIO_JOURNAL.headingZone.valueIn - ctx.spacing.headerGap;
  const frame = pageFrame(ctx, 0, { headerH, headerRule: false });
  const nodes: LayoutNode[] = [...frame.nodes];
  const diagnostics = [...frame.diagnostics];
  if (heading) {
    const t = positionText(ctx, heading === ctx.wording.date ? "dateLabel" : "pageTitle", frame.zones, "journal-heading", heading, "label", "above-content-left");
    nodes.push(t.node);
    diagnostics.push(...t.diagnostics);
  }
  // Margin-ruled paper: margin line measured from the page's INSIDE trim edge
  // so it mirrors with the gutter.
  const marginX = g.boundEdge === "right" ? g.trimWidthIn - ctx.pattern.marginLineIn : ctx.pattern.marginLineIn;
  nodes.push(...fillWritingRegion("journal-writing", frame.body, ctx.pattern, marginX));

  const metrics: LayoutMetric[] = [
    { label: "Writing region top (from trim)", value: frame.body.y, unit: "in", provenance: { geometryClass: "user-design", basis: "safe top + heading zone" } },
    { label: "Writing region bottom (from trim)", value: frame.body.y + frame.body.h, unit: "in", provenance: { geometryClass: "user-design", basis: "trim − safe bottom − footer" } },
  ];
  if (["ruled", "margin-ruled", "checklist", "cornell", "split-column"].includes(ctx.pattern.kind)) {
    const spacing = lineSpacingIn(ctx.pattern);
    metrics.push(
      { label: "Line spacing", value: spacing, unit: "in", provenance: { geometryClass: "user-design", basis: `ruling preset "${ctx.pattern.rulingPreset}"` } },
      { label: "Line count = floor(region ÷ spacing)", value: fitCount(frame.body.h, spacing), unit: "count", provenance: { geometryClass: "user-design", basis: `floor(${frame.body.h.toFixed(4)} ÷ ${spacing.toFixed(4)})` } },
    );
  }
  return { nodes, diagnostics, metrics, regions: { mainContent: frame.body, writingArea: frame.body } };
}

export const linedJournal: LayoutDefinition = {
  id: "journal-lined",
  label: "Lined Journal Page",
  family: "journal",
  description: "Full-page writing surface using the project ruling (or dot/graph pattern).",
  pages: 1,
  period: "none",
  capability: { ...WRITING_PAGE, supportedProductTypes: ["journal", "notebook", "planner", "insert", "worksheet", "custom"], wordingKeys: ["date"] },
  fit: minimumAreaFit(1.5, 2, "Writing page"),
  // A purpose that uses the plain journal design (e.g. Meeting With God) titles the page with its purpose.
  solve: (ctx) => [writingPage(ctx, ctx.module && ctx.module.type !== "lined-journal" ? ctx.module.title : ctx.wording.date)],
};

export const notesPage: LayoutDefinition = {
  id: "notes-page",
  label: "Notes Page",
  family: "shared",
  description: "Notes heading + writing surface. Also used as the spread filler page.",
  pages: 1,
  period: "none",
  capability: { ...WRITING_PAGE, supportedProductTypes: ["journal", "notebook", "planner", "insert", "notepad", "worksheet", "tracker", "custom"], wordingKeys: ["notes"] },
  fit: minimumAreaFit(1.5, 2, "Notes page"),
  solve: (ctx) => {
    if (ctx.filler && ctx.facingPage?.layoutId === "planner-monthly") {
      const headerH = monthlyTitleHeight({ page: ctx.facingPage.geometry, spacing: ctx.spacing, typography: ctx.typography, options: ctx.options });
      const frame = pageFrame(ctx, 0, { headerH });
      const title = headerTitle("notes-facing-month-header", ctx, frame.zones, "pageTitle", ctx.wording.notes, "monthTitle", "header-left");
      const g = ctx.pages[0];
      const marginX = g.boundEdge === "right" ? g.trimWidthIn - ctx.pattern.marginLineIn : ctx.pattern.marginLineIn;
      return [{ nodes: [...frame.nodes, ...title.nodes, ...fillWritingRegion("notes-facing-month-writing", frame.body, ctx.pattern, marginX), rule("notes-facing-month-bottom", frame.body.x, frame.body.y + frame.body.h, frame.body.x + frame.body.w, frame.body.y + frame.body.h, { strokePt: STUDIO_STROKES.headerRulePt, component: "Grid" })], diagnostics: [...frame.diagnostics, ...title.diagnostics], metrics: [], regions: { mainContent: frame.body, writingArea: frame.body } }];
    }
    return [writingPage(ctx, ctx.wording.notes)];
  },
};

/** Intentionally blank physical page used only when a bound spread needs alignment. */
export const blankFillerPage: LayoutDefinition = {
  ...notesPage,
  id: "blank-filler-page",
  label: "Blank filler page",
  description: "An intentionally blank page for facing-page alignment.",
  solve: () => [{ blankPage: true, nodes: [], diagnostics: [], metrics: [] }],
};
