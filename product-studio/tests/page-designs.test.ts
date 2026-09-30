/**
 * REUSABLE PAGE DESIGNS (Phase 2) — build a page once, save it as a page
 * design, insert it into products repeatedly:
 *
 *   saved page design  the master structure (never overwritten by a save)
 *   inserted pages     a group of independent Custom Page steps, one per page
 *
 * Save / reload, one and many copies, independence, page counts, order, a
 * whole product (cover, planner pages, designs, dividers, notes, end cover),
 * three trims, theme changes and export.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { rectContains } from "../src/engines/layout/math";
import { planPrint } from "../src/engines/print/printPlan";
import { updateNode } from "../src/engines/recipe/bookEdit";
import { addDivider, addEndCover, addFrontCover, addMonthly, addPageOfType } from "../src/engines/recipe/pageBuilder";
import { addPageFromDesign, designGroupOf, isDesignGroup, moveAmong, savePageDesign, setDesignPageCount } from "../src/engines/recipe/pageDesigns";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { PageDesign, ProductProject } from "../src/types/project";
import type { BookGroup, BookNode, BookStep } from "../src/types/recipe";
import { MASTER_DASHBOARD, PROJECT_SNAPSHOT, REVELATION_TO_EXECUTION } from "./fixtures/composerPages";

const base = (size = "7x9", extra: Record<string, unknown> = {}) =>
  createProject("custom", {
    name: "Designs",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "work", layoutId: "guided-page", title: "", promptSet: PROJECT_SNAPSHOT() })] },
    ...extra,
  });

function save(p: ProductProject, name: string, set = PROJECT_SNAPSHOT()): { p: ProductProject; d: PageDesign } {
  const s: BookStep = { kind: "step", id: "src", module: "custom", layoutId: "guided-page", cadence: { type: "copies", count: 1 }, title: "", promptSet: set };
  const res = savePageDesign(p, s, name, "2026-09-30T00:00:00Z");
  if ("error" in res) throw new Error(res.error);
  return { p: res.project, d: res.design };
}
const withStructure = (p: ProductProject, structure: BookNode[]): ProductProject => ({ ...p, recipe: { ...p.recipe, structure } });
const groups = (nodes: BookNode[]) => nodes.filter(isDesignGroup) as (BookGroup & { designId: string })[];
const reload = (p: ProductProject): ProductProject => JSON.parse(JSON.stringify(p));
const pagesOf = (doc: ReturnType<typeof resolveDocument>, g: BookGroup) => {
  const ids = new Set(g.children.map((c) => c.id));
  return doc.recipe.pages.map((pg, i) => ({ pg, i })).filter(({ pg }) => ids.has(pg.recipeItemId ?? "") && !pg.filler);
};
const pageText = (doc: ReturnType<typeof resolveDocument>, i: number) => solvePage(doc, i).nodes.flatMap((n) => (n.type === "text" ? [n.text] : [])).join(" | ");

describe("save a page design", () => {
  it("saves the sections under a name; survives a reload; never overwrites an existing design", () => {
    const { p, d } = save(base(), "Project Snapshot");
    const again = reload(p);
    expect(again.pageDesigns).toHaveLength(1);
    expect(again.pageDesigns![0]).toEqual(d);
    expect(again.pageDesigns![0].promptSet.blocks.map((b) => b.label)).toEqual(PROJECT_SNAPSHOT().blocks.map((b) => b.label));
    const s = again.recipe.structure![0] as BookStep;
    const dup = savePageDesign(again, s, " project snapshot ");
    expect("error" in dup && dup.error).toMatch(/already exists/);
    expect("error" in savePageDesign(again, s, "   ") && true).toBe(true);
  });

  it("stores structure only: no colors, fonts or coordinates in the design", () => {
    const { d } = save(base(), "Project Snapshot", { ...PROJECT_SNAPSHOT(), frame: "rounded" });
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/#[0-9a-f]{6}/i);
    expect(json).not.toMatch(/"(x|y|w|h|sizePt|fontFamily|paletteId)":/);
  });
});

describe("insert pages from a design", () => {
  it("one copy, then eight copies: each its own page, in a group named after the design, before the end cover", () => {
    const { p, d } = save(base(), "Project Snapshot");
    const one = addPageFromDesign(addEndCover(p.recipe.structure!), d, 1);
    expect(groups(one)).toHaveLength(1);
    expect(groups(one)[0].children).toHaveLength(1);
    const eight = addPageFromDesign(addEndCover(p.recipe.structure!), d, 8);
    const g = groups(eight)[0];
    expect(g.label).toBe("Project Snapshot");
    expect(g.children).toHaveLength(8);
    expect(new Set(g.children.map((c) => c.id)).size).toBe(8);
    // Every page has its own copy of the sections (no shared objects).
    const sets = g.children.map((c) => (c as BookStep).promptSet!);
    expect(new Set(sets).size).toBe(8);
    expect(sets.every((x) => x !== d.promptSet)).toBe(true);
    expect(eight.at(-1)).toMatchObject({ kind: "step", module: "back-cover" });
    const doc = resolveDocument(withStructure(p, eight));
    expect(pagesOf(doc, g).length).toBeGreaterThanOrEqual(8);
  });

  it("editing copy #4 changes only copy #4 — not the other pages, not the saved design; survives reload", () => {
    const { p, d } = save(base("8.5x11"), "Project Snapshot");
    let structure = addPageFromDesign(p.recipe.structure!, d, 8);
    const g = groups(structure)[0];
    const fourth = g.children[3] as BookStep;
    structure = updateNode(structure, fourth.id, (n) => ({ ...n, promptSet: { ...(n as BookStep).promptSet!, blocks: (n as BookStep).promptSet!.blocks.map((b) => (b.id === "purpose" ? { ...b, label: "Why this project" } : b)) } }) as BookNode);
    const saved = reload(withStructure(p, structure));
    const doc = resolveDocument(saved);
    const pages = pagesOf(doc, groups(saved.recipe.structure!)[0]);
    expect(pages).toHaveLength(8);
    pages.forEach(({ i }, k) => {
      const t = pageText(doc, i);
      if (k === 3) expect(t).toContain("Why this project");
      else expect(t, `copy ${k + 1}`).not.toContain("Why this project");
    });
    expect(saved.pageDesigns![0].promptSet.blocks.find((b) => b.id === "purpose")!.label).toBe("Purpose");
    expect(designGroupOf(saved.recipe.structure!, fourth.id)?.id).toBe(g.id);
  });

  it("number of pages: more pages are fresh copies of the design; fewer removes from the end, keeping edited pages", () => {
    const { p, d } = save(base(), "Project Snapshot");
    let s = addPageFromDesign(p.recipe.structure!, d, 3);
    const g = groups(s)[0];
    const first = g.children[0] as BookStep;
    s = updateNode(s, first.id, (n) => ({ ...n, title: "Edited" }) as BookNode);
    s = setDesignPageCount(s, g.id, 5, d);
    expect(groups(s)[0].children).toHaveLength(5);
    expect((groups(s)[0].children[4] as BookStep).title).toBe(d.title ?? d.name);
    s = setDesignPageCount(s, g.id, 2, d);
    expect(groups(s)[0].children.map((c) => c.id)).toEqual([first.id, g.children[1].id]);
    expect((groups(s)[0].children[0] as BookStep).title).toBe("Edited");
    // The saved design was deleted: new pages copy the group's first page.
    s = setDesignPageCount(s, g.id, 3);
    expect(groups(s)[0].children).toHaveLength(3);
    expect((groups(s)[0].children[2] as BookStep).promptSet).not.toBe((groups(s)[0].children[0] as BookStep).promptSet);
  });

  it("design pages can be put in order among the custom / design pages (structured moves, nothing else moves)", () => {
    const { p, d } = save(base(), "Project Snapshot");
    const r2e = save(p, "Revelation to Execution", REVELATION_TO_EXECUTION());
    let s = addEndCover(addPageFromDesign(addPageFromDesign(addPageOfType(addFrontCover(p.recipe.structure!), "notes"), d, 2), r2e.d, 3));
    const among = (n: BookNode) => isDesignGroup(n) || (n.kind === "step" && n.module === "custom");
    const order = () => s.map((n) => (n.kind === "group" ? n.label : n.module));
    expect(order()).toEqual(["cover-page", "custom", "notes", "Project Snapshot", "Revelation to Execution", "back-cover"]);
    s = moveAmong(s, groups(s)[1].id, -1, among);
    expect(order()).toEqual(["cover-page", "custom", "notes", "Revelation to Execution", "Project Snapshot", "back-cover"]);
    s = moveAmong(s, groups(s)[0].id, -1, among);
    expect(order()).toEqual(["cover-page", "Revelation to Execution", "custom", "notes", "Project Snapshot", "back-cover"]);
  });
});

describe("a whole product: cover, planner pages, design pages, dividers, notes, end cover", () => {
  it("assembles in the existing Pages / book structure; every page solves; nothing to fix", () => {
    let p = createProject("planner", {
      name: "Assembly",
      dimensions: { sizePresetId: "7x9", orientation: "portrait" },
      production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
      calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 1, sixRowMonths: true },
      recipe: { items: [], ordering: "chronological", structure: [] },
    });
    const dash = save(p, "Master Dashboard", MASTER_DASHBOARD());
    const snap = save(dash.p, "Project Snapshot");
    const r2e = save(snap.p, "Revelation to Execution", REVELATION_TO_EXECUTION());
    p = r2e.p;
    let s: BookNode[] = addFrontCover([]);
    s = addPageFromDesign(s, dash.d, 1);
    s = addPageFromDesign(s, snap.d, 8);
    s = addDivider(s, "Revelation");
    s = addPageFromDesign(s, r2e.d, 20);
    s = addMonthly(s);
    s = addPageOfType(s, "notes");
    s = addEndCover(s);
    p = withStructure(p, s);
    const doc = resolveDocument(p);
    const real = doc.recipe.pages.filter((x) => !x.filler);
    expect(real[0].layoutId).toBe("cover-page");
    expect(real.at(-1)!.layoutId).toBe("back-cover-page");
    const [gDash, gSnap, gR2e] = groups(s);
    expect(pagesOf(doc, gDash)).toHaveLength(1);
    expect(pagesOf(doc, gSnap).length).toBeGreaterThanOrEqual(8);
    expect(pagesOf(doc, gR2e)).toHaveLength(20);
    // In order: dashboard, snapshots, divider, revelation pages.
    const firstOf = (g: BookGroup) => pagesOf(doc, g)[0].i;
    const divider = doc.recipe.pages.findIndex((x) => x.layoutId === "divider-page");
    expect(firstOf(gDash)).toBeLessThan(firstOf(gSnap));
    expect(firstOf(gSnap)).toBeLessThan(divider);
    expect(divider).toBeLessThan(firstOf(gR2e));
    expect(doc.recipe.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
  });
});

describe("page sizes, Style and export", () => {
  for (const size of ["8.5x11", "7x9", "5.5x8.5"]) {
    it(`${size}: every inserted page reflows inside the safe area with no errors (continuing on another page when it must)`, () => {
      const { p, d } = save(base(size), "Project Snapshot");
      const dash = save(p, "Master Dashboard", MASTER_DASHBOARD());
      const s = addPageFromDesign(addPageFromDesign(p.recipe.structure!, d, 3), dash.d, 2);
      const doc = resolveDocument(withStructure(dash.p, s));
      for (const g of groups(s)) {
        const pages = pagesOf(doc, g);
        expect(pages.length).toBeGreaterThanOrEqual(g.children.length);
        for (const { pg, i } of pages) {
          const solved = solvePage(doc, i);
          const geo = geometryFor(doc, pg);
          expect(solved.diagnostics.filter((x) => x.severity === "error"), `${size} ${g.label}`).toEqual([]);
          for (const n of solved.nodes.filter((n) => n.functional !== false && n.type !== "group")) expect(rectContains(geo.safeRect, n.rect), `${size} ${n.id}`).toBe(true);
        }
      }
      expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error"), size).toEqual([]);
    });
  }

  it("a Style change (palette, fonts, writing lines, section treatment) changes the look, never the pages' structure", () => {
    const { p, d } = save(base("7x9"), "Project Snapshot");
    const s = addPageFromDesign(p.recipe.structure!, d, 3);
    const before = withStructure(p, s);
    const after: ProductProject = {
      ...before,
      colors: { paletteId: "dove-blush", overrides: {} },
      typography: { ...before.typography, fonts: { ...before.typography.fonts, headings: "Lato" } },
      functionalPattern: { ...before.functionalPattern, kind: "dot-grid" },
    };
    const a = resolveDocument(before), b = resolveDocument(after);
    expect(JSON.stringify(a.colors)).not.toBe(JSON.stringify(b.colors));
    expect(a.typography.fonts.headings).not.toBe(b.typography.fonts.headings);
    expect(JSON.stringify(after.recipe.structure)).toBe(JSON.stringify(before.recipe.structure));
    expect(after.pageDesigns).toEqual(before.pageDesigns);
    const g = groups(s)[0];
    expect(pagesOf(b, g).length).toBe(pagesOf(a, g).length);
    const rects = (doc: typeof a) => pagesOf(doc, g).flatMap(({ i }) => solvePage(doc, i).nodes.filter((n) => n.type === "group").map((n) => `${n.id}:${JSON.stringify(n.rect)}`));
    expect(rects(b)).toEqual(rects(a));
  });

  it("export: the print job holds every inserted page, in book order, one page size", () => {
    const { p, d } = save(base("7x9"), "Project Snapshot");
    const s = addEndCover(addPageFromDesign(addFrontCover(p.recipe.structure!), d, 8));
    const doc = resolveDocument(withStructure(p, s));
    const plan = planPrint(doc, { scope: "full", repeatSheets: false, target: "print-pdf" });
    expect(plan.errors).toEqual([]);
    const ids = new Set(groups(s)[0].children.map((c) => c.id));
    const printed = plan.sequence.filter((i) => ids.has(doc.recipe.pages[i].recipeItemId ?? ""));
    expect(printed.length).toBeGreaterThanOrEqual(8);
    expect([...printed].sort((x, y) => x - y)).toEqual(printed);
  });
});
