/**
 * Stationery recipes (Devotional + Worksheet): catalog → geometry → page model.
 *   lookup / family filter · trim compatibility · zone order · Verse Mapping spread ·
 *   table column geometry · semantic space controls · geometry/theme separation ·
 *   planner / journal regression
 */
import { describe, expect, it } from "vitest";
import { layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { effectiveZones, resolveColumns, shareWithMinimums } from "../src/engines/stationery/geometry";
import { getLayout, LAYOUTS } from "../src/layouts/registry";
import { recipePresetsFor } from "../src/presets/layouts/recipePresets";
import { PRODUCT_FAMILIES } from "../src/presets/products/productFamilies";
import { createProject } from "../src/presets/products/projectFactory";
import { getStationeryRecipe, recipeSupportsTrim, STATIONERY_RECIPES, stationeryLayoutId, stationeryRecipesFor } from "../src/presets/stationery/catalog";
import type { LayoutNode, SolvedPage } from "../src/types/layout";
import type { ProductType } from "../src/types/product";
import type { StationeryCustomization } from "../src/types/stationery";

type Group = Extract<LayoutNode, { type: "group" }>;

function project(comboId: string, size: string, custom?: StationeryCustomization, extra: Parameters<typeof createProject>[1] = {}) {
  const r = getStationeryRecipe(comboId)!;
  return createProject(r.family as ProductType, {
    name: comboId,
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [{ id: "page", layoutId: stationeryLayoutId(comboId), repeat: { kind: "count", count: 1 } }], ordering: "sequential" },
    layoutOptions: custom ? { stationery: { [comboId]: custom } } : {},
    ...extra,
  });
}
/** The solved pages of the recipe (skipping any filler page the book inserts before a spread). */
function pages(p: ReturnType<typeof project>): SolvedPage[] {
  const doc = resolveDocument(p);
  return doc.recipe.pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => pg.layoutId.startsWith("stationery:")).map(({ i }) => solvePage(doc, i));
}
const writingHeights = (s: SolvedPage) =>
  Object.fromEntries((s.metrics ?? []).filter((m) => m.label.endsWith("writing height")).map((m) => [m.label.replace(/^"(.*)" writing height$/, "$1"), m.value as number]));
const sectionOrder = (s: SolvedPage) => s.nodes.filter((n): n is Group => n.type === "group" && n.component === "Section" && /^st\d-[A-Za-z0-9]+$/.test(n.id)).map((n) => n.id.split("-")[1]);
const fitOf = (p: ReturnType<typeof project>, comboId: string) => layoutAvailability(resolveDocument(p)).find((a) => a.layoutId === stationeryLayoutId(comboId))!.fit;

describe("catalog", () => {
  it("looks recipes up by stable combo id", () => {
    const soap = getStationeryRecipe("devotional-soap.four-band")!;
    expect(soap.family).toBe("devotional");
    expect(soap.stationeryType).toBe("soap");
    expect(soap.variant).toBe("four-band");
    expect(getStationeryRecipe("devotional-soap.nope")).toBeUndefined();
    for (const r of STATIONERY_RECIPES) {
      expect(r.comboId).toBe(`${r.family}-${r.stationeryType}.${r.variant}`);
      expect(getLayout(stationeryLayoutId(r.comboId)).label).toBe(r.label);
    }
    expect(new Set(STATIONERY_RECIPES.map((r) => r.comboId)).size).toBe(STATIONERY_RECIPES.length);
  });
  it("filters by family: the MVP devotional and worksheet recipes", () => {
    expect(stationeryRecipesFor("devotional").map((r) => r.comboId)).toEqual(["devotional-daily-reflection.stacked", "devotional-soap.four-band", "devotional-verse-mapping.spread"]);
    expect(stationeryRecipesFor("worksheet").map((r) => r.comboId)).toEqual(["worksheet-prompt.prompt-response", "worksheet-reading-tracker.table", "worksheet-prayer-log.table"]);
    expect(recipePresetsFor("devotional").map((r) => r.id)).toEqual(stationeryRecipesFor("devotional").map((r) => stationeryLayoutId(r.comboId)));
    expect(recipePresetsFor("worksheet").map((r) => r.id)).toEqual(stationeryRecipesFor("worksheet").map((r) => stationeryLayoutId(r.comboId)));
  });
  it("recipes carry structure only: no colors, fonts or physical page measurements", () => {
    const json = JSON.stringify(STATIONERY_RECIPES);
    expect(json).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(json).not.toMatch(/"(font|color|margin|bleed|x|y|w|h|heightIn|widthIn)"/);
  });
});

