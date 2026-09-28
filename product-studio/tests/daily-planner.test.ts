/**
 * Daily pages:
 *   luxury     Luxury Daily Execution reproduces the Meetings With God Luxury Planner daily page (PPTX
 *              geometry) inside the print-safe area of Letter; declared incompatible where it cannot fit
 *   module     daily-planner → daily-luxury-execution → recipe → render
 *   cadence    every purpose declares its cadences; daily only where it makes sense
 *   expansion  one dated page per day (DST, year boundary, leap day), interleaved with months and weeks,
 *              recto / verso / spread rules intact, older books still expand
 *   weekly     every day of the Weekly Plan + Meeting With God spread has real writing space
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { LUXURY_DAILY_SOURCE as SRC, luxuryDailyExecution, luxuryDailyFrame } from "../src/layouts/planner/dailyPlanner";
import { getLayout } from "../src/layouts/registry";
import { BOOK_PRESETS, dailyPlannerBook, meetingsWithGodBook, section, step } from "../src/presets/bookRecipes";
import { getModule, MODULE_CADENCES, PAGE_MODULES, supportsCadence } from "../src/presets/modules";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { BookNode } from "../src/types/recipe";

type Text = Extract<LayoutNode, { type: "text" }>;
type Lines = Extract<LayoutNode, { type: "lines" }>;

const LETTER: [string, string, string] = ["8.5x11", "coil", "coil-generic"];
/** A daily step designed as Luxury Daily Execution. */
const luxury = () => step("daily-planner", { type: "daily" }, { layoutId: "daily-luxury-execution" });
function book(structure: BookNode[], opts: { size?: [string, string, string]; start?: string; end?: string; footer?: boolean } = {}) {
  const [size, bindingType, printProfileId] = opts.size ?? LETTER;
  return createProject("planner", {
    name: "Daily",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType, printProfileId, duplex: true } as never,
    calendar: { startDate: opts.start ?? "2027-01-01", endDate: opts.end ?? "2027-01-31", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure },
    layoutOptions: opts.footer ? { showFooter: true } : {},
  });
}
const days = (doc: ReturnType<typeof resolveDocument>, layoutId?: string) =>
  doc.recipe.pages.filter((p) => !p.filler && p.period.kind === "day" && (!layoutId || p.layoutId === layoutId)).map((p) => (p.period.kind === "day" ? p.period.iso : ""));
const isoRange = (a: string, b: string) => {
  const out: string[] = [];
  for (let t = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8)); t <= Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

