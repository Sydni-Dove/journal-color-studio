/**
 * Responsive cover / divider composition (layouts/book/composition.ts): size
 * classes, title and subtitle fitting, decoration kept clear of the text, cover
 * vs divider, fine-tuning offsets, size switching and preview/print parity.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer, styleForNode } from "../src/engines/typography/textMeasure";
import { rectContains } from "../src/engines/layout/math";
import { LUXE_SUBTITLE_STYLE, LUXE_TITLE_FONT, luxeTitleStyle, NEUTRAL_LUXE_ID } from "../src/presets/coverLuxe";
import { classifyComposition, fitSubtitle, fitTitle, placeDecoration, type MeasureText } from "../src/layouts/book/composition";
import { NEUTRAL_CHEETAH_LUXE } from "../src/layouts/book/luxeComposition";
import { PrintablePage } from "../src/primitives/PrintablePage";
import type { CoverDividerSettings } from "../src/types/recipe";
import type { LayoutNode } from "../src/types/layout";
import type { Rect } from "../src/types/geometry";

type Custom = { width: number; height: number; unit: "in" | "mm" };
/** A book with the Luxe cover and one tabbed divider, typed as "Use matching palette & script title" leaves it. */
function book(size: string, cover: Partial<CoverDividerSettings> = {}, custom?: Custom, title = "Plan") {
  return createProject("planner", {
    name: "Responsive composition",
    dimensions: { sizePresetId: size, ...(custom ? { custom } : {}) },
    colors: { paletteId: NEUTRAL_LUXE_ID },
    typography: { fonts: { cover: LUXE_TITLE_FONT, headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: LUXE_TITLE_FONT }, roleOverrides: { coverTitle: luxeTitleStyle(LUXE_TITLE_FONT), coverSubtitle: LUXE_SUBTITLE_STYLE } },
    recipe: { items: [], ordering: "sequential", structure: [
      step("cover-page", { type: "once" }, { title, cover }),
      step("divider-page", { type: "once" }, { title: "Prayer", cover: { ...cover, subtitle: "DRAW NEAR", tab: { show: true, count: 9, order: 1 } } }),
    ] },
  });
}
const pageOf = (size: string, cover: Partial<CoverDividerSettings> = {}, custom?: Custom, title?: string) => {
  const doc = resolveDocument(book(size, cover, custom, title));
  const at = (layoutId: string) => {
    const i = doc.recipe.pages.findIndex((p) => p.layoutId === layoutId);
    return { i, solved: solvePage(doc, i), g: geometryFor(doc, doc.recipe.pages[i]) };
  };
  return { doc, cover: at("cover-page"), divider: at("divider-page") };
};
const node = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.id === id)!;
const errorsOf = (size: string, cover: Partial<CoverDividerSettings> = {}, custom?: Custom) =>
  validateProject(book(size, cover, custom), heuristicMeasurer).issues.filter((x) => x.severity === "error");
/** Whether a drawn circle (filled, or a thin ring) touches a rectangle. */
function touches(c: LayoutNode, r: Rect): boolean {
  if (c.type !== "circle") return false;
  const cx = c.rect.x + c.rect.w / 2, cy = c.rect.y + c.rect.h / 2, rad = c.rect.w / 2;
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w)), ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  const near = Math.hypot(cx - nx, cy - ny);
  if (!c.outline) return near < rad - 1e-6;
  const far = Math.max(...[r.x, r.x + r.w].flatMap((x) => [r.y, r.y + r.h].map((y) => Math.hypot(cx - x, cy - y))));
  return near < rad - 1e-6 && far > rad + 1e-6;
}
const PLAN_SIZES = ["8.5x11", "7x9", "6x9", "5.5x8.5", "a5"];

describe("size classes come from the usable geometry", () => {
  it("presets land in their class, by live area rather than by name", () => {
    const cls = (size: string, custom?: Custom) => { const { cover } = pageOf(size, {}, custom); return classifyComposition(cover.g.safeRect).sizeClass; };
    expect(["8.5x11", "a4", "8x10"].map((s) => cls(s))).toEqual(["large", "large", "large"]);
    expect(["7x9", "7x9.25", "6x9"].map((s) => cls(s))).toEqual(["medium", "medium", "medium"]);
    expect(["5.5x8.5", "a5"].map((s) => cls(s))).toEqual(["small", "small"]);
    expect(["5x7", "a6", "filofax-personal"].map((s) => cls(s))).toEqual(["compact", "compact", "compact"]);
    // A custom size is classified by its own live area.
    expect(cls("custom", { width: 6.25, height: 9.5, unit: "in" })).toBe("medium");
    expect(cls("custom", { width: 148, height: 210, unit: "mm" })).toBe("small");
  });
  it("uses both sides and the aspect ratio: short side × long side, narrow and landscape flagged", () => {
    expect(classifyComposition({ x: 0, y: 0, w: 7.25, h: 10 }).sizeClass).toBe("large");
    // Wide enough but too short → not large.
    expect(classifyComposition({ x: 0, y: 0, w: 7.25, h: 8 }).sizeClass).toBe("medium");
    // Landscape: judged on its short and long sides.
    expect(classifyComposition({ x: 0, y: 0, w: 10, h: 7.25 })).toMatchObject({ sizeClass: "large", landscape: true });
    expect(classifyComposition({ x: 0, y: 0, w: 2.75, h: 8 })).toMatchObject({ sizeClass: "compact", narrow: true });
  });
});

