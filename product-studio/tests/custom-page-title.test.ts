/**
 * A Custom Page prints only what its maker put on it. Its name ("Custom Page",
 * or a saved design's name) names it in Pages and Browse pages, never on paper.
 * Other guided pages keep their printed titles.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { pageInfo } from "../src/engines/document/pageInfo";
import { addPageFromDesign, savePageDesign } from "../src/engines/recipe/pageDesigns";
import { step } from "../src/presets/bookRecipes";
import { CUSTOM_PAGE_PRESET } from "../src/presets/layouts/recipePresets";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { PromptBlock } from "../src/types/prompts";
import type { BookStep } from "../src/types/recipe";

const STEP_ONE: PromptBlock[] = [
  { id: "a", kind: "heading", label: "STEP ONE", textStyle: "title" },
  { id: "b", kind: "heading", label: "01" },
  { id: "c", kind: "heading", label: "RECEIVE" },
  { id: "d", kind: "heading", label: "THE WORD" },
  { id: "e", kind: "info", label: "", fields: ["Date", "Source"] },
  { id: "f", label: "Writing", space: "fill", responseStyle: "ruled" },
];
const texts = (nodes: LayoutNode[]) => nodes.filter((n): n is Extract<LayoutNode, { type: "text" }> => n.type === "text").sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

describe("Custom Page: no automatic title", () => {
  it("a new Custom Page (the preset, titled “Custom Page”) prints nothing at the top; its name stays for navigation", () => {
    const p = createProject("custom", { name: "c", recipe: CUSTOM_PAGE_PRESET.build({ count: 1 } as never) } as never);
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.layoutId === "guided-page");
    const nodes = solvePage(doc, i).nodes;
    expect(texts(nodes).map((t) => t.text)).not.toContain("Custom Page");
    // Nothing printed in the header band: no title, no rule under it.
    expect(nodes.filter((n) => n.type !== "group" && /-header/.test(n.id))).toEqual([]);
    expect(pageInfo(doc, i).title).toMatch(/Custom Page/);
  });

  it("STEP ONE / 01 / RECEIVE / THE WORD / info row / writing: the page begins with STEP ONE", () => {
    const p = createProject("custom", { name: "c", recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { title: "Custom Page", layoutId: "guided-page", promptSet: { blocks: STEP_ONE } })] } } as never);
    const doc = resolveDocument(p);
    const t = texts(solvePage(doc, doc.recipe.pages.findIndex((x) => x.layoutId === "guided-page")).nodes);
    expect(t[0].text).toBe("STEP ONE");
    expect(t.map((x) => x.text).slice(0, 4)).toEqual(["STEP ONE", "01", "RECEIVE", "THE WORD"]);
    expect(t.map((x) => x.text)).not.toContain("Custom Page");
  });

  it("pages inserted from a saved design print no design name either", () => {
    let p = createProject("custom", { name: "c", recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "src", title: "Custom Page", layoutId: "guided-page", promptSet: { blocks: STEP_ONE } })] } } as never);
    const res = savePageDesign(p, p.recipe.structure![0] as BookStep, "Receive the Word");
    if ("error" in res) throw new Error(res.error);
    p = { ...res.project, recipe: { ...res.project.recipe, structure: addPageFromDesign([], res.design, 3) } };
    const doc = resolveDocument(p);
    doc.recipe.pages.forEach((pg, i) => {
      if (pg.layoutId !== "guided-page") return;
      const t = texts(solvePage(doc, i).nodes).map((x) => x.text);
      expect(t[0]).toBe("STEP ONE");
      expect(t).not.toContain("Custom Page");
      expect(t).not.toContain("Receive the Word");
    });
  });

  it("guided pages (not custom) keep their printed title", () => {
    const p = createProject("journal", { name: "g", recipe: { items: [], ordering: "sequential", structure: [step("guided", { type: "copies", count: 1 }, { title: "Scripture + Reflection", layoutId: "guided-page", prompts: ["Scripture", "My prayer"] })] } } as never);
    const doc = resolveDocument(p);
    const t = texts(solvePage(doc, doc.recipe.pages.findIndex((x) => x.layoutId === "guided-page")).nodes).map((x) => x.text);
    expect(t[0]).toBe("Scripture + Reflection");
  });
});
