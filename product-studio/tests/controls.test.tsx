/**
 * CONTROL INTEGRATION TESTS — every visible editor control must change the
 * RENDERED OUTPUT (solved nodes / page markup), not just project state.
 * The control inventory lives in docs/control-audit.md.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compositionFor, geometryFor, layoutAvailability, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { computeUsage } from "../src/engines/document/usage";
import { heuristicMeasurer, type TextStyle } from "../src/engines/typography/textMeasure";
import { textCollisions, validateProject } from "../src/engines/validation/validate";
import { planDecoration } from "../src/themes/decorationPlan";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { ProductProject } from "../src/types/project";

const T = Object.fromEntries(TEST_PRODUCTS.map((t) => [t.id.split("-")[0], t.build]));
const notepad = () => T.tp1();
const journal = () => T.tp2();
const monthly = () => T.tp3();
const weekly = () => T.tp4();
const deskpad = () => T.tp5();

function firstIndex(p: ProductProject) {
  return resolveDocument(p).recipe.pages.findIndex((x) => !x.filler);
}

/** Markup of the first non-filler page, exactly as the renderer draws it. */
function render(p: ProductProject, index = firstIndex(p)): string {
  const doc = resolveDocument(p);
  return renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[index])} solved={solvePage(doc, index)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} mode="print" />,
  );
}

function expectChanges(label: string, make: () => ProductProject, mutate: (p: ProductProject) => void, index?: number) {
  it(`${label} changes the rendered page`, () => {
    const a = make();
    const b = make();
    mutate(b);
    expect(render(b, index ?? firstIndex(b))).not.toBe(render(a, index ?? firstIndex(a)));
  });
}

