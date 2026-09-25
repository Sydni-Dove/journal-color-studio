/**
 * Traditional monthly calendars must be ONE continuous connected grid:
 * zero internal gap, shared borders (each boundary stroked once), no
 * per-cell cards, and weekday labels on exactly the grid's columns.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { CALENDAR_GRID_GAP_IN } from "../src/layouts/shared/components";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { LayoutNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";

const EPS = 1e-9;
const cal = { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0 as const, sixRowMonths: true };
const monthlyRecipe = { items: [{ id: "m", layoutId: "planner-monthly", repeat: { kind: "every-month" as const } }], ordering: "chronological" as const };
const insert = (size: string) =>
  createProject("insert", { dimensions: { sizePresetId: size, orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: monthlyRecipe, layoutOptions: { showSidebar: true } });

const SCENARIOS: [string, () => ProductProject, string][] = [
  ["7 × 9 monthly (coil)", () => TEST_PRODUCTS[2].build(), "full"],
  ["A5 monthly insert", () => insert("a5"), "full"],
  ["Half Letter monthly (disc)", () => createProject("planner", { dimensions: { sizePresetId: "5.5x8.5", orientation: "portrait" }, production: { bindingType: "discbound", printProfileId: "disc-generic", duplex: true }, calendar: cal, recipe: monthlyRecipe }), "full"],
  ["Franklin Compact monthly", () => insert("franklin-compact"), "compact"],
  ["Filofax Personal monthly", () => insert("filofax-personal"), "compact"],
];

const byId = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.id === id)!;

describe("monthly calendar = one continuous connected grid", () => {
  it("the shared primitive uses zero internal gap", () => {
    expect(CALENDAR_GRID_GAP_IN).toBe(0);
  });

  for (const [name, make, variant] of SCENARIOS) {
    describe(name, () => {
      const doc = resolveDocument(make());
      const fit = layoutAvailability(doc).find((a) => a.layoutId === "planner-monthly")!.fit;

      it(`uses the ${variant} variant`, () => expect(fit.ok && fit.variant).toBe(variant));

      // Check every month (4-, 5- and 6-row shapes when six-row is off are covered below).
      doc.recipe.pages.forEach((_, index) => {
        it(`page ${index + 1}: cells are contiguous, borders shared, weekdays on the grid columns`, () => {
          const nodes = solvePage(doc, index).nodes;
          const grid = byId(nodes, "month-grid");
          const cells = nodes.filter((n) => n.component === "CalendarCell" && n.type === "group");
          const rowsN = cells.length / 7;
          expect(Number.isInteger(rowsN)).toBe(true);

          // No per-cell cards: no cell draws its own border or fill.
          expect(nodes.some((n) => n.component === "CalendarCell" && n.type === "box")).toBe(false);

          // Zero horizontal and vertical gap; cells tile the grid rectangle exactly.
          for (let r = 0; r < rowsN; r++) {
            const row = cells.slice(r * 7, r * 7 + 7);
            expect(row[0].rect.x).toBeCloseTo(grid.rect.x, 9);
            for (let c = 0; c < 6; c++) expect(row[c].rect.x + row[c].rect.w).toBeCloseTo(row[c + 1].rect.x, 9);
            expect(row[6].rect.x + row[6].rect.w).toBeCloseTo(grid.rect.x + grid.rect.w, 9);
          }
          for (let c = 0; c < 7; c++) {
            const col = cells.filter((_, i) => i % 7 === c);
            expect(col[0].rect.y).toBeCloseTo(grid.rect.y, 9);
            for (let r = 0; r < rowsN - 1; r++) expect(col[r].rect.y + col[r].rect.h).toBeCloseTo(col[r + 1].rect.y, 9);
            expect(col[rowsN - 1].rect.y + col[rowsN - 1].rect.h).toBeCloseTo(grid.rect.y + grid.rect.h, 9);
          }

          // Stroked once: one square-cornered outer border + one rule per interior boundary.
          const border = nodes.filter((n) => n.id === "month-grid-border");
          expect(border).toHaveLength(1);
          expect(border[0].type === "box" && border[0].radiusIn).toBe(0);
          const vRules = nodes.filter((n) => /^month-grid-v\d+$/.test(n.id));
          const hRules = nodes.filter((n) => /^month-grid-h\d+$/.test(n.id));
          expect(vRules).toHaveLength(6);
          expect(hRules).toHaveLength(rowsN - 1);
          const vx = vRules.map((n) => (n.type === "rule" ? n.x1 : NaN));
          const hy = hRules.map((n) => (n.type === "rule" ? n.y1 : NaN));
          expect(new Set(vx.map((x) => x.toFixed(9))).size).toBe(6); // no doubled interior lines
          expect(new Set(hy.map((y) => y.toFixed(9))).size).toBe(rowsN - 1);
          vx.forEach((x, i) => expect(x).toBeCloseTo(cells[i + 1].rect.x, 9)); // exactly on shared boundaries
          hy.forEach((y, i) => expect(y).toBeCloseTo(cells[(i + 1) * 7].rect.y, 9));
          for (const x of vx) expect(Math.abs(x - grid.rect.x) > EPS && Math.abs(x - (grid.rect.x + grid.rect.w)) > EPS).toBe(true);

          // Weekday header: the same seven columns as the grid.
          const labels = nodes.filter((n) => /^month-weekdays-\d$/.test(n.id));
          expect(labels).toHaveLength(7);
          labels.forEach((l, c) => {
            expect(l.rect.x).toBeCloseTo(cells[c].rect.x, 9);
            expect(l.rect.w).toBeCloseTo(cells[c].rect.w, 9);
          });
        });
      });

      it("rendered markup draws no per-cell rectangles and no rounded boxes", () => {
        const i = 0;
        const html = renderToStaticMarkup(
          <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[i])} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} mode="print" />,
        );
        expect(html).not.toMatch(/<rect[^>]*data-node="month-grid-r\d+c\d+"/);
        expect(html).toMatch(/<rect[^>]*data-node="month-grid-border"/);
        expect(html.match(/<line[^>]*data-node="month-grid-[vh]\d+"/g)?.length).toBeGreaterThanOrEqual(6 + 3);
        expect(html).not.toMatch(/data-node="month-grid-border"[^>]*rx="[1-9]/);
      });
    });
  }

  it("natural (non-six-row) months stay contiguous too", () => {
    const p = TEST_PRODUCTS[2].build();
    p.calendar!.sixRowMonths = false;
    const doc = resolveDocument(p);
    const feb = doc.recipe.pages.findIndex((x) => x.period.kind === "month" && x.period.key === "2027-02");
    const nodes = solvePage(doc, feb).nodes;
    const cells = nodes.filter((n) => n.component === "CalendarCell" && n.type === "group");
    const grid = byId(nodes, "month-grid");
    const rowsN = cells.length / 7;
    expect(rowsN).toBeLessThan(6);
    expect(cells[cells.length - 1].rect.y + cells[cells.length - 1].rect.h).toBeCloseTo(grid.rect.y + grid.rect.h, 9);
  });
});
