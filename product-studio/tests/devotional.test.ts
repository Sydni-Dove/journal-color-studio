/**
 * Phase 5 — a devotional printed from saved entries. The entries live in a
 * content list (ProductProject.data); a book section repeats once per entry;
 * its pages' sections name the fields they print (engines/data/bind.ts); the
 * shared paginator continues long entries across pages.
 *
 * Every check reads the solved pages — what preview and print draw — and the
 * sample entries are made of unique tokens, so each word is traced to the
 * section it prints in.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { bindPromptSet, fillTemplate, entryValues } from "../src/engines/data/bind";
import { addCollection, addRecord, moveRecord, setValue } from "../src/engines/data/data";
import { DEVOTIONAL_STRUCTURES, matchRoles, withDevotionalStructure } from "../src/presets/devotionalStructures";
import { step } from "../src/presets/bookRecipes";
import { sampleData, sampleDevotional, sampleEntry, sizeOf, type DevotionalOpts } from "./fixtures/devotionalSamples";
import type { LayoutNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";

const BLOCK_OF: Record<string, string> = { scr: "dev-scripture", tea: "dev-teaching", que: "dev-questions", pra: "dev-prayer", app: "dev-application" };
const ORDER = ["scr", "tea", "que", "pra", "app"];
const TOKEN = /e(\d+)(scr|tea|que|pra|app|tit)(\d{4})/g;
const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");

function solveAll(p: ProductProject) {
  const doc = resolveDocument(p);
  return { doc, pages: doc.recipe.pages.map((pg, i) => ({ pg, i, s: solvePage(doc, i), g: geometryFor(doc, pg) })) };
}

/** The words each section of entry e should print, in order. */
function expectedTokens(days: number, size?: Parameters<typeof sampleEntry>[1]): string[] {
  const out: string[] = [];
  for (let e = 0; e < days; e++) {
    const v = sampleEntry(e, size ?? sizeOf(e));
    const field: Record<string, string> = { scr: v.scripture as string, tea: v.reading as string, que: v.questions as string, pra: v.prayer as string, app: v.action as string };
    for (const code of ORDER) out.push(...(field[code].match(TOKEN) ?? []));
  }
  return out;
}

