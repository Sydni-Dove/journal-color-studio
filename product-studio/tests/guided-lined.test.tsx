/**
 * Guided Lined Page: one reusable prompt-section structure — any number of
 * sections, each with a heading, an optional prompt, and its own writing
 * space (fixed lines, fill the remaining space, or an equal share).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { lineSpacingIn } from "../src/engines/patterns/patterns";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { sectionLineCounts } from "../src/layouts/shared/promptPages";
import { GUIDED_LINED_PRESET, recipePresetsFor } from "../src/presets/layouts/recipePresets";
import { createProject } from "../src/presets/products/projectFactory";
import { PrintablePage } from "../src/primitives/PrintablePage";
import type { LayoutNode } from "../src/types/layout";
import { PROMPT_STARTERS, type PromptBlock, type PromptSet } from "../src/types/prompts";
import type { BookStep } from "../src/types/recipe";

const SIZES = ["8.5x11", "8x10", "7x9", "7x9.25", "6x9", "5.5x8.5", "a5"];
type Lines = Extract<LayoutNode, { type: "lines" }>;

function page(set: PromptSet, size = "7x9", title = "The Word") {
  const p = createProject("journal", { name: "Guided", dimensions: { sizePresetId: size, orientation: "portrait" }, production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true }, recipe: GUIDED_LINED_PRESET.build({ count: 1, sheets: 1 }) });
  const s = p.recipe.structure![0] as BookStep;
  s.promptSet = set;
  s.title = title;
  return p;
}
const solved = (p: ReturnType<typeof page>) => {
  const doc = resolveDocument(p);
  const pages = doc.recipe.pages.filter((x) => !x.filler).map((x) => doc.recipe.pages.indexOf(x));
  return { doc, pages: pages.map((i) => solvePage(doc, i)), indices: pages };
};
const counts = (p: ReturnType<typeof page>) => sectionLineCounts(solved(p).pages, "gp");
const issues = (p: ReturnType<typeof page>) => validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity !== "info");
const b = (label: string, extra: Partial<PromptBlock> = {}): PromptBlock => ({ id: label.toLowerCase().replace(/\W+/g, "-"), label, ...extra });

describe("Guided Lined Page", () => {
  it("is a page type for journals, notebooks, devotionals and worksheets; it starts as a Full Page Prompt", () => {
    for (const t of ["journal", "notebook", "devotional", "worksheet"] as const) expect(recipePresetsFor(t).map((r) => r.label)).toContain("Guided Lined Page");
    const s = GUIDED_LINED_PRESET.build({ count: 3, sheets: 1 }).structure![0] as BookStep;
    expect(s.cadence).toEqual({ type: "copies", count: 3 });
    expect(s.promptSet!.blocks).toHaveLength(1);
    expect(s.promptSet!.blocks[0]).toMatchObject({ label: "The Word", space: "fill" });
    expect(PROMPT_STARTERS.map((x) => x.label)).toEqual(["Full Page Prompt", "Two Prompt Reflection", "Three Prompt Response", "Four Prompt Review"]);
  });

  it("1 prompt + fill the remaining page: nearly the whole page is lines — more on Letter than A5, from each page's own geometry", () => {
    const set: PromptSet = { blocks: [b("The Word", { prompt: "Write the word exactly as you received it.", space: "fill" })] };
    const got = SIZES.map((size) => {
      const p = page(set, size), { doc, pages } = solved(p);
      expect(doc.recipe.pages.filter((x) => !x.filler)).toHaveLength(1);
      const lines = pages[0].nodes.find((n): n is Lines => n.type === "lines" && n.id.startsWith("gp0-the-word-surface"))!;
      // The lines reach the bottom of the page body: less than one line of space is left under the last line.
      const body = pages[0].regions!.mainContent!;
      const pitch = lineSpacingIn(doc.project.functionalPattern);
      expect(body.y + body.h - lines.positions.at(-1)!, size).toBeLessThan(pitch * 1.5);
      expect(issues(p), size).toEqual([]);
      return lines.positions.length;
    });
    expect(got[0]).toBeGreaterThan(got[6]); // Letter > A5
    expect(got[0]).toBeGreaterThan(25);
    expect(got[6]).toBeGreaterThan(12);
  });

  it("2 prompts with fixed lines get exactly those lines", () => {
    const p = page({ blocks: [b("What I Believe God Is Saying", { space: "fixed", lineCount: 10 }), b("Scripture Confirmation", { space: "fixed", lineCount: 9 })] });
    expect(counts(p)).toEqual({ "what-i-believe-god-is-saying": 10, "scripture-confirmation": 9 });
    expect(issues(p)).toEqual([]);
  });

  it("3 prompts, mixed: 8 + 8 fixed, Prayer fills the rest — or continues on the next page where 8 + 8 leave no room", () => {
    const prayerLines = SIZES.map((size) => {
      const set = PROMPT_STARTERS[2].set();
      const p = page(set, size), s = solved(p);
      const c = sectionLineCounts(s.pages, "gp");
      expect([c[set.blocks[0].id], c[set.blocks[1].id]], size).toEqual([8, 8]);
      expect(c[set.blocks[2].id], size).toBeGreaterThanOrEqual(2);
      // Small trims continue Prayer on the next page instead of squeezing lines.
      expect(s.pages.length, size).toBe(size === "5.5x8.5" || size === "a5" ? 2 : 1);
      expect(issues(p), size).toEqual([]);
      return s.pages.length === 1 ? c[set.blocks[2].id] : 0;
    });
    // On one page, Prayer gets more lines where the page is taller: Letter > 8×10 > 7×9.
    expect(prayerLines[0]).toBeGreaterThan(prayerLines[1]);
    expect(prayerLines[1]).toBeGreaterThan(prayerLines[2]);
  });

  it("4 prompts, equal share: every section the same whole number of lines, using the page", () => {
    const set: PromptSet = { blocks: ["What God Did", "Timeline", "Fruit & Impact", "Praise & Gratitude"].map((l) => b(l, { space: "equal" })) };
    for (const size of ["8.5x11", "7x9", "a5"]) {
      const c = Object.values(counts(page(set, size)));
      expect(c, size).toHaveLength(4);
      expect(new Set(c).size, size).toBe(1);
      expect(c[0], size).toBeGreaterThanOrEqual(3);
      // The part-line left after whole rounds goes between the sections: the last lines reach the bottom of the page body.
      const s = solved(page(set, size)), body = s.pages[0].regions!.mainContent!;
      const last = s.pages[0].nodes.filter((n): n is Lines => n.type === "lines").map((n) => n.positions.at(-1)!).sort((a, z) => z - a)[0];
      expect(body.y + body.h - last, size).toBeLessThan(lineSpacingIn(s.doc.project.functionalPattern) * 1.5);
    }
    // Equal sections next to a fill section: the equal ones match; the fill one takes what's left.
    const mixed: PromptSet = { blocks: [b("A", { space: "equal" }), b("B", { space: "equal" }), b("C", { space: "fill" })] };
    const m = counts(page(mixed, "8.5x11"));
    expect(m.a).toBe(m.b);
    expect(m.c).toBeGreaterThan(0);
  });

  it("the Four Prompt Review starter: 8 / 6 / 6 lines and Praise & Gratitude fills", () => {
    const set = PROMPT_STARTERS[3].set();
    const c = counts(page(set, "8.5x11"));
    expect(set.blocks.map((x) => c[x.id]).slice(0, 3)).toEqual([8, 6, 6]);
    expect(c[set.blocks[3].id]).toBeGreaterThan(2);
  });

  it("heading and prompt are separate: heading only, heading + prompt, prompt only; long prompts wrap and push their lines down", () => {
    const long = "Record how God fulfilled, clarified, redirected, or used this word — the people, the timing, the circumstances, and what it showed you about His ways.";
    const set: PromptSet = { blocks: [b("Only Heading", { space: "fixed", lineCount: 3 }), b("With Prompt", { prompt: long, space: "fixed", lineCount: 3 }), { id: "bare", label: "", prompt: "Prompt without a heading", space: "fill" }] };
    const { pages } = solved(page(set, "6x9"));
    const ids = pages[0].nodes.map((n) => n.id);
    expect(ids).toContain("gp0-only-heading-title");
    expect(ids).not.toContain("gp0-only-heading-prompt");
    expect(ids).toContain("gp0-with-prompt-title");
    expect(ids).toContain("gp0-bare-prompt");
    expect(ids).not.toContain("gp0-bare-title");
    const prompt = pages[0].nodes.find((n) => n.id === "gp0-with-prompt-prompt")!;
    expect(prompt.type === "text" && prompt.fit!.lines.length).toBeGreaterThan(1);
    const lines = pages[0].nodes.find((n): n is Lines => n.type === "lines" && n.id.startsWith("gp0-with-prompt-surface"))!;
    expect(lines.positions[0]).toBeGreaterThan(prompt.rect.y + prompt.rect.h);
    expect(issues(page(set, "6x9"))).toEqual([]);
  });

  it("reordering sections reorders them on the page", () => {
    const one: PromptSet = { blocks: [b("First", { space: "fixed", lineCount: 4 }), b("Second", { space: "fixed", lineCount: 4 })] };
    const y = (set: PromptSet, id: string) => solved(page(set)).pages[0].nodes.find((n) => n.id === `gp0-${id}`)!.rect.y;
    const two: PromptSet = { blocks: [one.blocks[1], one.blocks[0]] };
    expect(y(one, "first")).toBeLessThan(y(one, "second"));
    expect(y(two, "second")).toBeLessThan(y(two, "first"));
  });

  it("too many lines: continues on another page by default (line spacing never shrinks); “Keep one page and tell me” reports it in plain words", () => {
    const blocks = ["What God Did", "Timeline", "Fruit & Impact", "Praise & Gratitude"].map((l) => b(l, { space: "fixed", lineCount: 12 }));
    const cont = solved(page({ blocks }, "a5"));
    expect(cont.pages.length).toBeGreaterThan(1);
    expect(Object.values(sectionLineCounts(cont.pages, "gp"))).toEqual([12, 12, 12, 12]);
    const stop = page({ blocks, whenFull: "stop" }, "a5");
    const s = solved(stop);
    expect(s.pages.length).toBe(1);
    expect(s.pages[0].diagnostics.find((d) => d.rule === "prompt-fit")?.message).toBe("This page does not have enough room for 4 sections with 12 writing lines each.");
    const mixed = page({ blocks: blocks.map((x, i) => ({ ...x, lineCount: 10 + i })), whenFull: "stop" }, "a5");
    expect(solved(mixed).pages[0].diagnostics.find((d) => d.rule === "prompt-fit")?.message).toBe("This page does not have enough room for 4 sections with the selected writing lines.");
    // "Use fewer lines first" gives up lines (down to each section's minimum) before continuing.
    const fewer = solved(page({ blocks: blocks.map((x) => ({ ...x, minLines: 3 })), whenFull: "fewer-lines" }, "a5"));
    expect(Object.values(sectionLineCounts(fewer.pages, "gp")).some((n) => n < 12)).toBe(true);
  });

  it("a designed header is measured first: the sections get the space below it", () => {
    const plain: PromptSet = { blocks: [b("The Word", { space: "fill" })] };
    const withHeader: PromptSet = { ...plain, header: { eyebrow: "STEP TWO", number: "02", subtitle: "The Word", reference: "Habakkuk 2:2", rule: true, fields: ["Date", "Source"] } };
    const a = counts(page(plain, "7x9"))["the-word"], h = counts(page(withHeader, "7x9"))["the-word"];
    expect(h).toBeLessThan(a);
    expect(h).toBeGreaterThan(10);
    const { pages } = solved(page(withHeader, "7x9"));
    const ids = pages[0].nodes.map((n) => n.id);
    for (const id of ["gp0-intro-eyebrow", "gp0-intro-number", "gp0-intro-subtitle", "gp0-intro-reference", "gp0-intro-rule"]) expect(ids).toContain(id);
    expect(ids.some((id) => id.startsWith("gp0-fields"))).toBe(true);
    const rule = pages[0].nodes.find((n) => n.id === "gp0-intro-rule")!;
    const first = pages[0].nodes.find((n) => n.id.startsWith("gp0-fields"))!;
    expect(first.rect.y).toBeGreaterThan(rule.rect.y);
    expect(issues(page(withHeader, "7x9"))).toEqual([]);
  });

  it("checklist, blank and dot-grid writing areas", () => {
    const set: PromptSet = { blocks: [b("Steps", { space: "fixed", lineCount: 5, responseStyle: "checkboxes" }), b("Sketch", { space: "fixed", lineCount: 4, responseStyle: "blank" }), b("Grid", { space: "fill", responseStyle: "dot-grid" })] };
    const { pages } = solved(page(set, "8.5x11"));
    expect(pages[0].nodes.filter((n) => n.type === "checkbox" && n.id.startsWith("gp0-steps")).length).toBe(5);
    expect(pages[0].nodes.some((n) => n.type === "dots" && n.id.startsWith("gp0-grid"))).toBe(true);
  });

  it("preview = print, and a saved project reloads to the same pages", () => {
    const p = page(PROMPT_STARTERS[3].set(), "6x9");
    const { doc, indices } = solved(p);
    for (const i of indices) {
      const props = { geometry: geometryFor(doc, doc.recipe.pages[i]), solved: solvePage(doc, i), colors: doc.colors, typography: doc.typography, decorative: doc.decorative };
      const strip = (s: string) => s.replace("ps-page--editor", "").replace("ps-page--print", "");
      expect(strip(renderToStaticMarkup(<PrintablePage {...props} mode="editor" />))).toBe(strip(renderToStaticMarkup(<PrintablePage {...props} mode="print" />)));
    }
    const reloaded = JSON.parse(JSON.stringify(p));
    const again = solved(reloaded);
    expect(again.pages.map((x) => x.nodes)).toEqual(solved(p).pages.map((x) => x.nodes));
  });
});

describe("Guided Lined Page in the simple page list (no book structure)", () => {
  const flat = (set: PromptSet, size = "7x9") =>
    createProject("planner", {
      name: "Flat", dimensions: { sizePresetId: size, orientation: "portrait" }, production: { bindingType: "coil", printProfileId: "coil-generic", duplex: false },
      calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 1, sixRowMonths: true },
      recipe: { items: [{ id: "m", layoutId: "planner-monthly", repeat: { kind: "every-month" } }, { id: "g", layoutId: "guided-page", repeat: { kind: "count", count: 2 }, title: "Respond", promptSet: set }], ordering: "sequential" },
    });
  it("its sections and title reach its pages; lines as set; continuation measured on the page", () => {
    const set = PROMPT_STARTERS[2].set();
    const doc = resolveDocument(flat(set));
    const pages = doc.recipe.pages.map((p, i) => ({ p, i })).filter(({ p }) => p.recipeItemId === "g");
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0].p.module).toMatchObject({ type: "guided", title: "Respond" });
    const s = solvePage(doc, pages[0].i);
    expect(s.nodes.some((n) => n.type === "text" && n.text === "Respond")).toBe(true);
    const c = sectionLineCounts([s], "gp");
    expect([c[set.blocks[0].id], c[set.blocks[1].id]]).toEqual([8, 8]);
    // Too many lines: each copy continues on another page, measured on this size.
    const big = { blocks: set.blocks.map((b) => ({ ...b, space: "fixed" as const, lineCount: 14 })) };
    const d2 = resolveDocument(flat(big, "a5"));
    const g2 = d2.recipe.pages.filter((p) => p.recipeItemId === "g");
    expect(g2[0].flowCount).toBeGreaterThan(1);
    expect(g2.length).toBe(2 * g2[0].flowCount!);
    expect(issues(flat(set) as never)).toEqual([]);
  });
  it("a simple list without sections is unchanged (no module on its pages)", () => {
    const p = flat(PROMPT_STARTERS[0].set());
    p.recipe.items = p.recipe.items.map((x) => ({ ...x, promptSet: undefined, title: undefined }));
    expect(resolveDocument(p).recipe.pages.every((x) => !x.module)).toBe(true);
  });
});