describe("trim compatibility", () => {
  it("every recipe fits every trim it declares, with no layout errors", () => {
    for (const r of STATIONERY_RECIPES)
      for (const size of r.supportedTrims) {
        const p = project(r.comboId, size);
        expect(fitOf(p, r.comboId).ok, `${r.comboId} @ ${size}`).toBe(true);
        for (const s of pages(p)) expect(s.diagnostics.filter((d) => d.severity === "error"), `${r.comboId} @ ${size}`).toEqual([]);
      }
  });
  it("an undeclared trim is refused with the trims it is engineered for", () => {
    const f = fitOf(project("devotional-soap.four-band", "a6"), "devotional-soap.four-band");
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toMatch(/SOAP is engineered for .*6 × 9/);
    expect(recipeSupportsTrim(getStationeryRecipe("devotional-soap.four-band")!, "6x9")).toBe(true);
    expect(recipeSupportsTrim(getStationeryRecipe("devotional-daily-reflection.stacked")!, "a5")).toBe(false);
  });
  it("Devotional → SOAP → 6×9 needs no measurements: four equal writing bands inside the safe area", () => {
    const p = project("devotional-soap.four-band", "6x9");
    const doc = resolveDocument(p);
    const s = pages(p)[0];
    const h = writingHeights(s);
    expect(Object.keys(h)).toEqual(["Scripture", "Observation", "Application", "Prayer"]);
    const v = Object.values(h);
    for (const x of v) expect(x).toBeCloseTo(v[0], 6);
    const g = resolveDocument(p) && doc.recipe.pages[0];
    expect(g.layoutId).toBe("stationery:devotional-soap.four-band");
    // Everything functional sits in the safe area the geometry library solved.
    const safe = s.nodes.find((n) => n.id === "p0-header")!.rect;
    for (const n of s.nodes.filter((x) => x.functional)) expect(n.rect.x).toBeGreaterThanOrEqual(safe.x - 1e-6);
  });
  it("the body scales with the trim: Letter gives every section more room than 6×9", () => {
    const small = writingHeights(pages(project("devotional-soap.four-band", "6x9"))[0]);
    const big = writingHeights(pages(project("devotional-soap.four-band", "8.5x11"))[0]);
    for (const k of Object.keys(small)) expect(big[k]).toBeGreaterThan(small[k]);
  });
});

