/**
 * COMPOSED PAGE HEADER — step at the left, titles centred, details at the
 * right (each its own label and line), measured once; the sections start
 * below it. Headers saved before keep their stacked look.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { PromptSet } from "../src/types/prompts";
import { STEP_HEADERS, stepPage } from "./fixtures/propheticSteps";

const SIZES = ["6x9", "7x9", "8.5x11"];
function solve(set: PromptSet, size: string) {
  const p = createProject("custom", { name: "h", dimensions: { sizePresetId: size, orientation: "portrait" }, recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { layoutId: "guided-page", title: "Custom Page", promptSet: set })] } } as never);
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((x) => x.layoutId === "guided-page");
  return { doc, solved: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
}
const byId = (nodes: LayoutNode[], suffix: string) => nodes.find((n) => n.id.endsWith(suffix));
const overlaps = (a: LayoutNode["rect"], b: LayoutNode["rect"]) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

describe("composed page header: the five Prophetic Journal steps", () => {
  for (const size of SIZES)
    for (const header of STEP_HEADERS) {
      it(`${size} · ${header.title}: compact, no overlap, inside the safe area, sections below it, nothing to fix`, () => {
        const { doc, solved, g } = solve(stepPage(header), size);
        const head = solved.nodes.filter((n) => n.id.includes("-intro-") && n.type !== "group");
        const texts = head.filter((n) => n.type === "text");
        for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) expect(overlaps(texts[a].rect, texts[b].rect), `${texts[a].id} × ${texts[b].id}`).toBe(false);
        for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
        const bottom = Math.max(...head.map((n) => n.rect.y + n.rect.h));
        const firstSection = byId(solved.nodes, "-word-title")!;
        expect(firstSection.rect.y).toBeGreaterThan(bottom);
        // Compact: the header (with its gap) takes well under a quarter of the page body.
        const bodyTop = Math.min(...head.map((n) => n.rect.y));
        expect(firstSection.rect.y - bodyTop, `${size} header`).toBeLessThan(0.25 * g.safeRect.h);
        // Hierarchy: the main title is the largest text; step label and details are the smallest.
        const role = (s: string) => { const t = byId(solved.nodes, s); return t?.type === "text" ? t.role : undefined; };
        expect(role("-intro-title")).toBe("monthTitle");
        expect(role("-intro-number")).toBe("weekTitle");
        expect(role("-intro-eyebrow")).toBe("label");
        expect(role("-intro-overline")).toBe("label");
        const sz = (r: string) => doc.typography.roles[r as "label"].sizePt;
        expect(sz("monthTitle")).toBeGreaterThan(sz("weekTitle"));
        expect(sz("weekTitle")).toBeGreaterThan(sz("label"));
        expect(solved.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
      });
    }

  it("details: one label and one line each, stacked, lines aligned (never “DATE | TIME”)", () => {
    for (const size of ["7x9", "8.5x11"]) {
      const { solved } = solve(stepPage(STEP_HEADERS[0]), size);
      const labels = [0, 1, 2, 3].map((i) => byId(solved.nodes, `-intro-meta${i}-label`)!);
      expect(labels.map((l) => (l.type === "text" ? l.text : ""))).toEqual(["Date", "Time", "Received through", "Type"]);
      const lines = [0, 1, 2, 3].map((i) => byId(solved.nodes, `-intro-meta${i}-line`)!);
      for (const l of lines) {
        expect(l.type).toBe("rule");
        expect(l.rect.x).toBeCloseTo(lines[0].rect.x, 6);
        expect(l.rect.x + l.rect.w).toBeCloseTo(lines[0].rect.x + lines[0].rect.w, 6);
      }
      // Stacked top to bottom, right of the titles.
      for (let i = 1; i < 4; i++) expect(labels[i].rect.y).toBeGreaterThan(labels[i - 1].rect.y);
      expect(labels[0].rect.x).toBeGreaterThan(byId(solved.nodes, "-intro-title")!.rect.x);
    }
  });

  it("a narrow page moves the details below the titles as rows of blanks, inside the header region", () => {
    const { solved, g } = solve(stepPage(STEP_HEADERS[0]), "filofax-personal");
    const title = byId(solved.nodes, "-intro-title")!;
    const firstMeta = solved.nodes.find((n) => /-intro-meta-f0-label$/.test(n.id))!;
    expect(firstMeta.rect.y).toBeGreaterThan(title.rect.y + title.rect.h - 1e-6);
    expect(byId(solved.nodes, "-word-title")!.rect.y).toBeGreaterThan(firstMeta.rect.y + firstMeta.rect.h);
    for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
  });

  it("headers saved before (step label, number, subtitle only) keep their stacked look", () => {
    const { solved } = solve({ header: { eyebrow: "STEP TWO", number: "02", subtitle: "The Word", rule: true }, blocks: [{ id: "word", label: "Write", space: "fill" }] }, "7x9");
    const e = byId(solved.nodes, "-intro-eyebrow")!, n = byId(solved.nodes, "-intro-number")!, sub = byId(solved.nodes, "-intro-subtitle")!;
    expect(e.rect.x).toBeCloseTo(n.rect.x, 6);
    expect(n.rect.x).toBeCloseTo(sub.rect.x, 6);
    expect(e.rect.y).toBeLessThan(n.rect.y);
    expect(n.rect.y).toBeLessThan(sub.rect.y);
    expect(n.type === "text" && n.role).toBe("weekTitle");
    expect(byId(solved.nodes, "-intro-meta0-label")).toBeUndefined();
  });
});
