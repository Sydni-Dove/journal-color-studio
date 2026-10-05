/**
 * PROJECT USAGE — what the current product actually consumes.
 *
 * The editor shows a control only when something on the page uses it, so no
 * control is a placebo. Usage comes from layout capabilities AND from the
 * solved output (which text roles and color tokens really appear).
 */
import { dailySectionsOf } from "../../layouts/planner/dailyConfigurable";
import { monthlySidebarOf, weeklySidebarOf } from "../../layouts/planner/plannerOptions";
import { recipeSteps } from "../recipe/recipe";
import type { FitResult, LayoutDefinition } from "../../layouts/shared/types";
import type { FunctionalPatternKind } from "../../types/theme";
import type { ColorToken, FontGroup, TypographyRole, WordingKey } from "../../types/tokens";
import { anchorsFor } from "../../layouts/shared/components";
import type { CompositionAnchor } from "../../types/composition";
import type { SemanticTextKey, TextAnchor } from "../../types/layout";
import { compositionFor, recipeLayouts, representativeGeometry, solvePage, type ResolvedDocument } from "./resolve";

export type ProjectUsage = {
  layouts: { layout: LayoutDefinition; fit: FitResult }[];
  patterns: FunctionalPatternKind[];
  lineStyle: boolean;
  sidebar: { supported: boolean; available: boolean; reason?: string };
  /** Monthly calendar's sidebar, independent of the weekly one. */
  monthlySidebar: { supported: boolean; available: boolean; reason?: string };
  /** Weekly spread's sidebar, independent of the monthly one. */
  weeklySidebar: { supported: boolean; available: boolean; reason?: string };
  /** The weekly spread's extra Notes slot (only exists when its sidebar is off). */
  weeklyNotes: { supported: boolean };
  /** Weekly plan spread's Notes / Priorities foot sections. */
  weeklyPlanSections: { supported: boolean };
  /** Planner-level facing-page behavior (preserve spreads vs continuous flow). */
  spreadBehavior: { supported: boolean };
  datePlacement: boolean;
  sectionsPerDay: boolean;
  /** A Classic Weekly spread is in the product: its days can be columns or rows. */
  weeklyOrientation: { supported: boolean; vertical: boolean; horizontal: boolean; current?: "vertical" | "horizontal" };
  writingRows: boolean;
  /** A daily layout is in the product: its section list and schedule hours apply. */
  dailySections: boolean;
  /** A daily schedule is in the product: printed or blank times apply. */
  scheduleTimes: boolean;
  pageNumbers: boolean;
  footer: boolean;
  calendar: boolean;
  weekStart: boolean;
  wordingKeys: WordingKey[];
  textRoles: TypographyRole[];
  fontGroups: FontGroup[];
  colorTokens: ColorToken[];
  spreads: boolean;
  incompatible: { layoutId: string; label: string; reason: string }[];
  /** Positionable semantic text that renders, with the anchors each supports and an example of its text. */
  semanticText: { key: SemanticTextKey; example: string; anchors: TextAnchor[]; layoutIds: string[]; anchor: TextAnchor; defaultAnchor: TextAnchor }[];
  /** Composition anchors present on the product's pages (decoration placement). */
  compositionAnchors: CompositionAnchor[];
  /** Layouts that visibly consume each page-scoped control (for "applies to … pages" hints). */
  consumers: { pattern: string[]; sidebar: string[]; monthlySidebar: string[]; weeklySidebar: string[]; datePlacement: string[]; sectionsPerDay: string[]; writingRows: string[] };
};

