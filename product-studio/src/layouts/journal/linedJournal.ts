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
import { pageFrame } from "../shared/components";
import { lineBoxIn, text } from "../shared/nodes";
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
  const frame = pageFrame(ctx, 0, { headerH });
  const nodes: LayoutNode[] = [...frame.nodes];
  if (heading) {
    const h = lineBoxIn(ctx.typography, "label");
    nodes.push(text("journal-heading", { x: frame.header.x, y: frame.header.y + frame.header.h - h, w: frame.header.w, h }, heading, "label", { component: "PageHeader", vAlign: "bottom" }));
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
  return { nodes, diagnostics: frame.diagnostics, metrics };
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
  solve: (ctx) => [writingPage(ctx, ctx.wording.date)],
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
  solve: (ctx) => [writingPage(ctx, ctx.wording.notes)],
};
