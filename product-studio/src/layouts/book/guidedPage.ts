/**
 * GUIDED PAGE — one design that serves many PURPOSES. The page's module
 * (Meeting With God, Vision, Goals, Monthly Review, …) supplies its title,
 * period label and prompt + response blocks (types/prompts.ts); the shared
 * prompt page solver (layouts/shared/promptPages.ts) decides geometry, and
 * continues on another page when the prompts don't fit. A plain prompt list
 * (older pages, module defaults) keeps its original look: with three or more
 * prompts the first one gets twice the writing space.
 */
import { DEFAULT_WORDING } from "../../presets/wording";
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import { promptSetFromList } from "../../types/prompts";
import type { PageModuleContent } from "../../types/recipe";
import type { SpacingTokens } from "../../types/tokens";
import { blocksToZones, countZonePages, promptGap, solveZonePages, type ZonePageSpec } from "../shared/promptPages";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

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

/**
 * The page's prompt + response content: the creator's prompt blocks, or (pages
 * saved before prompt blocks, and module defaults) its plain prompt list,
 * migrated so it renders exactly as before.
 */
export function guidedSpec(module: PageModuleContent | undefined, fallbackTitle: string, spacing: SpacingTokens): ZonePageSpec {
  const set = module?.promptSet ?? promptSetFromList(module?.prompts ?? []);
  // A Custom Page (and every page made from a saved page design) prints only what its maker put on it:
  // its name ("Custom Page", "Project Snapshot") names it in Pages and Browse pages but is never printed.
  // Headings come from Heading / text pieces or the optional page header.
  const composed = module?.type === "custom";
  return {
    idPrefix: "gp",
    title: composed ? "" : module?.title ?? fallbackTitle,
    headerRight: composed ? undefined : module?.subtitle,
    instructions: set.instructions,
    intro: set.header,
    noun: set.header || set.blocks.some((b) => b.prompt || b.space) ? "section" : "prompt",
    // "The page's own style" for a guided page is the project's writing lines (ruled, dot grid, graph, blank).
    // Small fill-in fields from the header ("Date", "Source") sit on one row before the first section.
    zones: [
      ...(set.header?.fields?.some((f) => f.trim()) ? [{ key: "fields", label: "", surface: "fill-in" as const, weight: 0, fields: set.header.fields.filter((f) => f.trim()) }] : []),
      ...blocksToZones(set, () => ({ surface: "pattern" })),
    ],
    gapIn: promptGap(spacing.section, set),
    legacyWeights: set.legacyWeights,
    // "Tell me instead": keep one page and report that it does not fit.
    flow: set.whenFull !== "stop",
    fewerLines: set.whenFull === "fewer-lines",
    emptySurface: "pattern",
    basis: "guided page",
  };
}

export const guidedPage: LayoutDefinition = {
  // Declares its header so a facing page lines up with it; it does not grow its own (its page count depends on its body).
  headerIn: () => STUDIO_PLANNER.weeklyTitle.valueIn,
  alignsHeader: true,
  id: "guided-page",
  label: "Guided Lined Page (title + prompt sections)",
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
  solve: (ctx) => solveZonePages(guidedSpec(ctx.module, ctx.wording.journalTitle, ctx.spacing), ctx, ctx.pages.map((_, i) => i)),
  // Prompts that don't fit one page continue on another page (never cramped).
  flowPages: (f) => countZonePages(guidedSpec(f.module, DEFAULT_WORDING.journalTitle, f.spacing), f),
};
