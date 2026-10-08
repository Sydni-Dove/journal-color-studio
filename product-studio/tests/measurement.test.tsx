/**
 * Phase 2 — measurement and export readiness.
 *
 * Continuation pages are measured on the pages the book ends up with: both
 * sides (mirrored binding margins) and the final page count (spine gutters
 * grow in printer bands). Export waits for final pagination with real fonts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { computePageGeometry } from "../src/engines/geometry/pageGeometry";
import { getLayout } from "../src/layouts/registry";
import { rectContains } from "../src/engines/layout/math";
import { getLayoutMeasurer, heuristicMeasurer, setLayoutMeasurer } from "../src/engines/typography/textMeasure";
import { exportReadiness } from "../src/engines/print/readiness";
import { computeUsage } from "../src/engines/document/usage";
import { ExportDialog } from "../src/components/export/ExportDialog";
import { BINDING_PROFILES } from "../src/presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../src/presets/printProfiles/printProfiles";
import { SIZE_PRESETS } from "../src/presets/sizes/sizePresets";
import { resolveTrim } from "../src/engines/geometry/dimensions";
import type { PromptSet } from "../src/types/prompts";
import type { LayoutNode } from "../src/types/layout";

/** Long, unique content: every heading and prompt can be found exactly once. */
const longSet = (n: number, reps: number, lines: number, tag: string): PromptSet => ({
  blocks: Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    label: `${tag} heading ${i + 1}`,
    prompt: `${tag} prompt ${i + 1}: ` + "Describe what you noticed and why it matters to you. ".repeat(reps).trim(),
    space: "fixed" as const,
    lineCount: lines,
    minLines: lines,
  })),
});

function book(o: { size: string; orientation?: "portrait" | "landscape"; binding: string; profile: string; fixed: number; entries: number; set: PromptSet }) {
  return createProject("journal", {
    name: "Measurement",
    dimensions: { sizePresetId: o.size, orientation: o.orientation ?? "portrait" },
    production: { bindingType: o.binding as never, printProfileId: o.profile, includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: [
      step("lined-journal", { type: "copies", count: o.fixed }),
      step("guided", { type: "copies", count: o.entries }, { title: "Entry", promptSet: o.set }),
    ] },
  });
}

const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");
const FIT_RULES = new Set(["prompt-fit", "stationery-fit", "heading-fit"]);

/** Everything Phase 2 promises about a book with continuing entries. */
function checkBook(p: ReturnType<typeof book>, set: PromptSet, label: string) {
  const doc = resolveDocument(p);
  const pages = doc.recipe.pages;
  expect(doc.resolveNotes ?? [], label).toEqual([]);
  // Numbering is contiguous; sides alternate from a right-hand first page in a bound book.
  pages.forEach((pg, i) => {
    expect(pg.pageNumber, label).toBe(i + 1);
    expect(pg.side, `${label} p${pg.pageNumber}`).toBe(pg.pageNumber % 2 === 1 ? "recto" : "verso");
    // A filler page is always an intentional one (it says why).
    if (pg.filler) expect(pg.fillerReason, label).toBeTruthy();
  });
  // Each entry: its parts are consecutive, every heading and prompt prints exactly once, nothing overflows or is clipped,
  // and no continuation page is left over (an unused continuation would print as open writing space).
  const starts = pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => pg.layoutId === "guided-page" && (pg.flowPart ?? 0) === 0);
  expect(starts.length, label).toBeGreaterThan(0);
  for (const { pg, i } of starts) {
    const count = pg.flowCount ?? 1;
    const group = pages.slice(i, i + count);
    group.forEach((g, k) => expect(g.flowPart ?? 0, label).toBe(k));
    const texts: string[] = [];
    group.forEach((g, k) => {
      const s = solvePage(doc, i + k), geo = geometryFor(doc, g);
      expect(s.diagnostics.filter((d) => d.severity === "error" && FIT_RULES.has(d.rule)).map((d) => d.message), `${label} p${g.pageNumber}`).toEqual([]);
      for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(geo.safeRect, n.rect), `${label} p${g.pageNumber} ${n.id}`).toBe(true);
      if (k > 0) expect(s.nodes.some((n) => /-writing$/.test(n.id)), `${label} p${g.pageNumber} unused continuation`).toBe(false);
      texts.push(...s.nodes.map(textOf).filter(Boolean));
    });
    for (const b of set.blocks) {
      expect(texts.filter((t) => t === b.label).length, `${label} "${b.label}"`).toBe(1);
      expect(texts.filter((t) => t === b.prompt).length, `${label} prompt of "${b.label}"`).toBe(1);
    }
  }
  return doc;
}