describe("title fitting", () => {
  // 0.5 em per character at the given size; spacing in ems per gap.
  const linear: MeasureText = (t, pt, tr) => ((t.length * 0.5 + Math.max(0, t.length - 1) * tr) * pt) / 72;
  it("keeps the preferred size when it fits, shrinks only as far as the width needs, and stops at the floor", () => {
    expect(fitTitle("Plan", linear, { preferredPt: 100, minPt: 30 }, { w: 10, h: 10 })).toMatchObject({ sizePt: 100, ok: true, limitedBy: "preferred" });
    const w = fitTitle("Plan", linear, { preferredPt: 100, minPt: 30 }, { w: 2, h: 10 });
    expect(w).toMatchObject({ ok: true, limitedBy: "width" });
    expect(linear("Plan", w.sizePt, 0)).toBeLessThanOrEqual(2);
    expect(linear("Plan", w.sizePt, 0)).toBeGreaterThan(1.9);
    expect(fitTitle("Plan", linear, { preferredPt: 100, minPt: 30 }, { w: 10, h: 1 }).limitedBy).toBe("height");
    // Too long even at the floor: reported, never squeezed below it.
    expect(fitTitle("Wellness and Rest", linear, { preferredPt: 100, minPt: 30 }, { w: 1, h: 10 })).toMatchObject({ sizePt: 30, ok: false, limitedBy: "minimum" });
  });
  it("one fitting rule serves every section title (no hand-placed coordinates)", () => {
    for (const size of PLAN_SIZES) for (const title of ["Plan", "Prayer", "Vision", "Schedule", "Work", "Home", "Wellness", "Finances", "Notes"]) {
      const { cover } = pageOf(size, {}, undefined, title), t = node(cover.solved.nodes, "cover-title");
      expect(t.type === "text" && !t.fit!.failed, `${size} ${title}`).toBe(true);
      expect(rectContains(cover.g.safeRect, t.rect), `${size} ${title}`).toBe(true);
    }
  });
});

