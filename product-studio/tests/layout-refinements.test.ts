/**
 * Phase 7 refinements: page-filling sections follow the page (deliberate counts
 * never change), sections have meaningful names, and a column width the maker
 * set is kept exactly.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { refitAfterEdit, rowsFillingOnePage, refitPageFilling } from "../src/engines/recipe/fitRows";
import { inventoryCountSet, inventoryRecordSet } from "../src/presets/layouts/recipePresets";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { sectionName, type PromptBlock, type PromptSet } from "../src/types/prompts";
import type { ProductProject } from "../src/types/project";

function notebook(set: PromptSet, orientation: "portrait" | "landscape" = "portrait", size = "8.5x11"): ProductProject {
  return createProject("notebook", {
    dimensions: { sizePresetId: size, orientation },
    production: { bindingType: "coil" as never, printProfileId: "coil-generic", includeBleed: false, duplex: true },
    recipe: { items: [], ordering: "sequential", structure: [step("worksheet", { type: "copies", count: 3 }, { title: "Inventory Count", promptSet: set })] },
  });
}
const blockOf = (p: ProductProject, id: string) => p.recipe.structure!.flatMap((n) => (n.kind === "step" ? n.promptSet?.blocks ?? [] : [])).find((b) => b.id === id)!;
const rows = (p: ProductProject) => blockOf(p, "inv-count").table!.rows;

describe("page-filling sections follow the page", () => {
  it("turning the page refits the rows in the same edit; the pages stay one per copy", () => {
    const portrait = refitPageFilling(notebook(inventoryCountSet()));
    const landscape = refitAfterEdit(portrait, { ...portrait, dimensions: { ...portrait.dimensions, orientation: "landscape" } });
    expect(rows(landscape)).toBe(rowsFillingOnePage(landscape, "inv-count"));
    expect(rows(landscape)).toBeLessThan(rows(portrait));
    expect(resolveDocument(landscape).recipe.pages.filter((x) => !x.filler)).toHaveLength(3);
    const smaller = refitAfterEdit(landscape, { ...landscape, dimensions: { ...landscape.dimensions, sizePresetId: "6x9", orientation: "portrait" } });
    expect(rows(smaller)).toBe(rowsFillingOnePage(smaller, "inv-count"));
  });
  it("adding a section above the table refits it too", () => {
    const p = refitPageFilling(notebook(inventoryCountSet()));
    const s = p.recipe.structure![0];
    const withNote = { ...p, recipe: { ...p.recipe, structure: [{ ...s, promptSet: { ...s.kind === "step" ? s.promptSet! : { blocks: [] }, instructions: "Count every shelf before lunch. Note damaged stock in the last column." } } as typeof s] } };
    expect(rows(refitAfterEdit(p, withNote))).toBeLessThanOrEqual(rows(p));
  });
  it("a count the maker typed is deliberate: never refitted", () => {
    const set = inventoryCountSet(12);
    const deliberate: PromptSet = { ...set, blocks: set.blocks.map((b) => (b.id === "inv-count" ? { ...b, fillPage: undefined } : b)) };
    const p = notebook(deliberate);
    const turned = refitAfterEdit(p, { ...p, dimensions: { ...p.dimensions, orientation: "landscape" } });
    expect(rows(turned)).toBe(12);
  });
  it("records that fill the page refit too; an edit unrelated to the room on the page changes nothing", () => {
    const p = refitPageFilling(notebook(inventoryRecordSet(1)));
    const per = blockOf(p, "inv-records").recordCount!;
    const turned = refitAfterEdit(p, { ...p, dimensions: { ...p.dimensions, orientation: "landscape" } });
    expect(blockOf(turned, "inv-records").recordCount).toBe(rowsFillingOnePage(turned, "inv-records"));
    expect(per).toBeGreaterThan(1);
    const renamed = { ...p, name: "Renamed" };
    expect(refitAfterEdit(p, renamed)).toBe(renamed);
  });
});

describe("sections have meaningful names", () => {
  const b = (x: Partial<PromptBlock>): PromptBlock => ({ id: "x", label: "", ...x });
  it.each([
    [b({ responseStyle: "table", table: { columns: ["Item", "SKU", "Supplier", "Qty"], rows: 5 } }), "Table: Item, SKU, Supplier…"],
    [b({ kind: "record", recordFields: ["Item", "SKU"] }), "Records: Item, SKU"],
    [b({ kind: "list", items: [{ text: "a" }, { text: "b" }] }), "List (2 items)"],
    [b({ kind: "heading", textStyle: "body", prompt: "Morning light finds the kitchen before we do." }), "Text: Morning light finds the kitchen before…"],
    [b({ responseStyle: "checkboxes" }), "Checklist"],
    [b({}), "Writing space"],
    [b({ label: "Prayer" }), "Prayer"],
  ])("%#", (block, name) => expect(sectionName(block)).toBe(name));
});

describe("a column width the maker set is kept exactly", () => {
  const widthsOf = (p: ProductProject) => Object.fromEntries(solvePage(resolveDocument(p), 0).nodes.filter((n) => n.type === "text" && /-h-(no|c\d+)$/.test(n.id)).map((n) => [(n as { text: string }).text, n.rect.w]));
  const withWidths = (w: (number | null)[]): PromptSet => {
    const set = inventoryCountSet(10);
    return { ...set, blocks: set.blocks.map((x) => (x.id === "inv-count" ? { ...x, fillPage: undefined, table: { ...x.table!, columnWidths: w } } : x)) };
  };
  it("a set width is drawn at that width (less the cell insets); the others share the rest", () => {
    const auto = widthsOf(notebook(withWidths([])));
    const set = widthsOf(notebook(withWidths([2.5])));
    const inset = auto.Item - (auto.Item); // same insets both ways
    expect(set.Item + inset).toBeGreaterThan(auto.Item);
    // Column 1 (Item) is 2.5" wide including its insets: header text box = 2.5 − 2 × inset.
    const doc = resolveDocument(notebook(withWidths([2.5])));
    const ins = doc.spacing.labelToBorderInset;
    expect(set.Item).toBeCloseTo(2.5 - 2 * ins, 6);
    expect(set.Notes).toBeLessThan(auto.Notes);
  });
  it("widths that can't fit are reported, never silently changed", () => {
    const s = solvePage(resolveDocument(notebook(withWidths([3, 3, 3]))), 0);
    expect(s.diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join(" ")).toMatch(/column widths you set/);
  });
});
