/**
 * Decoration roles: every asset declares its visual job, only role-appropriate
 * placements are offered, each design's DEFAULT is its strongest composition,
 * and every placement attaches to a target (title rule, page edge, header,
 * footer, content boundary) — never to leftover empty space.
 */
import { describe, expect, it } from "vitest";
import { compositionFor, geometryFor, resolveDocument } from "../src/engines/document/resolve";
import { DESIGN_ASSETS } from "../src/design-library/library";
import { rolesFor } from "../src/design-library/placement";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { planDecoration, placementsFor } from "../src/themes/decorationPlan";
import type { DecorativeTheme } from "../src/types/theme";

const MONTHLY = 2, NOTEPAD = 0, JOURNAL = 1;
function planFor(i: number, d: Partial<DecorativeTheme>) {
  const p = TEST_PRODUCTS[i].build();
  p.decorativeTheme = { ...p.decorativeTheme, corners: undefined, edge: undefined, titlePosition: undefined, layout: undefined, ...d };
  const doc = resolveDocument(p);
  const idx = doc.recipe.pages.findIndex((x) => !x.filler);
  const g = geometryFor(doc, doc.recipe.pages[idx]);
  const comp = compositionFor(doc, idx);
  return { g, comp, plan: planDecoration(g, p.decorativeTheme, doc.colors, comp)!, trim: (r: { x: number; y: number; w: number; h: number }) => ({ ...r, x: r.x - g.trimOffset.x, y: r.y - g.trimOffset.y }) };
}

describe("every asset declares its roles; only those placements are offered", () => {
  it("each asset has roles and placements derived from them", () => {
    for (const a of DESIGN_ASSETS) {
      expect(rolesFor(a.capabilities).length, a.id).toBeGreaterThan(0);
      expect(a.placements.length, a.id).toBeGreaterThan(0);
    }
  });
  it("surfaces (marble) are only surfaces; florals and line art are never backgrounds or bands they were not designed for", () => {
    for (const a of DESIGN_ASSETS.filter((x) => x.type === "marble")) {
      expect(new Set(rolesFor(a.capabilities))).toEqual(new Set(["band", "frame", "edge", "background"]));
      expect(a.placements).toEqual(["header-band", "footer-band", "edge-strip", "border-frame", "full-page"]);
    }
    for (const a of DESIGN_ASSETS.filter((x) => x.type !== "marble")) expect(a.placements, a.id).not.toContain("full-page");
  });
  it("removed placements: line art behind the title; sprigs floating above / below the title", () => {
    for (const a of DESIGN_ASSETS.filter((x) => x.type === "accent")) expect(a.placements, a.id).not.toContain("behind-title");
    const sprig = DESIGN_ASSETS.find((a) => a.id === "jcs-floral-sprig")!;
    expect(sprig.capabilities.some((c) => c === "title-above" || c === "title-below")).toBe(false);
  });
  it("defaults are each design's strongest composition", () => {
    const first = (style: DecorativeTheme["style"], assetId?: string) => placementsFor({ style, assetId })[0];
    expect(first("floral", "jcs-floral-bouquet")).toBe("title-accent");
    expect(first("floral", "jcs-floral-sprig")).toBe("title-accent");
    expect(first("floral", "jcs-floral-corner")).toBe("corners");
    expect(first("accent", "jcs-accent-waves")).toBe("header-flourish");
    expect(first("accent", "jcs-accent-dots")).toBe("header-band");
    expect(first("marble", "jcs-marble-goldleaf")).toBe("header-band");
    expect(first("watercolor")).toBe("header-band");
  });
});

describe("placements attach to their targets", () => {
  it("bouquet default: a rule-end ornament resting on the title rule's right end (TITLE ───── ❀)", () => {
    const { plan, comp, trim } = planFor(MONTHLY, { style: "floral", assetId: "jcs-floral-bouquet", placement: "title-accent" });
    const r = plan.reports[0];
    expect(r.id).toBe("rule-right");
    const t = trim(r.rect!), rule = comp.headerRule!;
    expect(t.x + t.w).toBeCloseTo(rule.x + rule.w, 9);
    expect(t.y + t.h).toBeCloseTo(rule.y - comp.gaps.toRule, 9);
    // Larger than a sprig: a real ornament, not a speck.
    const sprig = planFor(MONTHLY, { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" }).plan.reports[0];
    expect(r.rect!.h).toBeGreaterThan(sprig.rect!.h);
  });
  it("bouquet on a centred title flanks both ends of its rule", () => {
    const { plan } = planFor(NOTEPAD, { style: "floral", assetId: "jcs-floral-bouquet", placement: "title-accent" });
    expect(plan.reports.map((r) => r.id).sort()).toEqual(["rule-left", "rule-right"]);
    expect(plan.reports.every((r) => r.rect)).toBe(true);
  });
  it("bouquet edge flourishes ENTER from the page edge (deliberate bleed), never float in the margin", () => {
    const { plan, comp, trim } = planFor(JOURNAL, { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" });
    for (const r of plan.reports.filter((x) => x.rect)) {
      expect(r.mode).toBe("bleed");
      expect(r.intentionalClip).toBe(true);
      const t = trim(r.rect!);
      if (r.id === "top") expect(t.y).toBeLessThan(0);
      else expect(t.y + t.h).toBeGreaterThan(comp.trim.h);
    }
  });
  it("surfaces: footer band starts just below the content; edge strip runs along the outer edge up to the content", () => {
    const f = planFor(JOURNAL, { style: "watercolor", placement: "footer-band" });
    const band = f.plan.pieces[0].kind === "watercolor" ? f.plan.pieces[0].rect : null;
    const content = f.comp.content!;
    expect(band!.y).toBeCloseTo(f.g.trimOffset.y + content.y + content.h + f.comp.clearanceIn, 9);
    expect(band!.y + band!.h).toBeCloseTo(f.g.mediaHeightIn, 9);
    const e = planFor(NOTEPAD, { style: "solid", placement: "edge-strip" });
    const strip = e.plan.pieces[0].kind === "solid" ? e.plan.pieces[0].rect : null;
    const c = e.comp.content!;
    expect(strip!.x).toBeCloseTo(e.g.trimOffset.x + c.x + c.w + e.comp.clearanceIn, 9);
    expect(strip!.x + strip!.w).toBeCloseTo(e.g.mediaWidthIn, 9);
  });
  it("flowing lines default: a header flourish resting on the title rule", () => {
    const { plan, comp, trim } = planFor(MONTHLY, { style: "accent", assetId: "jcs-accent-waves", placement: "header-flourish" });
    const t = trim(plan.reports[0].rect!);
    expect(t.y + t.h).toBeCloseTo(comp.headerRule!.y - comp.gaps.toRule, 9);
    expect(plan.reports[0].clippedShare).toBe(0);
  });
});
