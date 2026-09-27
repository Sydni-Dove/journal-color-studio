/**
 * Prompt + response (types/prompts.ts, layouts/shared/promptPages.ts):
 * 0 / 1 / many prompts · same and custom line counts · add / remove · long
 * wording · answer styles · trims · continuation pages · fewer lines first ·
 * preview = print · migration of plain prompt lists and older customizations.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { plainIssue } from "../src/components/help/plainIssues";
import type { LayoutNode, SolvedPage } from "../src/types/layout";
import type { PromptBlock, PromptSet } from "../src/types/prompts";
import type { StationeryCustomization } from "../src/types/stationery";

type Lines = Extract<LayoutNode, { type: "lines" }>;
const blocks = (labels: string[], extra: Partial<PromptBlock> = {}): PromptBlock[] => labels.map((label, i) => ({ id: `q${i + 1}`, label, ...extra }));

function guided(set: PromptSet | undefined, size = "8.5x11", prompts?: string[]) {
  const st = { ...step("meeting-with-god"), layoutId: "guided-page", cadence: { type: "once" } as never, ...(set ? { promptSet: set } : {}), ...(prompts ? { prompts } : {}) };
  return createProject("journal", { name: "G", dimensions: { sizePresetId: size, orientation: "portrait" }, recipe: { items: [], ordering: "sequential", structure: [st] } as never });
}
function recipe(comboId: string, custom: StationeryCustomization, size = "8.5x11") {
  return createProject(comboId.startsWith("worksheet") ? "worksheet" : "devotional", {
    name: "R",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [{ id: "page", layoutId: `stationery:${comboId}`, repeat: { kind: "count", count: 1 } }], ordering: "sequential" },
    layoutOptions: { stationery: { [comboId]: custom } },
  });
}
/** The solved pages of the prompt layout (a page and its continuation pages). */
function solved(p: ReturnType<typeof guided>, layoutId = "guided-page"): SolvedPage[] {
  const doc = resolveDocument(p);
  return doc.recipe.pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => pg.layoutId === layoutId || pg.layoutId.startsWith("stationery:")).map(({ i }) => solvePage(doc, i));
}
const lineCounts = (pages: SolvedPage[]) => pages.flatMap((s) => s.nodes.filter((n): n is Lines => n.type === "lines" && n.component === "WritingLines").map((n) => n.positions.length));
/** Prompt headings (not the date line's labels). */
const headings = (pages: SolvedPage[]) => pages.flatMap((s) => s.nodes.filter((n) => n.type === "text" && n.component === "SectionHeader" && n.id.endsWith("-title")).map((n) => (n.type === "text" ? n.text : "")));
const errors = (pages: SolvedPage[]) => pages.flatMap((s) => s.diagnostics.filter((d) => d.severity === "error"));

describe("prompt count", () => {
  it("zero prompts: one open writing area under the title", () => {
    const pages = solved(guided({ blocks: [] }));
    expect(pages).toHaveLength(1);
    expect(headings(pages)).toEqual([]);
    expect(lineCounts(pages)).toHaveLength(1);
    expect(errors(pages)).toEqual([]);
  });
  it("one prompt, and many prompts — any number, no fixed count", () => {
    expect(headings(solved(guided({ blocks: blocks(["What did God say?"]) })))).toEqual(["What did God say?"]);
    const seven = blocks(["A", "B", "C", "D", "E", "F", "G"]);
    expect(headings(solved(guided({ blocks: seven })))).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });
  it("adding and removing prompts changes the page", () => {
    const three = blocks(["One", "Two", "Three"]);
    expect(headings(solved(guided({ blocks: three })))).toHaveLength(3);
    expect(headings(solved(guided({ blocks: [...three, { id: "q4", label: "Four" }] })))).toHaveLength(4);
    expect(headings(solved(guided({ blocks: three.filter((b) => b.id !== "q2") })))).toEqual(["One", "Three"]);
  });
  it("wording is content: changing it never changes the page type", () => {
    for (const label of ["What did God say?", "What stood out to me?", "Key lesson"]) {
      const doc = resolveDocument(guided({ blocks: [{ id: "q1", label }] }));
      expect(doc.recipe.pages.map((p) => p.layoutId)).toEqual(["guided-page"]);
      expect(headings([solvePage(doc, 0)])).toEqual([label]);
    }
  });
});

