/**
 * Journal Color Studio → Product Studio design-library sync (JCS main ba916ad):
 *   registry      every snapshotted design is curated exactly once, with its provenance and picker thumbnail
 *   palettes      JCS roles map onto semantic tokens without flattening (accent, pattern roles, families)
 *   recolor       kintsugi capabilities (texScale, second stone under a transparent seam overlay), pattern ink maps
 *   rendering     marble / pattern / watercolor backgrounds plan and render on the background layer
 *   roles         surfaces only on the background layer, artwork only on the element layer
 *   migration     projects saved before the split open and render identically
 *   print         the print markup and the print raster pre-loader include the background
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BACKGROUND_GROUPS, ELEMENT_GROUPS } from "../src/design-library/catalog";
import { DESIGN_ASSETS, JCS_SNAPSHOT, findAsset } from "../src/design-library/library";
import { JCS_PALETTES_ADAPTED, jcsPaletteId, paletteFromColors } from "../src/design-library/palettes";
import { compositionFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { migrate } from "../src/persistence/projectStore";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { findPalette } from "../src/presets/themes/palettes";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { planDecoration, rasterRequests } from "../src/themes/decorationPlan";
import { isElementStyle, isSurfaceStyle, migrateLayers, splitLayers } from "../src/themes/layers";
import { marbleLUTs, paintMarblePixels, paintPatternPixels } from "../src/themes/recolorMath";
import type { ProductProject } from "../src/types/project";
import type { DecorativeTheme } from "../src/types/theme";

const MONTHLY = 2, JOURNAL = 1;
const theme = (d: Partial<DecorativeTheme>): DecorativeTheme => ({ style: "none", placement: "full-page", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight", ...d });
const build = (i: number) => TEST_PRODUCTS[i].build();
function render(p: ProductProject) {
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((x) => !x.filler);
  return renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[i])} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" />,
  );
}

describe("registry completeness", () => {
  const curated = [...BACKGROUND_GROUPS, ...ELEMENT_GROUPS].flatMap((g) => g.designs).filter((d) => d.assetId);
  it("the source is JCS main ba916ad", () => {
    expect(JCS_SNAPSHOT).toMatchObject({ branch: "main", commit: "ba916ad", previousCommit: "14e4e75" });
  });
  it("every snapshotted design appears exactly once in the curated library, and nothing else does", () => {
    expect(curated.map((d) => d.assetId).sort()).toEqual(DESIGN_ASSETS.map((a) => a.id).sort());
  });
  it("the four kintsugi marbles and three stripe patterns are present, with provenance", () => {
    for (const id of ["jcs-marble-rose", "jcs-marble-burgundy", "jcs-marble-ember", "jcs-marble-peach", "jcs-pattern-cabana", "jcs-pattern-pinstripe", "jcs-pattern-bias"]) {
      const a = findAsset(id)!;
      expect(a, id).toBeTruthy();
      expect(a.version).toBe(3);
      expect(a.snapshotted).toBe("2026-09-27");
      expect(["d7068ea", "8ed5ace"]).toContain(a.sourceCommit);
      expect(a.sha1).toMatch(/^[0-9a-f]{40}$/);
    }
  });
  it("every raster design has a picker thumbnail; every kintsugi marble has its As-designed palette", () => {
    for (const a of DESIGN_ASSETS.filter((x) => x.type !== "accent")) expect("thumb" in a && a.thumb, a.id).toBeTruthy();
    for (const a of DESIGN_ASSETS) {
      if (a.type !== "marble" || !a.asDesigned) continue;
      expect(findPalette(jcsPaletteId(a.asDesigned)).label).toBe(a.asDesigned);
      expect(a.statsSample, a.id).toBeTruthy();
      expect(a.layers, a.id).toBeTruthy();
    }
  });
});

describe("palette normalization", () => {
  const byName = (n: string) => JCS_PALETTES_ADAPTED.find((p) => p.label === n)!;
  it("kintsugi As-designed palettes carry the marble's own layer colors", () => {
    expect(byName("Rose Marble").colors).toMatchObject({ decorBase: "#FAB3B5", decorativeAccent: "#F68F22", decorHighlight: "#FCDFE0", background: "#FFFBFA" });
    expect(byName("Burgundy Blush Marble").colors).toMatchObject({ decorBase: "#9C2933", decorativeAccent: "#D9834F", decorHighlight: "#F9DCCF", lineArt: "#EF9C93" });
    expect(byName("Black Ember Marble").colors).toMatchObject({ decorBase: "#0B0A09", decorativeAccent: "#E97318", decorHighlight: "#413B37" });
    expect(byName("Peach Marble").colors).toMatchObject({ decorBase: "#FEB89F", decorativeAccent: "#F28F30", decorHighlight: "#FBE1D3" });
  });
  it("the line-art accent is kept, not flattened into trim", () => {
    expect(byName("Abstract Watercolor").colors.lineArt).toBe("#B8471C");
    expect(byName("Abstract Watercolor").colors.accent).toBe("#D7A04D");
    expect(byName("Halloween Orange").colors.lineArt).toBe("#FFD3BE");
    expect(byName("Gold Leaf").colors.lineArt).toBe("#C9A55E"); // default = trim
  });
  it("pattern roles equal JCS paletteVariants variation 0 (reference values computed by the JCS code at ba916ad)", () => {
    const want: Record<string, [string, string]> = {
      "Your Canva Cover": ["#FFFFFF", "#050505"],
      "Blush Watercolor": ["#FFFBFA", "#8E4B57"],
      "Peach Cloud": ["#FFF2EB", "#DE9D78"], // all-pastel: deepened stripe path
      "Burgundy Cream": ["#FFF9F2", "#800020"],
      "Rose Marble": ["#FFFBFA", "#FAB3B5"],
      "Orange Light": ["#FFFFFF", "#FF6700"],
      "Abstract Watercolor": ["#F4EDE6", "#63101A"],
    };
    for (const [n, [g, i]] of Object.entries(want)) expect([byName(n).colors.patternGround, byName(n).colors.patternInk], n).toEqual([g, i]);
  });
  it("color families use JCS's generic rule (darkest → main, most vivid → second, lightest → paper)", () => {
    const fam = JCS_PALETTES_ADAPTED.filter((p) => p.group === "family");
    expect(fam).toHaveLength(11);
    expect(paletteFromColors("Burgundy Cream", ["#800020", "#F3E6D5", "#FFF9F2", "#D45060"])).toMatchObject({ stone: "#800020", vein: "#D45060", highlight: "#F3E6D5", paper: "#FFF9F2" });
  });
  it("every palette defines every token", () => {
    for (const p of JCS_PALETTES_ADAPTED) for (const t of ["lineArt", "patternGround", "patternInk", "decorBase", "decorativeAccent", "decorHighlight"] as const) expect(p.colors[t], `${p.id}.${t}`).toMatch(/^#[0-9A-F]{6}$/i);
    for (const t of ["lineArt", "patternGround", "patternInk"] as const) expect(findPalette("dove-signature").colors[t]).toMatch(/^#/);
  });
});

describe("recolor mapping", () => {
  const st = { stone: 0.5, p5: 0.3, p95: 0.7, gold: 0.75, hi: 0.9 };
  const roles = { stone: "#FAB3B5", vein: "#F68F22", highlight: "#FFFFFF" };
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);
  it("second stone: under a transparent seam overlay the map's B layer is painted; the vein channel is not", () => {
    const luts = marbleLUTs(st, roles, 0.6);
    const plain = px(128, 0, 0), withB = px(128, 0, 255), withG = px(128, 255, 0);
    [plain, withB, withG].forEach((d) => paintMarblePixels(d, luts, 1, false, true));
    expect([...withB.slice(0, 3)]).not.toEqual([...plain.slice(0, 3)]); // second stone drawn
    expect([...withG.slice(0, 3)]).toEqual([...plain.slice(0, 3)]); // seams come from the overlay only
    const off = px(128, 0, 255);
    paintMarblePixels(off, luts, 1, false, false); // opaque-photo overlay (bold gold, burgundy): the overlay draws both
    expect([...off.slice(0, 3)]).toEqual([...plain.slice(0, 3)]);
  });
  it("texScale widens the stone's light/dark range (burgundy 2)", () => {
    const spread = (k: number) => {
      const l = marbleLUTs(st, roles, 0.6, k);
      return Math.abs(l.stoneLUT[255 * 3] - l.stoneLUT[0]) + Math.abs(l.stoneLUT[255 * 3 + 2] - l.stoneLUT[2]);
    };
    expect(spread(2)).toBeGreaterThan(spread(1));
    expect(findAsset("jcs-marble-burgundy")).toMatchObject({ texScale: 2, veins: { alpha: false } });
    for (const id of ["jcs-marble-rose", "jcs-marble-ember", "jcs-marble-peach"]) expect(findAsset(id)).toMatchObject({ veins: { alpha: true } });
  });
  it("patterns: ink 0 = ground, 255 = ink, edges blend (only colors change)", () => {
    const d = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255]);
    paintPatternPixels(d, "#FFFFFF", "#000000");
    expect([...d.slice(0, 3)]).toEqual([255, 255, 255]);
    expect([...d.slice(4, 7)]).toEqual([0, 0, 0]);
    expect(d[8]).toBeGreaterThan(100);
    expect(d[8]).toBeLessThan(160);
  });
});

describe("background rendering", () => {
  const withBg = (i: number, bg: Partial<DecorativeTheme>, el: Partial<DecorativeTheme> = {}) => {
    const p = build(i);
    p.backgroundTheme = theme(bg);
    p.decorativeTheme = theme(el);
    return p;
  };
  for (const [assetId, style] of [["jcs-marble-rose", "marble"], ["jcs-marble-burgundy", "marble"], ["jcs-pattern-cabana", "pattern"]] as const) {
    it(`${assetId}: a header band is a cover-fitted raster (cropped, never stretched)`, () => {
      const doc = resolveDocument(withBg(MONTHLY, { style, assetId, placement: "header-band" }));
      const plan = planDecoration(geometryFor(doc, doc.recipe.pages[0]), doc.background, doc.colors, compositionFor(doc, 0))!;
      expect(plan.pieces).toHaveLength(1);
      const piece = plan.pieces[0];
      expect(piece.kind === "raster" && piece.request.fit).toBe("cover");
      expect(piece.kind === "raster" && piece.request.assetId).toBe(assetId);
    });
  }
  it("background and elements render as two layers, background first", () => {
    const html = render(withBg(MONTHLY, { style: "marble", assetId: "jcs-marble-peach", placement: "header-band" }, { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" }));
    const bg = html.indexOf('data-layer="background"'), el = html.indexOf('data-layer="elements"');
    expect(bg).toBeGreaterThan(-1);
    expect(el).toBeGreaterThan(bg);
    expect(html).toContain('data-asset="jcs-marble-peach"');
    expect(html).toContain('data-asset="jcs-floral-sprig"');
  });
  it("watercolor stays procedural on the background layer", () => {
    expect(render(withBg(JOURNAL, { style: "watercolor", placement: "header-band" }))).toContain('data-layer="background"');
  });
  it("florals can keep their original colors (no recolor requested)", () => {
    const doc = resolveDocument(withBg(MONTHLY, {}, { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent", artColors: "original" }));
    const plan = planDecoration(geometryFor(doc, doc.recipe.pages[0]), doc.decorative, doc.colors, compositionFor(doc, 0))!;
    expect(plan.pieces.every((p) => p.kind === "raster" && p.request.original)).toBe(true);
  });
});

describe("design role restrictions", () => {
  it("the Background picker offers only surfaces; the Decorative elements picker only artwork", () => {
    for (const d of BACKGROUND_GROUPS.flatMap((g) => g.designs)) expect(d.style === "none" || isSurfaceStyle(d.style), d.value).toBe(true);
    for (const d of ELEMENT_GROUPS.flatMap((g) => g.designs)) expect(d.style === "none" || isElementStyle(d.style), d.value).toBe(true);
  });
  it("new marbles and patterns are surfaces only (background, frame, bands, edge strip)", () => {
    for (const a of DESIGN_ASSETS.filter((x) => x.type === "pattern" || x.id.match(/rose|burgundy|ember|peach/))) expect(a.placements).toEqual(["header-band", "footer-band", "edge-strip", "border-frame", "full-page"]);
  });
  it("a surface can never render on the element layer, nor artwork on the background layer", () => {
    const s = splitLayers(theme({ style: "floral", assetId: "jcs-floral-corner" }), theme({ style: "marble", assetId: "jcs-marble-rose" }));
    expect(s.background.style).toBe("marble"); // legacy surface in the element slot → background
    expect(s.elements.style).toBe("none");
  });
});

describe("migration of projects saved before the split", () => {
  const legacy = (d: Partial<DecorativeTheme>) => {
    const p = build(MONTHLY);
    delete p.backgroundTheme;
    p.decorativeTheme = theme(d);
    return JSON.parse(JSON.stringify(p)) as ProductProject;
  };
  for (const d of [
    { style: "marble", assetId: "jcs-marble-goldleaf", placement: "header-band" },
    { style: "watercolor", placement: "border-frame" },
    { style: "solid", placement: "footer-band", colorA: "accent" },
    { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" },
    { style: "accent", assetId: "jcs-accent-waves", placement: "header-flourish" },
  ] as Partial<DecorativeTheme>[]) {
    it(`${d.assetId ?? d.style}: opens, lands on the right layer and renders identically`, () => {
      const old = legacy(d);
      const loaded = migrate(JSON.parse(JSON.stringify(old)))!;
      expect(loaded).toBeTruthy();
      const surface = isSurfaceStyle(d.style);
      expect(loaded.backgroundTheme!.style).toBe(surface ? d.style : "none");
      expect(loaded.decorativeTheme.style).toBe(surface ? "none" : d.style);
      expect(render(loaded)).toBe(render(old));
      expect(migrateLayers(loaded)).toEqual(loaded); // idempotent
    });
  }
  it("variants keep exactly the one layer they showed", () => {
    const old = legacy({ style: "floral", assetId: "jcs-floral-corner", placement: "corners" });
    old.variants = [{ id: "v", name: "Marble look", overrides: { decorativeTheme: { style: "marble", assetId: "jcs-marble-white" }, colors: { primary: "#175B49" } } }];
    old.activeVariantId = "v";
    const loaded = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(loaded.variants[0].overrides.backgroundTheme?.style).toBe("marble");
    expect(loaded.variants[0].overrides.decorativeTheme?.style).toBe("none");
    expect(render(loaded)).toBe(render(old));
    loaded.activeVariantId = null;
    old.activeVariantId = null;
    expect(render(loaded)).toBe(render(old));
  });
  it("an empty background slot with a surface still in the element slot is normalized on load", () => {
    const p = build(MONTHLY);
    p.backgroundTheme = theme({});
    p.decorativeTheme = theme({ style: "marble", assetId: "jcs-marble-goldleaf", placement: "border-frame" });
    const before = render(p);
    const m = migrateLayers(p);
    expect(m.backgroundTheme!.style).toBe("marble");
    expect(m.decorativeTheme.style).toBe("none");
    expect(render(m)).toBe(before);
  });
  it("a project saved after the split is left as is (a variant may override one layer)", () => {
    const p = build(MONTHLY);
    p.backgroundTheme = theme({ style: "marble", assetId: "jcs-marble-rose", placement: "header-band" });
    p.variants = [{ id: "v", name: "Sprig", overrides: { decorativeTheme: { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" } } }];
    expect(migrateLayers(p)).toBe(p);
  });
});

describe("print / export presence", () => {
  it("the print raster pre-loader requests the background and the elements", () => {
    const p = build(MONTHLY);
    p.backgroundTheme = theme({ style: "marble", assetId: "jcs-marble-ember", placement: "footer-band" });
    p.decorativeTheme = theme({ style: "floral", assetId: "jcs-floral-bouquet", placement: "footer-flourish" });
    const doc = resolveDocument(p);
    const pages = doc.recipe.pages.map((_, i) => ({ g: geometryFor(doc, doc.recipe.pages[i]), comp: compositionFor(doc, i) })).slice(0, 3);
    const bg = rasterRequests(pages, doc.background, doc.colors), el = rasterRequests(pages, doc.decorative, doc.colors);
    expect(bg.some((r) => r.assetId === "jcs-marble-ember")).toBe(true);
    expect(el.some((r) => r.assetId === "jcs-floral-bouquet")).toBe(true);
    // Print always renders the full artwork, never a picker thumbnail.
    expect([...bg, ...el].every((r) => !r.thumb)).toBe(true);
  });
  it("print markup carries the imported background", () => {
    const p = build(JOURNAL);
    p.backgroundTheme = theme({ style: "pattern", assetId: "jcs-pattern-bias", placement: "footer-band", colorA: "patternGround", colorB: "patternInk" });
    expect(render(p)).toContain('data-asset="jcs-pattern-bias"');
  });
});
