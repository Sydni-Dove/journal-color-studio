/**
 * Headings you can move: the title of journal / notes pages ("NOTES") and each
 * Custom Page section's heading — left / center / right, a line under it, its
 * style and its own font. Writing starts below; everything stays on the page.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { PromptBlock } from "../src/types/prompts";
import type { ProductProject } from "../src/types/project";

function notesBook(writingTitle?: ProductProject["layoutOptions"]["writingTitle"], size = "8.5x11") {
  const p = createProject("journal", { name: "Notes", dimensions: { sizePresetId: size }, recipe: { items: [], ordering: "sequential", structure: [step("notes", { type: "copies", count: 1 })] } } as never);
  return { ...p, layoutOptions: { ...p.layoutOptions, ...(writingTitle ? { writingTitle } : {}) } };
}
const solve0 = (p: ProductProject) => {
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((pg) => !pg.filler);
  return { s: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
};

describe("journal / notes page title", () => {
  it("as before when nothing is chosen: a small label at the left, no line", () => {
    const { s, g } = solve0(notesBook());
    const t = s.nodes.find((n) => n.id === "journal-heading")!;
    expect(t.type === "text" && t.role).toBe("label");
    expect(t.rect.x).toBeLessThan(g.safeRect.x + g.safeRect.w / 4);
    expect(s.nodes.some((n) => n.id === "journal-heading-rule")).toBe(false);
  });
  for (const size of ["8.5x11", "6x9", "5.5x8.5"])
    for (const style of ["label", "sectionHeading", "pageTitle"] as const)
      it(`${size} · ${style}: centered, a line under it, its own font; writing below; inside the page`, () => {
        const { s, g } = solve0(notesBook({ align: "center", rule: true, style, font: "Cinzel" }, size));
        const t = s.nodes.find((n) => n.id === "journal-heading")!;
        if (t.type !== "text") throw new Error();
        expect(t.role).toBe(style);
        expect(t.family).toBe("Cinzel");
        const mid = t.rect.x + t.rect.w / 2, pageMid = g.safeRect.x + g.safeRect.w / 2;
        expect(Math.abs(mid - pageMid)).toBeLessThan(0.15);
        const r = s.nodes.find((n) => n.id === "journal-heading-rule")!;
        expect(r.rect.y).toBeGreaterThan(t.rect.y + t.rect.h - 1e-6);
        const firstLine = Math.min(...s.nodes.filter((n) => n.id.startsWith("journal-writing")).map((n) => n.rect.y));
        expect(firstLine).toBeGreaterThan(r.rect.y);
        for (const n of s.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
        expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      });
});

describe("Custom Page section headings", () => {
  const page = (b: Partial<PromptBlock>, size = "8.5x11") => {
    const p = createProject("custom", { name: "C", dimensions: { sizePresetId: size, orientation: "portrait" }, recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { layoutId: "guided-page", title: "Custom Page", promptSet: { blocks: [{ id: "notes", label: "Notes", prompt: "Anything on your heart.", space: "fill", ...b }] } })] } } as never);
    return solve0(p);
  };
  for (const align of ["center", "right"] as const)
    it(`${align}: heading and prompt ${align}ed; a line under the heading; own font; writing below`, () => {
      const { s, g } = page({ headingAlign: align, headingRule: true, headingFont: "Italiana" });
      const t = s.nodes.find((n) => n.id.endsWith("-notes-title"))!;
      const pr = s.nodes.find((n) => n.id.endsWith("-notes-prompt"))!;
      const r = s.nodes.find((n) => n.id.endsWith("-notes-heading-rule"))!;
      if (t.type !== "text" || pr.type !== "text") throw new Error();
      expect([t.align, pr.align]).toEqual([align, align]);
      expect(t.family).toBe("Italiana");
      expect(r.rect.y).toBeGreaterThan(t.rect.y + t.rect.h - 1e-6);
      expect(pr.rect.y).toBeGreaterThan(r.rect.y);
      const lines = s.nodes.find((n) => n.id.endsWith("-notes-surface-lines"))!;
      expect(lines.rect.y).toBeGreaterThan(pr.rect.y);
      for (const n of s.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
      expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });
  it("saved sections (no setting) are unchanged: left, no line", () => {
    const { s } = page({});
    const t = s.nodes.find((n) => n.id.endsWith("-notes-title"))!;
    expect(t.type === "text" && t.align).toBe("left");
    expect(s.nodes.some((n) => n.id.endsWith("-heading-rule"))).toBe(false);
  });
});