describe("subtitle fitting: spacing, then size, then width — only then an error", () => {
  const measure: MeasureText = (t, pt, tr) => ((t.length * 0.6 + Math.max(0, t.length - 1) * tr) * pt) / 72;
  const spec = { preferredPt: 12, minPt: 7.5, minTrackingEm: 0.2, width: 0.3, maxWidth: 0.9, stack: true, lineHeight: 1.5 };
  const width = (lines: string[], pt: number, tr: number) => Math.max(...lines.map((l) => measure(l, pt, tr)));
  it("uses the preferred spacing when it fits", () => {
    const f = fitSubtitle("WITH PURPOSE", measure, spec, 0.48, 3, 5);
    expect(f).toMatchObject({ lines: ["WITH", "PURPOSE"], sizePt: 12, trackingEm: 0.48, ok: true });
  });
  it("tightens the spacing before making the type smaller", () => {
    const zone = width(["PURPOSE"], 12, 0.3) / 0.985 + 1e-3;
    const f = fitSubtitle("WITH PURPOSE", measure, spec, 0.48, zone, 5);
    expect(f.sizePt).toBe(12);
    expect(f.trackingEm).toBeLessThan(0.48);
    expect(f.trackingEm).toBeGreaterThanOrEqual(0.2);
    expect(f.steps).toEqual(["tracking"]);
  });
  it("then slightly smaller type, then a wider zone, then smaller to the floor", () => {
    const perPt = width(["PURPOSE"], 1, 0.2);
    // Needs 90 % of the preferred size at the tightest spacing: smaller type, same zone.
    const a = fitSubtitle("WITH PURPOSE", measure, spec, 0.48, perPt * 12 * 0.9 / 0.985 + 1e-4, 5);
    expect(a).toMatchObject({ ok: true, trackingEm: 0.2 });
    expect(a.sizePt).toBeLessThan(12);
    expect(a.steps).toEqual(["tracking", "size"]);
    // Would need less than 82 %: the zone widens instead (the type stays at 82 %).
    const narrow = perPt * 12 * 0.5;
    const b = fitSubtitle("WITH PURPOSE", measure, spec, 0.48, narrow, 5);
    expect(b).toMatchObject({ ok: true, sizePt: 9.84 });
    expect(b.widthIn).toBeGreaterThan(narrow);
    expect(b.steps).toEqual(["tracking", "size", "width"]);
    // Even the widest zone is too narrow at 82 %: smaller, down to the floor.
    const c = fitSubtitle("WITH PURPOSE", measure, spec, 0.48, narrow, perPt * 8.5 / 0.985);
    expect(c.ok).toBe(true);
    expect(c.sizePt).toBeGreaterThanOrEqual(7.5);
    expect(c.sizePt).toBeLessThan(9.84);
    // Nothing left to try: reported.
    expect(fitSubtitle("WITH PURPOSE", measure, spec, 0.48, 0.2, 0.3).ok).toBe(false);
  });
  it("normal preset wording never needs shortening at Half Letter or A5", () => {
    for (const size of ["5.5x8.5", "a5"]) for (const subtitle of ["WITH PURPOSE", "DRAW NEAR", "SEE CLEARLY", "MAKE A WAY", "BUILD WELL", "CULTIVATE PEACE", "CARE FOR YOU", "BE A GOOD STEWARD", "IDEAS & EXTRAS"]) {
      const { cover } = pageOf(size, { subtitle }), s = node(cover.solved.nodes, "cover-subtitle");
      expect(s.type === "text" && !s.fit!.failed, `${size} ${subtitle}`).toBe(true);
      expect(rectContains(cover.g.safeRect, s.rect)).toBe(true);
    }
  });
});