describe("zones", () => {
  it("keep the recipe order", () => {
    expect(sectionOrder(pages(project("devotional-soap.four-band", "6x9"))[0])).toEqual(["date", "scripture", "observation", "application", "prayer"]);
    expect(sectionOrder(pages(project("devotional-daily-reflection.stacked", "6x9"))[0])).toEqual(["date", "scripture", "reflection", "application", "standOutVerse", "thankfulFor", "prayer"]);
  });
  it("Daily Reflection: writing space dominates prompts (research 1 : 5)", () => {
    for (const size of getStationeryRecipe("devotional-daily-reflection.stacked")!.supportedTrims) {
      const s = pages(project("devotional-daily-reflection.stacked", size))[0];
      const writing = Object.values(writingHeights(s)).reduce((a, b) => a + b, 0);
      const headings = s.nodes.filter((n) => n.type === "text" && /^st0-[A-Za-z]+-title$/.test(n.id) && n.id !== "st0-header-title").reduce((a, n) => a + n.rect.h, 0);
      expect(writing / headings, size).toBeGreaterThanOrEqual(5);
    }
  });
  it("customization: reorder, rename, hide an optional section — the recipe itself never changes", () => {
    const custom: StationeryCustomization = { order: [["prayer", "scripture"]], rename: { observation: "What I See" }, hidden: ["date", "scripture"] };
    const s = pages(project("devotional-soap.four-band", "6x9", custom))[0];
    // date is optional (removed); scripture is required (stays); prayer moved first.
    expect(sectionOrder(s)).toEqual(["prayer", "scripture", "observation", "application"]);
    expect(s.nodes.some((n) => n.type === "text" && n.text === "What I See")).toBe(true);
    expect(getStationeryRecipe("devotional-soap.four-band")!.pages[0].zones.map((z) => z.label)).toEqual(["Date", "Scripture", "Observation", "Application", "Prayer"]);
  });
  it("semantic space: More gives a section more writing space, Equal sections evens them out", () => {
    const base = writingHeights(pages(project("devotional-daily-reflection.stacked", "8.5x11"))[0]);
    const more = writingHeights(pages(project("devotional-daily-reflection.stacked", "8.5x11", { space: { prayer: "more" } }))[0]);
    expect(more.Prayer).toBeGreaterThan(base.Prayer);
    const eq = Object.values(writingHeights(pages(project("devotional-daily-reflection.stacked", "8.5x11", { balance: "equal" }))[0]));
    // Line-snapped page: equal to within one writing line.
    for (const v of eq) expect(Math.abs(v - eq[0])).toBeLessThanOrEqual(0.35);
    // Raw geometry: weights follow the recipe; minimums are honoured.
    expect(effectiveZones(getStationeryRecipe("devotional-soap.four-band")!.pages[0], 0, { space: { prayer: "less" } }).find((z) => z.key === "prayer")!.weight).toBeLessThan(1);
    expect(shareWithMinimums(10, [1, 1, 8], [2, 2, 0])).toEqual([2, 2, 6]);
    expect(shareWithMinimums(3, [1, 1], [2, 2])).toBeNull();
  });
  it("lined surfaces never become a dot grid, even in a dot-grid project", () => {
    const p = project("worksheet-prompt.prompt-response", "8.5x11", undefined, { functionalPattern: { kind: "dot-grid" } as never });
    const s = pages(p)[0];
    expect(s.nodes.some((n) => n.type === "dots")).toBe(false);
    expect(s.nodes.some((n) => n.type === "lines" && n.component === "WritingLines")).toBe(true);
  });
});

describe("Verse Mapping is a two-page spread", () => {
  it("one recipe, two pages: Verse / Translations / Keywords, then Cross References / Reflection / Prayer", () => {
    const r = getStationeryRecipe("devotional-verse-mapping.spread")!;
    expect(r.pages).toHaveLength(2);
    expect(getLayout(stationeryLayoutId(r.comboId)).pages).toBe(2);
    const p = project(r.comboId, "6x9");
    const doc = resolveDocument(p);
    const spread = doc.recipe.pages.filter((pg) => pg.layoutId === stationeryLayoutId(r.comboId));
    expect(spread.map((pg) => pg.side)).toEqual(["verso", "recto"]);
    const [left, right] = pages(p);
    expect(sectionOrder(left)).toEqual(["verse", "translations", "keywords"]);
    expect(sectionOrder(right)).toEqual(["crossReferences", "reflection", "prayer"]);
  });
});