describe("every visible control changes the rendered output", () => {
  expectChanges("trim size", notepad, (p) => (p.dimensions.sizePresetId = "4x6"));
  expectChanges("orientation", journal, (p) => (p.dimensions.orientation = "landscape"));
  // Coil → discbound keeps identical recto margins by design (both 0.75" studio);
  // perfect binding changes the gutter rule.
  expectChanges("binding", monthly, (p) => {
    p.production.bindingType = "perfect-bound";
    p.production.printProfileId = "generic-commercial";
  });
  it("binding changes production geometry (punch holes coil vs disc)", () => {
    const a = geometryFor(resolveDocument(monthly()), { side: "recto" });
    const p = monthly();
    p.production.bindingType = "discbound";
    p.production.printProfileId = "disc-generic";
    const b = geometryFor(resolveDocument(p), { side: "recto" });
    expect(b.holes.length).not.toBe(a.holes.length);
    expect(b.holes[0].shape).toBe("mushroom");
  });
  expectChanges("bound / glue edge", notepad, (p) => (p.production.boundEdge = "left"));
  expectChanges("printer profile", journal, (p) => (p.production.printProfileId = "ingramspark"));
  expectChanges("bleed", journal, (p) => (p.production.includeBleed = true));
  expectChanges("custom margins", notepad, (p) => (p.production.userMargins = { outside: 0.7 }));
  expectChanges("recipe layout", monthly, (p) => (p.recipe.items[0] = { id: "w", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } }));
  it("repeat mode changes the generated pages", () => {
    const p = journal();
    p.recipe.items[0].repeat = { kind: "count", count: 24 };
    expect(resolveDocument(p).recipe.pageCount).toBe(24);
    expect(resolveDocument(journal()).recipe.pageCount).toBe(120);
  });
  it("page order changes which layout a page shows", () => {
    const mk = () => {
      const p = monthly();
      p.recipe.items.push({ id: "wk", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } });
      return p;
    };
    const chrono = resolveDocument(mk()).recipe.pages.map((x) => x.layoutId);
    const p = mk();
    p.recipe.ordering = "sequential";
    const seq = resolveDocument(p).recipe.pages.map((x) => x.layoutId);
    expect(seq).not.toEqual(chrono);
    expect(seq.slice(0, 12).every((l) => l === "planner-monthly")).toBe(true);
  });
  expectChanges("start date", monthly, (p) => (p.calendar!.startDate = "2027-03-01"));
  expectChanges("week start", monthly, (p) => (p.calendar!.weekStart = 1));
  expectChanges("date placement", monthly, (p) => (p.layoutOptions.datePlacement = "top-right"));
  expectChanges("sidebar", monthly, (p) => (p.layoutOptions.showSidebar = false));
  expectChanges("sidebar heading", monthly, (p) => (p.layoutOptions.sidebarContent = "prayer"));
  expectChanges("sidebar width", monthly, (p) => (p.layoutOptions.sidebarWidthIn = 1.2));
  expectChanges("sections per day", weekly, (p) => (p.layoutOptions.sectionsPerDay = 2));
  expectChanges("desk-pad writing rows", deskpad, (p) => (p.layoutOptions.writingRowsPerDay = 3));
  expectChanges("page numbers", monthly, (p) => (p.layoutOptions.showPageNumbers = true));
  expectChanges("footer", journal, (p) => (p.layoutOptions.showFooter = true));
  expectChanges("writing pattern", journal, (p) => (p.functionalPattern.kind = "dot-grid"));
  expectChanges("ruling", journal, (p) => (p.functionalPattern.rulingPreset = "wide"));
  expectChanges("grid preset", journal, (p) => {
    p.functionalPattern.kind = "dot-grid";
    p.functionalPattern.gridPreset = "hobonichi-daily";
  });
  expectChanges("dot size", journal, (p) => {
    p.functionalPattern.kind = "dot-grid";
    p.functionalPattern.dotSizePt = 1.2;
  });
  expectChanges("line weight", notepad, (p) => (p.functionalPattern.lineWeightPt = 1));
  expectChanges("line opacity", notepad, (p) => (p.functionalPattern.opacity = 0.5));
  expectChanges("spacing density", notepad, (p) => (p.spacing.density = "airy"));
  expectChanges("heading font", monthly, (p) => (p.typography.fonts.headings = "Lora"));
  expectChanges("label font", monthly, (p) => (p.typography.fonts.subheadings = "Raleway"));
  expectChanges("typography size", monthly, (p) => (p.typography.roleOverrides = { monthTitle: { sizePt: 18 } }));
  expectChanges("palette", monthly, (p) => (p.colors.paletteId = "jcs-emerald-gold"));
  expectChanges("individual color token", monthly, (p) => (p.colors.overrides = { primary: "#123456" }));
  expectChanges("writing-line strength", journal, (p) => (p.colors.overrides = { lineOpacity: 0.8 }));
  expectChanges("semantic wording", notepad, (p) => (p.wording = { toDo: "Kingdom Assignments" }));
  expectChanges("decoration design", journal, (p) => (p.decorativeTheme = { ...p.decorativeTheme, style: "marble", assetId: "jcs-marble-veined" }));
  expectChanges("decoration placement", journal, (p) => (p.decorativeTheme = { ...p.decorativeTheme, style: "accent", assetId: "jcs-accent-topo", placement: "full-page" }));
  expectChanges("decoration scale", journal, (p) => (p.decorativeTheme = { ...p.decorativeTheme, style: "accent", assetId: "jcs-accent-arcs", placement: "corners", scale: 1.5 }));
  expectChanges("decoration opacity", journal, (p) => (p.decorativeTheme = { ...p.decorativeTheme, style: "solid", placement: "header-band", opacity: 0.5 }));
  expectChanges("decoration role color", journal, (p) => (p.decorativeTheme = { ...p.decorativeTheme, style: "solid", placement: "header-band", colorA: "accent" }));
  expectChanges("variant", monthly, (p) => {
    p.variants = [{ id: "v", name: "Emerald", overrides: { colors: { primary: "#175B49" } } }];
    p.activeVariantId = "v";
  });
});