describe("Plan / WITH PURPOSE needs no manual correction", () => {
  for (const size of PLAN_SIZES) it(`${size}: fits, stays the focal point, and the shapes frame rather than cover the text`, () => {
    const { doc, cover } = pageOf(size), n = cover.solved.nodes, safe = cover.g.safeRect;
    const t = node(n, "cover-title"), s = node(n, "cover-subtitle"), line = node(n, "cover-line");
    if (t.type !== "text" || s.type !== "text") throw new Error("text");
    expect(t.fit!.failed).toBe(false);
    expect(s.fit!.failed).toBe(false);
    expect(s.fit!.lines).toEqual(["WITH", "PURPOSE"]);
    for (const x of [t, s, line]) expect(rectContains(safe, x.rect), `${size} ${x.id}`).toBe(true);
    // Subtitle directly beneath the title and centred with it; the rule under the subtitle.
    expect(s.rect.y).toBeGreaterThanOrEqual(t.rect.y + t.rect.h - 1e-9);
    expect(Math.abs(s.rect.x + s.rect.w / 2 - (t.rect.x + t.rect.w / 2))).toBeLessThan(0.02);
    expect(line.rect.y).toBeGreaterThan(s.rect.y + s.rect.h);
    // Not disproportionately small (nor edge to edge): the lettering spans a real share of the live area.
    const titleW = heuristicMeasurer("Plan", styleForNode(doc.typography, t));
    expect(titleW / safe.w, size).toBeGreaterThan(0.45);
    expect(titleW / safe.w, size).toBeLessThanOrEqual(0.96);
    // No shape covers the subtitle or the rule; only the soft blush "title frame" may sit behind the title.
    for (const c of n.filter((x) => x.type === "circle")) {
      for (const r of [s.rect, line.rect]) expect(touches(c, r), `${size} ${c.id} × ${r === s.rect ? "subtitle" : "rule"}`).toBe(false);
      // The title's box spans its whole zone; the protected area is the lettering itself (measured, centred in the box).
      const ink = { x: t.rect.x + t.rect.w / 2 - titleW / 2, y: t.rect.y, w: titleW, h: t.rect.h };
      if (c.id !== "luxe-blush") expect(touches(c, ink), `${size} ${c.id} × title`).toBe(false);
    }
    expect(cover.solved.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(errorsOf(size)).toEqual([]);
  });
});

describe("cover vs divider", () => {
  it("the divider is calmer: a smaller, centred title, a one-line subtitle, clear of its tab", () => {
    for (const size of PLAN_SIZES) {
      const { cover, divider } = pageOf(size);
      const ct = node(cover.solved.nodes, "cover-title"), dt = node(divider.solved.nodes, "cover-title"), ds = node(divider.solved.nodes, "cover-subtitle"), tab = node(divider.solved.nodes, "tab");
      if (ct.type !== "text" || dt.type !== "text" || ds.type !== "text") throw new Error("text");
      expect(dt.fit!.sizePt, size).toBeLessThan(ct.fit!.sizePt);
      expect(ds.fit!.lines).toEqual(["DRAW NEAR"]);
      expect(dt.rect.x + dt.rect.w <= tab.rect.x || tab.rect.x + tab.rect.w <= dt.rect.x).toBe(true);
      expect(rectContains(divider.g.safeRect, tab.rect)).toBe(true);
      // Fewer shapes than the cover on smaller pages (the optional pieces step back).
      expect(divider.solved.nodes.filter((x) => x.type === "circle").length).toBeLessThanOrEqual(cover.solved.nodes.filter((x) => x.type === "circle").length);
    }
  });
  it("density by size: every shape on Letter, the signature pieces on a compact page", () => {
    const shapes = (size: string) => pageOf(size).cover.solved.nodes.filter((x) => x.type === "circle").map((x) => x.id);
    expect(shapes("8.5x11")).toHaveLength(NEUTRAL_CHEETAH_LUXE.decoration.length);
    const compact = shapes("5x7");
    for (const id of NEUTRAL_CHEETAH_LUXE.decoration.filter((d) => d.priority === "primary").map((d) => d.id)) expect(compact).toContain(id);
    for (const id of NEUTRAL_CHEETAH_LUXE.decoration.filter((d) => d.priority === "optional").map((d) => d.id)) expect(compact).not.toContain(id);
  });
});

describe("decoration steps around the text", () => {
  it("a shape over the text escapes towards its own edge; a primary piece is never removed", () => {
    const v = NEUTRAL_CHEETAH_LUXE.cover.large, page = { W: 8.5, H: 11, R: 8.5 };
    const burgundy = NEUTRAL_CHEETAH_LUXE.decoration[0];
    const zone = { rect: { x: 1, y: 2.4, w: 3, h: 1 }, soft: false };
    const [p] = placeDecoration([burgundy], v, page, [zone], { enabled: () => true, strokeIn: 0.03 });
    expect(p.hidden).toBe(false);
    expect(p.moved + (1 - p.scaled)).toBeGreaterThan(0);
    // Moved up-left, towards its corner.
    expect(p.cx).toBeLessThan(burgundy.x * page.W);
    expect(p.cy).toBeLessThan(burgundy.y * page.H);
    // An optional piece that cannot get clear steps aside instead.
    const tan = NEUTRAL_CHEETAH_LUXE.decoration.find((d) => d.id === "luxe-tan")!;
    const [q] = placeDecoration([tan], { ...v, maxShiftR: 0 }, page, [{ rect: { x: 0, y: 7, w: 8.5, h: 2 }, soft: false }], { enabled: () => true, strokeIn: 0.03 });
    expect(q.hidden).toBe(true);
  });
  it("the page's decoration toggles still apply", () => {
    const n = pageOf("7x9", { leopard: false, outlines: false }).cover.solved.nodes.filter((x) => x.type === "circle");
    expect(n.some((x) => x.type === "circle" && (x.leopard || x.outline))).toBe(false);
    expect(n.length).toBeGreaterThan(0);
  });
});

describe("fine-tuning adjusts the fitted design", () => {
  it("offsets are fractions of the page: the same nudge carries across sizes, inside the safe area", () => {
    for (const size of ["8.5x11", "5.5x8.5"]) {
      const base = pageOf(size).cover, moved = pageOf(size, { titleOffset: { x: 0, y: 0.03 } }).cover;
      const dy = node(moved.solved.nodes, "cover-title").rect.y - node(base.solved.nodes, "cover-title").rect.y;
      expect(dy / base.g.trimHeightIn, size).toBeCloseTo(0.03, 6);
    }
    // A nudge past the live area is held at its edge.
    const far = pageOf("5.5x8.5", { titleOffset: { x: 0, y: 0.5 } }).cover;
    for (const id of ["cover-title", "cover-subtitle", "cover-line"]) expect(rectContains(far.g.safeRect, node(far.solved.nodes, id).rect), id).toBe(true);
  });
  it("title size scales the preferred size; the subtitle and shapes can be nudged on their own", () => {
    const size = (o: Partial<CoverDividerSettings>) => { const t = node(pageOf("8.5x11", o).cover.solved.nodes, "cover-title"); return t.type === "text" ? t.fit!.sizePt : 0; };
    expect(size({ titleScale: 80 })).toBeLessThan(size({}));
    const sub = (o: Partial<CoverDividerSettings>) => node(pageOf("7x9", o).cover.solved.nodes, "cover-subtitle").rect.y;
    expect(sub({ subtitleOffset: { x: 0, y: 0.02 } })).toBeGreaterThan(sub({}));
    const slate = (o: Partial<CoverDividerSettings>) => node(pageOf("8.5x11", o).cover.solved.nodes, "luxe-slate").rect.x;
    expect(slate({ decorOffset: { x: -0.02, y: 0 } })).toBeLessThan(slate({}));
  });
  it("switching sizes repeatedly always resolves the same design for the same size", () => {
    const snap = (size: string) => JSON.stringify(pageOf(size, { titleOffset: { x: 0.01, y: -0.02 }, titleScale: 90 }).cover.solved.nodes);
    const first = snap("8.5x11"), a5 = snap("a5");
    for (const size of ["7x9", "5.5x8.5", "a5", "8.5x11", "6x9", "a5"]) snap(size);
    expect(snap("8.5x11")).toBe(first);
    expect(snap("a5")).toBe(a5);
  });
  it("with \"Fit design to page\" off, the reference layout is kept", () => {
    const n = pageOf("5.5x8.5", { autoFit: false }).cover.solved.nodes, g = pageOf("5.5x8.5").cover.g;
    const b = node(n, "luxe-burgundy");
    expect(b.rect.x + b.rect.w / 2).toBeCloseTo(0.269 * g.trimWidthIn, 6);
  });
});

describe("end cover", () => {
  it("uses the same engine: the design turned half a turn, its line of text kept clear", () => {
    const p = book("5.5x8.5");
    p.recipe = { items: [], ordering: "sequential", structure: [step("back-cover", { type: "once" }, { cover: { subtitle: "DOVE EXPRESSIONS" } })] };
    const doc = resolveDocument(p), i = doc.recipe.pages.findIndex((x) => x.layoutId === "back-cover-page"), s = solvePage(doc, i);
    const t = node(s.nodes, "back-line");
    expect(t.type === "text" && !t.fit!.failed).toBe(true);
    for (const c of s.nodes.filter((x) => x.type === "circle")) expect(touches(c, t.rect), c.id).toBe(false);
  });
});

describe("validation", () => {
  it("names the page style elsewhere in the book that doesn't fit, instead of blaming the cover", () => {
    const p = book("a6");
    p.recipe = { ...p.recipe, structure: [...p.recipe.structure!, step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-spread" })] };
    // A weekly spread needs more room than A6 has: reported against the weekly page, not the cover.
    const issues = validateProject(p, heuristicMeasurer).issues.filter((x) => x.componentId?.startsWith("layout:"));
    expect(issues.length).toBeGreaterThan(0);
    const cover = resolveDocument(p).recipe.pages.find((pg) => pg.layoutId === "cover-page")!;
    for (const x of issues) {
      expect(x.componentId).toBe("layout:weekly-plan-spread");
      expect(x.page).not.toBe(cover.pageNumber);
    }
  });
  it("preview = print for the fitted cover and divider", () => {
    for (const size of ["5.5x8.5", "a5"]) {
      const { doc, cover, divider } = pageOf(size);
      for (const pg of [cover, divider]) {
        const props = { geometry: pg.g, solved: pg.solved, colors: doc.colors, typography: doc.typography, decorative: doc.decorative };
        const strip = (s: string) => s.replace("ps-page--editor", "").replace("ps-page--print", "");
        expect(strip(renderToStaticMarkup(<PrintablePage {...props} mode="editor" />))).toBe(strip(renderToStaticMarkup(<PrintablePage {...props} mode="print" />)));
      }
    }
  });
});

describe("cover panel controls", () => {
  it("offer Fit design to page (on by default) and fine-tuning; Fit off hides the fine-tuning", async () => {
    const { CoverDividerControls } = await import("../src/components/editor/CoverDividerControls");
    const render = (cover: Partial<CoverDividerSettings>) =>
      renderToStaticMarkup(<CoverDividerControls step={step("cover-page", { type: "once" }, { title: "Plan", cover })} set={() => {}} applyPreset={() => {}} titleFont={LUXE_TITLE_FONT} onTitleFont={() => {}} />);
    const on = render({});
    expect(on).toContain("Fit design to page size");
    expect(on).toMatch(/type="checkbox" checked=""[^>]*\/?> Fit design to page size/);
    expect(on).toContain("Fine-tune (optional)");
    expect(on).toContain("Title size (%)");
    expect(render({ autoFit: false })).not.toContain("Fine-tune (optional)");
  });
});