describe("writing lines", () => {
  it("same number of lines for every prompt", () => {
    expect(lineCounts(solved(guided({ blocks: blocks(["A", "B", "C", "D"]), sameLines: 5 })))).toEqual([5, 5, 5, 5]);
  });
  it("custom lines per prompt", () => {
    const b = blocks(["What are you working toward?", "What is getting in the way?", "What is your next step?"]);
    expect(lineCounts(solved(guided({ blocks: [{ ...b[0], lineCount: 3 }, { ...b[1], lineCount: 7 }, { ...b[2], lineCount: 4 }] })))).toEqual([3, 7, 4]);
  });
  it("blank line count fills the space; fixed counts keep theirs", () => {
    const [fixed, fill] = lineCounts(solved(guided({ blocks: [{ id: "a", label: "Fixed", lineCount: 3 }, { id: "b", label: "Fill" }] })));
    expect(fixed).toBe(3);
    expect(fill).toBeGreaterThan(10);
  });
  it("line spacing is the page's ruling on every trim (never squeezed to fit)", () => {
    const pitch = (size: string) => {
      const l = solved(guided({ blocks: blocks(["A", "B", "C", "D", "E", "F"]), sameLines: 5 }, size))[0].nodes.find((n): n is Lines => n.type === "lines")!;
      return l.positions[1] - l.positions[0];
    };
    expect(pitch("a5")).toBeCloseTo(pitch("8.5x11"), 9);
    expect(pitch("5.5x8.5")).toBeCloseTo(pitch("8.5x11"), 9);
  });
});

describe("answer styles", () => {
  it("ruled, blank, dot grid and checklist can be mixed on one page", () => {
    const pages = solved(guided({ blocks: [
      { id: "a", label: "Lines", responseStyle: "ruled", lineCount: 3 },
      { id: "b", label: "Space", responseStyle: "blank", lineCount: 3 },
      { id: "c", label: "Dots", responseStyle: "dot-grid", lineCount: 3 },
      { id: "d", label: "List", responseStyle: "checkboxes", lineCount: 3 },
    ] }));
    const nodes = pages[0].nodes;
    expect(nodes.some((n) => n.id.startsWith("gp0-a-surface") && n.type === "lines")).toBe(true);
    expect(nodes.some((n) => n.id.startsWith("gp0-b-surface") && (n.type === "lines" || n.type === "dots"))).toBe(false);
    expect(nodes.some((n) => n.id.startsWith("gp0-c-surface") && n.type === "dots")).toBe(true);
    // "3 lines" of checklist = 3 checkboxes.
    expect(nodes.filter((n) => n.id.startsWith("gp0-d-surface") && n.type === "checkbox").length).toBe(3);
    expect(errors(pages)).toEqual([]);
  });
  it("long prompt wording wraps its heading instead of overflowing", () => {
    const long = "What is the one thing God has been asking me to do that I keep putting off, and what will I do about it this week?";
    const s = solved(guided({ blocks: [{ id: "a", label: long, lineCount: 4 }] }, "5.5x8.5"))[0];
    const t = s.nodes.find((n) => n.id === "gp0-a-title");
    expect(t?.type === "text" && t.fit?.lines && t.fit.lines.length > 1).toBe(true);
  });
});

describe("fit: continue on another page, never cramped", () => {
  it("6 prompts × 5 lines: Letter and A5 continue on a second page; every prompt keeps its 5 lines", () => {
    for (const size of ["8.5x11", "a5"]) {
      const p = guided({ blocks: blocks(["A", "B", "C", "D", "E", "F"]), sameLines: 5 }, size);
      const doc = resolveDocument(p);
      const flow = doc.recipe.pages.filter((x) => x.layoutId === "guided-page");
      expect(flow.map((x) => [x.flowPart, x.flowCount]), size).toEqual([[0, 2], [1, 2]]);
      const pages = solved(p);
      expect(lineCounts(pages), size).toEqual([5, 5, 5, 5, 5, 5]);
      expect(headings(pages), size).toEqual(["A", "B", "C", "D", "E", "F"]);
      expect(pages[1].nodes.some((n) => n.type === "text" && /continued/.test(n.text)), size).toBe(true);
      expect(errors(pages), size).toEqual([]);
    }
  });
  it("A5 needs more pages than Letter for the same content (solved from each page, not scaled)", () => {
    const set = { blocks: blocks(["A", "B", "C", "D", "E", "F", "G", "H"]), sameLines: 6 };
    const count = (size: string) => resolveDocument(guided(set, size)).recipe.pages.filter((x) => x.layoutId === "guided-page").length;
    expect(count("a5")).toBeGreaterThan(count("8.5x11"));
  });
  it("“use fewer lines first” keeps it on one page when the minimums fit", () => {
    const p = guided({ blocks: blocks(["A", "B", "C", "D", "E", "F"], { minLines: 2 }), sameLines: undefined, whenFull: "fewer-lines" }, "a5");
    // Without fixed counts the prompts share the page; with 8 lines each they don't fit and give up lines first.
    const eight: PromptSet = { blocks: blocks(["A", "B", "C", "D", "E", "F"]).map((b) => ({ ...b, lineCount: 8, minLines: 2 })), whenFull: "fewer-lines" };
    const pages = solved(guided(eight, "a5"));
    const counts = lineCounts(pages);
    expect(counts.every((n) => n >= 2 && n <= 8)).toBe(true);
    expect(counts.some((n) => n < 8)).toBe(true);
    expect(errors(solved(p))).toEqual([]);
  });
  it("a two-page spread can't continue: it reports in plain words with the count", () => {
    const set: PromptSet = { blocks: blocks(["A", "B", "C", "D", "E", "F"]), sameLines: 12 };
    const pages = solved(recipe("devotional-verse-mapping.spread", { promptPages: [set] }, "6x9"));
    const msg = errors(pages).find((d) => d.rule === "prompt-fit")?.message;
    expect(msg).toBe("This page does not have enough room for 6 prompts with 12 writing lines each.");
    expect(plainIssue({ rule: "layout-solver", severity: "error", message: msg!, page: 1, componentId: null }).advice).toMatch(/fewer prompts.*fewer lines.*another page/);
  });
  it("preview = print on a continuation page", () => {
    const doc = resolveDocument(guided({ blocks: blocks(["A", "B", "C", "D", "E", "F"]), sameLines: 5 }, "a5"));
    const i = doc.recipe.pages.findIndex((x) => x.flowPart === 1);
    const props = { geometry: geometryFor(doc, doc.recipe.pages[i]), solved: solvePage(doc, i), colors: doc.colors, typography: doc.typography, decorative: doc.decorative };
    const strip = (s: string) => s.replace("ps-page--editor", "").replace("ps-page--print", "");
    expect(strip(renderToStaticMarkup(<PrintablePage {...props} mode="editor" />))).toBe(strip(renderToStaticMarkup(<PrintablePage {...props} mode="print" />)));
  });
});

