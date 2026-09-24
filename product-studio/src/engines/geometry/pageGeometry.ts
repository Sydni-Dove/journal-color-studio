/**
 * PAGE GEOMETRY ENGINE — the single place where trim, bleed, safe margins,
 * binding/glue keep-outs and punch positions are calculated.
 *
 * Every layout consumes the PageGeometry produced here. No layout, renderer or
 * print routine recalculates safe geometry on its own.
 *
 * Margin resolution per physical edge:
 *   required    = max(printer live margin, binding keep-out / other-edge rule, printer gutter rule)
 *   recommended = studio default (product-type override → binding default),
 *                 or printer gutter + studio comfort for page-count-dependent gutters
 *   effective   = max(required, user ?? recommended)
 * A layout that does not fit NEVER shrinks these; elastic modules shrink instead.
 */
import type { BindingProfile } from "../../types/binding";
import type {
  Edge,
  EdgeBox,
  EdgeMarginResolution,
  KeepOutZone,
  LogicalEdge,
  Orientation,
  PageGeometry,
  PageSide,
  PhysicalSize,
  PunchHole,
  Rect,
} from "../../types/geometry";
import type { Provenance } from "../../types/measurement";
import type { PrintProfile } from "../../types/print";
import { STUDIO_MARGINS, type StudioValue } from "../../presets/studioDefaults";
import { measurementIn, mmToIn } from "../units/units";
import { OPPOSITE_EDGE, isHorizontalEdge, logicalToPhysical, physicalToLogical, resolveBoundEdge } from "./binding";

export type GeometryInput = {
  trim: PhysicalSize & { orientation: Orientation };
  binding: BindingProfile;
  /** Front-side bound/glued edge (defaults to the binding's default). */
  boundEdge?: Edge;
  printProfile: PrintProfile;
  includeBleed: boolean;
  /** Total interior page count — drives page-count-dependent gutters. */
  pageCount: number;
  side: PageSide;
  duplex: boolean;
  /** Product-type studio overrides (e.g. desk pads use a 0.75" glue zone). */
  recommendedOverrides?: { bound?: StudioValue; other?: StudioValue };
  userMargins?: Partial<Record<LogicalEdge, number>>;
};

const EDGES: Edge[] = ["top", "right", "bottom", "left"];

type Contribution = { valueIn: number; provenance: Provenance };

function maxContribution(list: Contribution[]): number {
  return list.reduce((m, c) => Math.max(m, c.valueIn), 0);
}

/** Resolve the printer gutter requirement / recommendation for a page count. */
export function resolveGutterRule(
  profile: PrintProfile,
  pageCount: number,
  includeBleed: boolean,
): { required?: Contribution; printerRecommended?: Contribution } {
  const rule = profile.gutterRules;
  switch (rule.kind) {
    case "none":
      return {};
    case "flat":
      return {
        required: {
          valueIn: measurementIn(rule.gutter),
          provenance: { geometryClass: "required-production", confidence: rule.gutter.confidence, source: rule.gutter.source, basis: `${profile.label} gutter` },
        },
      };
    case "page-count-table": {
      const band =
        rule.bands.find((b) => pageCount >= b.minPages && pageCount <= b.maxPages) ??
        (pageCount < rule.bands[0].minPages ? rule.bands[0] : rule.bands[rule.bands.length - 1]);
      return {
        required: {
          valueIn: measurementIn(band.gutter),
          provenance: {
            geometryClass: "required-production",
            confidence: band.gutter.confidence,
            source: band.gutter.source,
            basis: `${profile.label} gutter for ${band.minPages}–${band.maxPages} pages (book has ${pageCount})`,
          },
        },
      };
    }
    case "minimum-plus-recommended-table": {
      const band = rule.bands.find((b) => pageCount >= b.minPages && pageCount <= b.maxPages) ?? rule.bands[rule.bands.length - 1];
      const rec = includeBleed ? band.insideFullBleed : band.inside;
      return {
        required: {
          valueIn: measurementIn(rule.minimum),
          provenance: { geometryClass: "required-production", confidence: rule.minimum.confidence, source: rule.minimum.source, basis: `${profile.label} minimum gutter` },
        },
        printerRecommended: {
          valueIn: measurementIn(rec),
          provenance: {
            geometryClass: "studio-recommended",
            confidence: rec.confidence,
            source: rec.source,
            basis: `${profile.label} RECOMMENDED inside margin for ${pageCount} pages (printer recommendation, not a requirement)`,
          },
        },
      };
    }
  }
}

