/**
 * Milestone-1 acceptance: the five test products must validate with zero
 * errors, and their geometry must be mathematically consistent.
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { fitCount, rectContains } from "../src/engines/layout/math";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { LayoutNode } from "../src/types/layout";

const build = (id: string) => TEST_PRODUCTS.find((t) => t.id === id)!.build();
const byComponent = (nodes: LayoutNode[], c: string) => nodes.filter((n) => n.component === c);

describe("all five test products", () => {
  for (const t of TEST_PRODUCTS) {
    it(`${t.label}: validates with zero errors`, () => {
      const report = validateProject(t.build(), heuristicMeasurer);
      const errors = report.issues.filter((i) => i.severity === "error");
      expect(errors, JSON.stringify(errors.slice(0, 5), null, 2)).toHaveLength(0);
      expect(report.exportAllowed).toBe(true);
    });

    it(`${t.label}: every functional node stays inside the safe area on every page`, () => {
      const doc = resolveDocument(t.build());
      doc.recipe.pages.forEach((p, i) => {
        const g = geometryFor(doc, p);
        for (const n of solvePage(doc, i).nodes) {
          if (n.functional) expect(rectContains(g.safeRect, n.rect), `${n.id} on page ${p.pageNumber}`).toBe(true);
        }
      });
    });
  }
});

describe("TP1 — 5 × 7 top-glued to-do notepad", () => {
  const doc = resolveDocument(build("tp1-notepad-5x7-todo"));
  const g = geometryFor(doc, doc.recipe.pages[0]);
  const page = solvePage(doc, 0);

  it("is one editor page carrying 50 sheets as metadata", () => {
    expect(doc.recipe.pages).toHaveLength(1);
    expect(doc.recipe.pages[0].physicalSheets).toBe(50);
  });
  it("has 5 × 7 trim and a top glue keep-out", () => {
    expect([g.trimWidthIn, g.trimHeightIn]).toEqual([5, 7]);
    expect(g.keepOuts.find((k) => k.kind === "glue")!.edge).toBe("top");
  });
  it("solves checklist rows from height (not hard-coded)", () => {
    const rows = byComponent(page.nodes, "ChecklistRow");
    const grid = page.nodes.find((n) => n.id === "todo")!;
    expect(rows.length).toBe(fitCount(grid.rect.h, doc.spacing.listRow));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const boxes = page.nodes.filter((n) => n.type === "checkbox");
    expect(boxes).toHaveLength(rows.length);
    boxes.forEach((b) => expect([b.rect.w, b.rect.h]).toEqual([0.16, 0.16]));
  });
  it("adds rows when spacing becomes compact", () => {
    const p = build("tp1-notepad-5x7-todo");
    p.spacing.density = "compact";
    const d2 = resolveDocument(p);
    expect(byComponent(solvePage(d2, 0).nodes, "ChecklistRow").length).toBeGreaterThan(byComponent(page.nodes, "ChecklistRow").length);
  });
});

describe("TP2 — 6 × 9 lined journal (KDP, perfect bound)", () => {
  const doc = resolveDocument(build("tp2-journal-6x9-lined"));
  it("has 120 pages with alternating recto/verso", () => {
    expect(doc.recipe.pageCount).toBe(120);
    expect(doc.recipe.pages[0].side).toBe("recto");
    expect(doc.recipe.pages[1].side).toBe("verso");
  });
  it("mirrors the KDP gutter (0.375 required, 0.5 studio)", () => {
    const recto = geometryFor(doc, doc.recipe.pages[0]);
    const verso = geometryFor(doc, doc.recipe.pages[1]);
    expect(recto.safe.left).toBe(0.5);
    expect(verso.safe.right).toBe(0.5);
    expect(recto.margins.find((m) => m.edge === "left")!.requiredIn).toBe(0.375);
  });
  it("calculates 25 college lines, matching blueprint J-B1, on both page sides", () => {
    for (const i of [0, 1]) {
      const lines = solvePage(doc, i).nodes.find((n) => n.component === "WritingLines");
      expect(lines?.type).toBe("lines");
      if (lines?.type === "lines") expect(lines.positions).toHaveLength(25);
    }
  });
  it("changing the ruling recalculates the line count", () => {
    const p = build("tp2-journal-6x9-lined");
    p.functionalPattern.rulingPreset = "wide";
    const d = resolveDocument(p);
    const lines = solvePage(d, 0).nodes.find((n) => n.component === "WritingLines");
    if (lines?.type === "lines") expect(lines.positions).toHaveLength(21); // research table 6×9 wide
  });
});

describe("TP3 — 7 × 9 monthly coil planner", () => {
  const doc = resolveDocument(build("tp3-planner-7x9-monthly"));
  it("generates 12 months", () => expect(doc.recipe.pageCount).toBe(12));
  it("every month is a 7 × 6 grid of equal cells with one date per day", () => {
    doc.recipe.pages.forEach((_, i) => {
      const nodes = solvePage(doc, i).nodes;
      const cells = nodes.filter((n) => n.component === "CalendarCell" && n.type === "box");
      expect(cells).toHaveLength(42);
      const w = cells[0].rect.w, h = cells[0].rect.h;
      cells.forEach((c) => {
        expect(c.rect.w).toBeCloseTo(w, 10);
        expect(c.rect.h).toBeCloseTo(h, 10);
      });
      const month = doc.calendar!.months[i];
      const dates = nodes.filter((n) => n.type === "text" && n.component === "CalendarCell");
      expect(dates).toHaveLength(month.daysInMonth);
    });
  });
  it("puts the sidebar on the outer edge (mirrors with the coil)", () => {
    const recto = solvePage(doc, 0).nodes.find((n) => n.id === "month-sidebar")!;
    const verso = solvePage(doc, 1).nodes.find((n) => n.id === "month-sidebar")!;
    expect(recto.rect.x).toBeGreaterThan(3.5);
    expect(verso.rect.x).toBeLessThan(3.5);
  });
  it("date placement is configurable", () => {
    const p = build("tp3-planner-7x9-monthly");
    p.layoutOptions.datePlacement = "top-right";
    const d = resolveDocument(p);
    const date = solvePage(d, 0).nodes.find((n) => n.type === "text" && n.component === "CalendarCell");
    expect(date?.type === "text" && date.align).toBe("right");
  });
});

describe("TP4 — 7 × 9 weekly spread", () => {
  const doc = resolveDocument(build("tp4-planner-7x9-weekly"));
  it("generates one spread per week; spreads open on a verso", () => {
    const weeks = doc.calendar!.weeks.length;
    expect(doc.recipe.pages.filter((p) => p.spreadPart !== undefined)).toHaveLength(weeks * 2);
    doc.recipe.pages.filter((p) => p.spreadPart === 0).forEach((p) => expect(p.side).toBe("verso"));
  });
  it("all 8 slots are equal width across both pages", () => {
    const first = doc.recipe.pages.findIndex((p) => p.spreadPart === 0);
    const left = solvePage(doc, first), right = solvePage(doc, first + 1);
    const slotWidths = [left, right].flatMap((s) =>
      s.nodes.filter((n) => n.type === "group" && (/^wk\d-d\d$/.test(n.id) || n.id.endsWith("sidebar-bounds"))).map((n) => n.rect.w),
    );
    expect(slotWidths).toHaveLength(8);
    slotWidths.forEach((w) => expect(w).toBeCloseTo(slotWidths[0], 10));
    expect(left.diagnostics.concat(right.diagnostics).filter((d) => d.severity === "error")).toHaveLength(0);
  });
  it("uses Monday start and the configured sections per day", () => {
    const first = doc.recipe.pages.findIndex((p) => p.spreadPart === 0);
    const nodes = solvePage(doc, first).nodes;
    expect(nodes.find((n) => n.id === "wk0-d0-name")?.type === "text" && (nodes.find((n) => n.id === "wk0-d0-name") as { text: string }).text).toBe("Mon");
    expect(nodes.filter((n) => /^wk0-d0-s\d$/.test(n.id))).toHaveLength(3);
  });
});

describe("TP5 — 11 × 17 weekly desk pad", () => {
  const doc = resolveDocument(build("tp5-deskpad-11x17-weekly"));
  const g = geometryFor(doc, doc.recipe.pages[0]);
  const page = solvePage(doc, 0);
  it("is landscape 17 × 11 with a 0.75\" glue zone", () => {
    expect([g.trimWidthIn, g.trimHeightIn]).toEqual([17, 11]);
    expect(g.safe.top).toBe(0.75);
  });
  it("has 7 equal day columns × 4 writing rows, each with ruled lines", () => {
    const cells = page.nodes.filter((n) => n.component === "GridCell");
    expect(cells).toHaveLength(28);
    cells.forEach((c) => expect(c.rect.w).toBeCloseTo(cells[0].rect.w, 10));
    const lines = page.nodes.filter((n) => n.id.startsWith("dp-c") && n.type === "lines");
    expect(lines).toHaveLength(28);
    lines.forEach((l) => l.type === "lines" && expect(l.positions.length).toBeGreaterThan(0));
  });
});