describe("recipes and worksheets use the same model", () => {
  it("worksheet: title, instructions, prompts with their own line counts", () => {
    const set: PromptSet = { instructions: "Answer honestly.", blocks: [{ id: "a", label: "What are you working toward?", lineCount: 5 }, { id: "b", label: "What is getting in the way?", lineCount: 4 }, { id: "c", label: "What is your next step?", lineCount: 3 }] };
    const pages = solved(recipe("worksheet-prompt.prompt-response", { title: "Goal Worksheet", promptPages: [set] }));
    expect(lineCounts(pages)).toEqual([5, 4, 3]);
    expect(pages[0].nodes.some((n) => n.type === "text" && n.text === "Goal Worksheet")).toBe(true);
    expect(pages[0].nodes.some((n) => n.id === "st0-instructions")).toBe(true);
  });
  it("Daily Reflection: remove, rename and set line counts; the date line stays", () => {
    const set: PromptSet = { blocks: [{ id: "scripture", label: "Today's verse", lineCount: 3 }, { id: "reflection", label: "What stood out to me?", lineCount: 8 }, { id: "prayer", label: "Prayer", lineCount: 5 }] };
    const pages = solved(recipe("devotional-daily-reflection.stacked", { promptPages: [set] }, "6x9"));
    expect(headings(pages)).toEqual(["Today's verse", "What stood out to me?", "Prayer"]);
    expect(lineCounts(pages)).toEqual([3, 8, 5]);
    expect(pages[0].nodes.some((n) => n.id === "st0-date")).toBe(true);
  });
});

describe("saved-project migration", () => {
  // Recorded from the guided page before prompt blocks existed (same trims, same prompts).
  const BEFORE: Record<string, Record<string, number[]>> = {
    "8.5x11": { one: [32], two: [15, 15], four: [11, 5, 5, 5], default: [15, 7, 7] },
    "6x9": { one: [25], two: [11, 11], four: [8, 3, 3, 3], default: [11, 5, 5] },
    "5.5x8.5": { one: [23], two: [10, 10], four: [8, 3, 3, 3], default: [10, 4, 4] },
  };
  const CASES: Record<string, string[] | undefined> = { one: ["What did God say?"], two: ["What did God say?", "What will I do?"], four: ["What did God say?", "What stood out to me?", "What will I do?", "Prayer"], default: undefined };
  it("plain prompt lists render exactly the lines they had (wording unchanged)", () => {
    for (const [size, cases] of Object.entries(BEFORE))
      for (const [name, counts] of Object.entries(cases)) {
        const pages = solved(guided(undefined, size, CASES[name]));
        expect(lineCounts(pages), `${size} ${name}`).toEqual(counts);
        if (CASES[name]) expect(headings(pages)).toEqual(CASES[name]);
        expect(pages, `${size} ${name}`).toHaveLength(1);
      }
  });
  it("a project JSON saved with prompts arrays still loads", () => {
    const saved = JSON.parse(JSON.stringify(guided(undefined, "6x9", ["Time with God", "Notes"])));
    expect(saved.recipe.structure[0].promptSet).toBeUndefined();
    expect(headings(solved(saved))).toEqual(["Time with God", "Notes"]);
  });
  it("older recipe customization (rename / hide / order) still applies when no prompt blocks are set", () => {
    const pages = solved(recipe("devotional-soap.four-band", { rename: { observation: "What I See" }, hidden: ["date"], order: [["prayer"]] }, "6x9"));
    expect(headings(pages)).toEqual(["Prayer", "Scripture", "What I See", "Application"]);
  });
});
