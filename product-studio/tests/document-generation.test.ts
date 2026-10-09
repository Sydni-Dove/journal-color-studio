/**
 * Phase 8 — AI document generation. One pipeline for every document: the AI's
 * answer (the strict document specification) is checked, the maker's outline
 * becomes an ordinary product made of the studio's own components, and the
 * studio's engines measure, paginate and draw it. Every check reads solved pages.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSpec, SpecError, unplacedContent, type DocSpec } from "../src/engines/generate/spec";
import { projectFromSpec } from "../src/engines/generate/convert";
import { buildFromOutline, printLimits } from "../src/engines/generate/pipeline";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { migrate } from "../src/persistence/projectStore";
import { setValue } from "../src/engines/data/data";
import { REQUESTS, DEVOTIONAL_CONTENT, part, section } from "./fixtures/aiSpecs";
import type { LayoutNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";

const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
function solveAll(p: ProductProject) {
  const doc = resolveDocument(p);
  return { doc, pages: doc.recipe.pages.map((pg, i) => ({ pg, i, s: solvePage(doc, i), g: geometryFor(doc, pg) })) };
}
const build = (id: string) => {
  const r = REQUESTS.find((x) => x.id === id)!;
  const checked = checkSpec(JSON.stringify(r.spec), { description: r.description, content: r.content ?? "" });
  return { r, checked, project: projectFromSpec(checked) };
};
const clone = (s: DocSpec): DocSpec => JSON.parse(JSON.stringify(s));

describe("one pipeline for every kind of document", () => {
  for (const r of REQUESTS) {
    it(`${r.id}: checked, built from the studio's components, laid out and printed with no errors; page titles print`, () => {
      const { checked, project } = build(r.id);
      expect(checked.problems.filter((p) => p.level === "left-out")).toEqual([]);
      const { doc, pages } = solveAll(project);
      expect(doc.recipe.diagnostics.filter((d) => d.severity === "error"), r.id).toEqual([]);
      expect(pages.length).toBeGreaterThan(0);
      // Only the shared guided page draws generated pages (plus labelled fillers): no separate renderer.
      expect(new Set(pages.filter((x) => !x.pg.filler).map((x) => x.pg.layoutId))).toEqual(new Set(["guided-page"]));
      for (const { pg, s, g } of pages) {
        if (pg.filler) continue;
        expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => d.message), `${r.id} p${pg.pageNumber}`).toEqual([]);
        for (const n of s.nodes) if (n.type === "text" && n.functional) expect(rectContains(g.safeRect, n.rect), `${r.id} p${pg.pageNumber} ${n.id}`).toBe(true);
      }
      // Each kind of page prints its title (a generated page is never a title-less "custom" page).
      for (const sec of checked.spec.sections) {
        const first = pages.find(({ pg }) => pg.recipeItemId === `gen-${sec.id}` && !pg.filler);
        if (!first) continue;
        const printed = first.s.nodes.map(textOf).join(" ");
        if (!sec.title.includes("{")) expect(printed, `${r.id}: “${sec.title}” prints`).toContain(sec.title);
      }
      // Its page setup is what was proposed.
      expect(project.dimensions.sizePresetId).toBe(r.spec.page.size);
      expect(project.dimensions.orientation).toBe(r.spec.page.orientation);
    });
  }

  it("the maker's own devotional days print exactly as written, once each, in order — in their sections, from a content list", () => {
    const { checked, project } = build("devotional");
    expect(checked.spec.entries?.source).toBe("user");
    expect(checked.unplaced).toEqual([]); // every line placed — the day headings print as each day's page title
    expect(project.data?.collections[0].records).toHaveLength(3);
    const printed = squash(solveAll(project).pages.flatMap(({ s }) => s.nodes.map(textOf)).join(" "));
    for (const line of DEVOTIONAL_CONTENT.split("\n").filter((l) => !/^Day \d+:/.test(l))) {
      const at = printed.indexOf(squash(line));
      expect(at, line).toBeGreaterThanOrEqual(0);
      expect(printed.indexOf(squash(line), at + 1), `${line} printed once`).toBe(-1);
    }
    expect(printed).toMatch(/Day 1: Morning Light.*Day 2: Small Faithfulness.*Day 3: Rest as Obedience/);
    expect(printed).not.toContain("Your content"); // nothing left over to repeat
  });

  it("long wording of the maker's flows across pages: every word once, in order", () => {
    const words = Array.from({ length: 800 }, (_, i) => `w${String(i).padStart(4, "0")}`);
    const content = words.map((w, i) => (i % 12 === 11 ? `${w}.` : w)).join(" ");
    const spec: DocSpec = { title: "Long", summary: "", page: { size: "6x9", orientation: "portrait", binding: "book", why: "" }, entries: null, notes: [], sections: [section("s", "Reading", [part("text", { text: content, source: "user" })])] };
    const checked = checkSpec(spec, { description: "Print my reading", content });
    expect(checked.spec.sections[0].components[0].source).toBe("user");
    expect(checked.unplaced).toEqual([]);
    const got = solveAll(projectFromSpec(checked)).pages.flatMap(({ s }) => s.nodes.map(textOf).join(" ").match(/w\d{4}/g) ?? []);
    expect(got).toEqual(words);
  });
});

describe("the AI's answer is checked, never trusted", () => {
  const base = () => clone(REQUESTS.find((x) => x.id === "workbook")!.spec);
  it.each([
    ["not JSON", "Sure! Here is your document: {title:"],
    ["an array", "[1,2,3]"],
    ["no sections", JSON.stringify({ title: "x", sections: [] })],
  ])("%s → refused with a plain message", (_name, raw) => {
    expect(() => checkSpec(raw, { description: "a planner please" })).toThrow(SpecError);
  });
  it("nothing printable at all → refused", () => {
    const s = base();
    s.sections = [section("x", "Charts", [{ ...part("divider"), kind: "chart" as never }])];
    expect(() => checkSpec(s, { description: "charts" })).toThrow(/Nothing in the AI's outline/);
  });
  it("unsupported components are left out and said, the rest kept", () => {
    const s = base();
    s.sections[0].components.push({ ...part("text", { text: "x" }), kind: "image" as never }, { ...part("text", { text: "=SUM(A1:A9)" }), kind: "formula" as never });
    const c = checkSpec(s, { description: "plan" });
    expect(c.problems.filter((p) => p.level === "left-out").map((p) => p.message).join(" ")).toMatch(/“image” isn't something the studio prints.*“formula”/);
    expect(c.spec.sections[0].components).toHaveLength(2);
  });
  it("invalid repetition is adjusted and said: per-entry without entries, impossible copy counts, entry fields that don't exist", () => {
    const s = base();
    s.sections[0].repeat = { mode: "per-entry", count: 1 };
    s.sections[1].repeat = { mode: "copies", count: 0 };
    s.sections[4].repeat = { mode: "copies", count: 9999 };
    s.sections[2].components[0].fromEntryField = "nope";
    const c = checkSpec(s, { description: "plan" });
    expect(c.spec.sections.map((x) => x.repeat)).toEqual([{ mode: "once", count: 1 }, { mode: "copies", count: 1 }, { mode: "once", count: 1 }, { mode: "once", count: 1 }, { mode: "copies", count: 500 }]);
    expect(c.spec.sections[2].components[0].fromEntryField).toBeNull();
    expect(c.problems.filter((p) => p.level === "adjusted")).toHaveLength(4);
  });
  it("a count that comes with a once or per-entry section is ignored quietly (only copies have a count)", () => {
    const s = base();
    for (const x of s.sections) x.repeat = { mode: "once", count: 0 };
    expect(checkSpec(s, { description: "plan" }).problems.filter((p) => p.level === "adjusted")).toEqual([]);
  });
  it("one page per entry with no entries given (a log to fill in by hand) → blank copies, the entry's fields become places to write", () => {
    const s: DocSpec = {
      title: "Garden Journal", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "spiral", why: "" }, notes: [],
      entries: { name: "Plants", source: "suggested", records: [], fields: [{ key: "variety", label: "Variety", valueType: "text" }, { key: "planted", label: "Date planted", valueType: "date" }] },
      sections: [section("plant", "Plant Record {#}: {variety}", [part("heading", { fromEntryField: "variety" }), part("text", { fromEntryField: "planted" }), part("writing", { label: "Notes", lines: 8 })], { repeat: { mode: "per-entry", count: 20 } })],
    };
    const c = checkSpec(s, { description: "A garden journal with a page for each plant." });
    const [sec] = c.spec.sections;
    expect(sec.repeat).toEqual({ mode: "copies", count: 20 });
    expect(sec.title).toBe("Plant Record");
    expect(sec.components.map((x) => [x.kind, x.fields.map((f) => f.label).join(), x.fromEntryField])).toEqual([["fields", "Variety", null], ["fields", "Date planted", null], ["writing", "", null]]);
    expect(c.spec.entries).toBeNull();
    expect(c.problems.map((p) => p.message).join(" ")).toMatch(/no entries were given, so it prints 20 blank copies/);
    const out = buildFromOutline(c.spec, "", c);
    expect(resolveDocument(out.project).recipe.pageCount).toBeGreaterThanOrEqual(20);
    // Not a devotional: the assistant doesn't offer devotional designs.
    expect(out.review.alternatives.filter((a) => a.id.startsWith("devotional:"))).toEqual([]);
  });
  it("impossible page setup is adjusted and said", () => {
    const s = base() as unknown as { page: Record<string, string> };
    s.page = { size: "11x17", orientation: "diagonal", binding: "glue", why: "" };
    const c = checkSpec(s, { description: "plan" });
    expect(c.spec.page).toMatchObject({ size: "8.5x11", orientation: "portrait", binding: "loose" });
    expect(c.problems.map((p) => p.message).join(" ")).toMatch(/isn't one the studio prints.*binding isn't one the studio prints/);
  });
  it("conflicting instructions: the AI's reading is shown to the maker (notes), and its page choice can be changed before creating", () => {
    const s = base();
    s.notes = ["You asked for both landscape and portrait pages; the planning table is landscape-friendly, so landscape was chosen."];
    s.page.orientation = "landscape";
    const c = checkSpec(s, { description: "A workbook in portrait. Make the pages landscape." });
    expect(c.spec.notes).toEqual(s.notes);
    const edited = { ...c.spec, page: { ...c.spec.page, orientation: "portrait" as const } };
    expect(buildFromOutline(edited, "", c).project.dimensions.orientation).toBe("portrait");
  });
});

describe("whose words: the maker's are exact, the AI's are suggestions", () => {
  it("wording marked as the maker's but not word for word what they wrote becomes a suggestion (and says so)", () => {
    const r = REQUESTS.find((x) => x.id === "devotional")!;
    const s = clone(r.spec);
    s.entries!.records[0].values[3].value = "Morning light reaches the kitchen first."; // paraphrased
    const c = checkSpec(s, { description: r.description, content: r.content });
    expect(c.spec.entries!.source).toBe("suggested");
    expect(c.problems.some((p) => /isn't word for word/.test(p.message))).toBe(true);
    const s2 = clone(r.spec);
    s2.sections[0].components.push(part("text", { text: "Be still and know.", source: "user" }));
    expect(checkSpec(s2, { description: r.description, content: r.content }).spec.sections[0].components.at(-1)!.source).toBe("suggested");
  });
  it("with no content of the maker's, AI wording mislabeled as theirs is a suggestion, without a note per part; with content, one note for all", () => {
    const s = clone(REQUESTS.find((x) => x.id === "workbook")!.spec);
    for (const x of s.sections) for (const c of x.components) c.source = "user";
    const quiet = checkSpec(s, { description: "A business planning workbook." });
    expect(quiet.spec.sections.flatMap((x) => x.components).every((c) => c.source === "suggested")).toBe(true);
    expect(quiet.problems.filter((p) => /word for word/.test(p.message))).toEqual([]);
    const said = checkSpec(s, { description: "A business planning workbook.", content: "My business is a bakery." });
    expect(said.problems.filter((p) => /word for word/.test(p.message))).toHaveLength(1);
  });
  it("the maker's content the outline didn't place is kept word for word on a “Your content” page — nothing dropped, nothing duplicated", () => {
    const content = "Bring a pencil.\nPhones off during class.\nLate arrivals sit at the back.";
    const spec: DocSpec = { title: "Class Handout", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "loose", why: "" }, entries: null, notes: [], sections: [section("s", "Class Notes", [part("text", { label: "Before class", text: "Bring a pencil.", source: "user" }), part("writing", { label: "Notes", lines: 10 })])] };
    const c = checkSpec(spec, { description: "A class handout with my rules", content });
    expect(c.unplaced).toEqual(["Phones off during class.", "Late arrivals sit at the back."]);
    const printed = squash(solveAll(projectFromSpec(c)).pages.flatMap(({ s }) => s.nodes.map(textOf)).join(" "));
    for (const line of content.split("\n")) expect(printed.split(line).length - 1, line).toBe(1);
    expect(printed).toContain("Your content");
  });
  it("removing the maker's part in review puts that wording back on the “Your content” page", () => {
    const content = "Bring a pencil.";
    const spec: DocSpec = { title: "H", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "loose", why: "" }, entries: null, notes: [], sections: [section("s", "Notes", [part("text", { text: "Bring a pencil.", source: "user" }), part("writing", { lines: 8 })])] };
    const c = checkSpec(spec, { description: "handout", content });
    const edited = { ...c.spec, sections: [{ ...c.spec.sections[0], components: c.spec.sections[0].components.slice(1) }] };
    expect(unplacedContent(edited, content)).toEqual(["Bring a pencil."]);
  });
});

describe("unverified references and compliance claims are flagged", () => {
  it("a claim of legal / regulatory compliance is flagged; AI-supplied references are flagged; the maker's own references aren't", () => {
    const { checked } = build("intake");
    expect(checked.flags.filter((x) => x.kind === "compliance").map((x) => x.text)).toEqual(["This form is HIPAA compliant and meets all state cosmetology requirements."]);
    const dev = build("devotional").checked;
    expect(dev.flags).toEqual([]); // the Scripture references are the maker's own
    const s = clone(REQUESTS.find((x) => x.id === "workbook")!.spec);
    s.sections[0].components.push(part("text", { text: "As Proverbs 16:3 says, commit your work to the Lord. See https://example.com/plan." }));
    expect(checkSpec(s, { description: "plan" }).flags.map((x) => x.kind)).toEqual(["reference"]);
  });
});

describe("the generated document is an ordinary, editable product", () => {
  it("saves and reloads as any product (migrate), edits change the printed pages, entries stay in Your content", () => {
    const { project } = build("devotional");
    const reloaded = migrate(JSON.parse(JSON.stringify(project)))!;
    expect(reloaded.recipe.structure).toEqual(project.recipe.structure);
    expect(reloaded.data).toEqual(project.data);
    const c = reloaded.data!.collections[0];
    const edited = { ...reloaded, data: setValue(reloaded.data, c.id, c.records[1].id, "title", "Faithful in Little") };
    const printed = solveAll(edited).pages.flatMap(({ s }) => s.nodes.map(textOf)).join(" ");
    expect(printed).toContain("Day 2: Faithful in Little");
  });
  it("its fit is measured with the Smart Layout Assistant; a cramped proposal gets better-fitting alternatives", () => {
    const r = REQUESTS.find((x) => x.id === "inventory")!;
    const s = clone(r.spec);
    s.page = { ...s.page, size: "5.5x8.5", orientation: "portrait" };
    s.sections[0].components[1].fields.push({ label: "Location", valueType: "text" }, { label: "Last counted", valueType: "date" });
    const c = checkSpec(s, { description: r.description });
    const out = buildFromOutline(c.spec, "", c);
    expect(out.review.findings.length).toBeGreaterThan(0);
    expect(out.review.alternatives.length).toBeGreaterThan(0);
    for (const a of out.review.alternatives) {
      const next = a.apply(out.project);
      const errs = solveAll(next).pages.flatMap(({ s: sp }) => sp.diagnostics.filter((d) => d.severity === "error"));
      expect(errs, a.id).toEqual([]);
    }
  });
});

describe("text with its own heading", () => {
  it("prints the heading as a section heading kept with its text (not as a line of body text)", () => {
    const { project } = build("intake");
    const step = project.recipe.structure!.find((n) => n.kind === "step")!;
    const blocks = step.kind === "step" ? step.promptSet!.blocks : [];
    const i = blocks.findIndex((b) => b.label === "Consent");
    expect(blocks[i]).toMatchObject({ kind: "heading", label: "Consent" });
    expect(blocks[i].textStyle).toBeUndefined();
    expect(blocks[i + 1]).toMatchObject({ kind: "heading", textStyle: "body", label: "", prompt: expect.stringMatching(/^This form is HIPAA/) });
  });
});

describe("printer limits are shown before creating, with bindings that work", () => {
  it("a 3-day devotional as a bound book is too short for perfect binding: said plainly; spiral and loose pages are offered, and print", () => {
    const { checked } = build("devotional");
    const out = buildFromOutline(checked.spec, DEVOTIONAL_CONTENT, checked);
    expect(out.limits.join(" ")).toMatch(/needs at least 24 pages; this document has \d+/);
    expect(out.bindings).toContain("spiral");
    expect(out.bindings).toContain("loose");
    for (const b of out.bindings) {
      const next = buildFromOutline({ ...checked.spec, page: { ...checked.spec.page, binding: b } }, DEVOTIONAL_CONTENT, checked);
      expect(next.limits, b).toEqual([]);
      expect(printLimits(next.project)).toEqual([]);
    }
  });
});

describe("the Edge Function and the studio use the same answer format", () => {
  it("schema.json is the studio's docSpecSchema.json", () => {
    const a = readFileSync(new URL("../src/engines/generate/docSpecSchema.json", import.meta.url), "utf8");
    const b = readFileSync(new URL("../../supabase/functions/generate-document/schema.json", import.meta.url), "utf8");
    expect(JSON.parse(b)).toEqual(JSON.parse(a));
  });
  it("every fixture answer has exactly the schema's properties (what strict structured outputs return)", () => {
    const schema = JSON.parse(readFileSync(new URL("../src/engines/generate/docSpecSchema.json", import.meta.url), "utf8"));
    const compKeys = Object.keys(schema.properties.sections.items.properties.components.items.properties).sort();
    for (const r of REQUESTS) {
      expect(Object.keys(r.spec).sort()).toEqual([...schema.required].sort());
      for (const s of r.spec.sections) for (const c of s.components) expect(Object.keys(c).sort()).toEqual(compKeys);
    }
  });
});

describe("a maker's own devotional day (from a live run): their words once, typed blanks as writing lines, paragraph space", () => {
  const content = [
    "DAY 1 — Turn Aside",
    "Read: Exodus 3:1-6",
    "Welcome to Day 1. Today is about awareness.",
    "In Exodus 3, Moses was not searching for a spiritual experience.",
    "What I turned aside to look at today: ___",
    "What I sensed God saying: ___",
  ].join("\n");
  const spec: DocSpec = {
    title: "Drawing Near", summary: "", page: { size: "6x9", orientation: "portrait", binding: "spiral", why: "" }, entries: null, notes: [],
    sections: [section("day1", "Day 1 — Turn Aside", [
      part("text", { label: "Read", text: "Exodus 3:1-6", source: "user" }),
      part("text", { text: "Welcome to Day 1. Today is about awareness.\nIn Exodus 3, Moses was not searching for a spiritual experience.", source: "user" }),
      part("writing", { label: "Execution Log", text: "What I turned aside to look at today: ___\nWhat I sensed God saying: ___", source: "user", lines: 6 }),
    ], { repeat: { mode: "copies", count: 30 } })],
  };
  const c = checkSpec(spec, { description: "A 30-day devotional from my Day 1.", content });
  it("a page of the maker's wording isn't printed 30 times — once, and said", () => {
    expect(c.spec.sections[0].repeat).toEqual({ mode: "once", count: 1 });
    expect(c.problems.map((p) => p.message).join(" ")).toMatch(/holds your own wording, so it prints once/);
  });
  it("“Read: Exodus 3:1-6” placed as a part headed Read is placed (no duplicate on a Your content page)", () => {
    expect(c.unplaced).toEqual(["DAY 1 — Turn Aside"]);
  });
  it("typed blanks (___) become writing lines under the maker's words; paragraphs get space between them", () => {
    const { pages } = solveAll(projectFromSpec(c));
    const texts = pages.flatMap(({ s }) => s.nodes.map(textOf)).filter(Boolean);
    const all = squash(texts.join(" "));
    expect(all).not.toMatch(/___/);
    expect(all).toContain("What I turned aside to look at today:");
    expect(all).toContain("What I sensed God saying:");
    const blocks = projectFromSpec(c).recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks ?? [] : []));
    expect(blocks.filter((b) => b.prompt?.startsWith("What I")).map((b) => [b.lineCount, b.space])).toEqual([[2, "fixed"], [2, "fixed"]]);
    expect(blocks.find((b) => b.prompt?.startsWith("Welcome"))!.prompt).toBe("Welcome to Day 1. Today is about awareness.\n\nIn Exodus 3, Moses was not searching for a spiritual experience.");
  });
});