describe("Luxury Daily Execution (Meetings With God Luxury Planner daily page)", () => {
  const solveFirst = (p: ReturnType<typeof book>) => {
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.layoutId === "daily-luxury-execution");
    return { doc, i, s: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
  };

  it("module → layout registry: Luxury Daily Execution is a Daily planner design, dated per day", () => {
    const m = getModule("daily-planner");
    expect(m.layouts).toEqual(["planner-daily", "daily-luxury-execution"]);
    expect(m.defaultCadence).toEqual({ type: "daily" });
    expect(getLayout("daily-luxury-execution")).toBe(luxuryDailyExecution);
    expect(luxuryDailyExecution.period).toBe("day");
    expect(BOOK_PRESETS.some((b) => b.id === "daily-planner")).toBe(true);
  });

  it("Letter: the measured source structure inside the print-safe area", () => {
    const { s, g, doc } = solveFirst(book([luxury()], { end: "2027-01-02" }));
    const f = luxuryDailyFrame(g, doc.spacing, doc.typography, doc.project.layoutOptions);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const F = f.frame;
    // Header block at the measured offsets from the date's top (divider 0.74", band 0.90" + 0.48", body 1.54").
    expect(F.dividerY - F.area.y).toBeCloseTo(SRC.header.dividerY - SRC.header.top, 9);
    expect(F.band.y - F.area.y).toBeCloseTo(SRC.band.y - SRC.header.top, 9);
    expect(F.band.h).toBeCloseTo(0.48, 9);
    expect(F.left.y - F.area.y).toBeCloseTo(SRC.body.y - SRC.header.top, 9);
    // Column split 4.65 : 0.22 : 2.47.
    expect(F.right.x - (F.left.x + F.left.w)).toBeCloseTo(0.22, 9);
    expect(F.left.w / (F.left.w + F.right.w)).toBeCloseTo(4.65 / 7.12, 9);
    // Everything stays inside the print-safe area.
    for (const r of [F.band, F.left, F.right, F.strip]) {
      expect(r.x).toBeGreaterThanOrEqual(g.safeRect.x - 1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(g.safeRect.x + g.safeRect.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(g.safeRect.y + g.safeRect.h + 1e-9);
    }
    // 15 hourly rows, 6:00 AM – 8:00 PM, close to the source's 0.43".
    const hours = s.nodes.filter((n): n is Text => /^dl-hour-\d+$/.test(n.id)).map((n) => n.text);
    expect(hours).toEqual(["6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"]);
    expect(Math.abs(F.hourRowH - 0.43) / 0.43).toBeLessThan(0.1);
    // Right column: 4 instruction lines, 5 to-dos, 7 checklist items, 3 reflection lines; pitches near the source.
    const lines = (id: string) => (s.nodes.find((n) => n.id === id) as Lines).positions.length;
    expect(lines("dl-topInstructions-lines")).toBe(4);
    expect(s.nodes.filter((n) => /^dl-todo-cb\d+$/.test(n.id))).toHaveLength(5);
    expect(lines("dl-reflection-lines")).toBe(3);
    const pitch = Object.fromEntries(F.panels.map((p) => [p.key, p.pitch]));
    for (const [k, v] of Object.entries(SRC.panels)) expect(Math.abs(pitch[k] - v.pitch) / v.pitch, k).toBeLessThan(0.12);
    expect(s.nodes.filter((n): n is Text => /^dl-check-\d+$/.test(n.id)).map((n) => n.text)).toEqual(["Scripture / Prayer", "Water ○○○○○○○○", "Meals on track", "Fitness", "Daily cleaning", "Ministry task", "Business task"]);
    // Dated header, weekday band, semantic headings.
    const t = (id: string) => (s.nodes.find((n) => n.id === id) as Text).text;
    expect([t("dl-date"), t("dl-subtitle"), t("dl-brand"), t("dl-weekday")]).toEqual(["January 1, 2027", "Daily Execution Page", "Meetings With God", "Friday"]);
    expect(t("dl-verse")).toMatch(/^\[Verse Placeholder\]\u2003+Theme:/);
    expect(["dl-time-heading", "dl-topInstructions-heading", "dl-toDo-heading", "dl-checklist-heading", "dl-reflection-heading", "dl-strip-heading"].map(t)).toEqual(["Time Blocks", "Top Instructions", "To Do", "Daily Checklist", "End-of-Day Reflection", "Notes / Gratitude"]);
  });

  for (const footer of [false, true]) {
    it(`Letter${footer ? " with the footer on" : ""}: no validation errors or warnings`, () => {
      const p = book([luxury()], { end: "2027-01-03", footer });
      const issues = validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity !== "info");
      expect(issues, JSON.stringify(issues.slice(0, 3))).toHaveLength(0);
      if (footer) expect((solveFirst(p).s.nodes.find((n) => n.id === "p0-footer-text") as Text).text).toBe("January Daily Planner");
    });
  }

  it("schedule times can be left blank: the TIME column stays, the hours are not printed", () => {
    const p = book([luxury()], { end: "2027-01-01" });
    p.layoutOptions = { ...p.layoutOptions, scheduleTimes: "blank" };
    const { s } = solveFirst(p);
    expect(s.nodes.filter((n) => /^dl-hour-\d+$/.test(n.id))).toHaveLength(0);
    expect(s.nodes.some((n) => n.id === "dl-col-time")).toBe(true);
    expect(s.nodes.filter((n) => /^dl-hours-h\d+$/.test(n.id))).toHaveLength(15);
  });

  it("labels and checklist items are semantic wording: renaming or removing items needs no layout change", () => {
    const p = book([luxury()], { end: "2027-01-01" });
    p.wording = { ...p.wording, dailyChecklistItems: "Scripture; Prayer walk; Water; Rest; Call Mom", topInstructions: "Kingdom Instructions", brandHeading: "Dove Expressions" };
    const { s } = solveFirst(p);
    expect(s.nodes.filter((n): n is Text => /^dl-check-\d+$/.test(n.id)).map((n) => n.text)).toEqual(["Scripture", "Prayer walk", "Water", "Rest", "Call Mom"]);
    expect((s.nodes.find((n) => n.id === "dl-topInstructions-heading") as Text).text).toBe("Kingdom Instructions");
    expect((s.nodes.find((n) => n.id === "dl-brand") as Text).text).toBe("Dove Expressions");
  });

  for (const size of [["7x9", "coil", "coil-generic"], ["6x9", "perfect-bound", "kdp"], ["5.5x8.5", "discbound", "disc-generic"], ["a5", "ring-6", "ring-insert"]] as [string, string, string][]) {
    it(`${size[0]}: declared incompatible with a reason — never squashed`, () => {
      const p = book([luxury()], { size, end: "2027-01-01" });
      const doc = resolveDocument(p);
      const i = doc.recipe.pages.findIndex((x) => x.layoutId === "daily-luxury-execution");
      const fit = luxuryDailyExecution.fit({ page: geometryFor(doc, doc.recipe.pages[i]), spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions });
      expect(fit.ok).toBe(false);
      expect(!fit.ok && fit.reason).toMatch(/Letter/);
      const s = solvePage(doc, i);
      expect(s.nodes.filter((n) => n.id.startsWith("dl-"))).toHaveLength(0);
      expect(s.diagnostics.some((d) => d.rule === "layout-incompatible")).toBe(true);
    });
  }
});

describe("cadences are declared per purpose", () => {
  const DAILY = ["daily-planner", "meeting-with-god", "lined-journal", "notes", "prayer", "reflection", "devotional", "guided", "custom"];
  it("daily is offered for every purpose where a daily page makes sense", () => {
    for (const t of DAILY) {
      expect(PAGE_MODULES.some((m) => m.type === t), `${t} registered`).toBe(true);
      expect(supportsCadence(t as never, "daily"), t).toBe(true);
    }
    // Declared ahead of their layouts: trackers and worksheets repeat daily too.
    expect(MODULE_CADENCES.tracker).toContain("daily");
    expect(MODULE_CADENCES.worksheet).toContain("daily");
  });
  it("daily is not offered for period-bound or direction-setting purposes", () => {
    for (const t of ["monthly-calendar", "weekly-planner", "vision", "mission", "goals", "review"] as const) expect(supportsCadence(t, "daily"), t).toBe(false);
    expect(MODULE_CADENCES["monthly-calendar"]).toEqual(["once", "monthly"]);
    expect(MODULE_CADENCES["daily-planner"]).toEqual(["daily"]);
  });
  it("every registered purpose declares its default cadence among its cadences", () => {
    for (const m of PAGE_MODULES) expect(m.cadences, m.type).toContain(m.defaultCadence.type);
  });
});

describe("daily expansion", () => {
  const cases: [string, string, string][] = [
    ["DST spring-forward", "2027-03-10", "2027-03-17"],
    ["DST fall-back", "2027-11-03", "2027-11-10"],
    ["year boundary", "2026-12-28", "2027-01-04"],
    ["leap day", "2028-02-26", "2028-03-02"],
  ];
  for (const [name, start, end] of cases) {
    it(`${name}: one dated page per day, no duplicates or shifted dates`, () => {
      const doc = resolveDocument(book([step("devotional", { type: "daily" })], { start, end }));
      expect(days(doc)).toEqual(isoRange(start, end));
    });
  }

  it("daily pages interleave with monthly and weekly sections — each day once, in its week, after the week's plan", () => {
    const structure = [section("Every Month", [step("monthly-calendar", { type: "once" }), section("Every Week", [step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-mwg-spread" }), step("meeting-with-god", { type: "daily" })], "week")], "month")];
    const doc = resolveDocument(book(structure, { start: "2027-01-01", end: "2027-02-28" }));
    expect(days(doc)).toEqual(isoRange("2027-01-01", "2027-02-28"));
    const seq = doc.recipe.pages.filter((p) => !p.filler && p.spreadPart !== 1).map((p) => (p.period.kind === "day" ? "D" : p.layoutId === "planner-monthly" ? "M" : "W"));
    expect(seq[0]).toBe("M");
    // After a weekly plan come that week's days (1–7 of them) before the next week's plan.
    expect(seq.join("")).toMatch(/^M(WD{1,7})+M(WD{1,7})+$/);
  });

  it("the Daily planner book: every day of the range gets its daily page", () => {
    const doc = resolveDocument(book(dailyPlannerBook()));
    expect(days(doc, "planner-daily")).toEqual(isoRange("2027-01-01", "2027-01-31"));
  });

  it("recto / verso / spread rules hold for daily pages", () => {
    const structure = [section("Every Week", [step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-mwg-spread" }), step("devotional", { type: "daily" }, { start: "recto" })], "week")];
    const doc = resolveDocument(book(structure, { end: "2027-01-16" }));
    for (const p of doc.recipe.pages.filter((x) => !x.filler)) {
      if (p.period.kind === "day") expect(p.side, p.key).toBe("recto");
      if (p.layoutId === "weekly-plan-mwg-spread") expect(p.side, p.key).toBe(p.spreadPart === 0 ? "verso" : "recto");
    }
    expect(days(doc)).toEqual(isoRange("2027-01-01", "2027-01-16"));
  });

  it("older saved books still expand unchanged (including a cadence the editor no longer offers)", () => {
    expect(() => resolveDocument(book(meetingsWithGodBook(), { size: ["7x9", "coil", "coil-generic"] }))).not.toThrow();
    const legacy = resolveDocument(book([step("review", { type: "daily" })], { end: "2027-01-05" }));
    expect(days(legacy)).toEqual(isoRange("2027-01-01", "2027-01-05"));
  });
});

describe("Weekly Plan + Meeting With God: open days with more writing room", () => {
  // Writing line per weekday (lines × length, inches) the old boxed 2 × 4 grid gave; the open rows must beat it.
  for (const [size, oldGrid] of [
    [["7x9", "coil", "coil-generic"], 13.6],
    [["6x9", "coil", "coil-generic"], 11.1],
    [["5.5x8.5", "discbound", "disc-generic"], 7.9],
    [LETTER, 20.8],
  ] as [[string, string, string], number][]) {
    for (const weekStart of [0, 1] as const) {
      it(`${size[0]}, ${weekStart ? "Monday" : "Sunday"}-start week: no boxes; weekdays get more writing line than the old grid (${oldGrid}"), all equal; weekend ≥ 2 lines; priorities checklist`, () => {
        const p = book([section("Every Week", [step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-mwg-spread" })], "week")], { size, end: "2027-01-16" });
        p.calendar = { ...p.calendar!, weekStart };
        const doc = resolveDocument(p);
        const i = doc.recipe.pages.findIndex((x) => x.layoutId === "weekly-plan-mwg-spread" && x.spreadPart === 0);
        const s = solvePage(doc, i);
        expect(s.nodes.filter((n) => n.type === "box" && n.stroke)).toEqual([]); // no rectangles anywhere on the plan page
        const period = doc.recipe.pages[i].period;
        const week = doc.calendar!.weeks.find((w) => period.kind === "week" && w.key === period.key)!;
        const rules = s.nodes.filter((n) => n.type === "rule" && /^mw0-days-rule-/.test(n.id));
        const perDay = week.days.map((day, d) => {
          const surf = s.nodes.find((n): n is Lines => n.id === `mw0-days-d${d}-surface` && n.type === "lines")!;
          // The day's last line is its full-width divider, one pitch below the last drawn writing line.
          const pitch = surf.positions.length > 1 ? surf.positions[1] - surf.positions[0] : surf.positions[0] - surf.rect.y;
          const last = (surf.positions.at(-1) ?? surf.rect.y) + pitch;
          expect(rules.some((r) => r.type === "rule" && Math.abs(r.y1 - last) < 1e-6 && r.x1 <= surf.rect.x && r.x2 >= surf.rect.x + surf.rect.w), `day ${d} divider`).toBe(true);
          return { weekend: day.weekday === 0 || day.weekday === 6, lines: surf.positions.length + 1, room: (surf.positions.length + 1) * surf.rect.w };
        });
        const weekdays = perDay.filter((x) => !x.weekend);
        for (const x of weekdays) expect(x.room, "weekday writing line").toBeGreaterThan(oldGrid);
        expect(new Set(weekdays.map((x) => x.lines)).size).toBe(1);
        for (const x of perDay.filter((x) => x.weekend)) expect(x.lines).toBeGreaterThanOrEqual(2);
        expect(s.nodes.filter((n) => n.type === "checkbox" && n.id.startsWith("mw0-days-priorities")).length).toBeGreaterThanOrEqual(3);
        expect(validateProject(p, heuristicMeasurer, { pageIndices: [i] }).issues.filter((x) => x.severity !== "info")).toEqual([]);
      });
    }
  }
});
