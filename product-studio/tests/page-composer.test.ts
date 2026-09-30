/**
 * PAGE COMPOSER (Phase 1) — a Custom Page built from structured pieces:
 * heading/text, writing area, prompt + writing space, info row, table,
 * checklist/task list, divider and spacer. Everything flows top to bottom
 * inside the print-safe area; Product Studio does the geometry.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { contentOf, kindOf, type PromptBlock, type PromptSet } from "../src/types/prompts";

const DASHBOARD: PromptBlock[] = [
  { id: "intro", kind: "heading", label: "Master Dashboard", prompt: "Where every project stands this season." },
  { id: "info", kind: "info", label: "", fields: ["Season", "Updated"] },
  { id: "focus", label: "Current Focus", space: "fixed", lineCount: 3, responseStyle: "ruled" },
  { id: "rule1", kind: "divider", label: "" },
  { id: "projects", label: "Projects", space: "fixed", lineCount: 5, responseStyle: "table", table: { columns: ["Project", "Next step", "Due"], rows: 5, showHeader: true, borders: "horizontal" } },
  { id: "gap", kind: "spacer", label: "", spacer: "small" },
  { id: "tasks", label: "This week", space: "fixed", lineCount: 5, responseStyle: "checkboxes", taskMarker: "circle", taskMarkerPosition: "left" },
  { id: "notes", label: "Notes", space: "fill", responseStyle: "ruled" },
];

const composed = (blocks: PromptBlock[], size = "7x9") =>
  createProject("planner", {
    name: "Composer",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "dash", layoutId: "guided-page", title: "Master Dashboard", promptSet: { blocks } as PromptSet })] },
  });

describe("Page Composer blocks", () => {
  for (const size of ["8.5x11", "7x9", "5.5x8.5"]) {
    it(`${size}: a dashboard page from every block kind — each drawn, inside the safe area, no errors`, () => {
      const doc = resolveDocument(composed(DASHBOARD, size));
      const i = doc.recipe.pages.findIndex((p) => p.layoutId === "guided-page");
      const g = geometryFor(doc, doc.recipe.pages[i]);
      const nodes = doc.recipe.pages.filter((p) => p.layoutId === "guided-page").flatMap((_, k) => solvePage(doc, i + k).nodes);
      const has = (re: RegExp) => nodes.some((n) => re.test(n.id));
      expect(has(/-intro-title$/)).toBe(true); // heading
      expect(has(/-intro-prompt$/)).toBe(true); // its text line
      expect(has(/-info-surface-f1-label$/)).toBe(true); // info row, second field
      expect(has(/-rule1-surface-rule$/)).toBe(true); // divider
      expect(has(/-gap-surface$/)).toBe(true); // spacer
      expect(has(/-projects-surface/)).toBe(true); // table
      expect(has(/-tasks-surface/)).toBe(true); // checklist
      for (const n of solvePage(doc, i).nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
      expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
    });
  }

  it("a heading has no writing space; a spacer is exactly its chosen height; a divider draws one rule", () => {
    const doc = resolveDocument(composed([{ id: "h", kind: "heading", label: "Big Idea" }, { id: "s", kind: "spacer", label: "", spacer: "large" }, { id: "d", kind: "divider", label: "" }, { id: "w", label: "Write", space: "fill" }]));
    const nodes = solvePage(doc, doc.recipe.pages.findIndex((p) => p.layoutId === "guided-page")).nodes;
    expect(nodes.some((n) => /-h-surface-/.test(n.id) && n.type === "lines")).toBe(false);
    expect(nodes.find((n) => n.id.endsWith("-s-surface"))!.rect.h).toBeCloseTo(1, 6);
    expect(nodes.filter((n) => /-d-surface-rule$/.test(n.id))).toHaveLength(1);
  });

  it("reordering sections reorders the page", () => {
    const a = [{ id: "one", label: "One", space: "fixed" as const, lineCount: 2 }, { id: "two", label: "Two", space: "fixed" as const, lineCount: 2 }];
    const y = (blocks: PromptBlock[], id: string) => {
      const doc = resolveDocument(composed(blocks));
      return solvePage(doc, doc.recipe.pages.findIndex((p) => p.layoutId === "guided-page")).nodes.find((n) => n.id.endsWith(`-${id}-title`))!.rect.y;
    };
    expect(y(a, "one")).toBeLessThan(y(a, "two"));
    expect(y([...a].reverse(), "one")).toBeGreaterThan(y([...a].reverse(), "two"));
  });

  it("sections saved before the composer are prompts; every section says how it will be filled in (field or list)", () => {
    expect(kindOf({ id: "x", label: "Old" })).toBe("prompt");
    expect(contentOf({ id: "notes", label: "Notes" })).toEqual({ mode: "field", key: "notes" });
    expect(contentOf({ id: "p", label: "Projects", responseStyle: "table" })).toEqual({ mode: "list", key: "p" });
    expect(contentOf({ id: "w", label: "Words", content: { mode: "list", key: "propheticWords" } })).toEqual({ mode: "list", key: "propheticWords" });
  });
});