export function computeUsage(doc: ResolvedDocument): ProjectUsage {
  const layouts = recipeLayouts(doc);
  const caps = layouts.map((l) => l.layout.capability);
  const any = (f: (c: (typeof caps)[number]) => boolean) => caps.some(f);

  const sidebarLayouts = layouts.filter((l) => l.layout.capability.supportsSidebar);
  const sidebarAvailable = sidebarLayouts.some((l) => l.fit.ok && l.fit.sidebarAvailable);
  const sidebarReason = sidebarLayouts.map((l) => (l.fit.ok ? l.fit.sidebarReason : l.fit.reason)).find(Boolean);
  // Monthly and weekly sidebars are independent switches: availability is per layout family.
  const sidebarUsage = (ids: string[]) => {
    const ls = sidebarLayouts.filter((l) => ids.includes(l.layout.id));
    const available = ls.some((l) => l.fit.ok && l.fit.sidebarAvailable);
    return {
      supported: ls.length > 0,
      available,
      reason: available ? undefined : ls.map((l) => (l.fit.ok ? l.fit.sidebarReason : l.fit.reason)).find(Boolean),
    };
  };
  const monthlySidebar = sidebarUsage(["planner-monthly"]);
  const weeklySidebar = sidebarUsage(["planner-weekly-spread"]);

  const patterns = [...new Set(caps.flatMap((c) => c.supportsPatterns))];
  // Either sidebar showing pulls its heading's wording into the product.
  const monthlyOn = monthlySidebarOf(doc.project.layoutOptions) && monthlySidebar.available;
  const weeklyOn = weeklySidebarOf(doc.project.layoutOptions) && weeklySidebar.available;
  const showSidebar = monthlyOn || weeklyOn;
  const wording = new Set<WordingKey>(caps.flatMap((c) => c.wordingKeys));
  if (showSidebar) wording.add(doc.project.layoutOptions.sidebarContent);
  // Daily pages render the chosen sections' headings.
  const daily = any((c) => !!c.supportsDailySections);
  if (daily) for (const k of dailySectionsOf(doc.project.layoutOptions)) wording.add(k);
  // The product title renders through the footer (desk pads also show it in their header).
  if (doc.project.layoutOptions.showFooter) wording.add("productTitle");

  // Solved output of the first page of each recipe step: what really renders.
  const roles = new Set<TypographyRole>();
  const tokens = new Set<ColorToken>(["background"]);
  const semantic = new Map<SemanticTextKey, ProjectUsage["semanticText"][number]>();
  const anchors = new Set<CompositionAnchor>();
  const regionSets: Partial<Record<CompositionAnchor, { x: number; y: number; w: number; h: number }>>[] = [];
  recipeSteps(doc.project.recipe).forEach((item) => {
    const index = doc.recipe.pages.findIndex((p) => p.recipeItemId === item.id && !p.filler);
    if (index < 0) return;
    const solved = solvePage(doc, index);
    const hasFooter = solved.nodes.some((n) => n.type === "group" && n.component === "PageFooter");
    for (const n of solved.nodes) {
      if (n.type === "text" && n.semantic) {
        const cur = semantic.get(n.semantic);
        const layoutId = doc.recipe.pages[index].layoutId;
        if (cur) cur.layoutIds = [...new Set([...cur.layoutIds, layoutId])];
        else {
          const anchors = anchorsFor(n.semantic, { footer: hasFooter ? { x: 0, y: 0, w: 0, h: 0 } : null });
          const def = n.placement?.defaultAnchor ?? anchors[0];
          semantic.set(n.semantic, { key: n.semantic, example: n.text, anchors, layoutIds: [layoutId], anchor: n.placement?.anchor ?? def, defaultAnchor: def });
        }
      }
    }
    const regions = compositionFor(doc, index).regions;
    for (const a of Object.keys(regions)) anchors.add(a as CompositionAnchor);
    regionSets.push(regions);
    for (const n of solved.nodes) {
      switch (n.type) {
        case "text":
          roles.add(n.role);
          tokens.add(n.color ?? doc.typography.roles[n.role].color);
          break;
        case "box":
          if (n.stroke) tokens.add(n.stroke);
          if (n.fill) tokens.add(n.fill);
          break;
        case "lines":
        case "dots":
        case "checkbox":
        case "rule":
          tokens.add(n.color);
          break;
      }
    }
  });
  for (const d of [doc.background, doc.decorative]) {
    if (d.style === "none") continue;
    tokens.add(d.colorA);
    if (d.style !== "solid") tokens.add(d.colorB);
    if (d.style === "marble" || d.style === "watercolor" || d.style === "floral") tokens.add(d.colorC);
    if (d.style === "floral") tokens.add("primary");
  }

  const okIds = (f: (l: (typeof layouts)[number]) => boolean) => layouts.filter((l) => l.fit.ok && f(l)).map((l) => l.layout.id);
  const consumers = {
    // Monthly pages only draw a writing surface inside the notes sidebar.
    pattern: okIds((l) => l.layout.capability.supportsPatterns.length > 0 && (l.layout.id !== "planner-monthly" || (monthlyOn && l.fit.ok && l.fit.sidebarAvailable))),
    sidebar: okIds((l) => l.layout.capability.supportsSidebar && l.fit.ok && l.fit.sidebarAvailable),
    monthlySidebar: okIds((l) => l.layout.id === "planner-monthly" && l.fit.ok && l.fit.sidebarAvailable),
    weeklySidebar: okIds((l) => l.layout.id === "planner-weekly-spread" && l.fit.ok && l.fit.sidebarAvailable),
    datePlacement: okIds((l) => l.layout.capability.supportsDatePlacement),
    sectionsPerDay: okIds((l) => l.layout.capability.supportsSectionsPerDay && l.fit.ok && l.fit.variant === "vertical"),
    writingRows: okIds((l) => l.layout.capability.supportsWritingRows),
  };

  return {
    semanticText: [...semantic.values()],
    compositionAnchors: distinctAnchors([...anchors], regionSets),
    consumers,
    layouts,
    patterns,
    lineStyle: any((c) => c.supportsLineStyle),
    sidebar: { supported: sidebarLayouts.length > 0, available: sidebarAvailable, reason: sidebarAvailable ? undefined : sidebarReason },
    monthlySidebar,
    weeklySidebar,
    weeklyNotes: { supported: layouts.some((l) => l.layout.id === "planner-weekly-spread") },
    weeklyPlanSections: { supported: layouts.some((l) => l.layout.id === "weekly-plan-spread" || l.layout.id === "weekly-plan-mwg-spread") },
    // Facing-page behavior matters for paged products with two-page spreads.
    spreadBehavior: { supported: doc.recipe.pages.some((p) => p.side !== "single") && layouts.some((l) => l.layout.pages === 2) },
    datePlacement: any((c) => c.supportsDatePlacement),
    dailySections: daily,
    scheduleTimes: any((c) => !!c.supportsScheduleTimes),
    sectionsPerDay: layouts.some((l) => l.layout.capability.supportsSectionsPerDay && l.fit.ok && l.fit.variant === "vertical"),
    weeklyOrientation: weeklyOrientationUsage(doc, layouts),
    writingRows: any((c) => c.supportsWritingRows),
    pageNumbers: any((c) => c.supportsPageNumbers),
    footer: any((c) => c.supportsFooter),
    calendar: any((c) => c.requiresCalendar),
    weekStart: any((c) => c.usesWeekStart),
    wordingKeys: [...wording],
    textRoles: [...roles],
    fontGroups: [...new Set([...roles].map((r) => doc.typography.roles[r].group))],
    colorTokens: [...tokens],
    spreads: doc.recipe.pages.some((p) => p.side !== "single"),
    incompatible: layouts.filter((l) => !l.fit.ok).map((l) => ({ layoutId: l.layout.id, label: l.layout.label, reason: l.fit.ok ? "" : l.fit.reason })),
  };
}

