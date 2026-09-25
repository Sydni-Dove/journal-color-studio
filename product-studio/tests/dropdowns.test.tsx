/**
 * Dropdown behavior, end to end: UI value → state → resolver → solved data →
 * rendered output. Every option of the affected dropdowns either changes the
 * rendered page, or (printer / binding) changes solved requirements AND the
 * UI states why the page did not move. No placebo options.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compositionFor, geometryFor, representativeGeometry, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { computeUsage } from "../src/engines/document/usage";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { BINDING_CHOICES } from "../src/presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../src/presets/printProfiles/printProfiles";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { planDecoration, placementsFor } from "../src/themes/decorationPlan";
import type { CompositionAnchor } from "../src/types/composition";
import type { TextAnchor, TextNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";
import type { CornerSet, DecorativeTheme } from "../src/types/theme";

const build = (i: number) => TEST_PRODUCTS[i].build();
function render(p: ProductProject, index = 0) {
  const doc = resolveDocument(p);
  return renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[index])} solved={solvePage(doc, index)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} spacing={doc.spacing} mode="print" />,
  );
}
function plan(p: ProductProject, index = 0) {
  const doc = resolveDocument(p);
  return planDecoration(geometryFor(doc, doc.recipe.pages[index]), doc.decorative, doc.colors, compositionFor(doc, index))!;
}
const withDeco = (i: number, d: Partial<DecorativeTheme>) => {
  const p = build(i);
  p.decorativeTheme = { ...p.decorativeTheme, ...d };
  return p;
};

describe("Decoration → Placement: every offered option changes the solved plan and the rendered page", () => {
  const designs: Partial<DecorativeTheme>[] = [
    { style: "solid" },
    { style: "watercolor" },
    { style: "marble", assetId: "jcs-marble-boldgold" },
    { style: "accent", assetId: "jcs-accent-topo" },
    { style: "accent", assetId: "jcs-accent-ribbon" },
  ];
  for (const d of designs) {
    it(`${d.assetId ?? d.style}`, () => {
      const options = placementsFor({ style: d.style!, assetId: d.assetId });
      expect(options.length).toBeGreaterThan(1);
      const plans = options.map((placement) => {
        const pl = plan(withDeco(2, { ...d, placement }));
        return JSON.stringify([pl.pieces.map((x) => ("rect" in x ? x.rect : x.region)), pl.knockouts]);
      });
      const renders = options.map((placement) => render(withDeco(2, { ...d, placement })));
      expect(new Set(plans).size, "solved").toBe(options.length);
      expect(new Set(renders).size, "rendered").toBe(options.length);
    });
  }
});

describe("Decoration → Corners: each explicit corner set changes the solved pieces", () => {
  it("line-art corners (always placed: JCS overhang + knockout)", () => {
    const sets: CornerSet[] = ["opposite-tl-br", "opposite-tr-bl", "tl", "tr", "bl", "br"];
    const solved = sets.map((corners) => JSON.stringify(plan(withDeco(3, { style: "accent", assetId: "jcs-accent-dots", placement: "corners", corners }), 1).pieces));
    const rendered = sets.map((corners) => render(withDeco(3, { style: "accent", assetId: "jcs-accent-dots", placement: "corners", corners }), 1));
    expect(new Set(solved).size).toBe(sets.length);
    expect(new Set(rendered).size).toBe(sets.length);
  });
  it("floral corners: Automatic picks the pair with the most room; each corner reports placed or why not", () => {
    const auto = plan(withDeco(2, { style: "floral", assetId: "jcs-floral-corner", placement: "corners" }));
    const area = (x: typeof auto) => x.reports.reduce((s, r) => s + (r.rect ? r.rect.w * r.rect.h : 0), 0);
    const a = plan(withDeco(2, { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "opposite-tl-br" }));
    const b = plan(withDeco(2, { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "opposite-tr-bl" }));
    expect(area(auto)).toBeCloseTo(Math.max(area(a), area(b)), 9);
    for (const r of [...a.reports, ...b.reports]) expect(!!r.rect || !!r.reason).toBe(true);
  });
});

describe("Decoration → Anchor / Align X / Align Y (advanced)", () => {
  const bouquet = { style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom" } as const;
  it("each available anchor solves to a different position", () => {
    const usage = computeUsage(resolveDocument(build(2)));
    const anchors = usage.compositionAnchors.filter((a) => a !== "title" && a !== "header") as CompositionAnchor[];
    const rects = anchors.map((anchor) => JSON.stringify(plan(withDeco(2, { ...bouquet, layout: { anchor, allowContentOverlap: true } })).reports[0].rect));
    expect(new Set(rects).size).toBe(anchors.length);
  });
  it("Align X and Align Y each move the artwork within its region", () => {
    const at = (alignX: "start" | "center" | "end", alignY: "start" | "center" | "end") =>
      plan(withDeco(2, { ...bouquet, scale: 0.4, layout: { anchor: "calendar", alignX, alignY, allowContentOverlap: true } })).reports[0].rect!;
    expect(at("start", "center").x).toBeLessThan(at("center", "center").x);
    expect(at("center", "center").x).toBeLessThan(at("end", "center").x);
    expect(at("center", "start").y).toBeLessThan(at("center", "center").y);
    expect(at("center", "center").y).toBeLessThan(at("center", "end").y);
    expect(render(withDeco(2, { ...bouquet, scale: 0.4, layout: { anchor: "calendar", alignX: "start", allowContentOverlap: true } }))).not.toBe(
      render(withDeco(2, { ...bouquet, scale: 0.4, layout: { anchor: "calendar", alignX: "end", allowContentOverlap: true } })),
    );
  });
});

describe("Text placement: every offered anchor changes the solved position and the rendered page", () => {
  const cases: [number, "monthYear" | "weekOf" | "pageTitle" | "productTitle" | "dateLabel" | "sectionHeading" | "footer"][] = [
    [2, "monthYear"],
    [2, "sectionHeading"],
    [3, "weekOf"],
    [0, "pageTitle"],
    [0, "footer"],
    [4, "weekOf"],
    [4, "productTitle"],
    [1, "dateLabel"],
  ];
  for (const [i, key] of cases) {
    it(`${TEST_PRODUCTS[i].label}: ${key}`, () => {
      const p0 = build(i);
      const doc0 = resolveDocument(p0);
      const idx = doc0.recipe.pages.findIndex((x) => !x.filler);
      const offered = computeUsage(doc0).semanticText.find((s) => s.key === key)!;
      expect(offered, key).toBeDefined();
      const positions = offered.anchors.map((anchor: TextAnchor) => {
        const p = build(i);
        p.layoutOptions.textPositions = { [key]: { anchor, offsetXIn: 0, offsetYIn: 0 } };
        const t = solvePage(resolveDocument(p), idx).nodes.find((n): n is TextNode => n.type === "text" && n.semantic === key)!;
        expect(t.placement!.anchor).toBe(anchor);
        return { key: `${t.align}|${t.rect.x.toFixed(4)}|${t.rect.y.toFixed(4)}|${t.rect.w.toFixed(4)}`, html: render(p, idx) };
      });
      expect(new Set(positions.map((x) => x.key)).size, "solved").toBe(offered.anchors.length);
      expect(new Set(positions.map((x) => x.html)).size, "rendered").toBe(offered.anchors.length);
    });
  }
});

describe("Printer profile / Binding: solved requirements change; the UI explains when the page does not", () => {
  it("each printer profile changes the solved printer; profiles with identical requirements are named as such in the UI", () => {
    const p = build(2);
    const profiles = PRINT_PROFILES.filter((x) => x.bindingRules.supported.includes(p.production.bindingType));
    const solved = profiles.map((pr) => {
      const q = build(2);
      q.production.printProfileId = pr.id;
      const doc = resolveDocument(q);
      const g = representativeGeometry(doc);
      return { id: doc.printProfile.id, req: JSON.stringify([g.margins.map((m) => m.requiredIn), doc.printProfile.bleedRules.bleed?.value ?? null]) };
    });
    expect(solved.map((x) => x.id)).toEqual(profiles.map((x) => x.id));
    // Coil / Spiral Generic and Generic Commercial Print share requirements (research data) — the only duplicate pair.
    const groups = new Map<string, string[]>();
    for (const x of solved) groups.set(x.req, [...(groups.get(x.req) ?? []), x.id]);
    expect([...groups.values()].filter((g) => g.length > 1)).toEqual([["generic-commercial", "coil-generic"]]);
  });
  it("each binding for the coil planner changes the solved keep-out or requirements", () => {
    const allowed = BINDING_CHOICES.filter((c) => ["coil", "wire-o", "discbound", "ring-6", "ring-7"].includes(c.bindingType));
    const solved = allowed.map((c) => {
      const q = build(2);
      q.production.bindingType = c.bindingType;
      const doc = resolveDocument(q);
      const g = representativeGeometry(doc);
      return JSON.stringify([g.keepOuts.map((k) => [k.kind, +k.depthIn.toFixed(4)]), g.margins.map((m) => m.requiredIn)]);
    });
    // 6-ring and 7-ring share their page clearance (the UI says the ring count sets the punch pattern).
    const unique = new Set(solved);
    expect(unique.size).toBe(allowed.length - 1);
    const ring6 = solved[allowed.findIndex((c) => c.bindingType === "ring-6")], ring7 = solved[allowed.findIndex((c) => c.bindingType === "ring-7")];
    expect(ring6).toBe(ring7);
  });
  it("when requirements stay below the margins in use, every margin is marked as not driven by them (the summary says the page won't move)", () => {
    const doc = resolveDocument(build(2));
    const g = representativeGeometry(doc);
    expect(g.margins.every((m) => m.requiredIn < m.effectiveIn - 1e-6)).toBe(true);
  });
});