describe("table column geometry", () => {
  const edges = (s: SolvedPage) => (s.nodes.find((n): n is Group => n.type === "group" && n.id === "st0-log-surface")!.columnEdges ?? []);
  const widths = (e: number[]) => e.slice(1).map((x, i) => x - e[i]);
  it("Reading Tracker keeps the research proportions (2.20 : 2.60 : 1.00 : 1.00) across the usable width", () => {
    const s = pages(project("worksheet-reading-tracker.table", "8.5x11"))[0];
    const w = widths(edges(s));
    const ref = [2.2, 2.6, 1, 1];
    const k = w[0] / ref[0];
    w.forEach((x, i) => expect(x).toBeCloseTo(ref[i] * k, 6));
    // Scaled to the page, not hard-coded: the table spans the page body.
    const body = s.regions!.mainContent!;
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(body.w, 6);
  });
  it("Prayer Log (1.10 : 4.30 : 0.75): on 6 × 9 a column narrower than its heading is widened, the rest keep their ratio", () => {
    const letter = widths(edges(pages(project("worksheet-prayer-log.table", "8.5x11"))[0]));
    expect(letter[0] / letter[1]).toBeCloseTo(1.1 / 4.3, 6);
    expect(letter[2] / letter[1]).toBeCloseTo(0.75 / 4.3, 6);
    const small = widths(edges(pages(project("worksheet-prayer-log.table", "6x9"))[0]));
    expect(small[2] / small[1]).toBeGreaterThan(0.75 / 4.3);
    expect(small[0] / small[1]).toBeCloseTo(1.1 / 4.3, 6);
  });
  it("resolveColumns is pure geometry", () => {
    const cols = [{ key: "a", label: "A", referenceWidthIn: 1 }, { key: "b", label: "B", referenceWidthIn: 3 }];
    const r = resolveColumns(cols, 1, 8, () => 0);
    expect(r.columns.map((c) => [c.x, c.w])).toEqual([[1, 2], [3, 6]]);
    expect(resolveColumns(cols, 0, 1, () => 1).problems).toHaveLength(1);
  });
});

