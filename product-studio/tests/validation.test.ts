import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validatePage, validateProject } from "../src/engines/validation/validate";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { SolvedPage } from "../src/types/layout";

const notepad = () => TEST_PRODUCTS[0].build();
const journal = () => TEST_PRODUCTS[1].build();

describe("validation engine", () => {
  it("flags invalid dimensions and stops", () => {
    const p = notepad();
    p.dimensions = { sizePresetId: "custom", custom: { width: -1, height: 5, unit: "in" }, orientation: "portrait" };
    const r = validateProject(p, heuristicMeasurer);
    expect(r.exportAllowed).toBe(false);
    expect(r.issues[0].rule).toBe("invalid-dimensions");
  });

  it("detects text overflow when a font role grows", () => {
    const p = notepad();
    p.typography.roleOverrides = { pageTitle: { sizePt: 60 } };
    const r = validateProject(p, heuristicMeasurer);
    expect(r.issues.some((i) => i.rule === "text-overflow")).toBe(true);
    expect(r.exportAllowed).toBe(false);
  });

  it("detects heading collisions from long wording instead of shrinking type", () => {
    const p = TEST_PRODUCTS[3].build();
    p.wording = { morning: "Morning Devotion, Worship and Intercession Time" };
    const r = validateProject(p, heuristicMeasurer, { pageIndices: [1] });
    const overflow = r.issues.find((i) => i.rule === "text-overflow");
    expect(overflow?.measurement?.unit).toBe("in");
    expect(overflow!.page).toBe(2);
  });

  it("rejects type below the 6 pt print minimum", () => {
    const p = notepad();
    p.typography.roleOverrides = { footer: { sizePt: 5 } };
    expect(validateProject(p, heuristicMeasurer).issues.some((i) => i.rule === "text-too-small")).toBe(true);
  });

  it("detects safety-zone, keep-out and line-overflow violations on a corrupted page", () => {
    const doc = resolveDocument(notepad());
    const good = solvePage(doc, 0);
    const bad: SolvedPage = {
      ...good,
      nodes: [
        ...good.nodes,
        { type: "checkbox", id: "stray", component: "Checkbox", rect: { x: 1, y: 0.1, w: 0.16, h: 0.16 }, functional: true, strokePt: 0.75, color: "border", radiusIn: 0 },
        { type: "lines", id: "runaway", component: "WritingLines", rect: { x: 1, y: 2, w: 2, h: 1 }, functional: true, orientation: "horizontal", positions: [2.5, 3.5], from: 1, to: 3, strokePt: 0.5, color: "line", opacity: 1 },
      ],
    };
    const rules = validatePage(doc, 0, heuristicMeasurer, bad).map((i) => i.rule);
    expect(rules).toContain("safe-area");
    expect(rules).toContain("glue-keep-out");
    expect(rules).toContain("line-overflow");
  });

  it("detects negative geometry when margins exceed the trim", () => {
    const p = createProject("notepad", {
      dimensions: { sizePresetId: "custom", custom: { width: 1.2, height: 5, unit: "in" }, orientation: "portrait" },
      production: { userMargins: { inside: 0.7, outside: 0.7 } },
      recipe: { items: [{ id: "s", layoutId: "notepad-todo", repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" },
    });
    expect(validateProject(p, heuristicMeasurer).issues.some((i) => i.rule === "negative-geometry")).toBe(true);
  });

  it("enforces printer page-count rules (KDP minimum 24)", () => {
    const p = journal();
    p.recipe.items[0].repeat = { kind: "count", count: 10 };
    const r = validateProject(p, heuristicMeasurer);
    expect(r.issues.find((i) => i.rule === "page-count")!.measurement).toEqual({ actual: 10, limit: 24, unit: "pages" });
  });

  it("enforces saddle-stitch multiples of 4", () => {
    const p = journal();
    p.production.bindingType = "saddle-stitch";
    p.production.printProfileId = "generic-commercial";
    p.recipe.items[0].repeat = { kind: "count", count: 30 };
    expect(validateProject(p, heuristicMeasurer).issues.some((i) => i.rule === "page-count" && i.message.includes("divisible by 4"))).toBe(true);
  });

  it("warns (not silently) when a user margin is raised to a requirement", () => {
    const p = TEST_PRODUCTS[2].build();
    p.production.userMargins = { inside: 0.25 };
    const r = validateProject(p, heuristicMeasurer, { pageIndices: [0] });
    expect(r.issues.some((i) => i.rule === "safe-area" && i.severity === "warning")).toBe(true);
  });

  it("warns about full-bleed backgrounds on writable pads", () => {
    const p = notepad();
    p.decorativeTheme = { ...p.decorativeTheme, style: "marble", placement: "full-page", applyToInterior: true };
    expect(validateProject(p, heuristicMeasurer).issues.some((i) => i.rule === "decoration")).toBe(true);
  });

  it("rejects a binding the printer does not support", () => {
    const p = journal();
    p.production.bindingType = "coil";
    expect(validateProject(p, heuristicMeasurer).issues.some((i) => i.rule === "printer-profile" && i.severity === "error")).toBe(true);
  });
});

describe("layer independence", () => {
  it("changing colors or decoration does not re-solve layout (same cached object)", () => {
    const p = TEST_PRODUCTS[2].build();
    const a = solvePage(resolveDocument(p), 0);
    const b = solvePage(resolveDocument({ ...p, colors: { paletteId: "variant-sage", overrides: {} }, decorativeTheme: { ...p.decorativeTheme, style: "marble" } }), 0);
    expect(b).toBe(a);
  });
  it("changing a font family does not re-expand the recipe", () => {
    const p = TEST_PRODUCTS[2].build();
    const a = resolveDocument(p).recipe;
    const b = resolveDocument({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, headings: "Lora" } } }).recipe;
    expect(b).toBe(a);
  });
  it("variants override colors/title only and share geometry", () => {
    const p = TEST_PRODUCTS[1].build();
    p.variants = [{ id: "v1", name: "Sage", overrides: { colors: { primary: "#56644F" }, title: "Sage Journal" } }];
    p.activeVariantId = "v1";
    const d = resolveDocument(p);
    expect(d.colors.primary).toBe("#56644F");
    expect(d.wording.productTitle).toBe("Sage Journal");
    expect(d.recipe.pageCount).toBe(120);
  });
});
