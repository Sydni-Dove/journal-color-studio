import { describe, expect, it } from "vitest";
import { computePageGeometry, centredPitchPositions, ringHolePositions, type GeometryInput } from "../src/engines/geometry/pageGeometry";
import { pageSideFor, resolveBoundEdge } from "../src/engines/geometry/binding";
import { getBindingProfile } from "../src/presets/bindingProfiles/bindingProfiles";
import { getPrintProfile } from "../src/presets/printProfiles/printProfiles";
import { PRODUCT_RECOMMENDED_MARGINS } from "../src/presets/products/productTypes";
import { mmToIn } from "../src/engines/units/units";

function geo(partial: Partial<GeometryInput> & Pick<GeometryInput, "trim">): ReturnType<typeof computePageGeometry> {
  return computePageGeometry({
    binding: getBindingProfile("none"),
    printProfile: getPrintProfile("custom"),
    includeBleed: false,
    pageCount: 1,
    side: "single",
    duplex: false,
    ...partial,
  });
}
const portrait = (w: number, h: number) => ({ widthIn: w, heightIn: h, orientation: "portrait" as const });

describe("perfect-bound book (KDP)", () => {
  const base = { trim: portrait(6, 9), binding: getBindingProfile("perfect-bound"), printProfile: getPrintProfile("kdp"), duplex: true };

  it("uses the KDP page-count gutter as REQUIRED and adds studio comfort as RECOMMENDED", () => {
    const g = geo({ ...base, pageCount: 120, side: "recto" });
    const inside = g.margins.find((m) => m.edge === "left")!;
    expect(inside.requiredIn).toBe(0.375); // KDP 24–150 pp
    expect(inside.requiredBasis[0].geometryClass).toBe("required-production");
    expect(inside.requiredBasis[0].confidence).toBe("printer-standard");
    expect(inside.recommendedIn).toBe(0.5); // + 0.125 studio comfort (research 2.4)
    expect(inside.recommendedBasis.geometryClass).toBe("studio-recommended");
    expect(g.safeInsideIn).toBe(0.5);
  });

  it("follows every KDP gutter band", () => {
    const cases: [number, number][] = [[24, 0.375], [150, 0.375], [151, 0.5], [300, 0.5], [301, 0.625], [500, 0.625], [501, 0.75], [700, 0.75], [701, 0.875], [828, 0.875]];
    for (const [pages, gutter] of cases) {
      const g = geo({ ...base, pageCount: pages, side: "recto" });
      expect(g.margins.find((m) => m.edge === "left")!.requiredIn).toBe(gutter);
    }
  });

  it("mirrors the gutter: recto binds left, verso binds right", () => {
    const recto = geo({ ...base, pageCount: 120, side: "recto" });
    const verso = geo({ ...base, pageCount: 120, side: "verso" });
    expect(recto.boundEdge).toBe("left");
    expect(verso.boundEdge).toBe("right");
    expect(recto.safe.left).toBe(verso.safe.right);
    expect(recto.safe.right).toBe(verso.safe.left);
    expect(recto.usableWidthIn).toBeCloseTo(verso.usableWidthIn, 12);
  });

  it("reproduces blueprint A-B1 (200 pp, bleed build): 6.125 × 9.25 media, 5.125 × 8.25 live area", () => {
    const g = geo({
      ...base,
      pageCount: 200,
      side: "recto",
      includeBleed: true,
      // Use the printer's required geometry only (user margins below required are clamped up).
      userMargins: { inside: 0, outside: 0, top: 0, bottom: 0 },
    });
    expect(g.mediaWidthIn).toBeCloseTo(6.125, 10); // bleed on 3 outer edges only
    expect(g.mediaHeightIn).toBeCloseTo(9.25, 10);
    expect(g.bleed.left).toBe(0); // no bleed on the gutter
    expect(g.usableWidthIn).toBeCloseTo(5.125, 10);
    expect(g.usableHeightIn).toBeCloseTo(8.25, 10);
    expect(g.margins.every((m) => m.clamped)).toBe(true);
  });

  it("puts KDP no-bleed on the verso's right (gutter) edge", () => {
    const g = geo({ ...base, pageCount: 120, side: "verso", includeBleed: true });
    expect(g.bleed.right).toBe(0);
    expect(g.bleed.left).toBe(0.125);
  });

  it("Lulu: 0.2\" minimum is required; the page-count table is only a recommendation", () => {
    const g = geo({ trim: portrait(6, 9), binding: getBindingProfile("perfect-bound"), printProfile: getPrintProfile("lulu"), duplex: true, pageCount: 200, side: "recto" });
    const inside = g.margins.find((m) => m.edge === "left")!;
    expect(inside.requiredIn).toBe(0.5); // Lulu 0.5" safety margin dominates the 0.2" gutter minimum
    expect(inside.recommendedIn).toBe(1.0); // 151–400 pp recommendation
    expect(inside.recommendedBasis.geometryClass).toBe("studio-recommended");
  });
});