describe("left- and right-hand pages", () => {
  it("mirror the binding margins: the usable page is the same size on both sides, for every binding, printer, size and orientation", () => {
    let checked = 0;
    for (const binding of Object.values(BINDING_PROFILES)) for (const profile of PRINT_PROFILES) for (const size of SIZE_PRESETS) for (const orientation of ["portrait", "landscape"] as const) {
      const trim = resolveTrim({ sizePresetId: size.id, orientation });
      const at = (side: "recto" | "verso") => computePageGeometry({ trim, binding, printProfile: profile, includeBleed: false, pageCount: 120, side, duplex: true });
      const r = at("recto"), v = at("verso");
      expect([v.safeRect.w, v.safeRect.h], `${binding.id} ${profile.id} ${size.id} ${orientation}`).toEqual([r.safeRect.w, r.safeRect.h]);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe("continuation pages are measured on the book's final pages", () => {
  // Chosen because it sits on a page boundary: 2 pages per entry at the first-pass width (4.875"), 4 at the final
  // width (4.5") once 10 entries push a Lulu 6 × 9 book past 150 pages — the case that used to overflow.
  const SET = longSet(4, 9, 5, "Band");
  for (const profile of ["lulu", "kdp"]) {
    it(`${profile}: entries that push the book past a gutter band still fit (measured at the final, narrower width)`, () => {
      // Lulu: 150 → 151 pages moves the inside margin from 0.625" to 1"; KDP: 150 → 151, 0.375" to 0.5".
      const doc = checkBook(book({ size: "6x9", binding: "perfect-bound", profile, fixed: 140, entries: 10, set: SET }), SET, profile);
      expect(doc.recipe.pageCount).toBeGreaterThan(150);
      // The count each entry got is what the final page needs, on either side.
      const final = (side: "recto" | "verso") => geometryFor(doc, { side });
      const f = { spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern, module: doc.recipe.pages.find((p) => p.layoutId === "guided-page")!.module };
      const need = Math.max(getLayout("guided-page").flowPages!({ ...f, page: final("recto") }), getLayout("guided-page").flowPages!({ ...f, page: final("verso") }));
      expect(doc.recipe.pages.find((p) => p.layoutId === "guided-page")!.flowCount).toBe(need);
    });
  }
  it("before this fix the same book overflowed: measured at the first-pass width it needs fewer pages than the final width", () => {
    const doc = resolveDocument(book({ size: "6x9", binding: "perfect-bound", profile: "lulu", fixed: 140, entries: 10, set: SET }));
    // The page the old code measured on: the first pass, before continuation pages — the same book with each entry
    // kept to one page (fillers included, so it is the exact first-pass page count).
    const firstPassBook = resolveDocument(book({ size: "6x9", binding: "perfect-bound", profile: "lulu", fixed: 140, entries: 10, set: { ...SET, whenFull: "stop" } }));
    expect(firstPassBook.recipe.pageCount).toBeLessThanOrEqual(150);
    const firstPage = geometryFor(firstPassBook, { side: "recto" }), finalPage = geometryFor(doc, { side: "recto" });
    const f = { spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern, module: doc.recipe.pages.find((pg) => pg.layoutId === "guided-page")!.module };
    expect(firstPage.safeRect.w).toBeGreaterThan(finalPage.safeRect.w);
    expect(getLayout("guided-page").flowPages!({ ...f, page: firstPage })).toBeLessThan(getLayout("guided-page").flowPages!({ ...f, page: finalPage }));
  });
  it("a book that does not cross a band is unchanged by the extra measuring", () => {
    // 60 + 10 entries: the first pass (70 pages) and the final book are both in Lulu's 61–150 band.
    const doc = checkBook(book({ size: "6x9", binding: "perfect-bound", profile: "lulu", fixed: 60, entries: 10, set: SET }), SET, "no band change");
    expect(doc.recipe.pageCount).toBeGreaterThanOrEqual(61);
    expect(doc.recipe.pageCount).toBeLessThanOrEqual(150);
    const f = { spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern, module: doc.recipe.pages.find((pg) => pg.layoutId === "guided-page")!.module };
    const firstPass = resolveDocument(book({ size: "6x9", binding: "perfect-bound", profile: "lulu", fixed: 70, entries: 0, set: SET }));
    expect(doc.recipe.pages.find((pg) => pg.layoutId === "guided-page")!.flowCount).toBe(getLayout("guided-page").flowPages!({ ...f, page: geometryFor(firstPass, { side: "recto" }) }));
  });
});

describe("long content across sizes, orientations and bindings", () => {
  const SET = longSet(5, 6, 7, "Grid");
  const CASES: [string, "portrait" | "landscape", string, string][] = [];
  for (const [binding, profile] of [["coil", "coil-generic"], ["perfect-bound", "kdp"], ["perfect-bound", "lulu"]])
    for (const [size, orientation] of [["5.5x8.5", "portrait"], ["6x9", "portrait"], ["8.5x11", "portrait"], ["8.5x11", "landscape"]] as const) CASES.push([size, orientation, binding, profile]);
  for (const [size, orientation, binding, profile] of CASES) {
    it(`${size} ${orientation} · ${binding}/${profile}: every word once, nothing clipped, sides and numbering right, no stray pages`, () => {
      checkBook(book({ size, orientation, binding, profile, fixed: 3, entries: 3, set: SET }), SET, `${size} ${orientation} ${binding}/${profile}`);
    });
  }
});

describe("export waits for final pagination with real fonts", () => {
  afterEach(() => setLayoutMeasurer("heuristic", heuristicMeasurer));
  const canvas = "canvas:test-fonts:1";

  it("readiness: fonts, the browser's own status, the measurer the pages were laid out with, and a settled page count", () => {
    expect(exportReadiness({ fontsReady: false, docMeasurerId: canvas, currentMeasurerId: canvas }).ready).toBe(false);
    expect(exportReadiness({ fontsReady: true, browserFonts: "loading", docMeasurerId: canvas, currentMeasurerId: canvas }).ready).toBe(false);
    expect(exportReadiness({ fontsReady: true, docMeasurerId: "heuristic", currentMeasurerId: "heuristic" }).ready).toBe(false);
    expect(exportReadiness({ fontsReady: true, docMeasurerId: canvas, currentMeasurerId: "canvas:test-fonts:2" }).ready).toBe(false);
    expect(exportReadiness({ fontsReady: true, docMeasurerId: canvas, currentMeasurerId: canvas, resolveNotes: ["did not settle"] }).ready).toBe(false);
    expect(exportReadiness({ fontsReady: true, browserFonts: "loaded", docMeasurerId: canvas, currentMeasurerId: canvas })).toEqual({ ready: true });
  });

  const dialog = (fontsReady: boolean) => {
    const doc = resolveDocument(book({ size: "6x9", binding: "coil", profile: "coil-generic", fixed: 2, entries: 1, set: longSet(2, 1, 4, "Export") }));
    return renderToStaticMarkup(<ExportDialog doc={doc} usage={computeUsage(doc)} currentIndex={0} fontsReady={fontsReady} onClose={() => {}} onGoTo={() => {}} onSettings={() => {}} />);
  };
  const printButton = (html: string) => html.match(/<button[^>]*>(Print \/ Save PDF|Preparing…)<\/button>/)![0];

  it("the dialog blocks export while fonts load, and while pages are laid out with the approximate measurer", () => {
    expect(printButton(dialog(false))).toContain("disabled");
    // Fonts reported loaded, but these pages were laid out with the approximate measurer: still blocked.
    const html = dialog(true);
    expect(printButton(html)).toContain("disabled");
    expect(html).toContain('data-export-readiness="waiting"');
  });
  it("…and allows it once the pages are laid out with the real-font measurer that is current", () => {
    setLayoutMeasurer(canvas, heuristicMeasurer);
    expect(getLayoutMeasurer().id).toBe(canvas);
    const html = dialog(true);
    expect(printButton(html)).not.toContain("disabled");
    expect(html).not.toContain('data-export-readiness="waiting"');
  });
});