function bleedFor(input: GeometryInput, boundEdge: Edge | null, insideEdge: Edge): EdgeBox {
  const zero: EdgeBox = { top: 0, right: 0, bottom: 0, left: 0 };
  const { printProfile, binding, includeBleed } = input;
  if (!includeBleed || !printProfile.bleedRules.bleed || printProfile.bleedRules.edges === "none") return zero;
  const size = measurementIn(printProfile.bleedRules.bleed);
  const out = { ...zero };
  for (const e of EDGES) {
    let allowed = true;
    // KDP/Ingram: no bleed on the gutter/binding edge.
    if (printProfile.bleedRules.edges === "outer-three" && e === (boundEdge ?? insideEdge)) allowed = false;
    if (!binding.bleedOnBoundEdge && e === boundEdge) allowed = false;
    out[e] = allowed ? size : 0;
  }
  return out;
}

function edgeRect(edge: Edge, depth: number, w: number, h: number): Rect {
  switch (edge) {
    case "top":
      return { x: 0, y: 0, w, h: depth };
    case "bottom":
      return { x: 0, y: h - depth, w, h: depth };
    case "left":
      return { x: 0, y: 0, w: depth, h };
    case "right":
      return { x: w - depth, y: 0, w: depth, h };
  }
}

/** Evenly centred hole positions along an edge of length L with pitch p. */
export function centredPitchPositions(length: number, pitch: number): number[] {
  const n = Math.floor(length / pitch + 1e-9);
  if (n <= 0) return [];
  const start = (length - (n - 1) * pitch) / 2;
  return Array.from({ length: n }, (_, i) => start + i * pitch);
}

/** Positions of a two-group ring punch, centred on the edge (A-B4 layout). */
export function ringHolePositions(length: number, adjacent: number, groupGap: number, perGroup: number): number[] {
  const groupSpan = (perGroup - 1) * adjacent;
  const total = 2 * groupSpan + groupGap;
  const start = (length - total) / 2;
  const first = Array.from({ length: perGroup }, (_, i) => start + i * adjacent);
  const secondStart = start + groupSpan + groupGap;
  const second = Array.from({ length: perGroup }, (_, i) => secondStart + i * adjacent);
  return [...first, ...second];
}

function punchHoles(binding: BindingProfile, boundEdge: Edge | null, w: number, h: number): PunchHole[] {
  if (!boundEdge || !binding.punch) return [];
  const along = isHorizontalEdge(boundEdge) ? h : w;
  const place = (t: number, depthCenter: number, hw: number, hh: number, shape: PunchHole["shape"]): PunchHole => {
    // t = position along the edge; depthCenter = distance of hole centre from the edge.
    switch (boundEdge) {
      case "left":
        return { shape, cx: depthCenter, cy: t, w: hw, h: hh };
      case "right":
        return { shape, cx: w - depthCenter, cy: t, w: hw, h: hh };
      case "top":
        return { shape, cx: t, cy: depthCenter, w: hh, h: hw };
      case "bottom":
        return { shape, cx: t, cy: h - depthCenter, w: hh, h: hw };
    }
  };
  const p = binding.punch;
  switch (p.kind) {
    case "coil": {
      const pitch = measurementIn(p.pitch);
      const c = measurementIn(p.holeCenterFromEdge);
      return centredPitchPositions(along, pitch).map((t) => place(t, c, p.holeDiameterIn, p.holeDiameterIn, "round"));
    }
    case "disc": {
      const pitch = measurementIn(p.pitch);
      const depth = measurementIn(p.mushroomDepth);
      // Mushroom cut drawn as a slot from the edge to `depth`; width along the edge is a drawing aid.
      const slotAlong = pitch * 0.25;
      return centredPitchPositions(along, pitch).map((t) => place(t, depth / 2, depth, slotAlong, "mushroom"));
    }
    case "ring": {
      const adj = measurementIn(p.adjacentSpacing);
      // A5 (≈210 mm edge) uses the 70 mm group gap; smaller inserts use 50 mm (research A4 / A-B4).
      const gap = along >= mmToIn(200) ? mmToIn(70) : measurementIn(p.groupGap);
      const c = measurementIn(p.holeCenterFromEdge);
      return ringHolePositions(along, adj, gap, p.holesPerGroup).map((t) => place(t, c, p.holeDiameterIn, p.holeDiameterIn, "round"));
    }
  }
}

