/**
 * Phase 6 — an inventory notebook from the universal components: a guided
 * page's info row, a table and repeating records (no inventory layout, no
 * new pagination or rendering). Two shared capabilities were added for it,
 * available to every table: columns sized to what they hold, and rows
 * numbered across the whole product. Every check reads the solved pages —
 * what preview and print draw.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { INVENTORY_PRESETS, inventoryCountSet, inventoryRecordSet } from "../src/presets/layouts/recipePresets";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode, SolvedPage } from "../src/types/layout";
import type { PromptSet } from "../src/types/prompts";
import type { ProductProject } from "../src/types/project";

type Opts = { size?: string; orientation?: "portrait" | "landscape"; binding?: string; profile?: string; copies?: number };
function notebook(set: PromptSet, o: Opts = {}, title = "Inventory Count"): ProductProject {
  return createProject("notebook", {
    name: "Inventory",
    dimensions: { sizePresetId: o.size ?? "8.5x11", orientation: o.orientation ?? "portrait" },
    production: { bindingType: (o.binding ?? "coil") as never, printProfileId: o.profile ?? "coil-generic", includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: [step("worksheet", { type: "copies", count: o.copies ?? 3 }, { title, promptSet: set })] },
  });
}
function solveAll(p: ProductProject) {
  const doc = resolveDocument(p);
  return { doc, pages: doc.recipe.pages.map((pg, i) => ({ pg, i, s: solvePage(doc, i), g: geometryFor(doc, pg) })) };
}
const textNodes = (s: SolvedPage) => s.nodes.filter((n): n is Extract<LayoutNode, { type: "text" }> => n.type === "text");
/** Column widths of the count table on a page, by header label. */
function columnWidths(s: SolvedPage): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of textNodes(s)) if (/-inv-count-surface-h-/.test(n.id) || /-inv-count.*-h-(no|c\d+)$/.test(n.id)) out[n.text] = n.rect.w;
  return out;
}
const numbersOn = (s: SolvedPage, block: string) => textNodes(s).filter((n) => n.id.includes(`-${block}-`) && /-n\d+$/.test(n.id)).map((n) => Number(n.text));
const recordNumbers = (s: SolvedPage) => textNodes(s).filter((n) => /-inv-records-.*-r\d+-number$/.test(n.id)).map((n) => n.text);
const LAYOUTS = (p: ProductProject) => new Set(resolveDocument(p).recipe.pages.filter((x) => !x.filler).map((x) => x.layoutId));