describe("controls that are hidden because nothing consumes them", () => {
  it("cover, body and accent fonts are not offered (no layout renders those roles)", () => {
    for (const make of [notepad, journal, monthly, weekly, deskpad]) {
      const groups = computeUsage(resolveDocument(make())).fontGroups;
      expect(groups).not.toContain("cover");
      expect(groups).not.toContain("accent");
      expect(groups).not.toContain("body");
    }
    // Headings are offered only where a heading renders (not on a plain lined page).
    expect(computeUsage(resolveDocument(monthly())).fontGroups).toContain("headings");
    expect(computeUsage(resolveDocument(journal())).fontGroups).not.toContain("headings");
  });
  it("to-do notepad offers no writing pattern (checklist rows), only line style", () => {
    const u = computeUsage(resolveDocument(notepad()));
    expect(u.patterns).toHaveLength(0);
    expect(u.lineStyle).toBe(true);
    expect(u.calendar).toBe(false);
    expect(u.datePlacement).toBe(false);
  });
  it("only rendered wording keys are editable", () => {
    const u = computeUsage(resolveDocument(notepad()));
    expect(u.wordingKeys).toContain("toDo");
    expect(u.wordingKeys).not.toContain("kingdomAssignments");
  });
});

describe("Example A — recipe layout must render what the state says", () => {
  it("Monthly Calendar is not offered for a notepad", () => {
    const a = layoutAvailability(resolveDocument(notepad())).find((x) => x.layoutId === "planner-monthly")!;
    expect(a.supportedType).toBe(false);
  });
  it("switching a planner step to Monthly Calendar resolves and renders a monthly calendar (not a cached page)", () => {
    const p = weekly();
    const before = solvePage(resolveDocument(p), firstIndex(p));
    p.recipe.items[0] = { id: "week", layoutId: "planner-monthly", repeat: { kind: "every-month" } };
    const after = solvePage(resolveDocument(p), 0);
    expect(after).not.toBe(before);
    expect(after.nodes.filter((n) => n.component === "CalendarCell" && n.type === "group")).toHaveLength(42);
  });
});

describe("Example B — writing surface reaches every supported writing area", () => {
  it("weekly: Dot grid replaces ruled lines in the day sections", () => {
    const p = weekly();
    p.functionalPattern = { ...p.functionalPattern, kind: "dot-grid", gridPreset: "dot-5mm" };
    const nodes = solvePage(resolveDocument(p), firstIndex(p)).nodes;
    const surfaces = nodes.filter((n) => n.id.includes("-surface"));
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces.every((n) => n.type === "dots")).toBe(true);
    expect(surfaces.some((n) => n.type === "lines")).toBe(false);
  });
  it("desk pad: Graph grid replaces ruled lines in every cell", () => {
    const p = deskpad();
    p.functionalPattern = { ...p.functionalPattern, kind: "graph-grid" };
    const nodes = solvePage(resolveDocument(p), 0).nodes;
    expect(nodes.filter((n) => n.component === "GraphGrid").length).toBeGreaterThanOrEqual(28 * 2);
    expect(nodes.filter((n) => n.component === "WritingLines" && n.id.includes("-surface"))).toHaveLength(0);
  });
  it("monthly notes sidebar follows the pattern", () => {
    const p = monthly();
    p.functionalPattern = { ...p.functionalPattern, kind: "dot-grid" };
    const nodes = solvePage(resolveDocument(p), 0).nodes;
    expect(nodes.some((n) => n.id.startsWith("month-sidebar") && n.type === "dots")).toBe(true);
  });
});

function insert(size: string, layoutId: "planner-monthly" | "planner-weekly-spread") {
  return createProject("insert", {
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0, sixRowMonths: true },
    recipe: { items: [{ id: "x", layoutId, repeat: { kind: layoutId === "planner-monthly" ? "every-month" : "every-week" } }], ordering: "chronological" },
    layoutOptions: { showSidebar: true },
  });
}

