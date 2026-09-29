/**
 * Page type vs full books: the Page type list offers single page layouts
 * only; complete books are Full planners & books templates. Every book recipe
 * is still available, unchanged, and a template makes the same project the
 * recipe always made.
 */
import { describe, expect, it } from "vitest";
import { projectFromTemplate, previewPages } from "../src/components/wizard/BookTemplates";
import { resolveDocument } from "../src/engines/document/resolve";
import { BOOK_PRESETS } from "../src/presets/bookRecipes";
import { BOOK_TEMPLATES, RECIPE_PRESETS, recipePresetsFor } from "../src/presets/layouts/recipePresets";
import { PRODUCT_FAMILIES } from "../src/presets/products/productFamilies";
import { createProject } from "../src/presets/products/projectFactory";
import { PRODUCT_TYPES } from "../src/presets/products/productTypes";
import type { ProductType } from "../src/types/product";

const CHOICE = { sizeId: "7x9", bindingId: "coil", weekStart: 1 as const, year: 2027 };
const build = (id: string) => RECIPE_PRESETS.find((r) => r.id === id)!.build({ count: 1, sheets: 1 });
/** Book nodes get fresh ids on every build: renumber them in order of appearance (references included), compare the rest. */
const noIds = (x: unknown) => {
  const seen = new Map<string, string>();
  return JSON.stringify(x).replace(/"([gs]-[a-z0-9]{1,12})"/g, (_, id: string) => `"#${seen.get(id) ?? (seen.set(id, String(seen.size)), seen.size - 1)}"`);
};

describe("Page type lists page layouts only", () => {
  for (const t of Object.keys(PRODUCT_TYPES) as ProductType[]) {
    it(`${t}: no complete book among its page types`, () => {
      for (const r of recipePresetsFor(t)) {
        expect(r.template, r.id).toBeUndefined();
        // A page type is one kind of page: a flat page list, or a single book step (no sections) — never a whole book.
        const st = r.build({ count: 1, sheets: 1 }).structure;
        expect(!st || (st.length === 1 && st[0].kind === "step"), r.id).toBe(true);
        expect(r.label, r.id).not.toMatch(/^Book:/);
      }
    });
  }
});

describe("Full planners & books", () => {
  it("every book recipe is still offered — as a template, none deleted", () => {
    expect(BOOK_TEMPLATES.map((t) => t.id).sort()).toEqual(["book-daily-planner", "book-meetings-with-god", "book-meetings-with-god-daily", "book-planner-journal"]);
    // Each book structure the Book structure editor offers has a template that builds exactly it.
    for (const b of BOOK_PRESETS) {
      const s = noIds(b.build());
      expect(BOOK_TEMPLATES.some((t) => noIds(t.build({ count: 1, sheets: 1 }).structure) === s), b.id).toBe(true);
    }
  });

  it("plain names and one-line explanations — no recipe syntax, no long labels", () => {
    expect(Object.fromEntries(BOOK_TEMPLATES.map((t) => [t.id, [t.label, t.template!.summary]]))).toEqual({
      "book-daily-planner": ["Daily Planner + Meetings With God", "Includes monthly, weekly, daily and Meetings With God pages."],
      "book-meetings-with-god": ["Meetings With God Planner", "Monthly and weekly planning with Meetings With God journal pages."],
      "book-meetings-with-god-daily": ["Meetings With God Planner + Daily Pages", "Monthly, weekly, Meetings With God and journal pages, plus a page for every day."],
      "book-planner-journal": ["Monthly + Weekly Journal Planner", "Monthly planning, weekly planning and a journal page every week."],
    });
    for (const t of [...BOOK_TEMPLATES.map((x) => x.label), ...BOOK_PRESETS.map((x) => x.label)]) {
      expect(t).not.toMatch(/Book:|·|\(|\)/);
      expect(t.length).toBeLessThanOrEqual(40);
    }
  });

  for (const t of BOOK_TEMPLATES) {
    it(`${t.label}: Use this template makes the same project the recipe makes (recipe, options, every page)`, () => {
      const made = projectFromTemplate(t, CHOICE);
      expect(noIds(made.recipe)).toEqual(noIds(build(t.id)));
      expect(made.layoutOptions).toMatchObject(t.layoutOptions ?? {});
      expect(made.dimensions).toMatchObject({ sizePresetId: "7x9", orientation: "portrait" });
      expect(made.calendar).toMatchObject({ startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1 });
      // The way the wizard built it before: same recipe + options through createProject.
      const before = createProject("planner", { dimensions: made.dimensions, production: made.production, calendar: made.calendar, recipe: build(t.id), layoutOptions: t.layoutOptions });
      const pages = (p: typeof made) => resolveDocument(p).recipe.pages.map((x) => `${x.period.kind}:${"key" in x.period ? x.period.key : ""}|${x.layoutId}|${x.side}|${x.spreadPart ?? ""}|${x.pageNumber}`);
      expect(pages(made)).toEqual(pages(before));
    });

    it(`${t.label}: previews come from the real resolved pages at each suggested size`, () => {
      for (const sizeId of PRODUCT_TYPES.planner.suggestedSizes) {
        const doc = resolveDocument(projectFromTemplate(t, { ...CHOICE, sizeId }));
        expect(previewPages(doc, t.template!.preview).length, sizeId).toBe(t.template!.preview.length);
      }
    });
  }

  it("the simplified home lists product categories; complete books stay available as templates", () => {
    // Daily Planner and Planner + Journal are no longer separate home cards: they are Planner, with the complete
    // books (Daily Planner + Meetings With God, Meetings With God Planner, …) offered under Full planners & books.
    expect(PRODUCT_FAMILIES.map((f) => f.id)).not.toContain("daily-planner");
    expect(PRODUCT_FAMILIES.find((f) => f.id === "planner")!.start).toMatchObject({ type: "planner" });
    expect(BOOK_TEMPLATES.map((t) => t.id)).toEqual(expect.arrayContaining(["book-daily-planner", "book-meetings-with-god"]));
    for (const f of PRODUCT_FAMILIES) if (f.start?.template) expect(BOOK_TEMPLATES.some((t) => t.id === f.start!.template)).toBe(true);
  });
});