describe("coil (blueprints B1 / A-B2)", () => {
  const coil = { trim: portrait(7, 9), binding: getBindingProfile("coil"), printProfile: getPrintProfile("coil-generic"), duplex: true, pageCount: 150 };

  it("keeps the 0.5\" keep-out REQUIRED and the 0.75\" margin as a STUDIO default", () => {
    const g = geo({ ...coil, side: "recto" });
    const bound = g.margins.find((m) => m.edge === "left")!;
    expect(bound.requiredIn).toBe(0.5);
    expect(bound.recommendedIn).toBe(0.75);
    expect(bound.recommendedBasis.geometryClass).toBe("studio-recommended");
    expect(g.keepOuts.find((k) => k.kind === "binding")!.depthIn).toBe(0.5);
    // B1/A-B2: usableW = 7.0 − 0.75 − 0.5 = 5.75; usableH = 9.0 − 1.0 = 8.0
    expect(g.usableWidthIn).toBeCloseTo(5.75, 10);
    expect(g.usableHeightIn).toBeCloseTo(8.0, 10);
  });

  it("places coil holes at 4:1 pitch (44 holes on an 11\" edge)", () => {
    expect(centredPitchPositions(11, 0.25)).toHaveLength(44);
    const g = geo({ ...coil, side: "recto" });
    expect(g.holes).toHaveLength(36); // 9" edge
    expect(g.holes[0].cx).toBeCloseTo(mmToIn(5), 10); // hole centre 5 mm from edge (A-B2)
  });

  it("verso pages carry the coil on the right", () => {
    const g = geo({ ...coil, side: "verso" });
    expect(g.boundEdge).toBe("right");
    expect(g.holes[0].cx).toBeCloseTo(7 - mmToIn(5), 10);
  });

  it("never lets a user shrink below the keep-out", () => {
    const g = geo({ ...coil, side: "recto", userMargins: { inside: 0.3 } });
    const bound = g.margins.find((m) => m.edge === "left")!;
    expect(bound.effectiveIn).toBe(0.5);
    expect(bound.clamped).toBe(true);
  });

  it("honours a user margin larger than the studio default", () => {
    const g = geo({ ...coil, side: "recto", userMargins: { outside: 0.8 } });
    expect(g.safe.right).toBe(0.8);
  });
});

describe("discbound (A-B3)", () => {
  const disc = { binding: getBindingProfile("discbound"), printProfile: getPrintProfile("disc-generic"), pageCount: 1 };

  it("derives disc counts from edge length (9 / 11 / 7 / 8 discs)", () => {
    expect(geo({ ...disc, trim: portrait(7, 9.25) }).holes).toHaveLength(9);
    expect(geo({ ...disc, trim: portrait(8.5, 11) }).holes).toHaveLength(11);
    expect(geo({ ...disc, trim: portrait(4.625, 7) }).holes).toHaveLength(7);
    expect(geo({ ...disc, trim: portrait(5.5, 8.5) }).holes).toHaveLength(8);
  });

  it("centres the first hole ≈0.705\" from the top on 9.25\" (A-B3)", () => {
    const g = geo({ ...disc, trim: portrait(7, 9.25) });
    expect(g.holes[0].cy).toBeCloseTo((9.25 - 8 * 0.98) / 2, 10);
  });

  it("keeps the punched edge on the SAME physical side for single-sided inserts", () => {
    const recto = geo({ ...disc, trim: portrait(7, 9.25), side: "recto", duplex: false });
    const verso = geo({ ...disc, trim: portrait(7, 9.25), side: "verso", duplex: false });
    expect(recto.boundEdge).toBe("left");
    expect(verso.boundEdge).toBe("left");
  });

  it("mirrors onto the back of a duplex leaf", () => {
    expect(resolveBoundEdge(getBindingProfile("discbound"), "verso", true)).toBe("right");
    expect(pageSideFor(2, getBindingProfile("discbound"), false)).toBe("single");
    expect(pageSideFor(2, getBindingProfile("discbound"), true)).toBe("verso");
  });
});

