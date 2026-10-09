/**
 * Phase 7 — the Smart Layout Assistant. Findings and alternatives come from the
 * studio's own solved pages; every alternative must measure better and keep all
 * content: every word, column, field, entry and record number, nothing clipped,
 * no unintended blank pages, deliberate choices untouched.
 */
import { describe, expect, it } from "vitest";
import { layoutScore, measureLayout, reviewLayout, guessColumnType } from "../src/engines/layout/assistant";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { refitPageFilling } from "../src/engines/recipe/fitRows";
import { inventoryCountSet } from "../src/presets/layouts/recipePresets";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { sampleDevotional, sampleEntry } from "./fixtures/devotionalSamples";
import type { LayoutNode } from "../src/types/layout";
import type { PromptSet } from "../src/types/prompts";
import type { ProductProject } from "../src/types/project";

const COLUMNS = ["Item", "SKU", "Supplier", "Quantity on hand", "Reorder point", "Unit cost", "Location", "Notes"];
/** An inventory page that doesn't fit comfortably: 8 equal columns on a small upright page. */
function crowded(o: { size?: string; orientation?: "portrait" | "landscape"; rows?: number; widths?: (number | null)[] } = {}): ProductProject {
  const set = inventoryCountSet(o.rows ?? 30);
  const ps: PromptSet = { blocks: [set.blocks[0], { ...set.blocks[1], fillPage: undefined, table: { ...set.blocks[1].table!, columnTypes: undefined, columns: COLUMNS, ...(o.widths ? { columnWidths: o.widths } : {}) } }] };
  return createProject("notebook", {
    dimensions: { sizePresetId: o.size ?? "6x9", orientation: o.orientation ?? "portrait" },
    production: { bindingType: "coil" as never, printProfileId: "coil-generic", includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: [step("worksheet", { type: "copies", count: 4 }, { title: "Inventory Count", promptSet: ps })] },
  });
}
const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");
function solveAll(p: ProductProject) {
  const doc = resolveDocument(p);
  return { doc, pages: doc.recipe.pages.map((pg, i) => ({ pg, i, s: solvePage(doc, i), g: geometryFor(doc, pg) })) };
}
/** Nothing clipped, no errors, no two fillers in a row, no empty page of content, page numbers in order. */
function checkSound(p: ProductProject, label: string) {
  const r = solveAll(p);
  r.pages.forEach(({ pg, i, s, g }) => {
    expect(pg.pageNumber, label).toBe(i + 1);
    if (pg.filler) {
      expect(pg.fillerReason, label).toBeTruthy();
      expect(r.pages[i + 1]?.pg.filler ?? false, `${label}: two fillers in a row`).toBe(false);
      return;
    }
    expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => d.message), `${label} p${pg.pageNumber}`).toEqual([]);
    for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(g.safeRect, n.rect), `${label} p${pg.pageNumber} ${n.id}`).toBe(true);
  });
  expect(measureLayout(p).measures.emptyPages, `${label}: mostly empty pages`).toBe(0);
  return r;
}
const omitFns = (r: ReturnType<typeof reviewLayout>) => JSON.stringify({ ...r, alternatives: r.alternatives.map(({ apply: _a, ...x }) => x) });

describe("finding what doesn't fit comfortably", () => {
  it("a crowded table on a small upright page: crowded columns, the columns can't fit, a wide table on a portrait page", () => {
    const r = reviewLayout(crowded());
    const kinds = new Set(r.findings.map((f) => f.kind));
    expect(kinds).toEqual(new Set(["cannot-fit", "crowded-columns", "orientation"]));
    expect(r.measures.errors).toBeGreaterThan(0);
    // The same problem on every copy is reported once.
    expect(r.findings.filter((f) => f.kind === "cannot-fit")).toHaveLength(1);
  });
  it("is deterministic: the same product gives the same review", () => {
    const p = crowded();
    expect(omitFns(reviewLayout(p))).toBe(omitFns(reviewLayout(p)));
  });
  it("a comfortable layout has nothing to fix and no suggestions that would make it worse", () => {
    const p = refitPageFilling(createProject("notebook", {
      dimensions: { sizePresetId: "8.5x11", orientation: "landscape" },
      production: { bindingType: "coil" as never, printProfileId: "coil-generic", includeBleed: false, duplex: true },
      recipe: { items: [], ordering: "sequential", structure: [step("worksheet", { type: "copies", count: 3 }, { title: "Inventory Count", promptSet: inventoryCountSet() })] },
    }));
    const r = reviewLayout(p);
    expect(r.measures.errors + r.measures.crowdedColumns + r.measures.emptyPages).toBe(0);
    for (const a of r.alternatives) expect(layoutScore(a.after)).toBeLessThan(layoutScore(a.before));
  });
  it("a mostly empty page is found (rows spilling onto a new page)", () => {
    const r = reviewLayout(crowded({ size: "8.5x11", orientation: "landscape", rows: 17 }));
    expect(r.findings.some((f) => f.kind === "empty-page")).toBe(true);
    expect(r.alternatives.map((a) => a.id)).toContain(r.alternatives.find((a) => a.id.startsWith("fill-rows"))?.id);
  });
  it("guesses what a column holds from its heading", () => {
    expect(COLUMNS.map(guessColumnType)).toEqual(["text", "text", "text", "quantity", "number", "currency", "text", "longText"]);
  });
});