/** Which weekly arrangements fit this size (each tried as the maker's choice), and the one in use. */
function weeklyOrientationUsage(doc: ResolvedDocument, layouts: { layout: LayoutDefinition; fit: FitResult }[]): ProjectUsage["weeklyOrientation"] {
  const weekly = layouts.find((l) => l.layout.id === "planner-weekly-spread");
  if (!weekly || !weekly.fit.ok) return { supported: false, vertical: false, horizontal: false };
  const page = representativeGeometry(doc);
  const tryFit = (weeklyOrientation: "vertical" | "horizontal") =>
    weekly.layout.fit({ page, spacing: doc.spacing, typography: doc.typography, options: { ...doc.project.layoutOptions, weeklyOrientation }, pattern: doc.project.functionalPattern });
  const v = tryFit("vertical"), h = tryFit("horizontal");
  return {
    supported: true,
    vertical: !!v && v.ok && v.variant === "vertical",
    horizontal: !!h && h.ok && h.variant === "horizontal",
    current: weekly.fit.variant === "horizontal" ? "horizontal" : "vertical",
  };
}

/** Most specific first: when two anchors are the same physical region on every page, only this one is offered. */
const ANCHOR_SPECIFICITY: CompositionAnchor[] = ["title", "notes", "calendar", "writingArea", "sidebar", "header", "footer", "mainContent", "safeArea", "page", "topLeftAccent", "topRightAccent", "bottomLeftAccent", "bottomRightAccent"];

/** Drop anchors that are the same bounds as a more specific anchor on every page (no duplicate options). */
function distinctAnchors(anchors: CompositionAnchor[], pages: Partial<Record<CompositionAnchor, { x: number; y: number; w: number; h: number }>>[]): CompositionAnchor[] {
  const key = (r?: { x: number; y: number; w: number; h: number }) => (r ? [r.x, r.y, r.w, r.h].map((v) => v.toFixed(4)).join(",") : "-");
  const sorted = [...anchors].sort((a, b) => ANCHOR_SPECIFICITY.indexOf(a) - ANCHOR_SPECIFICITY.indexOf(b));
  const kept: CompositionAnchor[] = [];
  for (const a of sorted) {
    const dup = kept.some((k) => pages.every((pg) => key(pg[a]) === key(pg[k])));
    if (!dup) kept.push(a);
  }
  return anchors.filter((a) => kept.includes(a));
}
