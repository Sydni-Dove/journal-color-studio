/**
 * Table styling (Style → Tables) and the Stationery look: they change lines only — never rows, row height or the
 * writing space — and a product with no table style draws its tables exactly as before.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../src/presets/products/projectFactory";
import { HOPE_JOURNAL_SETTINGS, hopeJournalBook } from "../src/presets/hopeJournal";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { Divider, Box } from "../src/primitives/nodes";
import { hasTables } from "../src/components/editor/DesignPanels";
import type { ProductProject } from "../src/types/project";
import type { BookNode } from "../src/types/recipe";
import type { BoxNode, LayoutNode, RuleNode, TextNode } from "../src/types/layout";

const hope = (): ProductProject =>
  createProject("journal", {
    ...HOPE_JOURNAL_SETTINGS,
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    production: { duplex: true, boundEdge: "left", bindingType: "coil", includeBleed: false, printProfileId: "generic-commercial" },
    recipe: { items: [], ordering: "sequential", structure: hopeJournalBook(2) },
  } as never) as ProductProject;
const withPrayers = (p: ProductProject, patch: Record<string, unknown>): ProductProject => {
  const walk = (ns: BookNode[]): BookNode[] => ns.map((n) => (n.kind === "group" ? { ...n, children: walk(n.children) } : n.promptSet ? { ...n, promptSet: { ...n.promptSet, blocks: n.promptSet.blocks.map((b) => (b.id === "hope-prayers" && b.table ? { ...b, table: { ...b.table, ...patch } } : b)) } } : n));
  return { ...p, recipe: { ...p.recipe, structure: walk(p.recipe.structure ?? []) } };
};
const styled = (p: ProductProject, tableStyle: NonNullable<ProductProject["layoutOptions"]["tableStyle"]>): ProductProject => ({ ...p, layoutOptions: { ...p.layoutOptions, tableStyle } });
/** The right-hand hope page's Prayers table nodes. */
const prayers = (p: ProductProject) => {
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-right");
  const nodes = solvePage(doc, i).nodes.filter((n) => /hope-prayers/.test(n.id));
  const grid = nodes.find((n) => n.type === "group" && (n as { rowEdges?: number[] }).rowEdges) as LayoutNode & { rowEdges: number[]; columnEdges: number[] };
  return { nodes, grid, rules: nodes.filter((n): n is RuleNode => n.type === "rule"), box: nodes.find((n): n is BoxNode => n.type === "box" && n.id.endsWith("-border")), heads: nodes.filter((n): n is TextNode => n.type === "text" && /-h-[^-]+$/.test(n.id)) };
};

