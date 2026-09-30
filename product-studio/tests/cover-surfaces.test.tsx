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

describe("panel behind the wording (Journal Color Studio title plate)", () => {
  const solveWith = (panel: CoverDividerSettings["panel"], size = "6x9") => {
    const doc = resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-ember", textPanel: true, titleOnly: false, panel }, size));
    const i = pageOf(doc, "cover-page");
    return { s: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
  };
  // Reported: "the square is too short at the top. it shouldn't touch the words."
  for (const size of ["6x9", "7x9", "8.5x11", "5.5x8.5"])
    for (const shape of ["rectangle", "rounded", "oval", "circle"] as const)
      it(`${size} · ${shape}: clear space on every side of every printed line, inside the trim`, () => {
        const { s, g } = solveWith({ shape }, size);
        const panel = s.nodes.find((n) => n.id === "cover-panel")!;
        expect(panel.type).toBe(shape === "oval" || shape === "circle" ? "circle" : "box");
        expect(rectContains({ x: 0, y: 0, w: g.trimWidthIn, h: g.trimHeightIn }, panel.rect)).toBe(true);
        const title = s.nodes.find((n) => n.id === "cover-title")!;
        if (title.type !== "text") throw new Error();
        const lineH = (title.fit!.sizePt * title.fit!.lineHeight) / 72;
        // At least ¼" (and half the title's size) above the title's first line and below the last printed item.
        const clear = Math.max(0.25, (title.fit!.sizePt / 72) * 0.45);
        if (shape === "rectangle" || shape === "rounded") {
          expect(title.rect.y - panel.rect.y, "top").toBeGreaterThanOrEqual(clear - 1e-6);
          const last = Math.max(...s.nodes.filter((n) => /^cover-(title|subtitle|quote|line)$/.test(n.id)).map((n) => n.type === "text" ? n.rect.y + Math.min(n.rect.h, ((n.fit?.sizePt ?? 10) * (n.fit?.lineHeight ?? 1.2) * (n.fit?.lines.length ?? 1)) / 72) : n.rect.y + n.rect.h));
          expect(panel.rect.y + panel.rect.h - last, "bottom").toBeGreaterThanOrEqual(clear - 1e-6);
        } else {
          // An ellipse contains the title's corners with room to spare.
          const cy = panel.rect.y + panel.rect.h / 2, ry = panel.rect.h / 2;
          const top = ((title.rect.y - cy) / ry) ** 2;
          expect(top).toBeLessThan(1);
        }
        expect(lineH).toBeGreaterThan(0);
      });

  it("fill, opacity, outline and the thin inner line are the user's", () => {
    const { s } = solveWith({ shape: "rectangle", fill: "primary", opacity: 0.5, outline: "decorativeAccent", outlinePt: 2, trim: true });
    const panel = s.nodes.find((n) => n.id === "cover-panel")!;
    if (panel.type !== "box") throw new Error();
    expect([panel.fill, panel.fillOpacity, panel.stroke, panel.strokePt]).toEqual(["primary", 0.5, "decorativeAccent", 2]);
    const trim = s.nodes.find((n) => n.id === "cover-panel-trim")!;
    expect(trim.type === "box" && trim.stroke).toBe("lineArt");
    expect(rectContains(panel.rect, trim.rect)).toBe(true);
    // Words on a dark panel print in the paper color.
    const title = s.nodes.find((n) => n.id === "cover-title")!;
    expect(title.type === "text" && title.color).toBe("background");
    const oval = solveWith({ shape: "oval", opacity: 0.4, outline: "lineArt" }).s.nodes.find((n) => n.id === "cover-panel")!;
    expect(oval.type === "circle" && [oval.fillOpacity, oval.outline, oval.stroke]).toEqual([0.4, true, "lineArt"]);
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

describe("panel width: hugs the words, or runs off both sides — never almost the page", () => {
  const solveWith = (panel: CoverDividerSettings["panel"], subtitle = "FROM REVELATION TO EXECUTION") => {
    const doc = resolveDocument(project({ preset: "surface", surfaceId: "jcs-marble-ember", textPanel: true, subtitle, panel }, "6x9"));
    const i = pageOf(doc, "cover-page");
    return { s: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
  };
  it("across the page: through the bleed on both sides", () => {
    const { s, g } = solveWith({ shape: "rectangle", width: "band" });
    const p = s.nodes.find((n) => n.id === "cover-panel")!;
    expect(p.rect.x).toBeCloseTo(-g.trimOffset.x, 6);
    expect(p.rect.w).toBeCloseTo(g.mediaWidthIn, 6);
  });
  it("automatic: never almost the width of the page — a band through the bleed, or at most 78 % of the trim", () => {
    for (const subtitle of ["FROM REVELATION TO EXECUTION", "", "WORD"]) {
      const { s, g } = solveWith({ shape: "rounded" }, subtitle);
      const p = s.nodes.find((n) => n.id === "cover-panel")!;
      const band = Math.abs(p.rect.w - g.mediaWidthIn) < 1e-6 && Math.abs(p.rect.x + g.trimOffset.x) < 1e-6;
      expect(band || p.rect.w <= 0.78 * g.trimWidthIn + 1e-6, `${subtitle}: ${p.rect.w}`).toBe(true);
    }
    const fit = solveWith({ shape: "rounded", width: "fit" });
    expect(fit.s.nodes.find((n) => n.id === "cover-panel")!.rect.w).toBeLessThan(fit.g.trimWidthIn);
  });
});
