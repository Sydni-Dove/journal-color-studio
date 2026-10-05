/**
 * SIDEWAYS MONTHLY CALENDAR — the bullet-journal sideways arrangement:
 *
 *   7 weekday rows × week columns (instead of the classic 7 day-columns ×
 *   week rows). Day cells go wide, the grid fills the page, and there is no
 *   sidebar in sideways months. Opt-in per product via
 *   layoutOptions.monthlyArrangement ("classic" | "sideways").
 */
import { describe, expect, it } from "vitest";
import { layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
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
const monthlyPage = (d: ReturnType<typeof resolveDocument>) => {
  const i = d.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
  return { index: i, nodes: solvePage(d, i).nodes };
};
const texts = (nodes: LayoutNode[]) => nodes.filter((n): n is TextNode => n.type === "text");

describe("monthlyArrangementOf", () => {
  it("defaults to classic", () => {
    expect(monthlyArrangementOf({})).toBe("classic");
    expect(monthlyArrangementOf({ monthlyArrangement: "sideways" })).toBe("sideways");
  });
});

describe("sideways monthly calendar", () => {
  it("fits on a 7 × 9 page", () => {
    const d = doc({ monthlyArrangement: "sideways" });
    const fit = layoutAvailability(d).find((a) => a.layoutId === "planner-monthly")!.fit;
    expect(fit.ok).toBe(true);
    if (fit.ok) expect(fit.variantLabel).toContain("sideways");
  });

  it("renders 7 weekday rows with Sun..Sat labels in the leading column", () => {
    const { nodes } = monthlyPage(doc({ monthlyArrangement: "sideways" }));
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
      (_, d) => texts(nodes).find((t) => t.id === `month-dow-${d}`)!,
    );
    expect(labels.every(Boolean)).toBe(true);
    expect(labels.map((t) => t.text)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    // Rows run top to bottom in weekday order.
    const ys = labels.map((t) => t.rect.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it("places every date of the month exactly once, in its weekday row", () => {
    const { nodes } = monthlyPage(doc({ monthlyArrangement: "sideways" }));
    const dates = texts(nodes).filter((t) => t.component === "CalendarCell");
    expect(dates.map((t) => t.text).sort((a, b) => +a - +b)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(i + 1)),
    );
    // Jan 1 2027 is a Friday: the "1" sits in the Friday row.
    const one = dates.find((t) => t.text === "1")!;
    const fri = texts(nodes).find((t) => t.id === "month-dow-5")!;
    expect(one.rect.y).toBeGreaterThanOrEqual(fri.rect.y - 1e-6);
    expect(one.rect.y).toBeLessThan(fri.rect.y + fri.rect.h + 1e-6);
  });

  it("draws one shared rule per row/column boundary and no sidebar", () => {
    const { nodes } = monthlyPage(doc({ monthlyArrangement: "sideways" }));
    // Six week columns (sixRowMonths): label boundary + 5 interior vertical rules.
    expect(nodes.filter((n) => /^month-grid-v\d+$/.test(n.id))).toHaveLength(6);
    expect(nodes.filter((n) => /^month-grid-h\d+$/.test(n.id))).toHaveLength(6);
    expect(nodes.some((n) => n.id === "month-sidebar")).toBe(false);
  });

  it("the classic arrangement is unchanged when the option is absent", () => {
    const { nodes } = monthlyPage(doc());
    expect(nodes.some((n) => /^month-weekdays-\d$/.test(n.id))).toBe(true);
    expect(nodes.some((n) => /^month-dow-\d$/.test(n.id))).toBe(false);
  });
});