export function computePageGeometry(input: GeometryInput): PageGeometry {
  const { trim, binding, printProfile, includeBleed, side, duplex, userMargins, recommendedOverrides } = input;
  const w = trim.widthIn;
  const h = trim.heightIn;
  if (!(w > 0) || !(h > 0)) throw new Error(`Invalid trim ${w} × ${h}`);

  const boundEdge = resolveBoundEdge(binding, side, duplex, input.boundEdge);
  const logical = logicalToPhysical(boundEdge, side);
  const toLogical = physicalToLogical(boundEdge, side);
  const gutter = binding.boundEdgeMode === "book-spine" ? resolveGutterRule(printProfile, input.pageCount, includeBleed) : {};

  const printerLive = includeBleed ? printProfile.safeMargins.withBleed : printProfile.safeMargins.noBleed;

  const margins: EdgeMarginResolution[] = EDGES.map((edge) => {
    const isBound = edge === boundEdge;
    const required: Contribution[] = [];
    if (printerLive) {
      required.push({
        valueIn: measurementIn(printerLive),
        provenance: {
          geometryClass: "required-production",
          confidence: printerLive.confidence,
          source: printerLive.source,
          basis: `${printProfile.label} minimum live margin${includeBleed ? " (bleed build)" : ""}`,
        },
      });
    }
    // A page-count gutter table published by the printer governs the gutter;
    // the generic binding inner-margin row only applies when no printer rule exists.
    const printerGoverned = binding.gutterGrowsWithPageCount && gutter.required !== undefined;
    if (isBound && binding.boundEdgeKeepOut && !printerGoverned) {
      required.push({ valueIn: binding.boundEdgeKeepOut.valueIn, provenance: binding.boundEdgeKeepOut.provenance });
    } else if (!isBound && binding.otherEdgesRequired) {
      required.push(binding.otherEdgesRequired);
    }
    if (isBound && gutter.required) required.push(gutter.required);

    // Governing requirement first.
    required.sort((a, b) => b.valueIn - a.valueIn);
    const requiredIn = maxContribution(required);

    let recommended: Contribution;
    if (isBound) {
      if (binding.gutterGrowsWithPageCount && gutter.required) {
        const comfort = STUDIO_MARGINS.bookGutterComfort.valueIn;
        recommended = {
          valueIn: gutter.required.valueIn + comfort,
          provenance: {
            geometryClass: "studio-recommended",
            basis: `printer gutter ${gutter.required.valueIn}" + ${comfort}" studio comfort (research 2.4)`,
          },
        };
      } else {
        recommended = recommendedOverrides?.bound ?? binding.recommendedBoundMargin;
      }
      if (gutter.printerRecommended && gutter.printerRecommended.valueIn > recommended.valueIn) {
        recommended = gutter.printerRecommended;
      }
    } else {
      recommended = recommendedOverrides?.other ?? binding.recommendedOtherMargin;
    }

    const userIn = userMargins?.[toLogical[edge]];
    const chosen = userIn ?? recommended.valueIn;
    const effectiveIn = Math.max(requiredIn, chosen);

    return {
      edge,
      logicalEdge: toLogical[edge],
      requiredIn,
      requiredBasis: required.map((c) => c.provenance),
      recommendedIn: recommended.valueIn,
      recommendedBasis: recommended.provenance,
      userIn,
      effectiveIn,
      clamped: userIn !== undefined && userIn < requiredIn,
    };
  });

  const safe = Object.fromEntries(margins.map((m) => [m.edge, m.effectiveIn])) as EdgeBox;
  const bleed = bleedFor(input, boundEdge, logical.inside);

  const keepOuts: KeepOutZone[] = [];
  if (boundEdge) {
    const bm = margins.find((m) => m.edge === boundEdge)!;
    const isGlue = binding.boundEdgeMode === "glued-edge";
    if (bm.requiredIn > 0) {
      keepOuts.push({
        id: `${isGlue ? "glue" : "binding"}-keep-out`,
        kind: isGlue ? "glue" : "binding",
        edge: boundEdge,
        depthIn: bm.requiredIn,
        rect: edgeRect(boundEdge, bm.requiredIn, w, h),
        label: binding.boundEdgeKeepOut?.label ?? "Binding keep-out",
        provenance: bm.requiredBasis[0] ?? { geometryClass: "required-production" },
      });
    }
    if (binding.glueBand) {
      keepOuts.push({
        id: "glue-band",
        kind: "glue",
        edge: boundEdge,
        depthIn: binding.glueBand.valueIn,
        rect: edgeRect(boundEdge, binding.glueBand.valueIn, w, h),
        label: "Glue band",
        provenance: binding.glueBand.provenance,
      });
    }
  }

  const safeRect: Rect = {
    x: safe.left,
    y: safe.top,
    w: w - safe.left - safe.right,
    h: h - safe.top - safe.bottom,
  };

  return {
    trimWidthIn: w,
    trimHeightIn: h,
    orientation: trim.orientation,
    side,
    bindingType: binding.id,
    boundEdge,
    bleed,
    bleedTopIn: bleed.top,
    bleedBottomIn: bleed.bottom,
    bleedInsideIn: bleed[logical.inside],
    bleedOutsideIn: bleed[logical.outside],
    safe,
    safeTopIn: safe.top,
    safeBottomIn: safe.bottom,
    safeInsideIn: safe[logical.inside],
    safeOutsideIn: safe[logical.outside],
    safeRect,
    usableWidthIn: safeRect.w,
    usableHeightIn: safeRect.h,
    mediaWidthIn: w + bleed.left + bleed.right,
    mediaHeightIn: h + bleed.top + bleed.bottom,
    trimOffset: { x: bleed.left, y: bleed.top },
    keepOuts,
    holes: punchHoles(binding, boundEdge, w, h),
    margins,
  };
}

export { OPPOSITE_EDGE };