describe("Example C / Issue 2 — size-aware layouts on inserts", () => {
  it("7 × 9 → Franklin Compact: geometry recalculates and the compact monthly is chosen", () => {
    const big = monthly();
    const small = insert("franklin-compact", "planner-monthly");
    const gBig = geometryFor(resolveDocument(big), { side: "recto" });
    const dSmall = resolveDocument(small);
    const gSmall = geometryFor(dSmall, { side: "recto" });
    expect(gSmall.usableWidthIn).toBeLessThan(gBig.usableWidthIn);
    const a = layoutAvailability(dSmall).find((x) => x.layoutId === "planner-monthly")!;
    expect(a.fit.ok && a.fit.variant).toBe("compact");
    expect(a.fit.ok && a.fit.sidebarAvailable).toBe(false);
  });
  it("Franklin Compact monthly: no text collisions, cells above the minimum, zero validation errors", () => {
    const p = insert("franklin-compact", "planner-monthly");
    const doc = resolveDocument(p);
    for (let i = 0; i < doc.recipe.pages.length; i++) expect(textCollisions(solvePage(doc, i), doc, heuristicMeasurer)).toHaveLength(0);
    const cell = solvePage(doc, 0).nodes.find((n) => n.component === "CalendarCell" && n.type === "group")!;
    expect(cell.rect.w).toBeGreaterThanOrEqual(0.34);
    const r = validateProject(p, heuristicMeasurer);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("Filofax Personal uses the compact monthly; Filofax Pocket is reported incompatible (never squashed)", () => {
    // With the connected (zero-gap) grid, Filofax Personal cells are 0.356" — above the compact minimum.
    const personal = layoutAvailability(resolveDocument(insert("filofax-personal", "planner-monthly"))).find((x) => x.layoutId === "planner-monthly")!;
    expect(personal.fit.ok && personal.fit.variant).toBe("compact");
    const pocket = layoutAvailability(resolveDocument(insert("filofax-pocket", "planner-monthly"))).find((x) => x.layoutId === "planner-monthly")!;
    expect(pocket.fit.ok).toBe(false);
    const r = validateProject(insert("filofax-pocket", "planner-monthly"), heuristicMeasurer, { pageIndices: [0] });
    expect(r.issues.some((i) => i.rule === "layout-incompatible")).toBe(true);
  });
  it("A5 insert keeps the full monthly with sidebar", () => {
    const a = layoutAvailability(resolveDocument(insert("a5", "planner-monthly"))).find((x) => x.layoutId === "planner-monthly")!;
    expect(a.fit.ok && a.fit.variant).toBe("full");
  });
  it("weekly on Franklin Compact switches to horizontal day rows with zero errors", () => {
    const p = insert("franklin-compact", "planner-weekly-spread");
    const a = layoutAvailability(resolveDocument(p)).find((x) => x.layoutId === "planner-weekly-spread")!;
    expect(a.fit.ok && a.fit.variant).toBe("horizontal");
    expect(validateProject(p, heuristicMeasurer, { pageIndices: [1, 2] }).issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("decoration, palette and font changes reach the renderer", () => {
  it("selecting Floral changes the decorative assets", () => {
    // Monthly: its corners have free space (a full-page lined journal has none — validation reports that).
    const p = monthly();
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners" };
    const doc = resolveDocument(p);
    const plan = planDecoration(geometryFor(doc, doc.recipe.pages[0]), p.decorativeTheme, doc.colors, compositionFor(doc, 0))!;
    // Every placed piece is the corner art; a corner without room (here: top-left, in the coil punch zone
    // beside the title) is reported with a reason instead of being sliced.
    expect(plan.pieces.length).toBeGreaterThanOrEqual(1);
    expect(plan.pieces.every((x) => x.kind === "raster" && x.assetId === "jcs-floral-corner")).toBe(true);
    for (const r of plan.reports) expect(!!r.rect || !!r.reason).toBe(true);
    expect(render(p)).toContain('data-asset="jcs-floral-corner"');
  });
  it("marble recolors with the palette (raster key carries the role colors)", () => {
    const p = journal();
    p.decorativeTheme = { ...p.decorativeTheme, style: "marble", assetId: "jcs-marble-boldgold", placement: "header-band" };
    const a = render(p);
    p.colors.paletteId = "jcs-midnight-blue";
    expect(render(p)).not.toBe(a);
  });
  it("a different palette changes the rendered color tokens", () => {
    const p = monthly();
    const a = render(p);
    p.colors.paletteId = "jcs-plum";
    const b = render(p);
    expect(a).toContain("--c-primary:#630000");
    expect(b).not.toContain("--c-primary:#630000");
  });
  it("changing the heading font changes the family used to render AND measure headings", () => {
    const p = monthly();
    p.typography.fonts.headings = "Lora";
    expect(render(p)).toContain('--f-headings:&quot;Lora&quot;');
    const measured: string[] = [];
    const spy = (t: string, s: TextStyle) => {
      measured.push(s.family);
      return heuristicMeasurer(t, s);
    };
    validateProject(p, spy, { pageIndices: [0] });
    expect(measured).toContain("Lora");
  });
  it("toggling the sidebar changes the grid width and the sidebar node set", () => {
    const on = solvePage(resolveDocument(monthly()), 0);
    const p = monthly();
    p.layoutOptions.showSidebar = false;
    const off = solvePage(resolveDocument(p), 0);
    const w = (s: typeof on) => s.nodes.find((n) => n.id === "month-grid")!.rect.w;
    expect(w(off)).toBeGreaterThan(w(on));
    expect(on.nodes.some((n) => n.id.startsWith("month-sidebar"))).toBe(true);
    expect(off.nodes.some((n) => n.id.startsWith("month-sidebar"))).toBe(false);
  });
});

describe("validation catches visual failures the old validator missed", () => {
  it("overlapping text is reported", () => {
    const p = notepad();
    const doc = resolveDocument(p);
    const s = solvePage(doc, 0);
    const title = s.nodes.find((n) => n.type === "text")!;
    const clash = { ...s, nodes: [...s.nodes, { ...title, id: "clash" }] };
    expect(textCollisions(clash, doc, heuristicMeasurer).length).toBeGreaterThan(0);
  });
  it("grocery notepad 5 × 7 validates with two category columns", () => {
    const p = createProject("notepad", {
      dimensions: { sizePresetId: "5x7", orientation: "portrait" },
      production: { bindingType: "glued-pad", boundEdge: "top", printProfileId: "notepad-top-glued" },
      recipe: { items: [{ id: "s", layoutId: "notepad-grocery", repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" },
    });
    const r = validateProject(p, heuristicMeasurer);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    const doc = resolveDocument(p);
    expect(solvePage(doc, 0).metrics.find((m) => m.label === "Columns")!.value).toBe(2);
  });
});

describe("decoration never covers functional content", () => {
  it("fields respect content: the header band ends above the content, frames keep a clearance, full page sits behind", () => {
    const p = monthly();
    const doc = resolveDocument(p);
    const g = geometryFor(doc, doc.recipe.pages[0]);
    const comp = compositionFor(doc, 0);
    const clr = doc.spacing.decorationToContentGap;
    const band = planDecoration(g, { ...p.decorativeTheme, style: "marble", assetId: "jcs-marble-boldgold", placement: "header-band" }, doc.colors, comp)!;
    const piece = band.pieces[0];
    expect(piece.kind === "raster" && piece.rect.y + piece.rect.h).toBeCloseTo(g.trimOffset.y + comp.content!.y - clr, 9);
    const frame = planDecoration(g, { ...p.decorativeTheme, style: "watercolor", placement: "border-frame" }, doc.colors, comp)!;
    expect(frame.knockouts).toHaveLength(1);
    expect(frame.knockouts[0].x).toBeCloseTo(g.trimOffset.x + comp.content!.x - clr, 9);
    const behind = planDecoration(g, { ...p.decorativeTheme, style: "marble", assetId: "jcs-marble-veined", placement: "full-page" }, doc.colors, comp)!;
    expect(behind.knockouts).toHaveLength(0);
    expect(behind.reports[0].allowContentOverlap).toBe(true);
  });
});
