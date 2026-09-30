/**
 * COVER-ONLY JOURNAL COLOR STUDIO SURFACES — marbles and the Abstract
 * watercolor from the approved design-library snapshot, on a cover, end cover
 * or divider only. The interior never inherits them.
 */
import { describe, expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { compositionFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { COVER_SURFACES, coverSurfaceColors, coverSurfaceTheme, ownPaletteId } from "../src/design-library/coverSurfaces";
import { findAsset } from "../src/design-library/library";
import { findPalette } from "../src/presets/themes/palettes";
import { planDecoration } from "../src/themes/decorationPlan";
import { rectContains } from "../src/engines/layout/math";
import type { CoverDividerSettings } from "../src/types/recipe";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";

function project(cover: CoverDividerSettings, size = "6x9", back: CoverDividerSettings = cover) {
  return createProject("journal", {
    name: "Cover surface QA",
    dimensions: { sizePresetId: size },
    recipe: {
      items: [],
      ordering: "sequential",
      structure: [
        step("cover-page", { type: "once" }, { title: "Prophetic Word Journal", cover: { subtitle: "FROM REVELATION TO EXECUTION", ...cover } }),
        step("lined-journal", { type: "once" }),
        step("divider-page", { type: "once" }, { title: "Discern", cover: { ...cover, subtitle: undefined } }),
        step("lined-journal", { type: "once" }),
        step("back-cover", { type: "once" }, { cover: { subtitle: "DOVE EXPRESSIONS", ...back } }),
      ],
    },
  });
}
const pageOf = (doc: ReturnType<typeof resolveDocument>, layoutId: string) => doc.recipe.pages.findIndex((p) => p.layoutId === layoutId);
const ids = (s: ReturnType<typeof solvePage>) => s.nodes.map((n) => n.id);

describe("cover surface catalog: pointers into the approved design-library snapshot", () => {
  it("offers the seven Journal Color Studio surfaces, each an existing asset with its own palette", () => {
    expect(COVER_SURFACES.map((c) => c.assetId)).toEqual(["jcs-marble-burgundy", "jcs-marble-rose", "jcs-marble-ember", "jcs-marble-peach", "jcs-marble-goldleaf", "jcs-marble-white", "jcs-watercolor-abstract"]);
    for (const c of COVER_SURFACES) {
      const a = findAsset(c.assetId);
      expect(a, c.assetId).toBeDefined();
      expect(["marble", "watercolor"]).toContain(a!.type);
      expect(coverSurfaceTheme(c.assetId).style).toBe(a!.type);
      const id = ownPaletteId(c.assetId);
      expect(id, c.palette).not.toBeNull();
      expect(findPalette(id!).id).toBe(id);
    }
  });
});

describe("cover surface on the page", () => {
  for (const c of COVER_SURFACES)
    for (const size of ["6x9", "7x9", "8.5x11"])
      it(`${size} · ${c.label}: the cover and end cover carry the surface; wording on top; interior untouched`, () => {
        const p = project({ preset: "surface", surfaceId: c.assetId }, size);
        const doc = resolveDocument(p);
        for (const layout of ["cover-page", "back-cover-page", "divider-page"]) {
          const s = solvePage(doc, pageOf(doc, layout));
          expect(s.surface, layout).toEqual({ assetId: c.assetId, ownColors: true });
          expect(s.ownArtwork).toBe(true);
          expect(ids(s)).not.toContain("cover-solid-bg");
          expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
          const g = geometryFor(doc, doc.recipe.pages[pageOf(doc, layout)]);
          for (const n of s.nodes.filter((n) => n.functional !== false)) expect(rectContains(g.safeRect, n.rect), `${layout} ${n.id}`).toBe(true);
        }
        const front = solvePage(doc, pageOf(doc, "cover-page"));
        expect(ids(front)).toEqual(expect.arrayContaining(["cover-title", "cover-subtitle"]));
        const title = front.nodes.find((n) => n.id === "cover-title")!;
        expect(title.type === "text" && title.text).toBe("Prophetic Word Journal");
        expect(title.type === "text" && title.color).toBe(c.wording);
        // Interior pages: no surface, no change to the product's background.
        expect(doc.background.style).toBe("none");
        expect(p.backgroundTheme?.style ?? "none").toBe("none");
        doc.recipe.pages.forEach((pg, i) => {
          if (["cover-page", "back-cover-page", "divider-page"].includes(pg.layoutId)) return;
          const s = solvePage(doc, i);
          expect(s.surface, pg.layoutId).toBeUndefined();
          expect(s.ownArtwork ?? false).toBe(false);
        });
      });

  it("the surface is drawn edge to edge (through the bleed) by the shared decoration renderer, in its own colors or the palette's", () => {
    const doc = resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-ember" }, "6x9"));
    const i = pageOf(doc, "cover-page");
    const g = geometryFor(doc, doc.recipe.pages[i]);
    const own = coverSurfaceColors("jcs-marble-ember", true, doc.colors);
    const plan = planDecoration(g, coverSurfaceTheme("jcs-marble-ember"), own, { ...compositionFor(doc, i), ownArtwork: false })!;
    expect(plan.pieces).toHaveLength(1);
    const piece = plan.pieces[0];
    expect(piece.kind).toBe("raster");
    expect(piece.kind === "raster" && piece.rect).toEqual({ x: 0, y: 0, w: g.mediaWidthIn, h: g.mediaHeightIn });
    // Own colors: the Black Ember palette's stone, not the product's.
    if (piece.kind === "raster") expect(piece.request.roles.base.toLowerCase()).toBe(own.decorBase.toLowerCase());
    expect(own.decorBase).not.toBe(doc.colors.decorBase);
    expect(coverSurfaceColors("jcs-marble-ember", false, doc.colors)).toBe(doc.colors);
    // The product's own background plan is unaffected by the cover: the cover page is its own artwork.
    expect(planDecoration(g, doc.background, doc.colors, compositionFor(doc, i))).toBeNull();
    const s = solvePage(resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-ember", surfaceColors: "palette" })), i);
    expect(s.surface).toEqual({ assetId: "jcs-marble-ember", ownColors: false });
  });

  it("wording: title + subtitle, title only, or no wording (the page keeps its name)", () => {
    const words = (cover: CoverDividerSettings) => {
      const doc = resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-rose", quote: "Write the vision — Habakkuk 2:2", ...cover }));
      return { front: solvePage(doc, pageOf(doc, "cover-page")), back: solvePage(doc, pageOf(doc, "back-cover-page")), doc };
    };
    const full = words({});
    expect(ids(full.front)).toEqual(expect.arrayContaining(["cover-title", "cover-subtitle", "cover-quote", "cover-line"]));
    const titleOnly = words({ titleOnly: true });
    expect(ids(titleOnly.front)).toContain("cover-title");
    expect(ids(titleOnly.front)).not.toContain("cover-subtitle");
    const none = words({ showText: false });
    for (const s of [none.front, none.back]) {
      expect(s.nodes.some((n) => n.type === "text")).toBe(false);
      expect(s.surface?.assetId).toBe("jcs-marble-rose");
    }
    expect(none.doc.recipe.pages[pageOf(none.doc, "cover-page")].module?.title).toBe("Prophetic Word Journal");
  });

  it("an optional soft panel sits behind the wording, inside the trim, and switches the default wording to ink", () => {
    const doc = resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-ember", textPanel: true }));
    const i = pageOf(doc, "cover-page");
    const s = solvePage(doc, i), g = geometryFor(doc, doc.recipe.pages[i]);
    const panel = s.nodes.find((n) => n.id === "cover-panel")!;
    expect(panel.type).toBe("box");
    expect(panel.functional).toBe(false);
    expect(rectContains({ x: 0, y: 0, w: g.trimWidthIn, h: g.trimHeightIn }, panel.rect)).toBe(true);
    const title = s.nodes.find((n) => n.id === "cover-title")!;
    expect(ids(s).indexOf("cover-panel")).toBeLessThan(ids(s).indexOf("cover-title"));
    expect(panel.rect.y).toBeLessThanOrEqual(title.rect.y);
    expect(title.type === "text" && title.color).toBe("text");
  });
});

describe("export checks", () => {
  // Reported on the solid cover: the edge-to-edge fill was checked as content ("too close to the cut edge").
  for (const cover of [{ preset: "solid" }, ...COVER_SURFACES.map((c) => ({ preset: "surface", surfaceId: c.assetId })), { preset: "surface", surfaceId: "jcs-marble-ember", textPanel: true }] as CoverDividerSettings[])
    it(`${cover.surfaceId ?? cover.preset}${cover.textPanel ? " + panel" : ""}: no page problems on the covers (only the short test book's page count)`, () => {
      for (const size of ["6x9", "8.5x11"]) {
        const p = project(cover, size);
        const issues = validateProject(p, heuristicMeasurer).issues.filter((i) => i.severity === "error" && i.rule !== "page-count");
        expect(issues.map((i) => `${i.rule} ${"componentId" in i ? i.componentId : ""} ${i.message}`), size).toEqual([]);
      }
    });
});

describe("wording choices on the other cover designs", () => {
  it("Neutral Cheetah Luxe: no wording prints the artwork only; title only drops the subtitle", () => {
    for (const autoFit of [true, false]) {
      const none = resolveDocument(project({ preset: "neutral-cheetah-luxe", showText: false, autoFit }));
      for (const layout of ["cover-page", "back-cover-page"]) {
        const s = solvePage(none, pageOf(none, layout));
        expect(s.nodes.some((n) => n.type === "text"), layout).toBe(false);
        expect(s.nodes.some((n) => n.type === "circle"), layout).toBe(true);
      }
      const title = resolveDocument(project({ preset: "neutral-cheetah-luxe", titleOnly: true, autoFit }));
      const s = solvePage(title, pageOf(title, "cover-page"));
      expect(ids(s)).toContain("cover-title");
      expect(ids(s)).not.toContain("cover-subtitle");
    }
  });

  it("Solid: title only drops the subtitle; no wording keeps the fill only", () => {
    const t = resolveDocument(project({ preset: "solid", titleOnly: true }));
    expect(ids(solvePage(t, pageOf(t, "cover-page")))).not.toContain("cover-subtitle");
    const n = resolveDocument(project({ preset: "solid", showText: false }));
    const s = solvePage(n, pageOf(n, "cover-page"));
    expect(ids(s)).toEqual(["cover-solid-bg"]);
  });

  it("an unknown surface id falls back to a solid cover (never a blank page)", () => {
    const doc = resolveDocument(project({ preset: "surface", surfaceId: "missing" }));
    const s = solvePage(doc, pageOf(doc, "cover-page"));
    expect(s.surface).toBeUndefined();
    expect(ids(s)).toContain("cover-solid-bg");
  });
});