describe("6-ring (A-B4)", () => {
  it("lays out the Filofax Personal holes with 22.5 mm end margins", () => {
    const L = mmToIn(171);
    const pos = ringHolePositions(L, mmToIn(19), mmToIn(50), 3);
    expect(pos).toHaveLength(6);
    expect(pos[0]).toBeCloseTo(mmToIn(22.5), 10);
    expect(L - pos[5]).toBeCloseTo(mmToIn(22.5), 10);
    expect(pos[3] - pos[2]).toBeCloseTo(mmToIn(50), 10);
  });
  it("requires the derived 0.6\" content keep-out", () => {
    const g = geo({ trim: { widthIn: mmToIn(95), heightIn: mmToIn(171), orientation: "portrait" }, binding: getBindingProfile("ring-6"), printProfile: getPrintProfile("ring-insert") });
    const bound = g.margins.find((m) => m.edge === "left")!;
    expect(bound.requiredIn).toBeCloseTo(mmToIn(15), 10);
    expect(bound.requiredBasis[0].confidence).toBe("derived-calculation");
  });
});

describe("glued pads", () => {
  const pad = { binding: getBindingProfile("glued-pad"), printProfile: getPrintProfile("notepad-top-glued"), boundEdge: "top" as const };

  it("5 × 7 top-glued: 0.5\" glue clearance (manufacturer), 0.375\" glue band, 0.4\" sides", () => {
    const g = geo({ ...pad, trim: portrait(5, 7) });
    expect(g.boundEdge).toBe("top");
    expect(g.safe.top).toBe(0.5);
    expect(g.safe.left).toBe(0.4);
    expect(g.safe.bottom).toBe(0.4);
    const glue = g.keepOuts.find((k) => k.id === "glue-keep-out")!;
    expect(glue.depthIn).toBe(0.5);
    expect(glue.provenance.confidence).toBe("manufacturer-published");
    expect(g.keepOuts.find((k) => k.id === "glue-band")!.depthIn).toBe(0.375);
    expect(g.usableWidthIn).toBeCloseTo(4.2, 10);
    expect(g.usableHeightIn).toBeCloseTo(6.1, 10);
  });

  it("supports bottom / left / right glue edges without mirroring", () => {
    for (const edge of ["bottom", "left", "right"] as const) {
      const a = geo({ ...pad, boundEdge: edge, trim: portrait(4, 6), side: "recto" });
      const b = geo({ ...pad, boundEdge: edge, trim: portrait(4, 6), side: "verso" });
      expect(a.boundEdge).toBe(edge);
      expect(b.boundEdge).toBe(edge);
      expect(a.safe[edge]).toBe(0.5);
    }
  });

  it("11 × 17 desk pad (B6): 0.75\" glue zone studio default, usable 16.0 × 9.75", () => {
    const g = geo({ ...pad, trim: { widthIn: 17, heightIn: 11, orientation: "landscape" }, recommendedOverrides: PRODUCT_RECOMMENDED_MARGINS.deskpad });
    expect(g.safe.top).toBe(0.75);
    expect(g.margins.find((m) => m.edge === "top")!.requiredIn).toBe(0.5);
    expect(g.usableWidthIn).toBeCloseTo(16.0, 10);
    expect(g.usableHeightIn).toBeCloseTo(9.75, 10);
  });
});

describe("saddle stitch", () => {
  it("uses 0.25\" required inner, 0.375\" studio inner", () => {
    const g = geo({ trim: portrait(5.5, 8.5), binding: getBindingProfile("saddle-stitch"), printProfile: getPrintProfile("generic-commercial"), pageCount: 16, side: "recto", duplex: true });
    const inner = g.margins.find((m) => m.edge === "left")!;
    expect(inner.requiredIn).toBe(0.25);
    expect(inner.recommendedIn).toBe(0.375);
  });
});
