/**
 * PAGE HEADER ON CONTINUATION PAGES — a Custom Page that runs onto 3 pages
 * (STEP THREE / 03 / PROPHETIC WORD / RESPOND / THE WORD) shows its header on
 * the first page only (default) or on every page; the sections flow beneath it.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { GuidedHeader, PromptSet } from "../src/types/prompts";

const HEADER: GuidedHeader = { eyebrow: "STEP THREE", number: "03", overline: "PROPHETIC WORD", title: "RESPOND", subtitle: "THE WORD", meta: ["Date", "Time", "Received through", "Type"], rule: true };
const LINES: Record<string, number> = { "8.5x11": 15, "7x9": 11, "6x9": 11 };
const set = (repeat?: GuidedHeader["repeat"], lines = 15): PromptSet => ({
  header: { ...HEADER, ...(repeat ? { repeat } : {}) },
  blocks: [
    { id: "response", label: "My response", prompt: "What obedience, action, or posture does this word call for?", space: "fixed", lineCount: lines },
    { id: "do", label: "What I will do", prompt: "List the specific steps, decisions, or changes you will make.", space: "fixed", lineCount: lines },
    { id: "prayer", label: "Prayer", prompt: "Write a prayer of response.", space: "fixed", lineCount: lines },
  ],
});
function solveAll(s: PromptSet, size = "8.5x11") {
  const p = createProject("custom", { name: "Respond", dimensions: { sizePresetId: size, orientation: "portrait" }, recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { layoutId: "guided-page", title: "Custom Page", promptSet: s })] } } as never);
  const doc = resolveDocument(p);
  const idx = doc.recipe.pages.map((pg, i) => (pg.layoutId === "guided-page" ? i : -1)).filter((i) => i >= 0);
  return { doc, pages: idx.map((i) => ({ solved: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) })) };
}
const has = (nodes: { id: string }[], re: RegExp) => nodes.some((n) => re.test(n.id));

describe("composed header on continuation pages", () => {
  for (const size of ["8.5x11", "6x9", "7x9"])
    for (const repeat of [undefined, "first", "every"] as const)
      it(`${size} · ${repeat ?? "saved before (no setting)"}: header ${repeat === "every" ? "on every page" : "on the first page only"}; sections once each, below it, inside the page`, () => {
        const { pages } = solveAll(set(repeat, LINES[size]), size);
        // With the header on every page there is less room on each continuation page: 3 pages instead of 2.
        expect(pages.length, "the page continues").toBe(repeat === "every" ? 3 : 2);
        pages.forEach(({ solved, g }, k) => {
          const showsHeader = has(solved.nodes, /-intro-title$/);
          expect(showsHeader, `page ${k + 1}`).toBe(k === 0 || repeat === "every");
          if (showsHeader) {
            const head = solved.nodes.filter((n) => n.id.includes("-intro-"));
            const bottom = Math.max(...head.map((n) => n.rect.y + n.rect.h));
            const sectionTops = solved.nodes.filter((n) => /-(response|do|prayer)-title$/.test(n.id)).map((n) => n.rect.y);
            for (const t of sectionTops) expect(t, `page ${k + 1} body below header`).toBeGreaterThan(bottom);
          }
          for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), `page ${k + 1} ${n.id}`).toBe(true);
          expect(solved.diagnostics.filter((d) => d.severity === "error"), `page ${k + 1}`).toEqual([]);
          // No blank pages: every page carries a section.
          expect(has(solved.nodes, /-(response|do|prayer)-title$/), `page ${k + 1} has a section`).toBe(true);
        });
        // Each section once — never duplicated.
        for (const key of ["response", "do", "prayer"]) expect(pages.flatMap(({ solved }) => solved.nodes.filter((n) => new RegExp(`-${key}-title$`).test(n.id))), key).toHaveLength(1);
      });

  it("the repeated header takes its height on each page: a continuation page's body starts at the same place as the first page's", () => {
    const { pages } = solveAll(set("every"));
    const top = (k: number) => Math.min(...pages[k].solved.nodes.filter((n) => /-(response|do|prayer)-title$/.test(n.id)).map((n) => n.rect.y));
    expect(top(1)).toBeCloseTo(top(0), 6);
    expect(top(2)).toBeCloseTo(top(0), 6);
    const first = solveAll(set("first")).pages;
    const topFirst = Math.min(...first[1].solved.nodes.filter((n) => /-(response|do|prayer)-title$/.test(n.id)).map((n) => n.rect.y));
    expect(topFirst).toBeLessThan(top(1));
  });
});
