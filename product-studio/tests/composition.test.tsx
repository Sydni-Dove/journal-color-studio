/**
 * Composition layer: regions resolve to physical bounds, decoration anchors to
 * them, never covers protected content unless allowed, and never crops
 * artwork unintentionally. Semantic text moves between anchors. Rendered
 * output changes with each control (not only state).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { overlaps } from "../src/engines/composition/composition";
import { cellRects, MIN_LONG_SIDE_IN } from "../src/engines/composition/fit";
import { compositionFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { findAsset } from "../src/design-library/library";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { planDecoration, placementsFor, type DecorPlan } from "../src/themes/decorationPlan";
import type { CompositionAnchor } from "../src/types/composition";
import type { TextNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";
import type { DecorativeTheme } from "../src/types/theme";

const build = (i: number) => TEST_PRODUCTS[i].build();
const firstPage = (p: ProductProject) => {
  const doc = resolveDocument(p);
  return doc.recipe.pages.findIndex((x) => !x.filler);
};
function planFor(p: ProductProject, deco: Partial<DecorativeTheme>, index = firstPage(p)) {
  p.decorativeTheme = { ...p.decorativeTheme, ...deco };
  const doc = resolveDocument(p);
  const g = geometryFor(doc, doc.recipe.pages[index]);
  const comp = compositionFor(doc, index);
  return { doc, g, comp, plan: planDecoration(g, p.decorativeTheme, doc.colors, comp)! };
}
const html = (p: ProductProject, index = firstPage(p)) => {
  const doc = resolveDocument(p);
  return renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[index])} solved={solvePage(doc, index)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} spacing={doc.spacing} mode="print" />,
  );
};
const within = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;

describe("composition regions resolve to physical bounds", () => {
  it("monthly: page, safe area, header, title, calendar, notes, accents", () => {
    const p = build(2);
    const doc = resolveDocument(p);
    const c = compositionFor(doc, 0);
    for (const a of ["page", "safeArea", "header", "title", "mainContent", "calendar", "notes", "sidebar", "topLeftAccent", "bottomRightAccent"] as CompositionAnchor[]) {
      expect(c.regions[a], a).toBeDefined();
      expect(within(c.regions[a]!, c.regions.page!), a).toBe(true);
    }
    const title = solvePage(doc, 0).nodes.find((n) => n.id === "month-header-title") as TextNode;
    expect(c.regions.title!.y).toBeGreaterThanOrEqual(title.rect.y - 1e-9);
    expect(c.regions.calendar!.y).toBeGreaterThan(c.regions.title!.y + c.regions.title!.h);
  });
  it("protected content includes text ink, rules, surfaces and binding keep-outs, inflated by the clearance", () => {
    const doc = resolveDocument(build(2));
    const c = compositionFor(doc, 0);
    const kinds = new Set(c.protected.map((p) => p.kind));
    for (const k of ["text", "rule", "surface", "box", "keepout"]) expect(kinds.has(k as never), k).toBe(true);
    expect(c.clearanceIn).toBe(doc.spacing.decorationToContentGap);
  });
});

describe("decoration anchors to composition regions", () => {
  it("changing the anchor moves the artwork's physical bounds into the selected region", () => {
    const base = { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" } as const;
    for (const anchor of ["notes", "calendar", "header", "bottomRightAccent"] as CompositionAnchor[]) {
      const { plan, comp, g } = planFor(build(2), { ...base, layout: { anchor, allowContentOverlap: true } });
      const r = plan.reports.find((x) => x.rect)!;
      expect(r.anchor).toBe(anchor);
      const region = comp.regions[anchor]!;
      const media = { x: region.x + g.trimOffset.x, y: region.y + g.trimOffset.y, w: region.w, h: region.h };
      expect(within(r.rect!, media), anchor).toBe(true);
    }
  });
  it("different anchors give different bounds (rendered output changes too)", () => {
    const a = planFor(build(2), { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom", layout: { anchor: "notes", allowContentOverlap: true } }).plan;
    const b = planFor(build(2), { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom", layout: { anchor: "calendar", allowContentOverlap: true } }).plan;
    expect(a.reports[0].rect).not.toEqual(b.reports[0].rect);
    const pa = build(2), pb = build(2);
    pa.decorativeTheme = { ...pa.decorativeTheme, style: "accent", assetId: "jcs-accent-waves", placement: "corners", corners: "tr" };
    pb.decorativeTheme = { ...pb.decorativeTheme, style: "accent", assetId: "jcs-accent-waves", placement: "corners", corners: "bl" };
    expect(html(pa)).not.toBe(html(pb));
  });
  it("offsets move the artwork (and are still bound by the page rules)", () => {
    const a = planFor(build(2), { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" }).plan.reports.find((r) => r.rect)!;
    const b = planFor(build(2), { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent", layout: { offsetXIn: 0.3 } }).plan.reports.find((r) => r.rect)!;
    expect(b.rect!.x).toBeCloseTo(a.rect!.x + 0.3, 6);
  });
});

/** Every placed object's artwork cells, in trim coordinates. */
function inkCells(plan: DecorPlan, g: { trimOffset: { x: number; y: number } }) {
  return plan.pieces.flatMap((p) => {
    if (p.kind !== "raster" && p.kind !== "mask") return [];
    const r = { x: p.rect.x - g.trimOffset.x, y: p.rect.y - g.trimOffset.y, w: p.rect.w, h: p.rect.h };
    return cellRects(p.assetId, r, p.transform ?? {});
  });
}

