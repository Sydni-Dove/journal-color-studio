/**
 * Decoration placement regressions (composition / placement pass):
 *   A  flowing-line corners are CONTAINED by default (whole artwork visible, inset
 *      from the trim, clear of content) and cropped only in explicit BLEED mode
 *   B  floral sprigs attach to the title / title rule at the semantic gap tokens
 *   C  floral corners frame the content (anchored in the corner, grown up to the
 *      content clearance) — never floating in dead space
 * plus capabilities, migration and the new composition validation rules.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { overlaps } from "../src/engines/composition/composition";
import { compositionFor, geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { findAsset } from "../src/design-library/library";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { SPACING_PRESETS } from "../src/presets/spacing/spacingPresets";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import { migrate } from "../src/persistence/projectStore";
import { defaultTitlePosition, edgesFor, normalizeDecoration, placementsFor, planDecoration, titlePositionsFor } from "../src/themes/decorationPlan";
import type { Rect } from "../src/types/geometry";
import type { ProductProject } from "../src/types/project";
import type { DecorativeTheme, TitleAccentPosition } from "../src/types/theme";

const MONTHLY = 2;
const build = (i: number) => TEST_PRODUCTS[i].build();
const firstPage = (p: ProductProject) => resolveDocument(p).recipe.pages.findIndex((x) => !x.filler);
const centerTitle = (p: ProductProject) => {
  p.layoutOptions.textPositions = { monthYear: { anchor: "header-center", offsetXIn: 0, offsetYIn: 0 } };
  return p;
};
function planFor(p: ProductProject, deco: Partial<DecorativeTheme>, index = firstPage(p)) {
  p.decorativeTheme = { ...p.decorativeTheme, ...deco };
  const doc = resolveDocument(p);
  const g = geometryFor(doc, doc.recipe.pages[index]);
  const comp = compositionFor(doc, index);
  const plan = planDecoration(g, p.decorativeTheme, doc.colors, comp)!;
  const trim = (r: Rect): Rect => ({ x: r.x - g.trimOffset.x, y: r.y - g.trimOffset.y, w: r.w, h: r.h });
  return { doc, g, comp, plan, trim };
}
const issuesFor = (p: ProductProject) => validateProject(p, heuristicMeasurer, { pageIndices: [firstPage(p)] }).issues;
const DECOR_RULES = ["decoration-clipped", "decoration-outside-region", "decoration-too-close", "decoration-overlap", "decoration-bleed-contained", "decoration-dead-space"];
const html = (p: ProductProject) => {
  const doc = resolveDocument(p);
  const i = firstPage(p);
  return renderToStaticMarkup(
    <PrintablePage geometry={geometryFor(doc, doc.recipe.pages[i])} solved={solvePage(doc, i)} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} spacing={doc.spacing} mode="print" />,
  );
};
const within = (c: Rect, b: Rect, tol = 1e-6) => c.x >= b.x - tol && c.y >= b.y - tol && c.x + c.w <= b.x + b.w + tol && c.y + c.h <= b.y + b.h + tol;

// ── A ────────────────────────────────────────────────────────────────────────
describe("A · 7×9 Monthly · Flowing lines · Corners · Top-right + bottom-left", () => {
  const waves = { style: "accent", assetId: "jcs-accent-waves", placement: "corners", corners: "opposite-tr-bl" } as const;

  it("Contained is the default: the whole artwork is visible inside its corner region, inset from the trim, clear of content", () => {
    const { plan, comp, trim } = planFor(build(MONTHLY), waves);
    expect(plan.reports.map((r) => r.id).sort()).toEqual(["corner-bl", "corner-tr"]);
    const placed = plan.reports.filter((r) => r.rect);
    expect(placed.length).toBeGreaterThan(0);
    for (const r of plan.reports) {
      expect(r.mode).toBe("contained");
      if (!r.rect) {
        // Never silently dropped: the report says what blocks this corner and what to do.
        expect(r.reason).toMatch(/lower-left corner/);
        expect(r.reason).toMatch(/Bleed off the edge/);
        continue;
      }
      expect(r.clippedShare).toBe(0);
      expect(r.intentionalClip).toBe(false);
      const region = comp.corners[r.id.slice(-2) as "tr" | "bl"];
      const bounds = { x: region.x, y: region.y, w: region.width, h: region.height };
      expect(region.insetFromTrimIn).toBe(comp.gaps.cornerInset);
      for (const c of r.cells.map(trim)) {
        expect(within(c, bounds)).toBe(true);
        // Clearance: no ink cell inside any protected footprint (inflated by decorationToContentGap).
        for (const q of comp.protected) expect(overlaps(c, q.rect), q.id).toBe(false);
      }
    }
    // Contained line art is shrunk clear of content — nothing is masked (knocked out) away.
    expect(plan.knockouts).toEqual([]);
  });

  it("Contained validates with no clipping / region / clearance / overlap issue", () => {
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, ...waves };
    const found = issuesFor(p).filter((i) => DECOR_RULES.includes(i.rule));
    expect(found).toEqual([]);
  });

  it("Bleed off the edge: both corners placed, cropped on purpose by exactly edgeBleedAmount (never flagged)", () => {
    const { plan, comp, trim } = planFor(build(MONTHLY), { ...waves, edge: "bleed" });
    expect(plan.reports.length).toBe(2);
    for (const r of plan.reports) {
      expect(r.mode).toBe("bleed");
      expect(r.rect).not.toBeNull();
      expect(r.intentionalClip).toBe(true);
      expect(r.clippedShare).toBeGreaterThan(0);
      const t = trim(r.rect!);
      const out = Math.min(comp.gaps.edgeBleed, 0.45 * t.w);
      if (r.id === "corner-tr") {
        expect(t.x + t.w - comp.trim.w).toBeCloseTo(out, 9);
        expect(-t.y).toBeCloseTo(Math.min(comp.gaps.edgeBleed, 0.45 * t.h), 9);
      } else {
        expect(-t.x).toBeCloseTo(out, 9);
      }
    }
    expect(plan.knockouts.length).toBeGreaterThan(0);
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, ...waves, edge: "bleed" };
    expect(issuesFor(p).filter((i) => i.rule === "decoration-clipped" || i.rule === "decoration-bleed-contained")).toEqual([]);
  });

  it("contained and bleed render differently; stored projects without an edge setting render contained", () => {
    const a = build(MONTHLY), b = build(MONTHLY);
    a.decorativeTheme = { ...a.decorativeTheme, ...waves };
    b.decorativeTheme = { ...b.decorativeTheme, ...waves, edge: "bleed" };
    expect(html(a)).not.toBe(html(b));
    const stored = migrate(JSON.parse(JSON.stringify(a)))!;
    expect(stored.decorativeTheme.edge).toBeUndefined();
    expect(planFor(stored, {}).plan.reports.every((r) => r.mode === "contained")).toBe(true);
  });

  it("the other flowing-line placements: header flourish (on the rule), footer flourish, edge accent", () => {
    const opts = placementsFor({ style: "accent", assetId: "jcs-accent-waves" });
    for (const p of ["corners", "header-flourish", "footer-flourish", "edge-accent"] as const) expect(opts).toContain(p);
    const hf = planFor(build(MONTHLY), { ...waves, placement: "header-flourish" });
    const r = hf.plan.reports[0];
    expect(r.rect).not.toBeNull();
    const t = hf.trim(r.rect!);
    expect(t.y + t.h).toBeCloseTo(hf.comp.headerRule!.y - hf.comp.gaps.toRule, 9);
    expect(r.clippedShare).toBe(0);
    // No room below this calendar: reported, not squeezed into a speck or cropped.
    const ff = planFor(build(MONTHLY), { ...waves, placement: "footer-flourish" }).plan.reports[0];
    expect(!!ff.rect || !!ff.reason).toBe(true);
    const ea = planFor(build(MONTHLY), { ...waves, placement: "edge-accent" }).plan.reports[0];
    expect(ea.mode).toBe("bleed");
    expect(ea.intentionalClip).toBe(true);
  });
});

// ── B ────────────────────────────────────────────────────────────────────────
describe("B · 7×9 Monthly · Floral header sprigs attach to the title / title rule", () => {
  const sprig = (titlePosition?: TitleAccentPosition) => ({ style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent", titlePosition }) as const;
  const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it("offers only positions ATTACHED to the title or its rule (no floating above / below the title)", () => {
    expect(placementsFor({ style: "floral", assetId: "jcs-floral-sprig" })).toEqual(["title-accent"]);
    expect(titlePositionsFor("jcs-floral-sprig")).toEqual(["title-left", "title-right", "rule-left", "rule-center", "rule-right", "rule-both"]);
    expect(titlePositionsFor("jcs-floral-corner")).toEqual([]);
  });

  it("right of title: titleAccentGap after the title's ink, vertically centred on it", () => {
    const { plan, comp, trim } = planFor(build(MONTHLY), sprig("title-right"));
    const t = trim(plan.reports[0].rect!), title = comp.regions.title!;
    expect(t.x).toBeCloseTo(title.x + title.w + comp.gaps.titleAccent, 9);
    expect(center(t).y).toBeCloseTo(center(title).y, 9);
    expect(plan.reports[0].attachedTo).toEqual([comp.titleId]);
  });

  it("left of title (centred title): titleAccentGap before the title's ink, mirrored", () => {
    const { plan, comp, trim } = planFor(centerTitle(build(MONTHLY)), sprig("title-left"));
    const t = trim(plan.reports[0].rect!), title = comp.regions.title!;
    expect(t.x + t.w).toBeCloseTo(title.x - comp.gaps.titleAccent, 9);
    expect(center(t).y).toBeCloseTo(center(title).y, 9);
    expect(plan.pieces[0].kind === "raster" && plan.pieces[0].transform?.flipX).toBe(true);
  });

  it("left of a left-aligned title (no margin for it) is reported, never cropped or specked", () => {
    const r = planFor(build(MONTHLY), sprig("title-left")).plan.reports[0];
    expect(r.rect).toBeNull();
    expect(r.reason).toBeTruthy();
  });

  it("title-rule centre: rests decorationToRuleGap above the rule, centred on it", () => {
    const { plan, comp, trim } = planFor(build(MONTHLY), sprig("rule-center"));
    const t = trim(plan.reports[0].rect!), rule = comp.headerRule!;
    expect(t.y + t.h).toBeCloseTo(rule.y - comp.gaps.toRule, 9);
    expect(center(t).x).toBeCloseTo(center(rule).x, 9);
  });

  it("both rule ends (centred title): one sprig at each end of the rule, facing inward", () => {
    const { plan, comp, trim } = planFor(centerTitle(build(MONTHLY)), sprig("rule-both"));
    const rule = comp.headerRule!;
    const [l, r] = ["rule-left", "rule-right"].map((id) => plan.reports.find((x) => x.id === id)!);
    expect(trim(l.rect!).x).toBeCloseTo(rule.x, 9);
    expect(trim(r.rect!).x + r.rect!.w).toBeCloseTo(rule.x + rule.w, 9);
    for (const x of [l, r]) expect(trim(x.rect!).y + x.rect!.h).toBeCloseTo(rule.y - comp.gaps.toRule, 9);
  });

  it("each case validates clean and renders differently; Automatic balances the title", () => {
    const cases: [boolean, TitleAccentPosition][] = [[false, "title-right"], [true, "title-left"], [false, "rule-right"], [false, "rule-center"], [true, "rule-both"]];
    const renders = new Set<string>();
    for (const [centred, pos] of cases) {
      const p = build(MONTHLY);
      if (centred) centerTitle(p);
      p.decorativeTheme = { ...p.decorativeTheme, ...sprig(pos) };
      expect(issuesFor(p).filter((i) => DECOR_RULES.includes(i.rule)), pos).toEqual([]);
      renders.add(html(p));
    }
    expect(renders.size).toBe(cases.length);
    const left = planFor(build(MONTHLY), sprig());
    expect(defaultTitlePosition(left.comp)).toBe("rule-right");
    expect(left.plan.reports.map((r) => r.id)).toEqual(["rule-right"]);
    const mid = planFor(centerTitle(build(MONTHLY)), sprig());
    expect(defaultTitlePosition(mid.comp)).toBe("rule-both");
  });

  it("old 'title-flank' / floral header-band settings migrate to the title accent", () => {
    for (const placement of ["title-flank", "header-band"]) {
      const t = normalizeDecoration({ ...build(MONTHLY).decorativeTheme, style: "floral", assetId: "jcs-floral-sprig", placement } as unknown as DecorativeTheme);
      expect(t.placement).toBe("title-accent");
    }
  });
});

// ── C ────────────────────────────────────────────────────────────────────────
describe("C · Floral corners frame the content", () => {
  const FRAME_TOL_IN = 0.3;
  for (const i of [0, 1, 2, 3, 4]) {
    it(`${TEST_PRODUCTS[i].label}: every placed corner hugs its page corner and reaches the content; the rest say why`, () => {
      const { plan, comp, trim, doc } = planFor(build(i), { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "all" });
      const content = solvePage(doc, firstPage(build(i))).nodes.filter((n) => n.functional && n.type !== "group").map((n) => n.rect);
      for (const r of plan.reports) {
        if (!r.rect) {
          expect(r.reason).toMatch(/corner/);
          continue;
        }
        const k = r.id.slice(-2) as "tl" | "tr" | "bl" | "br";
        const reg = comp.corners[k];
        const ink = trim(r.inkBox!);
        const left = k === "tl" || k === "bl", top = k === "tl" || k === "tr";
        // Anchored IN the corner (at the inset), not floating toward the middle.
        expect(Math.abs((left ? ink.x : comp.trim.w - (ink.x + ink.w)) - reg.insetFromTrimIn)).toBeLessThan(0.05);
        expect(Math.abs((top ? ink.y : comp.trim.h - (ink.y + ink.h)) - reg.insetFromTrimIn)).toBeLessThan(0.05);
        // Framing: grown until it meets the content clearance (or its full size).
        const dist = (c: Rect, b: Rect) => Math.hypot(Math.max(0, b.x - (c.x + c.w), c.x - (b.x + b.w)), Math.max(0, b.y - (c.y + c.h), c.y - (b.y + b.h)));
        const gap = Math.min(...r.cells.map(trim).flatMap((c) => content.map((b) => dist(c, b))));
        if (r.scale < 0.999) expect(gap).toBeLessThan(comp.gaps.toContent + FRAME_TOL_IN);
        expect(r.clippedShare).toBe(0);
      }
    });
  }

  it("7×9 Monthly, Automatic: the pair with the most room; placed corners validate without dead space", () => {
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners" };
    expect(planFor(build(MONTHLY), p.decorativeTheme).plan.reports.some((r) => r.rect)).toBe(true);
    expect(issuesFor(p).filter((i) => DECOR_RULES.includes(i.rule))).toEqual([]);
  });

  it("floral corners offer Contained (default) and Bleed; the new corner presets resolve to their corners", () => {
    expect(edgesFor("jcs-floral-corner")).toEqual(["contained", "bleed"]);
    const ids = (corners: DecorativeTheme["corners"]) => planFor(build(MONTHLY), { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners }).plan.reports.map((r) => r.id);
    expect(ids("all")).toEqual(["corner-tl", "corner-tr", "corner-bl", "corner-br"]);
    expect(ids("top")).toEqual(["corner-tl", "corner-tr"]);
    expect(ids("bottom")).toEqual(["corner-bl", "corner-br"]);
    const bleed = planFor(build(4), { style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "all", edge: "bleed" }).plan.reports.filter((r) => r.rect);
    expect(bleed.length).toBeGreaterThan(0);
    for (const r of bleed) expect(r.intentionalClip).toBe(true);
  });
});

// ── Capabilities + tokens ───────────────────────────────────────────────────
describe("placement capabilities and decoration spacing tokens", () => {
  it("every asset declares capabilities, and only those placements are offered", () => {
    for (const id of ["jcs-floral-bouquet", "jcs-floral-corner", "jcs-floral-sprig", "jcs-accent-waves", "jcs-accent-dots", "jcs-marble-white"]) {
      const a = findAsset(id)!;
      expect(a.capabilities.length, id).toBeGreaterThan(0);
      expect(placementsFor({ style: a.type, assetId: id })).toEqual(a.placements);
    }
    expect(placementsFor({ style: "floral", assetId: "jcs-floral-corner" })).toEqual(["corners"]);
    expect(placementsFor({ style: "accent", assetId: "jcs-accent-dots" })).not.toContain("edge-accent");
  });
  it("decoration tokens are physical inches that grow with density", () => {
    for (const k of ["decorationToContentGap", "decorationToTitleGap", "decorationToRuleGap", "titleAccentGap", "cornerInset", "edgeBleedAmount"] as const) {
      expect(SPACING_PRESETS.compact[k]).toBeGreaterThan(0);
      expect(SPACING_PRESETS.compact[k]).toBeLessThan(SPACING_PRESETS.balanced[k]);
      expect(SPACING_PRESETS.balanced[k]).toBeLessThan(SPACING_PRESETS.airy[k]);
    }
    // Contained art clears trim drift (≈ 1/16").
    expect(SPACING_PRESETS.compact.cornerInset).toBeGreaterThanOrEqual(0.0625);
  });
  it("a stored spacing override under the old clearance name is migrated", () => {
    const p = build(MONTHLY);
    (p.spacing.overrides as Record<string, number>) = { decorationToContentClearance: 0.2 };
    const m = migrate(JSON.parse(JSON.stringify(p)))!;
    expect(m.spacing.overrides).toEqual({ decorationToContentGap: 0.2 });
  });
});

// ── Validation ──────────────────────────────────────────────────────────────
describe("composition validation: placement rules", () => {
  it("an accent nudged into the title's gap is flagged as too close to text", () => {
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent", titlePosition: "title-right", layout: { offsetXIn: -0.08 } };
    expect(issuesFor(p).some((i) => i.rule === "decoration-too-close")).toBe(true);
  });
  it("a rule accent nudged down across the rule is flagged (unintended rule overlap)", () => {
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-sprig", placement: "title-accent", titlePosition: "rule-right", layout: { offsetYIn: 0.12 } };
    expect(issuesFor(p).some((i) => i.rule === "decoration-overlap" && /crosses the rule/.test(i.message))).toBe(true);
  });
  it("bleed that no longer reaches the edge is flagged as incorrectly contained", () => {
    const p = build(4);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-corner", placement: "corners", corners: "bl", edge: "bleed", layout: { offsetXIn: 0.8, offsetYIn: -0.8, allowContentOverlap: true } };
    const r = planFor(build(4), p.decorativeTheme).plan.reports[0];
    expect(r.rect && r.clippedShare === 0).toBe(true);
    expect(issuesFor(p).some((i) => i.rule === "decoration-bleed-contained")).toBe(true);
  });
  it("a piece allowed over content that crosses the calendar is flagged", () => {
    const p = build(MONTHLY);
    p.decorativeTheme = { ...p.decorativeTheme, style: "floral", assetId: "jcs-floral-bouquet", placement: "top-bottom", opacity: 0.2, layout: { anchor: "calendar" } };
    const found = issuesFor(p);
    expect(found.some((i) => i.rule === "decoration-overlap" || i.rule === "decoration-no-room")).toBe(true);
  });
});
