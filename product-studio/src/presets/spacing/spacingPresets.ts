import type { SpacingDensity, SpacingTokens } from "../../types/tokens";

/**
 * USER-SELECTABLE design geometry. Every value sits inside a researched range:
 *   column/row gap   0.06–0.08" (blueprints B1, B2, B5, B6)
 *   box padding      0.06–0.12" (research 1.2.3 / 1.4)
 *   list row         0.32–0.40" (research 3.2.3 / 3.4)
 *   checkbox         0.14–0.18" (research 3.2.3)
 *   checkbox gap     0.10–0.14" (research 3.2.3)
 * Balanced reproduces the blueprint values; compact/airy use the range ends.
 *
 * Semantic spacing (studio-recommended, applied by the shared components):
 *   titleToRuleGap        title ink → rule under it
 *   headingToContentGap   section heading → its content
 *   labelToBorderInset    label → box / cell border        (≥ box padding)
 *   dateToCellInset       calendar date → cell border      (= box padding range)
 *   sectionHeadingInset   section heading → section edges
 *   decorationToContentClearance  decoration → functional content (≈ 1/8")
 */
export const SPACING_PRESETS: Record<SpacingDensity, SpacingTokens> = {
  compact: {
    page: 0,
    section: 0.15,
    block: 0.1,
    column: 0.05,
    row: 0.05,
    boxPadding: 0.06,
    headerGap: 0.06,
    footerGap: 0.06,
    listRow: 0.32,
    checkbox: 0.14,
    checkboxGap: 0.1,
    titleToRuleGap: 0.1,
    headingToContentGap: 0.06,
    labelToBorderInset: 0.07,
    dateToCellInset: 0.06,
    sectionHeadingInset: 0.07,
    decorationToContentClearance: 0.1,
  },
  balanced: {
    page: 0,
    section: 0.2,
    block: 0.15,
    column: 0.06,
    row: 0.06,
    boxPadding: 0.08,
    headerGap: 0.1,
    footerGap: 0.1,
    listRow: 0.36,
    checkbox: 0.16,
    checkboxGap: 0.12,
    titleToRuleGap: 0.14,
    headingToContentGap: 0.08,
    labelToBorderInset: 0.1,
    dateToCellInset: 0.08,
    sectionHeadingInset: 0.1,
    decorationToContentClearance: 0.125,
  },
  airy: {
    page: 0,
    section: 0.25,
    block: 0.2,
    column: 0.08,
    row: 0.08,
    boxPadding: 0.12,
    headerGap: 0.15,
    footerGap: 0.15,
    listRow: 0.4,
    checkbox: 0.18,
    checkboxGap: 0.14,
    titleToRuleGap: 0.18,
    headingToContentGap: 0.12,
    labelToBorderInset: 0.13,
    dateToCellInset: 0.11,
    sectionHeadingInset: 0.13,
    decorationToContentClearance: 0.18,
  },
};

export const SPACING_LABELS: Record<SpacingDensity, string> = {
  compact: "Compact — maximizes writing space",
  balanced: "Balanced — default",
  airy: "Airy — more breathing room",
};

export function resolveSpacing(density: SpacingDensity, overrides: Partial<SpacingTokens> = {}): SpacingTokens {
  return { ...SPACING_PRESETS[density], ...overrides };
}