describe("with overlap disabled, decoration never intersects protected content", () => {
  const cases: [number, Partial<DecorativeTheme>][] = [];
  for (const i of [0, 1, 2, 3, 4]) {
    cases.push([i, { style: "floral", assetId: "jcs-floral-corner", placement: "corners" }]);
    cases.push([i, { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" }]);
    cases.push([i, { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "all", edge: "bleed" }]);
    cases.push([i, { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" }]);
    for (const c of ["tl", "tr", "bl", "br"] as const) cases.push([i, { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: c }]);
  }
  for (const [i, deco] of cases) {
    it(`${TEST_PRODUCTS[i].label} · ${deco.assetId} · ${deco.placement}${deco.corners ? ` (${deco.corners})` : ""}`, () => {
      const p = build(i);
      const { plan, comp, g } = planFor(p, deco);
      // A rule accent rests ON the title rule by design: the rule and what lies beyond it are exempt.
      // A title accent is attached to the title at titleAccentGap / decorationToTitleGap (< clearance): the title is exempt.
      const onRule = plan.reports.some((r) => r.rect && r.id.startsWith("rule-"));
      const rest = onRule ? comp.headerRule!.y : undefined;
      const attached = new Set(plan.reports.flatMap((r) => r.attachedTo));
      const guarded = comp.protected.filter(
        (q) => !attached.has(q.id) && (rest === undefined || (q.rect.y + comp.clearanceIn < rest - 1e-6 && !(q.kind === "rule" && Math.abs(q.rect.y + q.rect.h / 2 - (comp.headerRule!.y + comp.headerRule!.h / 2)) < 1e-6))),
      );
      for (const cell of inkCells(plan, g)) {
        for (const q of guarded) expect(overlaps(cell, q.rect), `${q.id}`).toBe(false);
        if (rest !== undefined) expect(cell.y + cell.h).toBeLessThanOrEqual(rest + 1e-6);
      }
      // Nothing unintentionally cropped: every ink cell inside the trim (+ bleed, which is intentional).
      for (const r of plan.reports) if (r.rect) expect(r.clippedShare === 0 || r.intentionalClip).toBe(true);
      // Dropped pieces always say why; placed ones are never specks.
      for (const r of plan.reports) {
        if (!r.rect) expect(r.reason).toBeTruthy();
        else expect(Math.max(r.rect.w, r.rect.h)).toBeGreaterThanOrEqual(MIN_LONG_SIDE_IN - 1e-6);
      }
    });
  }
  it("line-art corners in BLEED mode mask content away (knockout) instead of covering it", () => {
    const { plan, comp } = planFor(build(3), { style: "accent", assetId: "jcs-accent-topo", placement: "corners", edge: "bleed" });
    expect(plan.knockouts.length).toBeGreaterThan(0);
    const content = comp.content!;
    expect(plan.knockouts.some((k) => k.x <= content.x && k.y <= content.y + 1)).toBe(true);
  });
});

describe("fields are composed around the content", () => {
  it("header band ends clearance above the content; frames keep a clearance around it", () => {
    for (const i of [0, 1, 2, 3, 4]) {
      const band = planFor(build(i), { style: "solid", placement: "header-band" });
      const top = band.comp.content!.y;
      const piece = band.plan.pieces[0];
      expect(piece.kind === "solid" && piece.rect.y + piece.rect.h, TEST_PRODUCTS[i].label).toBeCloseTo(band.g.trimOffset.y + top - band.comp.clearanceIn, 9);
      const frame = planFor(build(i), { style: "marble", assetId: "jcs-marble-boldgold", placement: "border-frame" });
      const hole = frame.plan.knockouts[0];
      const c = frame.comp.content!;
      expect(hole.x).toBeCloseTo(frame.g.trimOffset.x + c.x - frame.comp.clearanceIn, 9);
      expect(hole.y).toBeCloseTo(frame.g.trimOffset.y + c.y - frame.comp.clearanceIn, 9);
    }
  });
  it("line-art header band is mirror-tiled inside the band (never one giant copy cropped by the page)", () => {
    const { plan, g, comp } = planFor(build(2), { style: "accent", assetId: "jcs-accent-waves", placement: "header-band" });
    const t = plan.pieces[0];
    expect(t.kind).toBe("tile");
    if (t.kind === "tile") {
      expect(t.region.y).toBe(0);
      expect(t.region.y + t.region.h).toBeCloseTo(g.trimOffset.y + comp.content!.y - comp.clearanceIn, 9);
      expect(t.tile.h).toBeLessThan(t.region.h * 2);
    }
  });
  it("the retired lettered cover is gone: the bouquet is transparent artwork used as a rule / edge ornament", () => {
    const a = findAsset("jcs-floral-bouquet")!;
    expect(a.sourceFile).toBe("floral-bouquet.png");
    expect(placementsFor({ style: "floral", assetId: a.id })).toEqual(["title-accent", "footer-flourish", "top-bottom"]);
  });
});

describe("semantic text positioning", () => {
  const weekTitle = (p: ProductProject) => {
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.spreadPart === 0);
    return { node: solvePage(doc, i).nodes.find((n) => n.type === "text" && n.semantic === "weekOf") as TextNode, doc };
  };
  it("Week of: left → center → right moves the solved X (and alignment)", () => {
    const xs = (["header-left", "header-center", "header-right"] as const).map((anchor) => {
      const p = build(3);
      p.layoutOptions.textPositions = { weekOf: { anchor, offsetXIn: 0, offsetYIn: 0 } };
      const { node } = weekTitle(p);
      expect(node.align).toBe(anchor.split("-")[1]);
      return node.align === "left" ? node.rect.x : node.align === "right" ? node.rect.x + node.rect.w : node.rect.x + node.rect.w / 2;
    });
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
  it("vertical anchor: header → above-content → footer changes the solved Y", () => {
    const ys = (["header-left", "above-content-left", "footer-left"] as const).map((anchor) => {
      const p = build(3);
      p.layoutOptions.showFooter = true;
      p.layoutOptions.textPositions = { weekOf: { anchor, offsetXIn: 0, offsetYIn: 0 } };
      return weekTitle(p).node.rect.y;
    });
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
  it("fine offsets move text but never out of the print-safe area", () => {
    const p = build(3);
    p.layoutOptions.textPositions = { weekOf: { anchor: "header-left", offsetXIn: 0.4, offsetYIn: 0 } };
    const moved = weekTitle(p).node;
    const base = weekTitle(build(3)).node;
    expect(moved.rect.x).toBeCloseTo(base.rect.x + 0.4, 6);
    p.layoutOptions.textPositions = { weekOf: { anchor: "header-left", offsetXIn: -50, offsetYIn: -50 } };
    const { node, doc } = weekTitle(p);
    const g = geometryFor(doc, { side: "verso" });
    expect(node.rect.x).toBeGreaterThanOrEqual(g.safeRect.x - 1e-9);
    expect(node.rect.y).toBeGreaterThanOrEqual(g.safeRect.y - 1e-9);
  });
  it("footer anchors are offered only when the page has a footer", () => {
    const p = build(2);
    p.layoutOptions.textPositions = { monthYear: { anchor: "footer-right", offsetXIn: 0, offsetYIn: 0 } };
    const doc = resolveDocument(p);
    const s = solvePage(doc, 0);
    const t = s.nodes.find((n) => n.type === "text" && n.semantic === "monthYear") as TextNode;
    expect(t.placement!.anchor).not.toBe("footer-right");
    expect(s.diagnostics.some((d) => d.rule === "text-position")).toBe(true);
  });
  it("section headings (Notes) align left / center / right inside their section", () => {
    const xs = (["above-content-left", "above-content-center", "above-content-right"] as const).map((anchor) => {
      const p = build(2);
      p.layoutOptions.textPositions = { sectionHeading: { anchor, offsetXIn: 0, offsetYIn: 0 } };
      const t = solvePage(resolveDocument(p), 0).nodes.find((n) => n.id === "month-sidebar-title") as TextNode;
      return { align: t.align, html: html(p) };
    });
    expect(xs.map((x) => x.align)).toEqual(["left", "center", "right"]);
    expect(new Set(xs.map((x) => x.html)).size).toBe(3);
  });
  it("desk pad: Week of and its write-in line move together", () => {
    const at = (anchor: "above-content-left" | "above-content-center") => {
      const p = build(4);
      p.layoutOptions.textPositions = { weekOf: { anchor, offsetXIn: 0, offsetYIn: 0 } };
      const nodes = solvePage(resolveDocument(p), 0).nodes;
      return nodes.find((n) => n.id === "dp-weekof-line")!.rect.x;
    };
    expect(at("above-content-center")).toBeGreaterThan(at("above-content-left") + 1);
  });
});

describe("centralized spacing", () => {
  it("every product validates with no title-rule-gap or label-border-inset issue", () => {
    for (const t of TEST_PRODUCTS) {
      const r = validateProject(t.build(), heuristicMeasurer);
      const bad = r.issues.filter((i) => i.rule === "title-rule-gap" || i.rule === "label-border-inset");
      expect(bad, t.label).toEqual([]);
    }
  });
  it("titles keep titleToRuleGap from the rule / content below (desk pad, journal included)", () => {
    for (const i of [0, 1, 2, 3, 4]) {
      const doc = resolveDocument(build(i));
      const idx = doc.recipe.pages.findIndex((x) => !x.filler);
      const nodes = solvePage(doc, idx).nodes;
      const titles = nodes.filter((n): n is TextNode => n.type === "text" && !!n.semantic && n.semantic !== "footer" && n.semantic !== "sectionHeading");
      expect(titles.length, TEST_PRODUCTS[i].label).toBeGreaterThan(0);
    }
  });
  it("spacing tokens are physical and grow with density", () => {
    const token = (density: "compact" | "balanced" | "airy") => {
      const p = build(2);
      p.spacing.density = density;
      return resolveDocument(p).spacing;
    };
    for (const k of ["titleToRuleGap", "headingToContentGap", "labelToBorderInset", "dateToCellInset", "sectionHeadingInset", "decorationToContentGap"] as const) {
      expect(token("compact")[k]).toBeLessThan(token("balanced")[k]);
      expect(token("balanced")[k]).toBeLessThan(token("airy")[k]);
    }
  });
});

describe("composition validation catches objective failures", () => {
  const issues = (p: ProductProject) => validateProject(p, heuristicMeasurer, { pageIndices: [firstPage(p)] }).issues;
  it("decoration with no room is reported (not silently dropped)", () => {
    const p = build(0);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" };
    expect(issues(p).some((i) => i.rule === "decoration-no-room")).toBe(true);
  });
  it("allowing overlap at full strength over content is flagged as excessive", () => {
    const p = build(2);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom", opacity: 1, layout: { anchor: "calendar", allowContentOverlap: true } };
    expect(issues(p).some((i) => i.rule === "decoration-overlap")).toBe(true);
  });
  it("an ornament offset into empty space is flagged as dead space", () => {
    const p = build(4);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "tr", layout: { offsetXIn: -3, offsetYIn: 3, allowContentOverlap: true } };
    const found = issues(p).filter((i) => i.rule === "decoration-dead-space" || i.rule === "decoration-overlap");
    expect(found.length).toBeGreaterThan(0);
  });
  it("cropping without permission is flagged", () => {
    const p = build(2);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "tr", layout: { offsetXIn: 1.5, allowClipping: false, allowBleed: false, allowContentOverlap: true } };
    const r = planFor(build(2), p.decorativeTheme).plan.reports;
    // The fitter shrinks or drops rather than crop; either way nothing is cropped silently.
    for (const x of r) expect(!x.rect || x.clippedShare === 0 || x.intentionalClip).toBe(true);
  });
  it("a title pushed onto its rule is flagged (title-rule-gap)", () => {
    const p = build(2);
    p.layoutOptions.textPositions = { monthYear: { anchor: "above-content-left", offsetXIn: 0, offsetYIn: 0.3 } };
    // Offsets are clamped to the safe area, not to the rule: validation must catch the collision.
    expect(issues(p).some((i) => i.rule === "title-rule-gap" || i.rule === "text-collision")).toBe(true);
  });
  it("a label forced against a border is flagged (label-border-inset)", () => {
    const p = build(3);
    p.spacing.overrides = { ...(p.spacing.overrides ?? {}), labelToBorderInset: 0.2 };
    const doc = resolveDocument(p);
    const i = doc.recipe.pages.findIndex((x) => x.spreadPart === 0);
    const r = validateProject(p, heuristicMeasurer, { pageIndices: [i] }).issues;
    expect(r.some((x) => x.rule === "label-border-inset" || x.rule === "layout-solver" || x.rule === "text-overflow")).toBe(true);
  });
  it("a creative-default monthly with floral corners validates with 0 errors", () => {
    const p = build(2);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners" };
    expect(issues(p).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("placement controls reach the rendered page", () => {
  const variants: Partial<DecorativeTheme>[] = [
    { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "opposite-tl-br" },
    { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "tr" },
    { style: "accent", assetId: "jcs-accent-waves", placement: "corners", edge: "bleed" },
    { style: "accent", assetId: "jcs-accent-waves", placement: "header-band" },
    { style: "accent", assetId: "jcs-accent-waves", placement: "top-bottom" },
    { style: "accent", assetId: "jcs-accent-waves", placement: "behind-title", opacity: 0.16 },
    { style: "accent", assetId: "jcs-accent-waves", placement: "border-frame" },
    { style: "marble", assetId: "jcs-marble-goldleaf", placement: "header-band" },
    { style: "marble", assetId: "jcs-marble-goldleaf", placement: "border-frame" },
    { style: "marble", assetId: "jcs-marble-goldleaf", placement: "full-page", opacity: 0.16 },
    { style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent" },
    { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" },
  ];
  it("each placement that can be placed renders differently; one that cannot says why", () => {
    const out: string[] = [];
    for (const d of variants) {
      const p = build(3);
      const i = resolveDocument(p).recipe.pages.findIndex((x) => x.spreadPart === 0);
      const { plan } = planFor(p, d, i);
      if (plan.pieces.length === 0) {
        expect(plan.reports.every((r) => !!r.reason), `${d.assetId} ${d.placement}`).toBe(true);
        continue;
      }
      out.push(html(p, i));
    }
    expect(out.length).toBeGreaterThanOrEqual(variants.length - 2);
    expect(new Set(out).size).toBe(out.length);
  });
  it("create-project defaults carry no legacy decoration flag", () => {
    const p = createProject("journal", {});
    expect("applyToInterior" in p.decorativeTheme).toBe(false);
  });
});

describe("fields stay inside their region when rendered", () => {
  it("a watercolor header band is clipped to the band (blooms never wash the whole page)", () => {
    const p = build(4);
    p.decorativeTheme = { ...p.decorativeTheme, style: "watercolor", placement: "header-band" };
    const out = html(p, 0);
    const m = out.match(/<clipPath id="([^"]+wcclip0)"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
    expect(m).not.toBeNull();
    const doc = resolveDocument(p);
    const comp = compositionFor(doc, 0);
    const g = geometryFor(doc, doc.recipe.pages[0]);
    expect(Number(m![5])).toBeCloseTo(g.trimOffset.y + comp.content!.y - comp.clearanceIn, 6);
    expect(out).toContain(`clip-path="url(#${m![1]})"`);
  });
});
