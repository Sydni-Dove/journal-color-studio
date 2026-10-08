/**
 * Phase 3 — shared content pagination: sections continue across pages in
 * whole units through the ONE paginator (engines/stationery/geometry
 * paginateZones), drawn by the existing surfaces.
 *
 * Every check reads the solved pages — what preview and print draw.
 */
import { describe, expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { exportReadiness } from "../src/engines/print/readiness";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { listMarkers } from "../src/layouts/stationery/flowSurfaces";
import { paginateZones, type ZoneRequest } from "../src/engines/stationery/geometry";
import type { PromptBlock, PromptSet } from "../src/types/prompts";
import type { LayoutNode, PageFragment, SolvedPage } from "../src/types/layout";
import type { StationeryZone } from "../src/types/stationery";

type Opts = { size?: string; orientation?: "portrait" | "landscape"; binding?: string; profile?: string; copies?: number; before?: number };
function book(blocks: PromptBlock[], o: Opts = {}) {
  return createProject("journal", {
    name: "Pagination",
    dimensions: { sizePresetId: o.size ?? "6x9", orientation: o.orientation ?? "portrait" },
    production: { bindingType: (o.binding ?? "perfect-bound") as never, printProfileId: o.profile ?? "kdp", includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: [
      ...(o.before ? [step("lined-journal", { type: "copies", count: o.before })] : []),
      step("guided", { type: "copies", count: o.copies ?? 1 }, { title: "Content", promptSet: { blocks } as PromptSet }),
    ] },
  });
}

/** Every page of the guided entries, solved, in order, with their instance and part. */
function solve(blocks: PromptBlock[], o: Opts = {}) {
  const doc = resolveDocument(book(blocks, o));
  const pages = doc.recipe.pages.map((pg, i) => ({ pg, i, s: solvePage(doc, i), g: geometryFor(doc, pg) }));
  return { doc, pages, guided: pages.filter((p) => p.pg.layoutId === "guided-page") };
}

const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const ofSection = (s: SolvedPage, key: string, suffix: RegExp) => s.nodes.filter((n) => n.id.includes(`-${key}-`) && suffix.test(n.id));

/** Facing pages, numbering, intentional fillers, nothing clipped, no fit errors, no leftover continuation pages. */
function checkPages(r: ReturnType<typeof solve>, label: string) {
  expect(r.doc.resolveNotes, label).toEqual([]);
  r.pages.forEach(({ pg, i, s, g }) => {
    expect(pg.pageNumber, label).toBe(i + 1);
    expect(pg.side, `${label} p${pg.pageNumber}`).toBe(pg.pageNumber % 2 === 1 ? "recto" : "verso");
    if (pg.filler) expect(pg.fillerReason, label).toBeTruthy();
    expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.rule}: ${d.message}`), `${label} p${pg.pageNumber}`).toEqual([]);
    for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(g.safeRect, n.rect), `${label} p${pg.pageNumber} ${n.id}`).toBe(true);
    if ((pg.flowPart ?? 0) > 0) expect(s.nodes.some((n) => /-writing$/.test(n.id)), `${label} p${pg.pageNumber} leftover page`).toBe(false);
  });
}

/** Each split section: pieces in page order cover [0, count) exactly once, parts 0, 1, 2… — per instance. */
function checkFragments(r: ReturnType<typeof solve>, label: string): Map<string, PageFragment[]> {
  const byInstance = new Map<string, PageFragment[]>();
  for (const { pg, s } of r.guided) {
    const inst = pg.key.replace(/~\d+$/, "");
    for (const f of s.fragments ?? []) {
      const k = `${inst}|${f.componentId}`;
      byInstance.set(k, [...(byInstance.get(k) ?? []), f]);
    }
  }
  for (const [k, fs] of byInstance) {
    expect(fs[0].from, `${label} ${k}`).toBe(0);
    fs.forEach((f, j) => {
      expect(f.part, `${label} ${k}`).toBe(j);
      if (j) expect(f.from, `${label} ${k}`).toBe(fs[j - 1].to);
      expect(f.to, `${label} ${k}`).toBeGreaterThan(f.from);
    });
    expect(fs[fs.length - 1].to, `${label} ${k}`).toBe(fs[0].count);
  }
  return byInstance;
}

const SENTENCES = ["Grace meets us in ordinary mornings.", "We notice it when we slow down and listen.", "Write what you saw, not what you expected to see.", "Small faithfulness builds strong foundations.", "Rest is part of obedience, not a reward for it."];
/** n paragraphs, each of 3–5 distinct sentences (numbered, so every word is traceable). */
const prose = (n: number) => Array.from({ length: n }, (_, p) => Array.from({ length: 3 + (p % 3) }, (_, k) => `${p + 1}.${k + 1} ${SENTENCES[(p + k) % SENTENCES.length]}`).join(" ")).join("\n");
const bodyText = (id: string, value: string): PromptBlock => ({ id, kind: "heading", textStyle: "body", label: value });

const SIZES: Opts[] = [
  { size: "5.5x8.5" }, { size: "6x9" }, { size: "8.5x11" }, { size: "8.5x11", orientation: "landscape" },
  { size: "6x9", binding: "coil", profile: "coil-generic" }, { size: "8.5x11", binding: "perfect-bound", profile: "lulu", before: 140 },
];
const label = (o: Opts) => `${o.size} ${o.orientation ?? "portrait"} ${o.binding ?? "perfect-bound"}/${o.profile ?? "kdp"}${o.before ? ` after ${o.before} pages` : ""}`;

describe("long text continues line by line", () => {
  for (const o of SIZES) {
    it(`${label(o)}: a very long passage — every word once, in order, broken at sentence or paragraph ends`, () => {
      const value = prose(40);
      const r = solve([bodyText("t1", value)], o);
      checkPages(r, label(o));
      const frags = [...checkFragments(r, label(o)).values()][0];
      expect(frags.length, "it continues across pages").toBeGreaterThan(1);
      const printed = r.guided.flatMap(({ s }) => ofSection(s, "t1", /-prompt$/).map(textOf)).join(" ");
      expect(words(printed)).toEqual(words(value));
      // Every break falls after a sentence (paragraphs and sentences are a few lines long here).
      for (const { s } of r.guided.slice(0, -1)) {
        const last = ofSection(s, "t1", /-prompt$/).at(-1);
        if (last && last.type === "text") expect(last.fit!.lines!.at(-1), label(o)).toMatch(/[.!?]$/);
      }
    });
  }
  // Fill a 6 × 9 page with writing lines so the next section starts near its bottom: try every amount of filler,
  // so the break lands at every position.
  const fillers = Array.from({ length: 12 }, (_, i) => 14 + i);
  it("a short paragraph (3 lines) is never split: it can't leave 2 lines on both sides, so it moves whole", () => {
    const short = "1.1 Grace meets us in ordinary mornings. We notice it when we slow down and listen. Write what you saw, not what you expected to see. Small faithfulness builds strong foundations.";
    for (const n of fillers) {
      const r = solve([{ id: "q0", label: "Fill", space: "fixed", lineCount: n }, bodyText("t1", short)]);
      checkPages(r, `filler ${n}`);
      const lines = r.guided.flatMap(({ s }) => ofSection(s, "t1", /-prompt$/)).map((x) => (x.type === "text" ? x.fit!.lines!.length : 0));
      expect(lines.length, `filler ${n}: one piece (lines ${lines})`).toBe(1);
      expect(lines[0], "the paragraph is 3 lines at this size").toBeLessThanOrEqual(3);
      expect(words(r.guided.flatMap(({ s }) => ofSection(s, "t1", /-prompt$/).map(textOf)).join(" "))).toEqual(words(short));
    }
  });
  it("a heading stays on the page where its text starts, wherever the break falls", () => {
    for (const n of fillers) {
      const r = solve([{ id: "q0", label: "Fill", space: "fixed", lineCount: n }, { id: "h1", kind: "heading", label: "Reflection" }, bodyText("t1", prose(3))]);
      checkPages(r, `filler ${n}`);
      const pageOf = (key: string, suffix: RegExp) => r.guided.findIndex(({ s }) => ofSection(s, key, suffix).length > 0);
      expect(pageOf("h1", /-title$/), `filler ${n}`).toBe(pageOf("t1", /-prompt$/));
    }
  });
});

describe("lists continue between items", () => {
  const items = Array.from({ length: 70 }, (_, i) => ({ text: `Item ${i + 1}: ${SENTENCES[i % SENTENCES.length]}`, level: i % 7 === 0 ? 0 : i % 7 < 4 ? 1 : 2 }));
  for (const marker of ["number", "checkbox", "bullet"] as const) {
    it(`${marker} list (nested, three levels): every item once, numbering continues across pages`, () => {
      const r = solve([{ id: "l1", kind: "list", label: "Steps", listMarker: marker, items }], { size: "5.5x8.5" });
      checkPages(r, marker);
      expect([...checkFragments(r, marker).values()][0].length).toBeGreaterThan(1);
      const printed = r.guided.flatMap(({ s }) => ofSection(s, "l1", /-i\d+$/).map(textOf));
      expect(printed).toEqual(items.map((it) => it.text));
      if (marker === "number") {
        const markers = r.guided.flatMap(({ s }) => ofSection(s, "l1", /-marker$/).map(textOf));
        expect(markers).toEqual(listMarkers(items, "number"));
        expect(markers.slice(0, 5)).toEqual(["1.", "a.", "b.", "c.", "i."]);
      }
      if (marker === "checkbox") expect(r.guided.reduce((a, { s }) => a + ofSection(s, "l1", /-box$/).length, 0)).toBe(items.length);
    });
  }
  it("a short list that doesn't fit below other content moves whole instead of splitting", () => {
    const r = solve([{ id: "q0", label: "Fill", space: "fixed", lineCount: 20 }, { id: "l1", kind: "list", label: "Short", listMarker: "number", items: items.slice(0, 6) }], { size: "6x9" });
    checkPages(r, "short list");
    expect(r.guided.every(({ s }) => !(s.fragments ?? []).some((f) => f.componentId === "l1"))).toBe(true);
  });
});

describe("tables continue between rows, headings repeated", () => {
  // Long, two-line column headings (they fit their columns with real fonts too; see the next test for one that can't).
  const heads = ["Item", "Supplier Information", "Quantity on Hand", "Reorder Point"];
  for (const o of SIZES) {
    it(`${label(o)}: a long table with two-line column headings`, () => {
      const r = solve([{ id: "t1", label: "Inventory", responseStyle: "table", table: { columns: heads, rows: 80 }, space: "fixed", lineCount: 80 }], o);
      checkPages(r, label(o));
      const frags = [...checkFragments(r, label(o)).values()][0];
      expect(frags.length).toBeGreaterThan(1);
      let rows = 0;
      for (const { s } of r.guided) {
        const pieceRows = s.nodes.filter((n) => /-t1-surface-r\d+$/.test(n.id)).length;
        if (!pieceRows) continue;
        rows += pieceRows;
        // Every page with rows repeats every column heading (wrapped headings included).
        expect(ofSection(s, "t1", /-surface-h-c\d+$/).map(textOf), label(o)).toEqual(heads);
      }
      expect(rows).toBe(80);
    });
  }
  it("a column heading too long for its column is reported for fixing (export blocked), never printed clipped", () => {
    const cols = ["Item", "Supplier Information and Complete Contact Details Including Address", "Quantity on Hand", "Reorder Point", "Unit Cost", "Location"];
    const p = book([{ id: "t1", label: "Inventory", responseStyle: "table", table: { columns: cols, rows: 40 }, space: "fixed", lineCount: 40 }], { size: "5.5x8.5" });
    const issues = validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity === "error");
    expect(issues.some((x) => x.rule === "heading-fit")).toBe(true);
    // Every page that repeats the header flags the same heading as failed (drawn inside its box, not across it).
    const r = solve([{ id: "t1", label: "Inventory", responseStyle: "table", table: { columns: cols, rows: 40 }, space: "fixed", lineCount: 40 }], { size: "5.5x8.5" });
    const failed = r.guided.flatMap(({ s }) => ofSection(s, "t1", /-surface-h-c2$/)).map((n) => n.type === "text" && !!n.fit?.failed);
    expect(failed.length).toBeGreaterThan(1);
    expect(failed.every(Boolean)).toBe(true);
  });
  it("a checklist continues between items and keeps every item", () => {
    const r = solve([{ id: "c1", label: "To do", responseStyle: "checkboxes", lineCount: 60, space: "fixed" }], { size: "5.5x8.5" });
    checkPages(r, "checklist");
    expect([...checkFragments(r, "checklist").values()][0].length).toBeGreaterThan(1);
    const fr = [...checkFragments(r, "checklist").values()][0];
    expect(fr.reduce((a, f) => a + f.to - f.from, 0)).toBe(60);
  });
  it("writing lines longer than a page continue; shorter ones move whole, as before", () => {
    const r = solve([{ id: "w1", label: "Notes", space: "fixed", lineCount: 70 }], { size: "5.5x8.5" });
    checkPages(r, "writing");
    const fr = [...checkFragments(r, "writing").values()][0];
    expect(fr.reduce((a, f) => a + f.to - f.from, 0)).toBe(70);
  });
});

describe("repeating records stay whole and number across the whole product", () => {
  const record = (count: number): PromptBlock => ({ id: "r1", kind: "record", label: "Journal entries", recordFields: ["Date", "Time", "Signer", "ID type", "Fee", "Notes"], recordCount: count, numbering: { prefix: "No." } });
  for (const o of SIZES) {
    it(`${label(o)}: records near page boundaries are never split; numbers run 1…N across pages and copies`, () => {
      const r = solve([record(9)], { ...o, copies: 4 });
      checkPages(r, label(o));
      checkFragments(r, label(o));
      const numbers = r.guided.flatMap(({ s }) => s.nodes.filter((n) => /-r1-surface-r\d+-number$/.test(n.id)).map(textOf));
      expect(numbers).toEqual(Array.from({ length: 36 }, (_, i) => `No. ${i + 1}`));
      // Whole records: every record's outline lies inside one page's body.
      for (const { s, g } of r.guided) for (const n of s.nodes.filter((x) => /-r1-surface-r\d+$/.test(x.id))) expect(rectContains(g.safeRect, n.rect), label(o)).toBe(true);
    });
  }
  it("records with a shared sequence continue across different sections; an explicit start is honoured", () => {
    const a: PromptBlock = { ...record(3), id: "a", numbering: { sequence: "journal", start: 101 } };
    const b: PromptBlock = { ...record(2), id: "b", numbering: { sequence: "journal" } };
    const r = solve([a, b], { copies: 2 });
    const numbers = r.guided.flatMap(({ s }) => s.nodes.filter((n) => /-(a|b)-surface-r\d+-number$/.test(n.id)).map(textOf));
    expect(numbers).toEqual(["No. 101", "No. 102", "No. 103", "No. 104", "No. 105", "No. 106", "No. 107", "No. 108", "No. 109", "No. 110"]);
  });
});

describe("mixed long document: everything once, in order, across sizes", () => {
  for (const o of SIZES) {
    it(`${label(o)}`, () => {
      const blocks: PromptBlock[] = [
        { id: "h0", kind: "heading", textStyle: "title", label: "Inventory Notebook" },
        bodyText("t1", prose(12)),
        { id: "h1", kind: "heading", label: "Stock" },
        { id: "tb", label: "Items", responseStyle: "table", table: { columns: ["Item", "Supplier", "Qty"], rows: 45 }, space: "fixed", lineCount: 45 },
        { id: "l1", kind: "list", label: "Checks", listMarker: "number", items: Array.from({ length: 30 }, (_, i) => ({ text: `Check ${i + 1}`, level: i % 3 ? 1 : 0 })) },
        { id: "r1", kind: "record", label: "Visits", recordFields: ["Date", "Technician", "Work done"], recordCount: 12 },
      ];
      const r = solve(blocks, o);
      checkPages(r, label(o));
      checkFragments(r, label(o));
      const all = r.guided.flatMap(({ s }) => s.nodes.map(textOf));
      expect(words(r.guided.flatMap(({ s }) => ofSection(s, "t1", /-prompt$/).map(textOf)).join(" "))).toEqual(words(prose(12)));
      expect(all.filter((t) => /^Check \d+$/.test(t))).toEqual(Array.from({ length: 30 }, (_, i) => `Check ${i + 1}`));
      expect(all.filter((t) => /^No\. \d+$/.test(t))).toEqual(Array.from({ length: 12 }, (_, i) => `No. ${i + 1}`));
      expect(r.guided.reduce((a, { s }) => a + s.nodes.filter((n) => /-tb-surface-r\d+$/.test(n.id)).length, 0)).toBe(45);
      // Sections keep their order across pages.
      const firstPage = (key: string) => r.guided.findIndex(({ s }) => s.nodes.some((n) => n.id.includes(`-${key}-`)));
      expect([firstPage("t1"), firstPage("tb"), firstPage("l1"), firstPage("r1")]).toEqual([...[firstPage("t1"), firstPage("tb"), firstPage("l1"), firstPage("r1")]].sort((x, y) => x - y));
    });
  }
});

describe("the paginator itself", () => {
  const zone = (key: string): StationeryZone => ({ key, label: key, surface: "lined", weight: 1 });
  it("sections that fit are placed exactly as before (no split metadata, no extra pages)", () => {
    const reqs: ZoneRequest[] = [{ zone: zone("a"), overheadIn: 0.3, lines: 5 }, { zone: zone("b"), overheadIn: 0.3, lines: 5 }];
    const out = paginateZones(reqs, () => 10, 0.2, 0.3, { flow: true });
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].every((r) => !r.piece)).toBe(true);
  });
  it("never shrinks a unit and never splits mid-unit: a unit taller than a page is reported as overflow", () => {
    const z = zone("big");
    const r: ZoneRequest = { zone: z, overheadIn: 0, contentIn: 12, split: { unit: "record", count: 1, minFirst: 1, minLast: 1, policy: "flow", piece: (from, to) => ({ zone: z, overheadIn: 0, contentIn: 12 * (to - from) }) } };
    const out = paginateZones([r], () => 8, 0.2, 0.3, { flow: true });
    expect(out.overflow).toBe(true);
    expect(out.pages).toHaveLength(1);
  });
});

describe("font safety", () => {
  it("a required font that failed to load blocks export, naming the font", () => {
    const r = exportReadiness({ fontsReady: true, browserFonts: "loaded", docMeasurerId: "canvas:x", currentMeasurerId: "canvas:x", failedFonts: ["Playfair Display"] });
    expect(r.ready).toBe(false);
    expect(!r.ready && r.reason).toContain("Playfair Display");
  });
});
