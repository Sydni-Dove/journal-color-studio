/**
 * ROTATED MONTHLY CALENDAR — true 90° rotation of the monthly design:
 *
 *   The classic monthly calendar (title, weekday labels, 7-column grid,
 *   notes sidebar) is solved in LANDSCAPE against the turned page geometry,
 *   flagged with contentRotation: 90, and the renderer turns the painted
 *   content 90° clockwise onto the portrait sheet. The reader turns the
 *   physical planner to read it. Opt-in per product via
 *   layoutOptions.monthlyArrangement ("classic" | "rotated").
 */
import { describe, expect, it } from "vitest";
import { contentGeometryFor, layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { turnGeometry90CW } from "../src/engines/geometry/turn";
import { monthlyArrangementOf } from "../src/layouts/planner/plannerOptions";
import { addMonthly } from "../src/engines/recipe/pageBuilder";
import { createProject } from "../src/presets/products/projectFactory";
import type { BookNode } from "../src/types/recipe";
import type { LayoutNode, TextNode } from "../src/types/layout";
import type { LayoutOptions } from "../src/types/project";

const paged = { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never;

const planner = (structure: BookNode[], layoutOptions: Partial<LayoutOptions> = {}) =>
  createProject("planner", {
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: paged,
    calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure },
    layoutOptions,
  });

const doc = (layoutOptions: Partial<LayoutOptions> = {}) => resolveDocument(planner(addMonthly([]), layoutOptions));
const monthlySolved = (d: ReturnType<typeof resolveDocument>) => {
  const i = d.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
  return { index: i, solved: solvePage(d, i) };
};
const texts = (nodes: LayoutNode[]) => nodes.filter((n): n is TextNode => n.type === "text");

describe("monthlyArrangementOf", () => {
  it("defaults to classic", () => {
    expect(monthlyArrangementOf({})).toBe("classic");
    expect(monthlyArrangementOf({ monthlyArrangement: "rotated" })).toBe("rotated");
  });
});

describe("turnGeometry90CW", () => {
  it("swaps width/height dimensions", () => {
    const d = doc();
    const i = d.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
    const g = contentGeometryFor(d, d.recipe.pages[i], i); // classic: paper geometry
    const t = turnGeometry90CW(g);
    expect(t.trimWidthIn).toBeCloseTo(g.trimHeightIn, 6);
    expect(t.trimHeightIn).toBeCloseTo(g.trimWidthIn, 6);
    expect(t.usableWidthIn).toBeCloseTo(g.usableHeightIn, 6);
    expect(t.usableHeightIn).toBeCloseTo(g.usableWidthIn, 6);
    expect(t.mediaWidthIn).toBeCloseTo(g.mediaHeightIn, 6);
    expect(t.mediaHeightIn).toBeCloseTo(g.mediaWidthIn, 6);
    expect(t.orientation).toBe("landscape");
    // Double turn returns to the original dims.
    const back = turnGeometry90CW(t);
    expect(back.trimWidthIn).toBeCloseTo(g.trimWidthIn, 6);
    expect(back.usableWidthIn).toBeCloseTo(g.usableWidthIn, 6);
  });
});

describe("rotated monthly fit", () => {
  it("fits against the landscape geometry and labels the variant rotated", () => {
    const d = doc({ monthlyArrangement: "rotated" });
    const avail = layoutAvailability(d);
    const monthly = avail.find((a) => a.layoutId === "planner-monthly");
    expect(monthly?.fit.ok).toBe(true);
    if (monthly?.fit.ok) expect(monthly.fit.variantLabel).toContain("rotated");
  });

  it("fitMonthly measures wider cells in landscape than the portrait classic", () => {
    const dClassic = doc();
    const dRotated = doc({ monthlyArrangement: "rotated" });
    const pageOf = (dd: ReturnType<typeof resolveDocument>) => {
      const i = dd.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
      return contentGeometryFor(dd, dd.recipe.pages[i], i);
    };
    // contentGeometryFor returns the turned (landscape) geometry for rotated months.
    const gRotated = pageOf(dRotated);
    const gClassic = pageOf(dClassic);
    expect(gRotated.usableWidthIn).toBeGreaterThan(gClassic.usableWidthIn);
    expect(gRotated.usableWidthIn).toBeCloseTo(gClassic.usableHeightIn, 6);
  });
});

describe("rotated monthly solve", () => {
  it("flags the solved page with contentRotation 90", () => {
    const d = doc({ monthlyArrangement: "rotated" });
    const { solved } = monthlySolved(d);
    expect(solved.contentRotation).toBe(90);
  });

  it("does not flag classic months", () => {
    const d = doc();
    const { solved } = monthlySolved(d);
    expect(solved.contentRotation).toBeUndefined();
  });

  it("solves nodes in landscape coordinates (wider than the portrait sheet)", () => {
    const d = doc({ monthlyArrangement: "rotated" });
    const { index, solved } = monthlySolved(d);
    const grid = solved.nodes.find((n) => n.id === "month-grid");
    expect(grid).toBeDefined();
    // The grid is solved in the turned landscape geometry: wider than the
    // portrait trim width.
    const paperW = d.recipe.pages[index]
      ? contentGeometryFor(d, d.recipe.pages[index], index)
      : null;
    expect(grid!.rect.w).toBeGreaterThan(0);
    expect(paperW).not.toBeNull();
    // Landscape content width exceeds the portrait usable width.
    const classic = doc();
    const ci = classic.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
    const classicGrid = solvePage(classic, ci).nodes.find((n) => n.id === "month-grid");
    expect(grid!.rect.w).toBeGreaterThan(classicGrid!.rect.w);
  });

  it("keeps the classic 7-column structure (title, weekday labels, grid, dates)", () => {
    const d = doc({ monthlyArrangement: "rotated" });
    const { solved } = monthlySolved(d);
    const ids = new Set(solved.nodes.map((n) => n.id));
    expect(ids.has("month-header-title")).toBe(true);
    expect(ids.has("month-grid")).toBe(true);
    expect([...ids].some((id) => id.startsWith("month-weekdays-"))).toBe(true);
    const dateTexts = texts(solved.nodes).filter((t) => /month-grid-.*-date/.test(t.id));
    expect(dateTexts.length).toBeGreaterThan(27);
  });

  it("the rotated grid is substantially wider than the classic portrait grid", () => {
    const dRot = doc({ monthlyArrangement: "rotated" });
    const dClassic = doc();
    const gridOf = (dd: ReturnType<typeof resolveDocument>) => {
      const i = dd.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
      return solvePage(dd, i).nodes.find((n) => n.id === "month-grid")!;
    };
    const wRot = gridOf(dRot).rect.w;
    const wClassic = gridOf(dClassic).rect.w;
    // Landscape content width vs portrait: roughly the trim aspect ratio.
    expect(wRot / wClassic).toBeGreaterThan(1.2);
  });
});