describe("geometry / theme separation", () => {
  const geometry = (s: SolvedPage) => JSON.stringify(s.nodes.map((n) => [n.id, n.type, n.rect]));
  it("changing palette, decoration and background never changes the page structure", () => {
    for (const r of STATIONERY_RECIPES) {
      const size = r.supportedTrims[0];
      const a = pages(project(r.comboId, size));
      const b = pages(
        project(r.comboId, size, undefined, {
          colors: { paletteId: "jcs-abstract-watercolor", overrides: {} },
          decorativeTheme: { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" },
          backgroundTheme: { style: "watercolor", placement: "full-page", opacity: 0.2 },
        }),
      );
      expect(b.map(geometry), r.comboId).toEqual(a.map(geometry));
    }
  });
});

describe("families + regression", () => {
  it("Devotional and Worksheet are ready families on the studio home; Daily Planner stays", () => {
    const ready = PRODUCT_FAMILIES.filter((f) => f.status === "ready").map((f) => f.id);
    expect(ready).toEqual(expect.arrayContaining(["daily-planner", "devotional", "worksheet", "planner", "journal"]));
    expect(PRODUCT_FAMILIES.find((f) => f.id === "devotional")!.start).toEqual({ type: "devotional", section: "build" });
  });
  it("planner / journal / notepad layouts and presets are unchanged", () => {
    const ids = LAYOUTS.map((l) => l.id);
    expect(ids.slice(0, 12)).toEqual(["notepad-todo", "notepad-grocery", "journal-lined", "notes-page", "planner-monthly", "planner-weekly-spread", "deskpad-weekly", "guided-page", "weekly-plan-mwg-spread", "planner-daily", "daily-luxury-execution", "notepad-daily"]);
    expect(recipePresetsFor("journal").map((r) => r.id)).not.toContain(expect.stringMatching(/^stationery:/));
    expect(recipePresetsFor("planner").map((r) => r.id)).not.toContain(expect.stringMatching(/^stationery:/));
    expect(recipePresetsFor("notepad").map((r) => r.id)).not.toContain(expect.stringMatching(/^stationery:/));
  });
});

describe("Daily Reflection composition: one open-line writing language", () => {
  const DR = "devotional-daily-reflection.stacked";
  const lineCounts = (s: SolvedPage) =>
    Object.fromEntries(s.nodes.filter((n): n is Extract<LayoutNode, { type: "lines" }> => n.type === "lines").map((n) => [n.id.split("-")[1], n.positions.length]));
  it("no bordered boxes: Scripture is open ruled lines, Stand Out Verse a hairline callout in the quiet line color", () => {
    for (const size of getStationeryRecipe(DR)!.supportedTrims) {
      const s = pages(project(DR, size))[0];
      expect(s.nodes.filter((n) => n.type === "box"), size).toEqual([]);
      const bar = s.nodes.find((n) => n.id === "st0-standOutVerse-surface-callout");
      expect(bar?.type).toBe("rule");
      if (bar?.type === "rule") {
        expect(bar.x1).toBe(bar.x2);
        expect(bar.color).toBe("line");
        const verse = s.nodes.find((n) => n.id === "st0-standOutVerse-surface")!.rect;
        expect(Math.min(bar.y1, bar.y2)).toBeGreaterThanOrEqual(verse.y - 1e-6);
        expect(Math.max(bar.y1, bar.y2)).toBeLessThanOrEqual(verse.y + verse.h + 1e-6);
      }
      expect(lineCounts(s).scripture, size).toBeGreaterThanOrEqual(2);
    }
  });
  it("whole lines at the page's ruling, the remainder spread evenly between sections (no dead strips)", () => {
    for (const size of getStationeryRecipe(DR)!.supportedTrims) {
      const s = pages(project(DR, size))[0];
      const lines = s.nodes.filter((n): n is Extract<LayoutNode, { type: "lines" }> => n.type === "lines");
      const pitch = lines[0].positions[1] - lines[0].positions[0];
      for (const l of lines) {
        // The writing area ends exactly on its last line.
        expect(l.rect.y + l.rect.h, `${size} ${l.id}`).toBeCloseTo(l.positions[l.positions.length - 1], 6);
        expect(l.positions[1] - l.positions[0]).toBeCloseTo(pitch, 9);
      }
      const secs = s.nodes.filter((n): n is Group => n.type === "group" && /^st0-[A-Za-z]+$/.test(n.id));
      const gaps = secs.slice(1).map((n, i) => n.rect.y - (secs[i].rect.y + secs[i].rect.h));
      for (const g of gaps) expect(g, size).toBeCloseTo(gaps[0], 6);
      const body = s.regions!.mainContent!;
      const last = secs[secs.length - 1].rect;
      expect(last.y + last.h, size).toBeCloseTo(body.y + body.h, 6);
    }
  });
  it("Reflection, Application and Prayer carry the most writing; smaller trims get fewer lines at the same spacing", () => {
    const letter = lineCounts(pages(project(DR, "8.5x11"))[0]);
    const six = lineCounts(pages(project(DR, "6x9"))[0]);
    for (const c of [letter, six]) {
      for (const k of ["reflection", "application", "prayer"]) expect(c[k]).toBeGreaterThanOrEqual(Math.max(c.scripture, c.standOutVerse, c.thankfulFor));
    }
    const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
    expect(total(six)).toBeLessThan(total(letter));
  });
  it("other devotional pages keep their framed Scripture (only Daily Reflection changed)", () => {
    expect(pages(project("devotional-soap.four-band", "6x9"))[0].nodes.some((n) => n.id === "st0-scripture-surface-frame" && n.type === "box")).toBe(true);
    expect(pages(project("devotional-verse-mapping.spread", "6x9"))[0].nodes.some((n) => n.id === "st0-verse-surface-frame" && n.type === "box")).toBe(true);
  });
});
