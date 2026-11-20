/**
 * Grocery List toolbar notes: "Still need line options" (solid, dashed, dotted or no writing lines; compact, standard
 * or roomy spacing) and "Should have option for no section" (one list, no headings). And the coloring book's verse
 * size: chosen in the studio, it reaches the printed page and the What's Missing check.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createProject } from "../src/presets/products/projectFactory";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { WritingLines } from "../src/primitives/nodes";
import { normalizeBrief } from "../src/persistence/coverStore";
import { coloringBrief, newBook } from "../src/engines/coloringBook/book";
import { assembleInterior } from "../src/engines/coloringBook/assembleBook";
import type { ProductProject } from "../src/types/project";
import type { LinesNode } from "../src/types/layout";

const pad = (listPage?: ProductProject["layoutOptions"]["listPage"]) => {
  const p = createProject("notepad", { name: "Grocery", recipe: { items: [{ id: "sheet", layoutId: "notepad-grocery", repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" } } as never);
  return { ...p, layoutOptions: { ...p.layoutOptions, ...(listPage ? { listPage } : {}) } };
};
const solved = (p: ProductProject) => solvePage(resolveDocument(p), 0);
const texts = (p: ProductProject) => solved(p).nodes.filter((n) => n.type === "text").map((n) => (n as { text: string }).text);
const lines = (p: ProductProject) => solved(p).nodes.filter((n) => n.type === "lines") as LinesNode[];
const rows = (p: ProductProject) => solved(p).nodes.filter((n) => n.type === "checkbox").length;

describe("Grocery List: one list, no sections", () => {
  it("drops every section heading and rule, and fills the page with one list (two columns on a wide sheet)", () => {
    const before = texts(pad());
    expect(before).toEqual(expect.arrayContaining(["Produce", "Dairy"]));
    const one = pad({ noSections: true });
    const t = texts(one);
    expect(t.some((x) => /produce|dairy|pantry|frozen|household/i.test(x))).toBe(false);
    expect(t).toContain("Grocery List");
    expect(solved(one).nodes.filter((n) => /^grocery-.*-rule$/.test(n.id) && !n.id.startsWith("grocery-header")).map((n) => n.id)).toEqual([]);
    // With no headings the rows run down the page: more rows than with six sections.
    expect(rows(one)).toBeGreaterThan(rows(pad()));
    // A set number of lines is the whole list, shared between the columns.
    expect(rows(pad({ noSections: true, lines: 10 }))).toBe(10);
  });
});

describe("Grocery List: line options", () => {
  it("solid by default; dashed or dotted lines; or no lines with the checkboxes kept", () => {
    expect(lines(pad()).every((l) => !l.dash)).toBe(true);
    expect(lines(pad({ lineStyle: "dashed" })).every((l) => l.dash === "dashed")).toBe(true);
    const dotted = lines(pad({ lineStyle: "dotted" }));
    expect(dotted.length).toBeGreaterThan(0);
    expect(renderToStaticMarkup(createElement(WritingLines, { node: dotted[0] }))).toMatch(/stroke-dasharray="0 [\d.]+".*stroke-linecap="round"/);
    expect(renderToStaticMarkup(createElement(WritingLines, { node: lines(pad({ lineStyle: "dashed" }))[0] }))).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
    const none = pad({ lineStyle: "none" });
    expect(lines(none)).toHaveLength(0);
    expect(rows(none)).toBe(rows(pad()));
  });

  it("line spacing: compact fits more rows than standard, roomy fewer", () => {
    const [c, s, r] = (["compact", "standard", "roomy"] as const).map((lineSpacing) => rows(pad({ lineSpacing, noSections: true })));
    expect(c).toBeGreaterThan(s);
    expect(r).toBeLessThan(s);
    const one = lines(pad({ lineSpacing: "roomy" }))[0];
    expect(one.positions[1] - one.positions[0]).toBeCloseTo(0.42, 10);
  });
});

describe("Coloring book: the verse size", () => {
  const book = (textSizePt?: number) => {
    const scenes = [{ id: "s1", title: "Brave", scriptureRef: "Joshua 1:9", verseText: "Be strong and of a good courage.", verseApproved: "x" } as never];
    const b = newBook("b", { name: "Ballerinas", faithBased: true, content: { title: true, scripture: "full", lesson: false, customText: false }, brief: coloringBrief({ title: "Ballerinas", translation: "KJV", scenes }) });
    return textSizePt ? { ...b, brief: { ...b.brief, pageTypography: { ...b.brief.pageTypography, textSizePt } } } : b;
  };
  const verseSize = (b: ReturnType<typeof book>) => {
    const doc = resolveDocument(assembleInterior(b));
    const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === "scene-s1");
    return (solvePage(doc, i).nodes.find((n) => n.id.endsWith("-verse-prompt")) as { fit: { sizePt: number } }).fit.sizePt;
  };
  it("a new book starts at 18 pt Cormorant Garamond; the chosen size prints; an older book without a size stays 13 pt", () => {
    expect(verseSize(book())).toBe(18);
    expect(book().brief.pageTypography.scriptureFont).toBe("Cormorant Garamond");
    const older = book();
    const { textSizePt: _drop, ...rest } = older.brief.pageTypography;
    expect(verseSize({ ...older, brief: { ...older.brief, pageTypography: rest } })).toBe(13);
    expect(verseSize(book(16))).toBe(16);
    expect(verseSize(book(11))).toBe(11);
  });
  it("is kept when the book is saved and reopened", () => {
    expect(normalizeBrief({ ...book(16).brief } as never).pageTypography.textSizePt).toBe(16);
    const b = book();
    const { textSizePt: _drop, ...rest } = b.brief.pageTypography;
    expect(normalizeBrief({ ...b.brief, pageTypography: rest } as never).pageTypography.textSizePt).toBeUndefined();
  });
});
