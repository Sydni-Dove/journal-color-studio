/**
 * Weekly sidebar / section headings fit user-entered wording of any length:
 * normal size on one line → two lines (where the heading area is tall enough)
 * → 0.5 pt steps down to HEADING_MIN_PT → an explicit heading-fit error.
 * Checked against the SOLVED node bounds, the measured ink and the rendered
 * markup — never only state.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { inkBoxFor } from "../src/engines/typography/ink";
import { heuristicMeasurer, styleForRole } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { fitHeading, HEADING_MIN_PT } from "../src/layouts/shared/components";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { Rect } from "../src/types/geometry";
import type { LayoutNode, TextNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";

const cal = { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1 as const, sixRowMonths: true };
const weeklyRecipe = { items: [{ id: "w", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" as const } }], ordering: "chronological" as const };
const PRODUCTS: [string, () => ProductProject][] = [
  ["7 × 9 weekly", () => TEST_PRODUCTS[3].build()],
  ["Half Letter weekly", () => createProject("planner", { dimensions: { sizePresetId: "5.5x8.5", orientation: "portrait" }, production: { bindingType: "discbound", printProfileId: "disc-generic", duplex: true }, calendar: cal, recipe: weeklyRecipe })],
  ["Franklin Compact weekly", () => createProject("insert", { dimensions: { sizePresetId: "franklin-compact", orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: weeklyRecipe, layoutOptions: { showSidebar: true } })],
];
const TOO_LONG = "Important Things To Remember Before Sunday Service";

function solveWith(make: () => ProductProject, heading: string) {
  const p = make();
  p.layoutOptions.showSidebar = true;
  p.layoutOptions.sidebarContent = "prayer";
  p.wording = { ...p.wording, prayer: heading };
  const doc = resolveDocument(p);
  const index = doc.recipe.pages.findIndex((x) => x.spreadPart === 0);
  const solved = solvePage(doc, index);
  const node = solved.nodes.find((n): n is TextNode => n.type === "text" && /sidebar-(name|title)$/.test(n.id))!;
  const slot = solved.nodes.find((n) => n.id === "wk0-sidebar-bounds")!;
  const issues = validateProject(p, heuristicMeasurer, { pageIndices: [index] }).issues;
  const html = renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[index])} solved={solved} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} spacing={doc.spacing} mode="print" />,
  );
  return { p, doc, index, solved, node, slot, ink: inkBoxFor(node, doc.typography, heuristicMeasurer), issues, html };
}
const errors = (issues: { severity: string }[]) => issues.filter((i) => i.severity === "error");

/** The heading's ink keeps the section-heading inset from the slot's side rules and top edge. */
function expectInsideSlot(ink: Rect, slot: LayoutNode, inset: number) {
  const r = slot.rect;
  expect(ink.x).toBeGreaterThanOrEqual(r.x + inset - 1e-6);
  expect(ink.x + ink.w).toBeLessThanOrEqual(r.x + r.w - inset + 1e-6);
  expect(ink.y).toBeGreaterThanOrEqual(r.y + inset - 1e-6);
}

describe("fitHeading (shared primitive)", () => {
  const typography = resolveDocument(TEST_PRODUCTS[3].build()).typography;
  const ctx = { typography };
  const w = (t: string, pt = 9) => heuristicMeasurer(t, { ...styleForRole(typography, "subheading"), sizePt: pt });
  it("keeps the normal size on one line when it fits", () => {
    const f = fitHeading("Notes", "subheading", { w: 1.2, h: 0.2 }, ctx);
    expect([f.ok, f.sizePt, f.lines]).toEqual([true, 9, ["Notes"]]);
  });
  it("wraps to two lines at the normal size before shrinking, when the area is tall enough", () => {
    const f = fitHeading("Prayer Requests", "subheading", { w: w("Prayer Requests") * 0.8, h: 0.5 }, ctx);
    expect([f.ok, f.sizePt, f.lines]).toEqual([true, 9, ["Prayer", "Requests"]]);
  });
  it("shrinks in 0.5 pt steps when two lines do not fit the height — never below the minimum", () => {
    const f = fitHeading("Prayer Requests", "subheading", { w: w("Prayer Requests") * 0.9, h: 0.2 }, ctx);
    expect(f.ok).toBe(true);
    expect(f.sizePt).toBeLessThan(9);
    expect(f.sizePt).toBeGreaterThanOrEqual(HEADING_MIN_PT);
    expect((f.sizePt * 2) % 1).toBe(0);
    const no = fitHeading(TOO_LONG, "subheading", { w: 0.8, h: 0.2 }, ctx);
    expect(no.ok).toBe(false);
    expect(no.sizePt).toBe(HEADING_MIN_PT);
    expect(no.excessIn).toBeGreaterThan(0);
  });
});