describe("Style → Tables changes only the lines", () => {
  it("no table style: the original look (full grid, 0.5 pt rules, 1 pt heading rule)", () => {
    const t = prayers(hope());
    expect(t.box?.strokePt).toBe(0.5);
    expect(t.rules.find((r) => r.id.endsWith("-header-rule"))?.strokePt).toBe(1);
    expect(t.rules.filter((r) => /-v\d+$/.test(r.id))).toHaveLength(1);
    expect(t.rules.every((r) => r.hex === undefined && r.opacity === undefined)).toBe(true);
  });

  it("weight, color, grid, header and padding each change the drawing — never the rows", () => {
    const base = prayers(hope());
    const cases: NonNullable<ProductProject["layoutOptions"]["tableStyle"]>[] = [{ weight: "hairline" }, { weight: "strong" }, { color: "light-gray" }, { color: "soft-burgundy" }, { color: "custom", customColor: "#336699" }, { grid: "horizontal" }, { grid: "outer-horizontal" }, { grid: "minimal" }, { header: "shaded" }, { header: "accent" }, { padding: "spacious" }];
    for (const c of cases) {
      const t = prayers(styled(hope(), c));
      // Same rows, same writing rows (only the heading row may grow with padding).
      expect(t.grid.rowEdges.length).toBe(base.grid.rowEdges.length);
      const rowH = (e: number[]) => e[2] - e[1];
      expect(rowH(t.grid.rowEdges)).toBeCloseTo(rowH(base.grid.rowEdges), 9);
    }
    const rowPt = (c: object) => prayers(styled(hope(), c)).rules.find((r) => /-r1$/.test(r.id))!.strokePt;
    expect([rowPt({ weight: "hairline" }), rowPt({ weight: "light" }), rowPt({ weight: "medium" }), rowPt({ weight: "strong" })]).toEqual([0.25, 0.4, 0.6, 1]);
    expect(prayers(styled(hope(), { weight: "none" })).rules).toHaveLength(0);
    expect(prayers(styled(hope(), { color: "light-gray" })).rules[0].hex).toBe("#BDBDBD");
    expect(prayers(styled(hope(), { color: "custom", customColor: "#336699" })).box?.strokeHex).toBe("#336699");
    expect(prayers(styled(hope(), { color: "soft-burgundy" })).rules[0].opacity).toBeLessThan(1);
    const horizontal = prayers(styled(hope(), { grid: "horizontal" }));
    expect(horizontal.box).toBeUndefined();
    expect(horizontal.rules.some((r) => /-v\d+$/.test(r.id))).toBe(false);
    expect(prayers(styled(hope(), { grid: "outer-horizontal" })).box).toBeDefined();
    expect(prayers(styled(hope(), { header: "shaded" })).nodes.some((n) => n.id.endsWith("-header-shade"))).toBe(true);
    expect(prayers(styled(hope(), { header: "accent" })).heads.every((h) => h.color === "border")).toBe(true);
    const pad = (c: object) => { const e = prayers(styled(hope(), c)).grid.rowEdges; return e[1] - e[0]; };
    expect(pad({ padding: "spacious" })).toBeGreaterThan(pad({ padding: "compact" }));
  });

  it("the rule color and tint reach the printed line", () => {
    const html = renderToStaticMarkup(<svg><Divider node={{ type: "rule", id: "r", component: "Grid", rect: { x: 0, y: 0, w: 1, h: 0 }, functional: true, x1: 0, y1: 0, x2: 1, y2: 0, strokePt: 0.25, color: "border", hex: "#BDBDBD", opacity: 0.5 }} /></svg>);
    expect(html).toMatch(/stroke:#BDBDBD/);
    expect(html).toMatch(/stroke-opacity:0.5/);
    const box = renderToStaticMarkup(<svg><Box node={{ type: "box", id: "b", component: "Grid", rect: { x: 0, y: 0, w: 1, h: 1 }, functional: true, stroke: "border", strokePt: 0.25, fill: null, fillOpacity: 1, radiusIn: 0, strokeHex: "#336699", strokeOpacity: 0.55 }} /></svg>);
    expect(box).toMatch(/stroke:#336699/);
    expect(box).toMatch(/stroke-opacity:0.55/);
  });

  it("the Tables controls show only in products that have a table", () => {
    expect(hasTables(hope())).toBe(true);
    expect(hasTables(createProject("notepad", {} as never) as ProductProject)).toBe(false);
  });
});

describe("Prayers I Have Prayed: the Stationery look", () => {
  it("thin burgundy rules under each row, a light outer border, subtle column line, small headings, no shading — same writing space", () => {
    const orig = prayers(hope());
    const st = prayers(withPrayers(hope(), { look: "stationery" }));
    expect(st.grid.rowEdges).toEqual(orig.grid.rowEdges);
    expect(st.grid.columnEdges).toEqual(orig.grid.columnEdges);
    expect(st.rules.filter((r) => /-r\d+$/.test(r.id)).every((r) => r.strokePt === 0.25 && r.color === "border" && r.hex === undefined)).toBe(true);
    expect(st.box?.strokePt).toBe(0.25);
    const col = st.rules.find((r) => /-v1$/.test(r.id))!;
    expect(col.opacity).toBeLessThan(0.5);
    expect(st.heads.map((h) => h.text)).toEqual(["Date", "Prayer"]);
    expect(st.heads.every((h) => (h.fit?.sizePt ?? 99) < 8.5)).toBe(true);
    expect(st.nodes.some((n) => n.id.endsWith("-header-shade"))).toBe(false);
    // Without the outer border.
    expect(prayers(withPrayers(hope(), { look: "stationery", outerBorder: false })).box).toBeUndefined();
  });

  it("keeps its own lighter look under a heavier product table style; the other tables follow the product style", () => {
    const p = styled(withPrayers(hope(), { look: "stationery" }), { weight: "strong", grid: "full" });
    expect(prayers(p).rules.find((r) => /-r1$/.test(r.id))!.strokePt).toBe(0.25);
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.recipeItemId === "hope-index");
    const index = solvePage(doc, i).nodes.find((n) => n.type === "rule" && /hope-index.*-r1$/.test(n.id)) as RuleNode;
    expect(index.strokePt).toBe(1);
  });
});
