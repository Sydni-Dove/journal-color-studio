/**
 * PROJECT USAGE — what the current product actually consumes.
 *
 * The editor shows a control only when something on the page uses it, so no
 * control is a placebo. Usage comes from layout capabilities AND from the
 * solved output (which text roles and color tokens really appear).
 */
import type { FitResult, LayoutDefinition } from "../../layouts/shared/types";
import type { FunctionalPatternKind } from "../../types/theme";
import type { ColorToken, FontGroup, TypographyRole, WordingKey } from "../../types/tokens";
import { recipeLayouts, solvePage, type ResolvedDocument } from "./resolve";

export type ProjectUsage = {
  layouts: { layout: LayoutDefinition; fit: FitResult }[];
  patterns: FunctionalPatternKind[];
  lineStyle: boolean;
  sidebar: { supported: boolean; available: boolean; reason?: string };
  datePlacement: boolean;
  sectionsPerDay: boolean;
  writingRows: boolean;
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
  /** Layouts that visibly consume each page-scoped control (for "applies to … pages" hints). */
  consumers: { pattern: string[]; sidebar: string[]; datePlacement: string[]; sectionsPerDay: string[]; writingRows: string[] };
};

export function computeUsage(doc: ResolvedDocument): ProjectUsage {
  const layouts = recipeLayouts(doc);
  const caps = layouts.map((l) => l.layout.capability);
  const any = (f: (c: (typeof caps)[number]) => boolean) => caps.some(f);

  const sidebarLayouts = layouts.filter((l) => l.layout.capability.supportsSidebar);
  const sidebarAvailable = sidebarLayouts.some((l) => l.fit.ok && l.fit.sidebarAvailable);
  const sidebarReason = sidebarLayouts.map((l) => (l.fit.ok ? l.fit.sidebarReason : l.fit.reason)).find(Boolean);

  const patterns = [...new Set(caps.flatMap((c) => c.supportsPatterns))];
  const showSidebar = doc.project.layoutOptions.showSidebar && sidebarAvailable;
  const wording = new Set<WordingKey>(caps.flatMap((c) => c.wordingKeys));
  if (showSidebar) wording.add(doc.project.layoutOptions.sidebarContent);
  // The product title renders through the footer (desk pads also show it in their header).
  if (doc.project.layoutOptions.showFooter) wording.add("productTitle");

  // Solved output of the first page of each recipe step: what really renders.
  const roles = new Set<TypographyRole>();
  const tokens = new Set<ColorToken>(["background"]);
  doc.project.recipe.items.forEach((item) => {
    const index = doc.recipe.pages.findIndex((p) => p.recipeItemId === item.id && !p.filler);
    if (index < 0) return;
    for (const n of solvePage(doc, index).nodes) {
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
  const d = doc.decorative;
  if (d.style !== "none") {
    tokens.add(d.colorA);
    if (d.style !== "solid") tokens.add(d.colorB);
    if (d.style === "marble" || d.style === "watercolor" || d.style === "floral") tokens.add(d.colorC);
    if (d.style === "floral") tokens.add("primary");
  }

  const okIds = (f: (l: (typeof layouts)[number]) => boolean) => layouts.filter((l) => l.fit.ok && f(l)).map((l) => l.layout.id);
  const consumers = {
    // Monthly pages only draw a writing surface inside the notes sidebar.
    pattern: okIds((l) => l.layout.capability.supportsPatterns.length > 0 && (l.layout.id !== "planner-monthly" || (showSidebar && l.fit.ok && l.fit.sidebarAvailable))),
    sidebar: okIds((l) => l.layout.capability.supportsSidebar && l.fit.ok && l.fit.sidebarAvailable),
    datePlacement: okIds((l) => l.layout.capability.supportsDatePlacement),
    sectionsPerDay: okIds((l) => l.layout.capability.supportsSectionsPerDay && l.fit.ok && l.fit.variant === "vertical"),
    writingRows: okIds((l) => l.layout.capability.supportsWritingRows),
  };

  return {
    consumers,
    layouts,
    patterns,
    lineStyle: any((c) => c.supportsLineStyle),
    sidebar: { supported: sidebarLayouts.length > 0, available: sidebarAvailable, reason: sidebarAvailable ? undefined : sidebarReason },
    datePlacement: any((c) => c.supportsDatePlacement),
    sectionsPerDay: layouts.some((l) => l.layout.capability.supportsSectionsPerDay && l.fit.ok && l.fit.variant === "vertical"),
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
