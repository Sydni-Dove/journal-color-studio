/**
 * Weekly spreads must read as ONE connected planner grid per page: the four
 * slots (days + outer sidebar/notes) are contiguous tracks, every boundary is
 * stroked once by the grid, and days / sections never draw their own boxes.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { PLANNER_GRID_GAP_IN } from "../src/layouts/shared/components";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { LayoutNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";

const cal = { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1 as const, sixRowMonths: true };
const weeklyRecipe = { items: [{ id: "w", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" as const } }], ordering: "chronological" as const };
const withSidebar = (p: ProductProject, on: boolean) => ((p.layoutOptions.showSidebar = on), p);

const SCENARIOS: [string, () => ProductProject, "vertical" | "horizontal"][] = [
  ["7 × 9 weekly (sidebar)", () => withSidebar(TEST_PRODUCTS[3].build(), true), "vertical"],
  ["7 × 9 weekly (notes)", () => withSidebar(TEST_PRODUCTS[3].build(), false), "vertical"],
  ["Half Letter weekly (disc)", () => createProject("planner", { dimensions: { sizePresetId: "5.5x8.5", orientation: "portrait" }, production: { bindingType: "discbound", printProfileId: "disc-generic", duplex: true }, calendar: cal, recipe: weeklyRecipe }), "vertical"],
  ["Franklin Compact weekly (sidebar)", () => createProject("insert", { dimensions: { sizePresetId: "franklin-compact", orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: weeklyRecipe, layoutOptions: { showSidebar: true } }), "horizontal"],
  ["Franklin Compact weekly (notes)", () => createProject("insert", { dimensions: { sizePresetId: "franklin-compact", orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: weeklyRecipe, layoutOptions: { showSidebar: false } }), "horizontal"],
];

const ruleNodes = (nodes: LayoutNode[], re: RegExp) => nodes.filter((n) => n.type === "rule" && re.test(n.id)) as Extract<LayoutNode, { type: "rule" }>[];

describe("weekly spread = one connected planner grid", () => {
  it("the shared planner grid uses zero internal gap", () => expect(PLANNER_GRID_GAP_IN).toBe(0));

  for (const [name, make, variant] of SCENARIOS) {
    describe(name, () => {
      const project = make();
      const doc = resolveDocument(project);
      const fit = layoutAvailability(doc).find((a) => a.layoutId === "planner-weekly-spread")!.fit;
      const first = doc.recipe.pages.findIndex((p) => p.spreadPart === 0);
      const horizontal = variant === "horizontal";

      it(`uses the ${variant} variant`, () => expect(fit.ok && fit.variant).toBe(variant));

      [0, 1].forEach((p) => {
        it(`${p === 0 ? "left" : "right"} page: contiguous slots, each boundary stroked once, no cards`, () => {
          const nodes = solvePage(doc, first + p).nodes;
          const grid = nodes.find((n) => n.id === `wk${p}-grid`)!;
          const slots = nodes.filter((n) => n.type === "group" && (new RegExp(`^wk${p}-d\\d$`).test(n.id) || n.id === `wk${p}-sidebar-bounds` || n.id === `wk${p}-notes`));
          expect(slots).toHaveLength(4);
          const start = (n: LayoutNode) => (horizontal ? n.rect.y : n.rect.x);
          const size = (n: LayoutNode) => (horizontal ? n.rect.h : n.rect.w);
          slots.sort((a, b) => start(a) - start(b));
          expect(start(slots[0])).toBeCloseTo(start(grid), 9);
          for (let i = 0; i < 3; i++) expect(start(slots[i]) + size(slots[i])).toBeCloseTo(start(slots[i + 1]), 9);
          expect(start(slots[3]) + size(slots[3])).toBeCloseTo(start(grid) + size(grid), 9);

          // The ONLY box on the page is the grid's square outer border — no day or section cards.
          const boxes = nodes.filter((n) => n.type === "box");
          expect(boxes.map((b) => b.id)).toEqual([`wk${p}-grid-border`]);
          expect(boxes[0].type === "box" && boxes[0].radiusIn).toBe(0);

          // One shared rule on each of the 3 interior slot boundaries.
          const shared = ruleNodes(nodes, new RegExp(`^wk${p}-grid-[vh]\\d$`));
          expect(shared).toHaveLength(3);
          const at = shared.map((r) => (horizontal ? r.y1 : r.x1)).sort((a, b) => a - b);
          at.forEach((v, i) => expect(v).toBeCloseTo(start(slots[i + 1]), 9));

          if (horizontal) {
            // Label-column divider: one continuous rule per run of day rows, never overlapping.
            const label = ruleNodes(nodes, new RegExp(`^wk${p}-label-rule\\d$`));
            const days = slots.filter((s) => /-d\d$/.test(s.id));
            expect(label.reduce((t, r) => t + r.rect.h, 0)).toBeCloseTo(days.reduce((t, d) => t + d.rect.h, 0), 9);
            expect(new Set(label.map((r) => r.x1.toFixed(9))).size).toBe(1);
          } else {
            // Header row: ONE rule across the entire grid.
            const head = ruleNodes(nodes, new RegExp(`^wk${p}-head-rule$`));
            expect(head).toHaveLength(1);
            expect(head[0].rect.x).toBeCloseTo(grid.rect.x, 9);
            expect(head[0].rect.w).toBeCloseTo(grid.rect.w, 9);
            // Section dividers: per boundary, runs cover exactly the day columns, once.
            const n = project.layoutOptions.sectionsPerDay;
            const secs = ruleNodes(nodes, new RegExp(`^wk${p}-sec\\d-run\\d$`));
            const dayW = slots.filter((s) => /-d\d$/.test(s.id)).reduce((t, d) => t + d.rect.w, 0);
            for (let j = 1; j < n; j++) {
              const row = secs.filter((r) => r.id.startsWith(`wk${p}-sec${j}-`));
              expect(row.reduce((t, r) => t + r.rect.w, 0)).toBeCloseTo(dayW, 9);
              expect(new Set(row.map((r) => r.y1.toFixed(9))).size).toBe(1);
            }
            // Section regions inside each day are contiguous (no gap between Morning/Afternoon/Evening).
            const d = slots.find((s) => /-d\d$/.test(s.id))!;
            const secRects = nodes.filter((x) => x.type === "group" && new RegExp(`^${d.id}-s\\d$`).test(x.id)).sort((a, b) => a.rect.y - b.rect.y);
            expect(secRects).toHaveLength(n);
            for (let i = 0; i < n - 1; i++) expect(secRects[i].rect.y + secRects[i].rect.h).toBeCloseTo(secRects[i + 1].rect.y, 9);
            expect(secRects[n - 1].rect.y + secRects[n - 1].rect.h).toBeCloseTo(d.rect.y + d.rect.h, 9);
          }
          expect(solvePage(doc, first + p).diagnostics.filter((x) => x.severity === "error")).toEqual([]);
        });
      });

      [0, 1].forEach((p) => {
        it(`${p === 0 ? "left" : "right"} page, rendered SVG: one border, shared rules once, no card rects`, () => {
          const html = renderToStaticMarkup(
            <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[first + p])} solved={solvePage(doc, first + p)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} mode="print" />,
          );
          // Every stroked rectangle drawn is either the grid border or a checklist checkbox.
          const rects = [...html.matchAll(/<rect[^>]*data-node="([^"]+)"/g)].map((m) => m[1]);
          expect(rects.filter((id) => !/-cb\d+$/.test(id))).toEqual([`wk${p}-grid-border`]);
          expect(html).not.toMatch(/rx="[1-9]/);
          // Exactly 3 shared slot rules in the markup, at 3 distinct positions.
          const shared = [...html.matchAll(new RegExp(`<line[^>]*data-node="wk${p}-grid-[vh]\\d"[^>]*>`, "g"))].map((m) => m[0]);
          expect(shared).toHaveLength(3);
          const pos = shared.map((l) => l.match(horizontal ? /y1="([^"]+)"/ : /x1="([^"]+)"/)![1]);
          expect(new Set(pos).size).toBe(3);
        });
      });
    });
  }
});

describe("weekly desk pad = one connected 7-day grid", () => {
  const project = TEST_PRODUCTS[4].build();
  const doc = resolveDocument(project);
  const nodes = solvePage(doc, 0).nodes;
  const grid = nodes.find((n) => n.id === "dp-grid")!;
  const rowsN = project.layoutOptions.writingRowsPerDay;
  const cells = nodes.filter((n) => n.component === "GridCell");

  it("cells are geometry only and tile the grid with zero gap", () => {
    expect(cells).toHaveLength(7 * rowsN);
    expect(cells.every((c) => c.type === "group")).toBe(true);
    for (let c = 0; c < 7; c++) {
      const col = cells.filter((n) => n.id.startsWith(`dp-c${c}r`)).sort((a, b) => a.rect.y - b.rect.y);
      if (c === 0) expect(col[0].rect.x).toBeCloseTo(grid.rect.x, 9);
      if (c === 6) expect(col[0].rect.x + col[0].rect.w).toBeCloseTo(grid.rect.x + grid.rect.w, 9);
      if (c < 6) expect(col[0].rect.x + col[0].rect.w).toBeCloseTo(cells.find((n) => n.id === `dp-c${c + 1}r0`)!.rect.x, 9);
      for (let r = 0; r < rowsN - 1; r++) expect(col[r].rect.y + col[r].rect.h).toBeCloseTo(col[r + 1].rect.y, 9);
      expect(col[rowsN - 1].rect.y + col[rowsN - 1].rect.h).toBeCloseTo(grid.rect.y + grid.rect.h, 9);
    }
  });
  it("shared rules: 6 vertical + (rows − 1) horizontal, each drawn once on a boundary", () => {
    const v = ruleNodes(nodes, /^dp-grid-v\d$/);
    const h = ruleNodes(nodes, /^dp-grid-h\d$/);
    expect(v).toHaveLength(6);
    expect(h).toHaveLength(rowsN - 1);
    v.forEach((r, i) => expect(r.x1).toBeCloseTo(cells.find((n) => n.id === `dp-c${i + 1}r0`)!.rect.x, 9));
    h.forEach((r, i) => expect(r.y1).toBeCloseTo(cells.find((n) => n.id === `dp-c0r${i + 1}`)!.rect.y, 9));
  });
  it("weekday labels sit on exactly the grid columns", () => {
    const labels = nodes.filter((n) => /^dp-weekdays-\d$/.test(n.id));
    expect(labels).toHaveLength(7);
    labels.forEach((l, c) => {
      const cell = cells.find((n) => n.id === `dp-c${c}r0`)!;
      expect(l.rect.x).toBeCloseTo(cell.rect.x, 9);
      expect(l.rect.w).toBeCloseTo(cell.rect.w, 9);
    });
  });
  it("rendered SVG: no per-cell rects; only the grid border (+ the separate priorities panel)", () => {
    const html = renderToStaticMarkup(
      <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[0])} solved={solvePage(doc, 0)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} mode="print" />,
    );
    const rects = [...html.matchAll(/<rect[^>]*data-node="([^"]+)"/g)].map((m) => m[1]).filter((id) => !/-cb\d+$/.test(id));
    expect(rects.sort()).toEqual(project.layoutOptions.showSidebar ? ["dp-grid-border", "dp-priorities-box"] : ["dp-grid-border"]);
    expect(html).not.toMatch(/<rect[^>]*data-node="dp-c\d+r\d+"/);
    expect(solvePage(doc, 0).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