describe("7 × 9 weekly sidebar heading", () => {
  const make = PRODUCTS[0][1];

  it("short label (Notes): default size, one line, no error", () => {
    const r = solveWith(make, "Notes");
    expect(r.node.fit).toBeUndefined();
    expect(r.ink.h).toBeCloseTo((9 * 1.2) / 72, 9);
    expect(r.html).toMatch(/font-size:9pt/);
    expect(errors(r.issues)).toEqual([]);
  });

  it("medium label (Prayer Requests — the reported defect): fits cleanly, no collision, no error", () => {
    const r = solveWith(make, "Prayer Requests");
    expect(r.node.fit).toBeDefined();
    expect(r.node.fit!.sizePt).toBeGreaterThanOrEqual(HEADING_MIN_PT);
    expectInsideSlot(r.ink, r.slot, r.doc.spacing.sectionHeadingInset);
    // Sits on the day names' baseline, above the header rule by labelToBorderInset.
    const monday = r.solved.nodes.find((n): n is TextNode => n.type === "text" && n.id === "wk0-d0-name")!;
    const mInk = inkBoxFor(monday, r.doc.typography, heuristicMeasurer);
    expect(r.ink.y + r.ink.h).toBeCloseTo(mInk.y + mInk.h, 9);
    expect(r.ink.x + r.ink.w).toBeLessThan(mInk.x);
    expect(errors(r.issues)).toEqual([]);
    expect(r.issues.filter((i) => i.rule === "text-overflow" || i.rule === "text-collision" || i.rule === "heading-fit")).toEqual([]);
    expect(r.html).toMatch(new RegExp(`font-size:${r.node.fit!.sizePt}pt`));
  });

  it("longer label (Kingdom Assignments): two readable lines, no border collision, no error", () => {
    const r = solveWith(make, "Kingdom Assignments");
    expect(r.node.fit!.lines).toEqual(["Kingdom", "Assignments"]);
    expect(r.node.fit!.sizePt).toBeGreaterThanOrEqual(HEADING_MIN_PT);
    expectInsideSlot(r.ink, r.slot, r.doc.spacing.sectionHeadingInset);
    expect(errors(r.issues)).toEqual([]);
    // Rendered as the two solved lines.
    expect(r.html).toMatch(/<span style="display:block">Kingdom<\/span><span style="display:block">Assignments<\/span>/);
  });

  it("realistic user headings all fit", () => {
    for (const h of ["Notes", "Priorities", "Prayer Requests", "Kingdom Assignments", "Important Things This Week"]) {
      const r = solveWith(make, h);
      expectInsideSlot(r.ink, r.slot, r.doc.spacing.sectionHeadingInset);
      expect(errors(r.issues), h).toEqual([]);
    }
  });

  it("excessively long label: an explicit heading-fit error with page, element and excess — no generic overflow / collision", () => {
    const r = solveWith(make, TOO_LONG);
    const e = r.issues.filter((i) => i.rule === "heading-fit");
    expect(e).toHaveLength(1);
    expect(e[0].severity).toBe("error");
    expect(e[0].page).toBe(r.doc.recipe.pages[r.index].pageNumber);
    expect(e[0].componentId).toBe("wk0-sidebar-name");
    expect(e[0].message).toMatch(/^Sidebar heading "IMPORTANT THINGS TO REMEMBER BEFORE SUNDAY SERVICE" exceeds the available heading width by \d\.\d\d"/);
    expect(e[0].measurement!.actual - e[0].measurement!.limit).toBeGreaterThan(0);
    expect(r.issues.filter((i) => i.rule === "text-overflow" || i.rule === "text-collision")).toEqual([]);
    // Drawn at the minimum, never smaller, and kept inside its box (the error blocks export).
    expect(r.node.fit!.sizePt).toBe(HEADING_MIN_PT);
    expect(r.node.fit!.failed).toBe(true);
    expect(r.html).toMatch(/overflow:hidden;text-overflow:ellipsis/);
  });

  it("the day grid is unchanged by a long heading (the sidebar keeps its equal track)", () => {
    const a = solveWith(make, "Notes"), b = solveWith(make, "Kingdom Assignments");
    const tracks = (s: typeof a) => s.solved.nodes.filter((n) => n.type === "group" && /^wk0-(d\d|sidebar-bounds)$/.test(n.id)).map((n) => n.rect);
    expect(tracks(b)).toEqual(tracks(a));
  });
});

describe("other weekly sizes using the same primitive", () => {
  for (const [name, make] of PRODUCTS.slice(1)) {
    it(`${name}: Prayer Requests and Kingdom Assignments fit inside the sidebar with no error`, () => {
      for (const h of ["Prayer Requests", "Kingdom Assignments"]) {
        const r = solveWith(make, h);
        expect(r.node, `${name} ${h}`).toBeDefined();
        expectInsideSlot(r.ink, r.slot, r.doc.spacing.sectionHeadingInset - 1e-9);
        expect(errors(r.issues), `${name} ${h}`).toEqual([]);
      }
    });
  }
  it("Half Letter: a heading too wide for its 0.86\" sidebar is reported specifically", () => {
    const r = solveWith(PRODUCTS[1][1], "Important Things This Week");
    const e = r.issues.find((i) => i.rule === "heading-fit")!;
    expect(e.message).toMatch(/^Sidebar heading "IMPORTANT THINGS THIS WEEK" exceeds the available heading width by/);
    expect(r.issues.filter((i) => i.rule === "text-collision" || i.rule === "text-overflow")).toEqual([]);
  });
});
