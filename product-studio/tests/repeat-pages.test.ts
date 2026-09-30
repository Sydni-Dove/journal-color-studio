/**
 * REPEAT PAGES — "if I make 3 types of pages across 20 pages, I want to be
 * able to 1) duplicate by section and begin that at page 21, 2) duplicate all
 * 3 and begin at page 21, and 3) add a number of times I want the whole thing
 * duplicated."
 */
import { describe, expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { resolveDocument } from "../src/engines/document/resolve";
import { repeatableNodes, repeatIndex, repeatPages, stepsOf } from "../src/engines/recipe/pageDesigns";
import type { BookNode, BookStep } from "../src/types/recipe";

// Cover, then 3 kinds of page making pages 2–21 (6 + 7 + 7 = 20), then the end cover.
function book() {
  return createProject("journal", {
    name: "Prophetic",
    dimensions: { sizePresetId: "6x9" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: false },
    recipe: {
      items: [],
      ordering: "sequential",
      structure: [
        step("cover-page", { type: "once" }, { title: "Prophetic" }),
        { ...step("custom", { type: "copies", count: 6 }, { layoutId: "guided-page", title: "Receive" }), id: "receive" },
        { ...step("custom", { type: "copies", count: 7 }, { layoutId: "guided-page", title: "Discern" }), id: "discern" },
        { ...step("lined-journal", { type: "copies", count: 7 }), id: "journal" },
        step("back-cover", { type: "once" }),
      ],
    },
  } as never);
}
const pagesByStep = (nodes: BookNode[]) => {
  const p = book();
  const doc = resolveDocument({ ...p, recipe: { ...p.recipe, structure: nodes } });
  return { doc, first: (n: BookNode) => { const ids = new Set(stepsOf(n).map((s) => s.id)); const ps = doc.recipe.pages.filter((x) => ids.has(x.recipeItemId)).map((x) => x.pageNumber); return ps.length ? Math.min(...ps) : null; } };
};
const titles = (nodes: BookNode[]) => nodes.map((n) => (n.kind === "step" ? n.title ?? n.module : n.label));

describe("repeat pages", () => {
  const base = book().recipe.structure!;
  const { doc, first } = pagesByStep(base);

  it("the fixture: three kinds of page on pages 2–21", () => {
    expect(first(base[1])).toBe(2);
    expect(first(base[3])).toBe(15);
    expect(doc.recipe.pages.filter((p) => ["receive", "discern", "journal"].includes(p.recipeItemId))).toHaveLength(20);
    expect(repeatableNodes(base).map((n) => n.id)).toEqual(["receive", "discern", "journal"]);
  });

  it("1) one kind of page, starting at page 22 (right after the set)", () => {
    const at = repeatIndex(base, ["discern"], { at: "page", page: 22 }, first);
    const out = repeatPages(base, ["discern"], 1, at);
    expect(titles(out)).toEqual(["Prophetic", "Receive", "Discern", "lined-journal", "Discern 2", "back-cover"]);
    const { first: f2 } = pagesByStep(out);
    expect(f2(out[4])).toBe(22);
    expect((out[4] as BookStep).cadence).toEqual({ type: "copies", count: 7 });
  });

  it("2 + 3) all three, three more times, right after them — in order, before the end cover", () => {
    const ids = ["receive", "discern", "journal"];
    const out = repeatPages(base, ids, 3, repeatIndex(base, ids, { at: "after" }, first));
    expect(titles(out)).toEqual(["Prophetic", "Receive", "Discern", "lined-journal", "Receive 2", "Discern 2", "lined-journal", "Receive 3", "Discern 3", "lined-journal", "Receive 4", "Discern 4", "lined-journal", "back-cover"]);
    const { doc: d2, first: f2 } = pagesByStep(out);
    expect(f2(out[4])).toBe(22);
    expect(d2.recipe.pages.filter((p) => !["cover-page", "back-cover-page"].includes(p.layoutId) && !p.filler)).toHaveLength(80);
    // Every copy is its own: new ids, and editing one changes nothing else.
    const allIds = out.flatMap(stepsOf).map((s) => s.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    (out[4] as BookStep).title = "Changed";
    expect((out[1] as BookStep).title).toBe("Receive");
  });

  it("at the end: before the end cover; a page in the middle of a row starts after that row", () => {
    expect(repeatIndex(base, ["receive"], { at: "end" }, first)).toBe(4);
    // Page 5 is inside Receive (2–7): the copies start at Discern's first page, 8.
    expect(repeatIndex(base, ["receive"], { at: "page", page: 5 }, first)).toBe(2);
    expect(repeatIndex(base, ["receive"], { at: "page", page: 999 }, first)).toBe(4);
  });

  it("covers are never repeated; zero times changes nothing", () => {
    expect(repeatPages(base, [base[0].id], 2, 4)).toBe(base);
    expect(repeatPages(base, ["receive"], 0, 4)).toBe(base);
  });
});