describe("alternatives measure better and keep everything", () => {
  const p = crowded();
  const r = reviewLayout(p);
  it("offers several measured alternatives, best first, each with a reason and outcomes", () => {
    expect(r.alternatives.length).toBeGreaterThanOrEqual(2);
    for (const a of r.alternatives) {
      expect(a.reason.length).toBeGreaterThan(10);
      expect(a.outcome.length).toBeGreaterThan(0);
      expect(layoutScore(a.after)).toBeLessThan(layoutScore(a.before));
      expect(measureLayout(a.apply(p)).measures).toEqual(a.after); // what it says is what you get
    }
    const scores = r.alternatives.map((a) => layoutScore(a.after));
    expect([...scores].sort((x, y) => x - y)).toEqual(scores);
  });
  it("every alternative keeps every column (as columns or record blanks), the rows and the numbers; nothing clipped; no empty pages", () => {
    for (const a of r.alternatives) {
      const next = a.apply(p);
      const { pages } = checkSound(next, a.id);
      const texts = pages.flatMap(({ s }) => s.nodes.map(textOf));
      for (const c of COLUMNS) expect(texts.some((t) => t.toLowerCase().includes(c.toLowerCase())), `${a.id}: column "${c}"`).toBe(true);
      const blocks = next.recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks ?? [] : []));
      const heads = blocks.flatMap((b) => b.table?.columns ?? b.recordFields ?? []);
      expect([...heads].sort(), `${a.id}: each column once`).toEqual([...COLUMNS].sort());
      // Numbering: each numbered sequence counts 1…N once, in page order.
      const seqs = new Map<string, number[]>();
      for (const { s } of pages) for (const n of s.nodes) {
        const m = /-(inv-count(?:-2)?)-.*-n(\d+)$/.exec(n.id) ?? /-(inv-count(?:-2)?)-surface-n(\d+)$/.exec(n.id);
        if (m) seqs.set(m[1], [...(seqs.get(m[1]) ?? []), Number(m[2])]);
        const rec = /-inv-count-.*-r(\d+)-number$/.exec(n.id);
        if (rec) seqs.set("records", [...(seqs.get("records") ?? []), Number(rec[1])]);
      }
      expect(seqs.size, `${a.id}: numbered`).toBeGreaterThan(0);
      for (const [k, v] of seqs) expect(v, `${a.id} ${k}`).toEqual(Array.from({ length: v.length }, (_, i) => i + 1));
      if (seqs.has("inv-count") && seqs.has("inv-count-2")) expect(seqs.get("inv-count-2")).toEqual(seqs.get("inv-count")); // the same rows on both pages of the spread
    }
  });
  it("splitting a wide table puts its halves on facing pages, clearly named", () => {
    const split = r.alternatives.find((a) => a.id.startsWith("split:"))!;
    const { pages } = solveAll(split.apply(p));
    const content = pages.filter(({ pg }) => !pg.filler);
    for (let k = 0; k + 1 < content.length; k += 2) {
      expect(content[k].pg.side).toBe("verso");
      expect(content[k + 1].pg.side).toBe("recto");
      expect(content[k + 1].pg.pageNumber).toBe(content[k].pg.pageNumber + 1);
    }
    const labels = split.apply(p).recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks.map((b) => b.label) ?? [] : []));
    expect(labels.filter((l) => / of 2: /.test(l))).toEqual(["Table (1 of 2: Item – Quantity on hand)", "Table (2 of 2: Reorder point – Notes)"]);
  });
});

describe("deliberate choices are kept", () => {
  it("set column widths and typed row counts survive every alternative (or the alternative isn't offered)", () => {
    const p = crowded({ size: "8.5x11", widths: [1.4, null, null, null, null, null, null, null] });
    const rows = (q: ProductProject) => q.recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks ?? [] : [])).filter((b) => b.table).map((b) => b.table!.rows);
    for (const a of reviewLayout(p).alternatives) {
      if (a.id.startsWith("records:") || a.id.startsWith("fill-rows:")) continue; // these change the count only because the maker chooses them
      const next = a.apply(p);
      expect(rows(next).every((x) => x === 30), a.id).toBe(true);
      const w = next.recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks ?? [] : [])).find((b) => b.table?.columns.includes("Item"))!.table!.columnWidths;
      expect(w?.[0], a.id).toBe(1.4);
    }
    expect(reviewLayout(p).alternatives.some((a) => a.id.startsWith("split:"))).toBe(false); // a table with set widths isn't split
  });
});

describe("devotionals", () => {
  const TOKEN = /e(\d+)(scr|tea|que|pra|app)(\d{4})/g;
  const expected = (days: number) => Array.from({ length: days }, (_, e) => {
    const v = sampleEntry(e);
    return ["scripture", "reading", "questions", "prayer", "action"].flatMap((k) => String(v[k]).match(TOKEN) ?? []);
  }).flat();
  it("suggests another design when it measures better, and every suggestion keeps every word once, in order", () => {
    const p = sampleDevotional({ days: 14, structure: "right-hand" });
    const r = reviewLayout(p);
    expect(r.alternatives.length).toBeGreaterThan(0);
    for (const a of r.alternatives) {
      const next = a.apply(p);
      expect(next.data).toBe(p.data);
      const { pages } = checkSound(next, a.id);
      const words = pages.flatMap(({ s }) => s.nodes.map(textOf).join(" ").match(TOKEN) ?? []);
      expect(words, a.id).toEqual(expected(14));
    }
  });
  it("body text wrapping is not a squeezed heading", () => {
    expect(reviewLayout(sampleDevotional({ days: 3 })).findings.filter((f) => f.kind === "squeezed-heading")).toEqual([]);
  });
});