/** The content checks every devotional must pass. */
function checkDevotional(o: DevotionalOpts) {
  const label = `${o.days} days · ${o.structure ?? "flowing"} · ${o.sizePreset ?? "6x9"} ${o.orientation ?? "portrait"} · ${o.binding ?? "perfect-bound"}`;
  const p = sampleDevotional(o);
  const dataBefore = JSON.stringify(p.data);
  const { doc, pages } = solveAll(p);
  expect(doc.recipe.diagnostics.filter((d) => d.severity === "error"), label).toEqual([]);
  expect(doc.resolveNotes, label).toEqual([]);

  // Every word once, in entry order, each section in its place; each word printed in its own section.
  const printed: string[] = [];
  const firstPageOf = new Map<number, number>();
  for (const { pg, s } of pages) {
    expect(pg.pageNumber, label).toBe(pages.indexOf(pages.find((x) => x.pg === pg)!) + 1);
    expect(pg.side, `${label} p${pg.pageNumber}`).toBe(pg.pageNumber % 2 === 1 ? "recto" : "verso");
    if (pg.filler) {
      expect(pg.fillerReason, label).toBeTruthy();
      expect(s.nodes.map(textOf).join(" "), `${label} filler p${pg.pageNumber} prints no entry text`).not.toMatch(TOKEN);
      continue;
    }
    expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.rule}: ${d.message}`), `${label} p${pg.pageNumber}`).toEqual([]);
    const headings = new Set<string>();
    const bodies = new Set<string>();
    for (const n of s.nodes) {
      if (n.type !== "text") continue;
      const t = textOf(n);
      const hm = /-(dev-[a-z]+)-heading-title$/.exec(n.id);
      if (hm) headings.add(hm[1]);
      for (const m of t.matchAll(TOKEN)) {
        if (m[2] === "tit") {
          if (!firstPageOf.has(+m[1])) firstPageOf.set(+m[1], pg.pageNumber);
          continue; // the title is the page title (repeated on continued pages)
        }
        expect(n.id, `${label}: "${m[0]}" prints in its own section`).toContain(`-${BLOCK_OF[m[2]]}-`);
        bodies.add(BLOCK_OF[m[2]]);
        printed.push(m[0]);
      }
    }
    // A section heading never ends a page without its text.
    for (const h of headings) expect(bodies.has(h), `${label} p${pg.pageNumber}: heading of ${h} kept with its text`).toBe(true);
  }
  const expected = expectedTokens(o.days, o.size);
  expect(printed.length, `${label}: words printed`).toBe(expected.length);
  expect(printed, label).toEqual(expected);
  // Every entry has pages, in list order, starting with its title.
  expect([...firstPageOf.keys()], label).toEqual(Array.from({ length: o.days }, (_, e) => e));
  // Nothing printed outside the print-safe area.
  for (const { pg, s, g } of pages) for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(g.safeRect, n.rect), `${label} p${pg.pageNumber} ${n.id}`).toBe(true);
  // Printing never changes the entries.
  expect(JSON.stringify(p.data), label).toBe(dataBefore);
  return { doc, pages, firstPageOf };
}

describe("binding an entry to a page's sections", () => {
  const { data, collectionId } = sampleData(3);
  const c = data.collections[0];
  it("templates read the entry's values; {#} is its place; {a|b} falls back", () => {
    const v = entryValues(c, c.records[1], 1);
    expect(fillTemplate("Day {day|#}: {title}", v)).toBe("Day 2: e1tit0000 e1tit0001");
    expect(fillTemplate("Entry {#}", v)).toBe("Entry 2");
    expect(fillTemplate("{missing|#}", v)).toBe("2");
    expect(collectionId).toBe(c.id);
  });
  it("each bound section prints exactly its field's value; an empty value leaves the section out; unbound sections are untouched", () => {
    const set = DEVOTIONAL_STRUCTURES[0].build(c.id, matchRoles(c).map)[0];
    const pageSet = set.kind === "group" && set.children[0].kind === "step" ? set.children[0].promptSet! : null;
    const empty = setValue(data, c.id, c.records[0].id, "prayer", "").collections[0];
    const bound = bindPromptSet(pageSet!, empty, empty.records[0], 0);
    expect(bound.blocks.some((b) => b.id === "dev-prayer" || b.id === "dev-prayer-heading")).toBe(false);
    expect(bound.blocks.find((b) => b.id === "dev-teaching")!.prompt).toBe(sampleEntry(0).reading);
    expect(bound.blocks.find((b) => b.id === "dev-questions")!.items!.map((i) => i.text)).toEqual((sampleEntry(0).questions as string).split("\n"));
    expect(bound.blocks.find((b) => b.id === "dev-next-step")).toEqual(pageSet!.blocks.find((b) => b.id === "dev-next-step"));
  });
  it("questions their writer already numbered print as written (no second number)", () => {
    const set = { blocks: [{ id: "q", kind: "list" as const, label: "Reflect", listMarker: "number" as const, content: { mode: "field" as const, key: "questions" } }] };
    const numbered = setValue(data, c.id, c.records[0].id, "questions", "1. First question?\n2. Second question?").collections[0];
    const b = bindPromptSet(set, numbered, numbered.records[0], 0).blocks;
    expect(b.map((x) => [x.kind, x.textStyle, x.label, x.prompt])).toEqual([["heading", undefined, "Reflect", undefined], ["heading", "body", "", "1. First question?\n2. Second question?"]]);
  });
  it("structures match roles by field key or label, and report fields they don't print", () => {
    const { data: d2, id } = addCollection(undefined, "Lent", [
      { key: "num", label: "Day", valueType: "number" }, { key: "theme", label: "Theme", valueType: "text" }, { key: "verse", label: "Key verse", valueType: "longText" },
      { key: "message", label: "Message", valueType: "longText" }, { key: "author", label: "Guest author", valueType: "text" },
    ]);
    const { map, unused } = matchRoles(d2.collections.find((x) => x.id === id)!);
    expect(map).toEqual({ day: "num", title: "theme", scripture: "verse", teaching: "message" });
    expect(unused.map((f) => f.label)).toEqual(["Guest author"]);
  });
});

describe("a devotional from saved entries", () => {
  it("7 days, every structure: every word once, in order, in its own section", () => {
    for (const s of DEVOTIONAL_STRUCTURES) checkDevotional({ days: 7, structure: s.id });
  });

  it("each day starts on a right-hand page: intentional, labelled notes pages fill the gaps", () => {
    const { pages, firstPageOf } = checkDevotional({ days: 7, structure: "right-hand" });
    for (const pageNo of firstPageOf.values()) expect(pageNo % 2, `day starting on p${pageNo}`).toBe(1);
    expect(pages.some(({ pg }) => pg.filler)).toBe(true);
  });

  it("40 days on several page sizes, orientations and bindings", () => {
    for (const o of [
      { sizePreset: "6x9" }, { sizePreset: "5.5x8.5" }, { sizePreset: "8.5x11" }, { sizePreset: "8.5x11", orientation: "landscape" as const },
      { sizePreset: "6x9", binding: "coil", profile: "coil-generic" }, { sizePreset: "8.5x11", profile: "lulu" },
    ])
      checkDevotional({ days: 40, ...o });
  });

  it("365 days: every word once, in order; one section per entry, keyed by the entry's stable id", () => {
    const { doc } = checkDevotional({ days: 365 });
    const ids = new Set(doc.recipe.pages.filter((p) => p.period.kind === "entry").map((p) => (p.period.kind === "entry" ? p.period.recordId : "")));
    expect(ids.size).toBe(365);
    expect(new Set(doc.recipe.pages.map((p) => p.key)).size).toBe(doc.recipe.pages.length);
  }, 120_000);

  it("only very long entries continue onto extra pages; short ones don't", () => {
    const short = solveAll(sampleDevotional({ days: 3, size: "short" })).doc.recipe.pages.filter((p) => !p.filler).length;
    const long = solveAll(sampleDevotional({ days: 3, size: "long" })).doc.recipe.pages.filter((p) => !p.filler).length;
    expect(short).toBeLessThan(long);
    expect(long / 3).toBeGreaterThan(3);
  });
});

describe("content and structure stay separate", () => {
  it("a different structure, page size or binding prints the same entries without re-entering anything", () => {
    const base = sampleDevotional({ days: 10 });
    const c = base.data.collections[0];
    for (const [structure, size] of [["reading-journal", "8.5x11"], ["right-hand", "5.5x8.5"], ["flowing", "a5"]] as const) {
      const p: ProductProject = { ...base, dimensions: { ...base.dimensions, sizePresetId: size }, recipe: { ...base.recipe, structure: withDevotionalStructure(base.recipe.structure, structure, c) } };
      const words = solveAll(p).pages.flatMap(({ s }) => s.nodes.map(textOf).join(" ").match(TOKEN) ?? []).filter((w) => !w.includes("tit"));
      expect(words, `${structure} ${size}`).toEqual(expectedTokens(10));
      expect(p.data).toBe(base.data);
    }
  });

  it("reordering entries reorders their pages; editing one entry never re-keys another's pages", () => {
    const p = sampleDevotional({ days: 5 });
    const c = p.data.collections[0];
    const keysOf = (q: ProductProject) => resolveDocument(q).recipe.pages.map((pg) => pg.key);
    const before = keysOf(p);
    const moved = { ...p, data: moveRecord(p.data, c.id, 4, 0) };
    const order = resolveDocument(moved).recipe.pages.filter((pg) => pg.flowPart === undefined || pg.flowPart === 0).map((pg) => (pg.period.kind === "entry" ? pg.period.recordId : ""));
    expect(order).toEqual([c.records[4].id, ...c.records.slice(0, 4).map((r) => r.id)]);
    const edited = { ...p, data: setValue(p.data, c.id, c.records[2].id, "title", "A new title") };
    const after = keysOf(edited);
    expect(after.filter((k) => !k.includes(c.records[2].id))).toEqual(before.filter((k) => !k.includes(c.records[2].id)));
  });

  it("the cover and back cover around the days are kept when a structure is chosen", () => {
    const { data } = sampleData(2);
    const c = data.collections[0];
    const current = [step("cover-page", { type: "once" }), step("lined-journal", { type: "copies", count: 3 }), step("back-cover", { type: "once" })];
    const next = withDevotionalStructure(current, "flowing", c);
    expect(next.map((n) => (n.kind === "step" ? n.module : "days"))).toEqual(["cover-page", "days", "back-cover"]);
  });

  it("a list that was deleted, or has no entries, is reported — never a silent empty book", () => {
    const { data } = sampleData(0);
    const p = sampleDevotional({ days: 1 });
    expect(resolveDocument({ ...p, data }).recipe.diagnostics.map((d) => d.severity)).toContain("error");
    const empty = { ...p, data: { ...p.data, collections: [{ ...p.data.collections[0], records: [] }] } };
    expect(resolveDocument(empty).recipe.diagnostics.map((d) => d.severity)).toContain("warning");
    expect(addRecord).toBeTypeOf("function");
  });
});
