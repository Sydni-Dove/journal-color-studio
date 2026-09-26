/**
 * GUIDED PAGE — one design that serves many PURPOSES. The page's module
 * (Meeting With God, Vision, Goals, Monthly Review, …) supplies its title,
 * period label and prompts; the layout only decides geometry: a titled header
 * and one writing section per prompt. With three or more prompts the first
 * one gets twice the writing space (the main conversation / reflection).
 */
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import type { LayoutNode, SolvedPage } from "../../types/layout";
import { headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { text } from "../shared/nodes";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";

/** Split a height into sections by weight, with a fixed gap between them. */
export function weightedStack(y: number, h: number, weights: number[], gap: number): { y: number; h: number }[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = h - gap * (weights.length - 1);
  let cur = y;
  return weights.map((w) => {
    const size = (avail * w) / total;
    const r = { y: cur, h: size };
    cur += size + gap;
    return r;
  });
}

function solveGuided(ctx: LayoutContext): SolvedPage {
  const title = ctx.module?.title ?? ctx.wording.journalTitle;
  const prompts = ctx.module?.prompts ?? [];
  const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.weeklyTitle.valueIn });
  const head = headerTitle("gp-header", ctx, frame.zones, "pageTitle", title, "pageTitle", "header-left");
  const nodes: LayoutNode[] = [...frame.nodes, ...head.nodes];
  const diagnostics = [...frame.diagnostics, ...head.diagnostics];
  const sub = ctx.module?.subtitle;
  if (sub) {
    // The period this page belongs to (e.g. "January 2027"), opposite the title.
    const z = frame.zones.header;
    nodes.push(text("gp-period", { x: z.x, y: z.y, w: z.w, h: z.h - ctx.spacing.titleToRuleGap }, sub, "label", { component: "PageHeader", align: "right", vAlign: "bottom" }));
  }
  const b = frame.body;
  if (!prompts.length) nodes.push(...writingSurface("gp-writing", b, ctx));
  else {
    const weights = prompts.map((_, i) => (i === 0 && prompts.length >= 3 ? 2 : 1));
    weightedStack(b.y, b.h, weights, ctx.spacing.section).forEach((r, i) => {
      const sec = section(`gp-s${i}`, { x: b.x, y: r.y, w: b.w, h: r.h }, prompts[i], ctx, "surface", { titleRole: "sectionHeading" });
      nodes.push(...sec.nodes);
      diagnostics.push(...sec.diagnostics);
    });
  }
  return { nodes, diagnostics, metrics: [{ label: "Prompt sections", value: prompts.length, unit: "count", provenance: { geometryClass: "user-design", basis: "page module prompts" } }], regions: { mainContent: b, writingArea: b } };
}

export const guidedPage: LayoutDefinition = {
  id: "guided-page",
  label: "Guided page (title + prompts)",
  family: "journal",
  description: "Module title and period, then one writing section per prompt. Serves Meeting With God, Vision, Goals, Reviews and other purposes.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["journal", "notebook", "planner", "insert", "worksheet", "custom"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
    supportsLineStyle: true,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: [],
    repeats: ["once", "count"],
    defaultRepeat: "once",
  },
  fit: minimumAreaFit(2, 3, "Guided page"),
  solve: (ctx) => [solveGuided(ctx)],
};