function checkPages(r: ReturnType<typeof solveAll>, label: string) {
  expect(r.doc.recipe.diagnostics.filter((d) => d.severity === "error"), label).toEqual([]);
  for (const { pg, s, g } of r.pages) {
    expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.rule}: ${d.message}`), `${label} p${pg.pageNumber}`).toEqual([]);
    for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(g.safeRect, n.rect), `${label} p${pg.pageNumber} ${n.id}`).toBe(true);
  }
}

describe("inventory count sheets", () => {
  it("are made of shared parts only (the guided page): no inventory-specific layout", () => {
    for (const preset of INVENTORY_PRESETS) {
      const p = notebook({ blocks: [] });
      const built = { ...p, recipe: preset.build({ count: 2, sheets: 1 }) };
      expect([...LAYOUTS(built)]).toEqual(["guided-page"]);
    }
  });

  it("columns are sized to what they hold: notes widest, words wide, amounts / quantities / numbers narrow; none narrower than its heading", () => {
    const { pages } = solveAll(notebook(inventoryCountSet()));
    const w = columnWidths(pages[0].s);
    expect(Object.keys(w)).toEqual(["No.", "Item", "SKU", "Supplier", "Quantity", "Reorder point", "Unit cost", "Notes"]);
    expect(w.Notes).toBeGreaterThan(w.Item);
    expect(w.Item).toBeGreaterThan(w["Unit cost"]);
    expect(w.Item).toBeGreaterThan(w.Quantity);
    expect(w["No."]).toBeLessThan(w.Item);
    // The heading still decides a column's least width: "Quantity" (one long word) is wider than its numbers need.
    expect(w.Quantity).toBeGreaterThan(w["Unit cost"]);
    expect(pages[0].s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("a table that doesn't say what its columns hold keeps equal columns (existing tables are unchanged)", () => {
    const set: PromptSet = { blocks: [{ id: "inv-count", label: "", responseStyle: "table", space: "fixed", lineCount: 6, table: { columns: ["Item", "Notes", "Qty"], rows: 6 } }] };
    const w = Object.values(columnWidths(solveAll(notebook(set)).pages[0].s));
    expect(w).toHaveLength(3);
    for (const x of w) expect(x).toBeCloseTo(w[0], 6);
  });

  it("rows are numbered straight through every copy, in order, each number once", () => {
    const { pages } = solveAll(notebook(inventoryCountSet(20), { copies: 5 }));
    const nums = pages.flatMap(({ s }) => numbersOn(s, "inv-count"));
    expect(nums).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it("a table longer than a page continues: its header repeats and the numbers carry on", () => {
    const { pages, doc } = solveAll(notebook(inventoryCountSet(90), { copies: 2, size: "6x9" }));
    checkPages({ pages, doc }, "90 rows on 6x9");
    const nums = pages.flatMap(({ s }) => numbersOn(s, "inv-count"));
    expect(nums).toEqual(Array.from({ length: 180 }, (_, i) => i + 1));
    expect(pages.length).toBeGreaterThan(2);
    for (const { s } of pages) expect(Object.keys(columnWidths(s))).toContain("Notes"); // the header row on every piece
  });

  it("portrait and landscape, several sizes and bindings: everything fits; landscape gives the columns more room", () => {
    const configs: Opts[] = [
      { size: "8.5x11" }, { size: "8.5x11", orientation: "landscape" }, { size: "6x9", binding: "perfect-bound", profile: "kdp" },
      { size: "5.5x8.5", orientation: "landscape" }, { size: "a5" }, { size: "a4", orientation: "landscape" }, { size: "7x9", binding: "wire-o", profile: "generic-commercial" },
    ];
    for (const o of configs) checkPages(solveAll(notebook(inventoryCountSet(), o)), `${o.size} ${o.orientation ?? "portrait"} ${o.binding ?? "coil"}`);
    const portrait = columnWidths(solveAll(notebook(inventoryCountSet())).pages[0].s);
    const landscape = columnWidths(solveAll(notebook(inventoryCountSet(), { orientation: "landscape" })).pages[0].s);
    expect(landscape.Notes).toBeGreaterThan(portrait.Notes);
  });

  it("too many columns for the page is reported plainly — never squeezed below their headings", () => {
    const { pages } = solveAll(notebook(inventoryCountSet(), { size: "5.5x8.5" }));
    const errs = pages[0].s.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.message)).toEqual([expect.stringMatching(/column headings need [\d.]+" but the page is [\d.]+" wide/)]);
  });

  it("columns are the maker's: relabel, reorder, change what they hold, add or remove — widths follow", () => {
    const base = inventoryCountSet(10);
    const t = base.blocks[1].table!;
    const custom: PromptSet = { ...base, blocks: [base.blocks[0], { ...base.blocks[1], table: { ...t, columns: ["Bin", "Description", "Count", "Checked"], columnTypes: ["text", "longText", "number", "boolean"] } }] };
    const w = columnWidths(solveAll(notebook(custom)).pages[0].s);
    expect(Object.keys(w)).toEqual(["No.", "Bin", "Description", "Count", "Checked"]);
    expect(w.Description).toBeGreaterThan(w.Bin);
    expect(w.Bin).toBeGreaterThan(w.Count);
    const unnumbered: PromptSet = { ...custom, blocks: [custom.blocks[0], { ...custom.blocks[1], table: { ...custom.blocks[1].table!, numbering: undefined } }] };
    const r = solveAll(notebook(unnumbered));
    expect(r.pages.flatMap(({ s }) => numbersOn(s, "inv-count"))).toEqual([]);
    expect(Object.keys(columnWidths(r.pages[0].s))).not.toContain("No.");
  });

  it("the book check finds nothing to fix (portrait and landscape)", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const errors = validateProject(notebook(inventoryCountSet(), { orientation, copies: 12 }), heuristicMeasurer).issues.filter((x) => x.severity === "error");
      expect(errors.map((x) => `${x.rule}: ${x.message}`), orientation).toEqual([]);
    }
  });
});

describe("item record pages", () => {
  it("repeating blank records are numbered across every copy, whole on their page", () => {
    const { pages, doc } = solveAll(notebook(inventoryRecordSet(3), { copies: 4 }, "Item Records"));
    checkPages({ pages, doc }, "records");
    const nums = pages.flatMap(({ s }) => recordNumbers(s));
    expect(nums).toEqual(Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`));
  });
  it("count sheets and record pages in one notebook keep separate counts", () => {
    const p = notebook(inventoryCountSet(10), { copies: 2 });
    const both = { ...p, recipe: { ...p.recipe, structure: [...p.recipe.structure!, step("worksheet", { type: "copies", count: 2 }, { title: "Item Records", promptSet: inventoryRecordSet(2) })] } };
    const { pages } = solveAll(both);
    expect(pages.flatMap(({ s }) => numbersOn(s, "inv-count"))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(pages.flatMap(({ s }) => recordNumbers(s))).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"]);
  });
});
