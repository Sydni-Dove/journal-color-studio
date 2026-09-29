import { describe, it, expect } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { neutralLuxeDividers } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor, compositionFor } from "../src/engines/document/resolve";
import { planDecoration } from "../src/themes/decorationPlan";
import { SIZE_PRESETS } from "../src/presets/sizes/sizePresets";
import { rectContains } from "../src/engines/layout/math";
import { LUXE_CHEETAH, LUXE_CIRCLES, LUXE_RINGS, tabEdge, tabGeometry } from "../src/layouts/book/coverDivider";
import { LUXE_SUBTITLE_STYLE, LUXE_TITLE_FONT, luxeTitleStyle, NEUTRAL_LUXE_ID } from "../src/presets/coverLuxe";
import { findPalette } from "../src/presets/themes/palettes";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { step } from "../src/presets/bookRecipes";
import type { BookNode } from "../src/types/recipe";
export function luxeProject(size = "8.5x11") {
  return createProject("planner", { name: "Neutral Luxe QA", dimensions: { sizePresetId: size }, colors: { paletteId: "neutral-cheetah-luxe" }, typography: { fonts: { cover: "Great Vibes", headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: "Great Vibes" }, roleOverrides: { coverTitle: { sizePt: 88, transform: "none", weight: 400, trackingEm: 0 }, coverSubtitle: { sizePt: 10, trackingEm: 0.22 } } }, recipe: { items: [], ordering: "sequential", structure: neutralLuxeDividers() } });
}
describe("Reusable covers and printed tabs", () => {
  for (const size of SIZE_PRESETS) it(`${size.id}: audit composition and safe physical tab geometry`, () => {
    const p = luxeProject(size.id), doc = resolveDocument(p);
    // The cover and nine dividers; in a two-sided book each starts on a right-hand page (a notes page on each back).
    const own = doc.recipe.pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => !pg.filler);
    expect(own).toHaveLength(10);
    own.forEach(({ pg, i }, k) => {
      const solved = solvePage(doc, i), g = geometryFor(doc, pg);
      if (pg.side !== "single") expect(pg.side).toBe("recto");
      for (const node of solved.nodes.filter((n) => n.functional)) expect(rectContains(g.safeRect, node.rect)).toBe(true);
      if (k) {
        const t = pg.module!.cover!.tab!;
        expect(t.order).toBe(k); expect(t.count).toBe(9);
        const rect = tabGeometry(g, t);
        if (rect) expect(rectContains(g.safeRect, rect)).toBe(true);
        else expect(solved.diagnostics.some((d) => d.rule === "tab-fit")).toBe(true);
      }
    });
  });
  it("tabs print on the outer edge: right on a right-hand page, left on a left-hand page — never at the binding", () => {
    // A two-sided coil book; one divider deliberately set to start on a left-hand page.
    const structure: BookNode[] = [
      step("divider-page", { type: "once" }, { title: "Prayer", cover: { tab: { show: true } } }),
      step("divider-page", { type: "once" }, { title: "Vision", start: "verso", cover: { tab: { show: true } } }),
    ];
    const p = { ...luxeProject("8.5x11"), production: { ...luxeProject("8.5x11").production, bindingType: "coil" as const, printProfileId: "coil-generic", duplex: true } };
    p.recipe = { items: [], ordering: "sequential", structure };
    const doc = resolveDocument(p);
    const pages = doc.recipe.pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => !pg.filler);
    expect(pages.map(({ pg }) => pg.side)).toEqual(["recto", "verso"]);
    for (const { pg, i } of pages) {
      const g = geometryFor(doc, pg), s = solvePage(doc, i);
      const tab = s.nodes.find((n) => n.id === "tab")!;
      const outer = pg.side === "recto" ? "right" : "left";
      expect(g.boundEdge).not.toBe(outer);
      expect(tabEdge(g)).toBe(outer);
      expect(tab.rect.x + tab.rect.w / 2 > g.trimWidthIn / 2 ? "right" : "left").toBe(outer);
      expect(rectContains(g.safeRect, tab.rect)).toBe(true);
      // The title keeps clear of the tab on either side.
      const title = s.nodes.find((n) => n.id === "cover-title")!;
      expect(title.rect.x + title.rect.w <= tab.rect.x || tab.rect.x + tab.rect.w <= title.rect.x).toBe(true);
    }
    expect(validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
  });
  it("Neutral Cheetah Luxe: the reference cover's composition, colors and type on every size", () => {
    const luxeType = (size: string) => {
      const p = luxeProject(size);
      p.typography = { ...p.typography, fonts: { ...p.typography.fonts, cover: LUXE_TITLE_FONT }, roleOverrides: { ...p.typography.roleOverrides, coverTitle: luxeTitleStyle(LUXE_TITLE_FONT), coverSubtitle: LUXE_SUBTITLE_STYLE } };
      return p;
    };
    // Palette: sampled from the reference.
    const c = findPalette(NEUTRAL_LUXE_ID).colors;
    expect([c.primary, c.decorHighlight, c.accent, c.secondary, c.decorativeAccent, c.lineArt, c.background]).toEqual(["#5b0610", "#f2d8cd", "#c5674a", "#e9d3c0", "#718496", "#c8974d", "#ffffff"]);
    for (const size of ["8.5x11", "6x9", "5.5x8.5", "a5"]) {
      const doc = resolveDocument(luxeType(size)), g = geometryFor(doc, doc.recipe.pages[0]), s = solvePage(doc, 0);
      const W = g.trimWidthIn, H = g.trimHeightIn, R = Math.min(W, (H * 8.5) / 11);
      const circle = (id: string) => s.nodes.find((n) => n.id === id)!;
      // Every shape at its reference position (fractions of the trim), in draw order: fills, cheetah, rings.
      for (const ref of [...LUXE_CIRCLES, ...LUXE_CHEETAH, ...LUXE_RINGS]) {
        const n = circle(ref.id);
        expect(n.rect.x + n.rect.w / 2, `${size} ${ref.id}`).toBeCloseTo(ref.x * W, 6);
        expect(n.rect.y + n.rect.h / 2).toBeCloseTo(ref.y * H, 6);
        expect(n.rect.w / 2).toBeCloseTo(ref.r * R, 6);
      }
      const order = s.nodes.filter((n) => n.type === "circle").map((n) => n.id);
      expect(order).toEqual([...LUXE_CIRCLES, ...LUXE_CHEETAH, ...LUXE_RINGS].map((r) => r.id));
      expect(LUXE_RINGS.every((r) => { const n = circle(r.id); return n.type === "circle" && n.outline && n.stroke === "lineArt" && n.fill === null; })).toBe(true);
      expect(LUXE_CHEETAH.every((r) => { const n = circle(r.id); return n.type === "circle" && n.leopard; })).toBe(true);
      // Title: one line of script; subtitle stacked on two lines below the title's box; gold rule under it.
      const title = s.nodes.find((n) => n.id === "cover-title")!, sub = s.nodes.find((n) => n.id === "cover-subtitle")!, line = s.nodes.find((n) => n.id === "cover-line")!;
      expect(title.type === "text" && title.fit?.lines).toEqual(["Plan"]);
      expect(sub.type === "text" && sub.fit?.lines).toEqual(["WITH", "PURPOSE"]);
      expect(sub.rect.y).toBeGreaterThanOrEqual(title.rect.y + title.rect.h - 1e-9);
      expect(line.type === "rule" && line.color).toBe("lineArt");
      expect(line.rect.y).toBeGreaterThan(sub.rect.y + sub.rect.h);
      for (const n of [title, sub, line]) expect(rectContains(g.safeRect, n.rect), `${size} ${n.id}`).toBe(true);
      expect(validateProject(luxeType(size), heuristicMeasurer, { pageIndices: [0] }).issues.filter((x) => x.severity === "error")).toEqual([]);
    }
  });
  it("a title letter with a tail (g j p q y) above the subtitle pushes the subtitle below it", () => {
    const at = (title: string) => {
      const p = luxeProject("8.5x11");
      p.recipe = { items: [], ordering: "sequential", structure: [step("cover-page", { type: "once" }, { title, cover: { subtitle: "DRAW NEAR" } })] };
      p.typography = { ...p.typography, roleOverrides: { ...p.typography.roleOverrides, coverTitle: luxeTitleStyle(LUXE_TITLE_FONT) } };
      // Measured from the title's own baseline (the subtitle follows the title).
      const nodes = solvePage(resolveDocument(p), 0).nodes, t = nodes.find((n) => n.id === "cover-title")!.rect;
      return nodes.find((n) => n.id === "cover-subtitle")!.rect.y - (t.y + t.h);
    };
    expect(at("Prayer")).toBeGreaterThan(at("Plan") + 0.1);
  });
  it("covers and dividers start on a right-hand page by default; a step can still choose its side", () => {
    const p = { ...luxeProject("8.5x11"), production: { ...luxeProject("8.5x11").production, bindingType: "coil" as const, printProfileId: "coil-generic", duplex: true } };
    p.recipe = { items: [], ordering: "sequential", structure: [step("lined-journal", { type: "once" }), step("divider-page", { type: "once" }, { title: "Prayer" })] };
    const doc = resolveDocument(p);
    expect(doc.recipe.pages.map((pg) => [pg.side, pg.filler ? "filler" : pg.module?.type])).toEqual([["recto", "lined-journal"], ["verso", "filler"], ["recto", "divider-page"]]);
    p.recipe.structure = [step("lined-journal", { type: "once" }), step("divider-page", { type: "once" }, { title: "Prayer", start: "any" })];
    expect(resolveDocument(p).recipe.pages.map((pg) => pg.module?.type)).toEqual(["lined-journal", "divider-page"]);
  });
  for (const size of ["8.5x11", "7x9", "6x9", "5.5x8.5", "a5"]) it(`${size}: passes full printable validation`, () => {
    expect(validateProject(luxeProject(size), heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
  });
  it("rejects impossible counts rather than squeezing tabs", () => {
    const doc = resolveDocument(luxeProject("filofax-pocket")), g = geometryFor(doc, { side: "recto" });
    expect(tabGeometry(g, { show: true, count: 24, order: 1 })).toBeNull();
    expect(tabGeometry(g, { show: true, count: 4, order: 5 })).toBeNull();
  });
});

describe("Neutral Cheetah Luxe cover composition (the design's type and artwork, whatever the project's theme)", () => {
  // The case from review: a book whose covers use the Luxe design, but whose palette, fonts and marble
  // header band were never switched ("Use matching palette & script title" not pressed).
  const themed = (size: string) =>
    createProject("planner", {
      name: "Themed book", dimensions: { sizePresetId: size, orientation: "portrait" },
      backgroundTheme: { style: "marble", assetId: "jcs-marble-rose", placement: "header-band", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" },
      recipe: { items: [], ordering: "sequential", structure: [...neutralLuxeDividers(), step("lined-journal", { type: "once" })] },
    });
  const SIZES = ["8.5x11", "8x10", "7x9", "7x9.25", "6x9", "5.5x8.5", "a5"];

  it("the design's script title applies by itself; the project's other fonts are untouched", () => {
    const doc = resolveDocument(themed("8.5x11"));
    expect(doc.project.typography.fonts.cover).not.toBe(LUXE_TITLE_FONT);
    expect(doc.typography.roles.coverTitle).toMatchObject({ family: LUXE_TITLE_FONT, transform: "none", lineHeight: 0.7 });
    expect(doc.typography.roles.coverSubtitle).toMatchObject({ transform: "uppercase", trackingEm: LUXE_SUBTITLE_STYLE.trackingEm });
    expect(doc.typography.roles.pageTitle.family).toBeUndefined();
    expect(doc.typography.fonts).toEqual(doc.project.typography.fonts);
    // A script cover font the project chose is kept.
    const own = themed("8.5x11");
    own.typography = { ...own.typography, fonts: { ...own.typography.fonts, cover: "Great Vibes" } };
    expect(resolveDocument(own).typography.roles.coverTitle.family).toBeUndefined();
    // A book whose covers are all "plain" keeps the project's own cover type.
    const plain = themed("8.5x11");
    plain.recipe = { items: [], ordering: "sequential", structure: [step("cover-page", { type: "once" }, { title: "Plan", cover: { preset: "plain" } })] };
    expect(resolveDocument(plain).typography.roles.coverTitle.family).toBeUndefined();
  });

  for (const size of SIZES) {
    it(`${size}: cover = one composition (no band cut across it), large script title under the burgundy circle; divider smaller and centred`, () => {
      const doc = resolveDocument(themed(size));
      const cover = doc.recipe.pages.findIndex((p) => p.layoutId === "cover-page");
      const divider = doc.recipe.pages.findIndex((p) => p.layoutId === "divider-page");
      const journal = doc.recipe.pages.findIndex((p) => p.layoutId === "journal-lined");
      const g = geometryFor(doc, doc.recipe.pages[cover]), W = g.trimWidthIn, H = g.trimHeightIn;
      // The project's marble band is drawn on the journal page, never on the designed cover or divider.
      expect(compositionFor(doc, journal).ownArtwork).toBeFalsy();
      expect(planDecoration(geometryFor(doc, doc.recipe.pages[journal]), doc.background, doc.colors, compositionFor(doc, journal))).not.toBeNull();
      for (const i of [cover, divider]) {
        expect(compositionFor(doc, i).ownArtwork).toBe(true);
        expect(planDecoration(geometryFor(doc, doc.recipe.pages[i]), doc.background, doc.colors, compositionFor(doc, i))).toBeNull();
      }
      const c = solvePage(doc, cover), d = solvePage(doc, divider);
      const ct = c.nodes.find((n) => n.id === "cover-title")!, dt = d.nodes.find((n) => n.id === "cover-title")!;
      const burgundy = c.nodes.find((n) => n.id === "luxe-burgundy")!;
      if (ct.type !== "text" || dt.type !== "text") throw new Error("titles");
      // Cover: the focal point — most of the page's width, its lettering in the upper-middle, just under the burgundy circle.
      expect(ct.fit!.sizePt).toBeGreaterThan(dt.fit!.sizePt);
      expect(ct.rect.y).toBeLessThan(0.62 * H);
      expect(ct.rect.y + ct.rect.h).toBeLessThanOrEqual(0.7 * H);
      // (The box starts below the script's tall loops: the design's tight leading keeps the box to the lettering's body.)
      expect(ct.rect.y).toBeLessThan(burgundy.rect.y + burgundy.rect.h + 0.15 * H);
      // Divider: its own zone — centred, narrower, a little above the middle; the subtitle on one line beneath.
      // (centred on its column, which leaves room for the printed tab at the outer edge)
      expect(Math.abs(dt.rect.x + dt.rect.w / 2 - W / 2)).toBeLessThan(0.6);
      expect(dt.rect.w).toBeLessThan(ct.rect.w);
      const ds = d.nodes.find((n) => n.id === "cover-subtitle")!;
      expect(ds.type === "text" && ds.fit!.lines).toHaveLength(1);
      expect(ds.rect.y).toBeGreaterThanOrEqual(dt.rect.y + dt.rect.h - 1e-9);
      for (const n of [ct, dt]) expect(rectContains(g.safeRect, n.rect), `${size} ${n.id}`).toBe(true);
      expect(validateProject(themed(size), heuristicMeasurer, { pageIndices: [cover, divider] }).issues.filter((x) => x.severity === "error")).toEqual([]);
    });
  }

  it("every divider title fits its zone without being positioned by hand (Prayer … Notes)", () => {
    const doc = resolveDocument(themed("5.5x8.5"));
    doc.recipe.pages.forEach((p, i) => {
      if (p.layoutId !== "divider-page") return;
      const t = solvePage(doc, i).nodes.find((n) => n.id === "cover-title")!;
      expect(t.type === "text" && !t.fit!.failed, p.module?.title).toBe(true);
    });
  });
});

describe("End cover (the back of the book)", () => {
  const book = (extra: Partial<BookNode & { kind: "step" }> = {}) => {
    const p = { ...luxeProject("7x9"), production: { ...luxeProject("7x9").production, bindingType: "coil" as const, printProfileId: "coil-generic", duplex: true } };
    p.recipe = { items: [], ordering: "sequential", structure: [step("cover-page", { type: "once" }), step("lined-journal", { type: "once" }), step("back-cover", { type: "once" }, extra)] };
    return resolveDocument(p);
  };
  it("closes the book on a left-hand page, the cover's own artwork turned half a turn", () => {
    const doc = book(), last = doc.recipe.pages.length - 1, pg = doc.recipe.pages[last];
    expect(pg.layoutId).toBe("back-cover-page");
    expect(pg.side).toBe("verso");
    const solved = solvePage(doc, last), g = geometryFor(doc, pg);
    expect(solved.ownArtwork).toBe(true);
    expect(planDecoration(g, doc.decorative, doc.colors, compositionFor(doc, last))).toBeNull();
    const c = LUXE_CIRCLES[0], n = solved.nodes.find((x) => x.id === `${c.id}-back`)!;
    expect(n.rect.x + n.rect.w / 2).toBeCloseTo((1 - c.x) * g.trimWidthIn, 6);
    expect(n.rect.y + n.rect.h / 2).toBeCloseTo((1 - c.y) * g.trimHeightIn, 6);
    // No text unless asked for.
    expect(solved.nodes.some((x) => x.type === "text")).toBe(false);
  });
  it("an optional line of text sits centred inside the safe area", () => {
    const doc = book({ cover: { subtitle: "DOVE EXPRESSIONS" } }), last = doc.recipe.pages.length - 1;
    const solved = solvePage(doc, last), g = geometryFor(doc, doc.recipe.pages[last]);
    const t = solved.nodes.find((x) => x.id === "back-line")!;
    expect(t.type === "text" && !t.fit!.failed).toBe(true);
    expect(rectContains(g.safeRect, t.rect)).toBe(true);
    expect(t.rect.x + t.rect.w / 2).toBeCloseTo(g.trimWidthIn / 2, 6);
  });
  it("every full planner template opens with a cover and closes with an end cover", async () => {
    const { BOOK_TEMPLATES } = await import("../src/presets/layouts/recipePresets");
    for (const t of BOOK_TEMPLATES) {
      const st = t.build({ count: 1, sheets: 1 }).structure!;
      expect([st[0], st[st.length - 1]].map((n) => n.kind === "step" && n.module), t.id).toEqual(["cover-page", "back-cover"]);
    }
  });
});
