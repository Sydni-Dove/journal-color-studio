/**
 * DECORATION PLANNER — pure. Page geometry + composition (regions + protected
 * content, from the solved functional layout) + decorative theme + colors →
 * positioned decoration pieces in MEDIA coordinates (inches).
 *
 * Decoration never moves functional geometry: it reads the composition, it
 * never writes to it. The preview, the print renderer, the print pre-loader
 * and validation all use this same plan.
 *
 * Placement recipes follow the snapshotted Journal Color Studio composition
 * data (design-library/placement.ts):
 *   fields   full-page (soft, behind content), header-band (ends above the
 *            content), border-frame (around content, with a clearance)
 *   objects  corners, title accents, flourishes, top-bottom — placed
 *            relative to a semantic target (title, title rule, page corner,
 *            page edge, footer space) and fitted against the artwork's real
 *            footprint (engines/composition/fit)
 *   line art bands / frames are mirror-tiled
 *
 * Edge treatment is explicit. CONTAINED (the default) keeps the whole artwork
 * visible inside its region, inset from the trim by `cornerInset` and clear of
 * content by `decorationToContentGap`; it shrinks, or reports a conflict,
 * instead of being cropped. BLEED runs the artwork `edgeBleedAmount` past the
 * trim on purpose — the only mode that crops.
 */
import { DESIGN_ASSETS, SOLID_PLACEMENTS, WATERCOLOR_BLOOMS, WATERCOLOR_PLACEMENTS, findAsset, type DesignAsset } from "../design-library/library";
import {
  ACCENT_BAND_TILE_FACTOR,
  ACCENT_CAPS,
  ACCENT_EDGE_BAND,
  BOUQUET_WIDTH_OF_PAGE,
  DECORATION_CAPABILITIES,
  FLORAL_CORNER_OF_SHORT_SIDE,
  FLORAL_FLANK,
  LINE_FLOURISH_OF_PAGE,
} from "../design-library/placement";
import { inflate, union } from "../engines/composition/composition";
import { fitObject, MIN_LONG_SIDE_IN, type ArtTransform, type ObjectSpec } from "../engines/composition/fit";
import type { Composition, CompositionAnchor, Corner, DecorationPlacement, ProtectedRect } from "../types/composition";
import type { PageGeometry, Rect } from "../types/geometry";
import type { CornerSet, DecorativePlacement, DecorativeTheme, EdgeTreatment, TitleAccentPosition } from "../types/theme";
import type { ColorToken, ColorTokens } from "../types/tokens";
import type { RasterRequest } from "./recolor";

/** Raster decorations are rendered at this density (px per inch) for preview AND print. */
export const DECOR_DPI = 150;
/** Upper bound on a raster's long side, to keep large desk pads within canvas memory. */
const MAX_RASTER_PX = 3600;
/** Object rasters are requested at widths rounded up to this step, so per-page size changes reuse a few rasters. */
const RASTER_STEP_IN = 0.05;
/** Full-page repeat tile width as a fraction of page width (JCS REPEAT_TILE; stripes use half the page). */
const REPEAT_TILE: Record<string, number> = { "jcs-accent-dots": 0.34, "jcs-accent-arcs": 0.26, "jcs-accent-topo": 0.5, "jcs-accent-waves": 0.5, "jcs-accent-stripes": 0.5 };
const REPEAT_TILE_DEFAULT = 0.4;
/** Watercolor frames fade in over this share of the clearance (soft edge that never reaches content). */
const WATERCOLOR_FEATHER_OF_CLEARANCE = 0.45;
/** JCS "Top + bottom edges": share of the art's height inside the top band (the rest hangs off the page). */
const EDGE_ART_INSIDE_TOP = 0.55;

export type DecorPiece =
  | { kind: "solid"; rect: Rect; color: ColorToken }
  | { kind: "raster"; assetId: string; rect: Rect; request: RasterRequest; fallback: ColorToken | null; transform?: ArtTransform }
  | { kind: "mask"; assetId: string; url: string; rect: Rect; color: ColorToken; transform?: ArtTransform; clip?: Rect }
  | { kind: "tile"; assetId: string; url: string; region: Rect; tile: { w: number; h: number; ox: number; oy: number }; color: ColorToken }
  | { kind: "watercolor"; rect: Rect; paper: ColorToken; blooms: { cx: number; cy: number; r: number; color: ColorToken; alpha: number }[] };

/** What happened to each decorative piece (validation + editor feedback). Rects in MEDIA coordinates. */
export type PieceReport = {
  id: string;
  assetId: string;
  anchor: CompositionAnchor | "field";
  rect: Rect | null;
  inkBox: Rect | null;
  reason?: string;
  clippedShare: number;
  overlapShare: number;
  intentionalClip: boolean;
  allowContentOverlap: boolean;
  /** Share of the preferred size the object was placed at (1 = full size). */
  scale: number;
  /** contained = must be fully visible; bleed = cropped at the trim on purpose; field = an area fill. */
  mode: "contained" | "bleed" | "field";
  /** Ink cells (MEDIA coordinates) — validation measures real clearances against these. */
  cells: Rect[];
  /** Region a contained piece must stay inside (MEDIA coordinates). */
  bounds: Rect | null;
  /** Content masked away under this piece (line-art bleed), so covering it is not an overlap. */
  knockout: boolean;
  /** Protected content this piece is attached to by design (the title / rule it sits beside or on). */
  attachedTo: string[];
  /** The gap the piece is designed to keep from its attached target (inches). */
  targetGapIn: number | null;
};

export type DecorPlan = {
  pieces: DecorPiece[];
  /** Areas masked out of the decoration (content + clearance), MEDIA coordinates. */
  knockouts: Rect[];
  /** Soft-edge radius for knockouts (inches; 0 = crisp). */
  featherIn: number;
  opacity: number;
  reports: PieceReport[];
};

/** Placements genuinely implemented for a style / asset. */
export function placementsFor(theme: Pick<DecorativeTheme, "style" | "assetId">): DecorativePlacement[] {
  if (theme.style === "none") return [];
  if (theme.style === "solid") return SOLID_PLACEMENTS;
  if (theme.style === "watercolor") return WATERCOLOR_PLACEMENTS;
  return findAsset(theme.assetId)?.placements ?? [];
}

/** Edge treatments an asset's corners support (contained first: the default). */
export function edgesFor(assetId: string | undefined): EdgeTreatment[] {
  const caps = DECORATION_CAPABILITIES[assetId ?? ""] ?? [];
  return [...(caps.includes("corner-contained") ? (["contained"] as const) : []), ...(caps.includes("corner-bleed") ? (["bleed"] as const) : [])];
}

/** Title-accent positions an asset supports (from its declared capabilities). */
export function titlePositionsFor(assetId: string | undefined): TitleAccentPosition[] {
  const caps = DECORATION_CAPABILITIES[assetId ?? ""] ?? [];
  const out: TitleAccentPosition[] = [];
  if (caps.includes("title-left")) out.push("title-left");
  if (caps.includes("title-right")) out.push("title-right");
  if (caps.includes("title-above")) out.push("title-above", "title-above-center");
  if (caps.includes("title-below")) out.push("title-below", "title-below-center");
  if (caps.includes("title-rule-left")) out.push("rule-left");
  if (caps.includes("title-rule-center")) out.push("rule-center");
  if (caps.includes("title-rule-right")) out.push("rule-right");
  if (caps.includes("title-rule-left") && caps.includes("title-rule-right")) out.push("rule-both");
  return out;
}

/**
 * Default title accent: balance the title. A start-aligned title gets the
 * accent at the far (right) end of its rule, an end-aligned one at the near
 * end, a centred one centred above it.
 */
export function defaultTitlePosition(comp: Pick<Composition, "titleAlign" | "headerRule">): TitleAccentPosition {
  if (comp.titleAlign === "center") return "title-above-center";
  if (!comp.headerRule) return comp.titleAlign === "end" ? "title-left" : "title-right";
  return comp.titleAlign === "end" ? "rule-left" : "rule-right";
}

export function assetsFor(style: DecorativeTheme["style"]): DesignAsset[] {
  return DESIGN_ASSETS.filter((a) => a.type === style);
}

/** Opacity ceiling per placement (JCS ACCENT_CAPS); other decoration is uncapped. */
export function opacityCap(theme: Pick<DecorativeTheme, "style" | "placement">): number {
  if (theme.style !== "accent") return 1;
  if (theme.placement === "corners" || theme.placement === "edge-accent" || theme.placement === "header-flourish" || theme.placement === "footer-flourish") return ACCENT_CAPS.corners.maxOpacity;
  if (theme.placement === "top-bottom") return ACCENT_CAPS.topBottom.maxOpacity;
  if (theme.placement === "behind-title") return ACCENT_CAPS.behindTitle.maxOpacity;
  return 1;
}

/** Placements made of anchored objects (these take the advanced anchor / alignment / size controls). */
export function isObjectPlacement(theme: Pick<DecorativeTheme, "style" | "placement">): boolean {
  if (theme.style === "floral") return true;
  return theme.style === "accent" && (["corners", "behind-title", "edge-accent", "header-flourish", "footer-flourish"] as DecorativePlacement[]).includes(theme.placement);
}

export function defaultCorners(assetId: string | undefined): CornerSet {
  // JCS: line-art "Opposite corners" = top-right + bottom-left; the floral corner frames top-left + bottom-right.
  return findAsset(assetId)?.type === "floral" ? "opposite-tl-br" : "opposite-tr-bl";
}

/** Bring any stored theme onto a valid style/asset/placement combination (and migrate old fields). */
export function normalizeDecoration(t: DecorativeTheme): DecorativeTheme {
  const styles = ["none", "solid", "marble", "watercolor", "floral", "accent"];
  if (!styles.includes(t.style)) return { ...t, style: "none" };
  let assetId = t.assetId;
  if (t.style === "marble" || t.style === "floral" || t.style === "accent") {
    if (!findAsset(assetId) || findAsset(assetId)!.type !== t.style) assetId = assetsFor(t.style)[0].id;
  }
  let placement: string = t.placement;
  // Header sprigs used "header-band", then "title-flank"; both are now a title accent (placementsFor re-validates below).
  if ((placement === "header-band" && t.style === "floral") || placement === "title-flank") placement = "title-accent";
  const next: DecorativeTheme = { ...t, assetId, placement: placement as DecorativePlacement };
  delete next.applyToInterior;
  if (next.edge && !edgesFor(assetId).includes(next.edge)) delete next.edge;
  if (next.titlePosition && !titlePositionsFor(assetId).includes(next.titlePosition)) delete next.titlePosition;
  const allowed = placementsFor(next);
  const fixed = allowed.length && !allowed.includes(next.placement) ? { ...next, placement: allowed[0] } : next;
  return { ...fixed, opacity: Math.min(fixed.opacity, opacityCap(fixed)) };
}

const HEX = /^#[0-9a-f]{6}$/i;
const hexOf = (colors: ColorTokens, token: ColorToken, fallback: string) => (HEX.test(colors[token]) ? colors[token] : fallback);

function rasterFor(asset: DesignAsset, rect: Rect, theme: DecorativeTheme, colors: ColorTokens, fit: RasterRequest["fit"]): RasterRequest {
  let wIn = rect.w, hIn = rect.h;
  if (fit === "stretch") {
    // Quantize object rasters (aspect preserved) so small per-page size changes reuse one bitmap.
    wIn = Math.max(RASTER_STEP_IN, Math.ceil(rect.w / RASTER_STEP_IN) * RASTER_STEP_IN);
    hIn = wIn * (asset.size.h / asset.size.w);
  }
  let pxW = wIn * DECOR_DPI, pxH = hIn * DECOR_DPI;
  const k = Math.min(1, MAX_RASTER_PX / Math.max(pxW, pxH));
  pxW = Math.max(1, Math.round(pxW * k));
  pxH = Math.max(1, Math.round(pxH * k));
  return {
    assetId: asset.id,
    pxW,
    pxH,
    fit,
    zoom: asset.type === "marble" ? Math.max(1, theme.scale) : 1,
    roles: {
      base: hexOf(colors, theme.colorA, "#630000"),
      vein: hexOf(colors, theme.colorB, "#E6A742"),
      highlight: hexOf(colors, theme.colorC, "#FDFDFD"),
      deep: hexOf(colors, "primary", "#630000"),
      paper: hexOf(colors, "background", "#FDFDFD"),
    },
  };
}

type Ctx = { comp: Composition; theme: DecorativeTheme; colors: ColorTokens; toMedia: (r: Rect) => Rect };
type Spec = Omit<ObjectSpec, "assetId" | "aspect"> & {
  id: string;
  mode: "contained" | "bleed";
  corner?: Corner;
  attachedTo?: string[];
  targetGapIn?: number | null;
};



/** Content blocks masked out of line art (header, body, footer — each + clearance), trim coordinates. */
function contentBlocks(comp: Composition): Rect[] {
  const clr = comp.clearanceIn;
  const zones = new Map<string, Rect[]>();
  const header = comp.regions.header, footer = comp.regions.footer;
  const keepouts: Rect[] = [];
  for (const p of comp.protected) {
    if (p.kind === "keepout") {
      keepouts.push(p.rect);
      continue;
    }
    const r = inflate(p.rect, -clr);
    const cy = r.y + r.h / 2;
    const zone = header && cy <= header.y + header.h ? "header" : footer && cy >= footer.y ? "footer" : "body";
    zones.set(zone, [...(zones.get(zone) ?? []), r]);
  }
  return [...[...zones.values()].map((rs) => inflate(union(rs)!, clr)), ...keepouts];
}

const CORNER_DEF = {
  tl: { anchor: "topLeftAccent", alignX: "start", alignY: "start" },
  tr: { anchor: "topRightAccent", alignX: "end", alignY: "start" },
  bl: { anchor: "bottomLeftAccent", alignX: "start", alignY: "end" },
  br: { anchor: "bottomRightAccent", alignX: "end", alignY: "end" },
} as const;

const CORNERS_OF: Record<CornerSet, Corner[]> = {
  "opposite-tl-br": ["tl", "br"],
  "opposite-tr-bl": ["tr", "bl"],
  all: ["tl", "tr", "bl", "br"],
  top: ["tl", "tr"],
  bottom: ["bl", "br"],
  tl: ["tl"],
  tr: ["tr"],
  bl: ["bl"],
  br: ["br"],
};

/** Corners of a set, with the transform that turns the art into each corner. */
function cornersOf(set: CornerSet, kind: "floral" | "accent") {
  // Floral corner art grows from its top-left; JCS line-art corners are designed for the top-right.
  const t = (k: Corner): ArtTransform =>
    kind === "floral" ? { flipX: k === "tr" || k === "br", flipY: k === "bl" || k === "br" } : { flipX: k === "tl" || k === "bl", flipY: k === "bl" || k === "br" };
  return CORNERS_OF[set].map((k) => ({ ...CORNER_DEF[k], corner: k, transform: t(k) }));
}

/** Base object placement before user overrides. */
function base(p: Partial<DecorationPlacement>): DecorationPlacement {
  return { anchor: "page", attach: "inside", alignX: "center", alignY: "center", fit: "contain", offsetXIn: 0, offsetYIn: 0, allowContentOverlap: false, allowBleed: true, allowClipping: false, ...p };
}

/** The trim inset by the corner inset: where contained art may go. */
function containedBounds(comp: Composition): Rect {
  const i = comp.gaps.cornerInset;
  return { x: i, y: i, w: comp.trim.w - 2 * i, h: comp.trim.h - 2 * i };
}

/** Corner pieces: CONTAINED in the corner region (never cropped), or BLEED past the trim by edgeBleedAmount. */
function cornerSpecs(comp: Composition, set: CornerSet, kind: "floral" | "accent", preferredW: number, edge: EdgeTreatment): Spec[] {
  return cornersOf(set, kind).map((k) => {
    const id = `corner-${k.corner}`;
    const corner = k.corner;
    if (edge === "contained") {
      const c = comp.corners[k.corner];
      const region = { x: c.x, y: c.y, w: c.width, h: c.height };
      return { ...base({ anchor: k.anchor, alignX: k.alignX, alignY: k.alignY, allowBleed: false }), id, corner, mode: "contained", preferredW, region, bounds: region, transform: k.transform };
    }
    // Line art keeps the JCS knockout under its bleed; florals shrink clear of content.
    return {
      ...base({ anchor: k.anchor, alignX: k.alignX, alignY: k.alignY, fit: "natural" }),
      id,
      corner,
      mode: "bleed",
      preferredW,
      bleedOut: comp.gaps.edgeBleed,
      avoid: kind === "accent" ? "knockout" : "shrink",
      transform: k.transform,
    };
  });
}

const sameRule = (p: ProtectedRect, rule: Rect) => p.kind === "rule" && Math.abs(p.rect.y + p.rect.h / 2 - (rule.y + rule.h / 2)) < 1e-6 && p.rect.x <= rule.x + 1e-6;

/** Title-accent pieces: attached to the title's ink or to its rule, at the semantic gap tokens. */
function titleAccentSpecs(comp: Composition, pos: TitleAccentPosition, preferredW: number): Spec[] {
  const g = comp.gaps;
  const contained = containedBounds(comp);
  const title = comp.titleId;
  const rule = comp.headerRule;
  const onTitle = (p: ProtectedRect) => p.id === title;
  const common = { mode: "contained" as const, preferredW, bounds: contained };
  const beside = (side: "start" | "end"): Spec => ({
    ...base({ anchor: "title", attach: "outside", alignX: side, alignY: "center", fit: "natural", allowBleed: false }),
    ...common,
    id: side === "start" ? "title-left" : "title-right",
    attachY: "inside",
    gapIn: g.titleAccent,
    ignore: onTitle,
    attachedTo: title ? [title] : [],
    targetGapIn: g.titleAccent,
    transform: { flipX: side === "start" },
  });
  const aboveBelow = (y: "start" | "end", x: "start" | "center" | "end", id: string): Spec => ({
    ...base({ anchor: "title", attach: "outside", alignX: x, alignY: y, fit: "natural", allowBleed: false }),
    ...common,
    id,
    attachX: "inside",
    gapIn: g.toTitle,
    ignore: onTitle,
    attachedTo: title ? [title] : [],
    targetGapIn: g.toTitle,
    transform: {},
  });
  const onRule = (x: "start" | "center" | "end", id: string): Spec => ({
    ...base({ anchor: "titleRule", attach: "inside", alignX: x, alignY: "end", fit: "natural", allowBleed: false }),
    ...common,
    id,
    // Sits ON the title rule, a decorationToRuleGap above it; content beyond the rule is separated by the rule.
    restOnY: rule ? rule.y - g.toRule : undefined,
    ignore: (p) => !!rule && (sameRule(p, rule) || p.rect.y + g.toContent >= rule.y - 1e-6),
    attachedTo: [],
    targetGapIn: g.toRule,
    transform: { flipX: x === "start" },
  });
  const titleAlign = comp.titleAlign;
  switch (pos) {
    case "title-left":
      return [beside("start")];
    case "title-right":
      return [beside("end")];
    case "title-above":
      return [aboveBelow("start", titleAlign, "title-above")];
    case "title-above-center":
      return [aboveBelow("start", "center", "title-above")];
    case "title-below":
      return [aboveBelow("end", titleAlign, "title-below")];
    case "title-below-center":
      return [aboveBelow("end", "center", "title-below")];
    case "rule-left":
      return [onRule("start", "rule-left")];
    case "rule-center":
      return [onRule("center", "rule-center")];
    case "rule-right":
      return [onRule("end", "rule-right")];
    case "rule-both":
      return [onRule("start", "rule-left"), onRule("end", "rule-right")];
  }
}

/** Fallback order for the automatic title accent. */
const AUTO_TITLE_ORDER: TitleAccentPosition[] = ["rule-right", "title-right", "title-above-center", "title-above", "rule-left", "title-left", "rule-center"];

/** Apply the user's advanced overrides; an overridden anchor turns a mirrored set into one piece there. */
function withOverrides(specs: Spec[], theme: DecorativeTheme, comp: Composition): Spec[] {
  const o = theme.layout;
  if (!o) return specs;
  const list = o.anchor && specs.length > 1 ? specs.slice(0, 1) : specs;
  return list.map((s) => {
    const next: Spec = { ...s };
    if (o.anchor && o.anchor !== s.anchor) {
      next.anchor = o.anchor;
      next.attach = "inside";
      next.attachX = next.attachY = undefined;
      next.restOnY = undefined;
      next.region = undefined;
      next.bleedOut = undefined;
      next.ignore = undefined;
      if (next.mode === "contained") next.bounds = containedBounds(comp);
    }
    if (o.alignX) next.alignX = o.alignX;
    if (o.alignY) next.alignY = o.alignY;
    if (o.fit) next.fit = o.fit;
    if (o.maxWidthIn !== undefined) next.maxWidthIn = o.maxWidthIn;
    if (o.maxHeightIn !== undefined) next.maxHeightIn = o.maxHeightIn;
    if (o.offsetXIn !== undefined) next.offsetXIn = o.offsetXIn;
    if (o.offsetYIn !== undefined) next.offsetYIn = o.offsetYIn;
    if (o.allowContentOverlap !== undefined) next.allowContentOverlap = o.allowContentOverlap;
    if (o.allowBleed !== undefined) next.allowBleed = o.allowBleed;
    if (o.allowClipping !== undefined) next.allowClipping = o.allowClipping;
    // Allowing bleed / cropping on a contained piece makes it a bleed piece.
    if (next.mode === "contained" && (next.allowClipping || (o.allowBleed && !s.allowBleed))) {
      next.mode = "bleed";
      next.bounds = undefined;
    }
    return next;
  });
}

const CORNER_NAME: Record<Corner, string> = { tl: "upper-left", tr: "upper-right", bl: "lower-left", br: "lower-right" };

/** Say WHY an object was not placed, in page terms. */
function noRoomReason(comp: Composition, s: Spec, fallback = "no room"): string {
  const c = comp.content;
  if (s.corner && c && !fallback.startsWith("this page has no")) {
    const left = s.corner === "tl" || s.corner === "bl", top = s.corner === "tl" || s.corner === "tr";
    const mx = left ? c.x : comp.trim.w - (c.x + c.w), my = top ? c.y : comp.trim.h - (c.y + c.h);
    // A binding / glue zone reaching the corner is the real blocker there.
    const cx = left ? 0 : comp.trim.w, cy = top ? 0 : comp.trim.h;
    const zone = comp.protected.find((q) => q.kind === "keepout" && cx >= q.rect.x - 1e-6 && cx <= q.rect.x + q.rect.w + 1e-6 && cy >= q.rect.y - 1e-6 && cy <= q.rect.y + q.rect.h + 1e-6);
    const room = zone
      ? `the binding / glue zone covers the ${CORNER_NAME[s.corner]} corner`
      : `the content leaves ${mx.toFixed(2)}" × ${my.toFixed(2)}" of margin at the ${CORNER_NAME[s.corner]} corner`;
    return s.mode === "contained"
      ? `no room to show the whole artwork: ${room} (art keeps ${comp.gaps.cornerInset}" from the trim and ${comp.gaps.toContent}" from content) — choose other corners or "Bleed off the edge"`
      : `no room even when bled off the edge: ${room}`;
  }
  if (fallback.includes('"titleRule"')) return "this page's title has no rule — choose a position beside, above or below the title";
  return fallback;
}

function placeObjects(c: Ctx, asset: Exclude<DesignAsset, { type: "marble" }>, specs: Spec[]) {
  const ar = asset.size.w / asset.size.h;
  const pieces: DecorPiece[] = [];
  const reports: PieceReport[] = [];
  let knockout = false;
  for (const s of specs) {
    const fit = fitObject({ ...s, assetId: asset.id, aspect: ar }, c.comp);
    const knocks = s.avoid === "knockout" && !s.allowContentOverlap;
    reports.push({
      id: s.id,
      assetId: asset.id,
      anchor: s.anchor,
      rect: fit.rect ? c.toMedia(fit.rect) : null,
      inkBox: fit.inkBox ? c.toMedia(fit.inkBox) : null,
      reason: fit.rect ? undefined : noRoomReason(c.comp, s, fit.reason),
      clippedShare: fit.clippedShare,
      // Knockout pieces never paint over content: it is masked away.
      overlapShare: knocks ? 0 : fit.overlapShare,
      intentionalClip: fit.intentionalClip,
      allowContentOverlap: s.allowContentOverlap,
      scale: fit.scale,
      mode: s.mode,
      cells: fit.cells.map(c.toMedia),
      bounds: s.mode === "contained" && fit.bounds ? c.toMedia(fit.bounds) : null,
      knockout: knocks,
      attachedTo: s.attachedTo ?? [],
      targetGapIn: s.targetGapIn ?? null,
    });
    if (!fit.rect) continue;
    const rect = c.toMedia(fit.rect);
    if (knocks) knockout = true;
    if (asset.type === "accent") pieces.push({ kind: "mask", assetId: asset.id, url: asset.url, rect, color: c.theme.colorB, transform: s.transform });
    else pieces.push({ kind: "raster", assetId: asset.id, rect, request: rasterFor(asset, rect, c.theme, c.colors, "stretch"), fallback: null, transform: s.transform });
  }
  return { pieces, reports, knockout };
}

export function planDecoration(g: PageGeometry, input: DecorativeTheme, colors: ColorTokens, comp: Composition): DecorPlan | null {
  const theme = normalizeDecoration(input);
  if (theme.style === "none") return null;
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const ox = g.trimOffset.x, oy = g.trimOffset.y;
  const toMedia = (r: Rect): Rect => ({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });
  const c: Ctx = { comp, theme, colors, toMedia };
  const media: Rect = { x: 0, y: 0, w: W, h: H };
  const clr = comp.clearanceIn;
  const content = comp.content;
  const plan = (pieces: DecorPiece[], knockouts: Rect[] = [], reports: PieceReport[] = [], featherIn = 0): DecorPlan => ({ pieces, knockouts, featherIn, opacity: theme.opacity, reports });
  // Band: top (bleed) edge → just above the content. Frame hole: content + clearance.
  const band: Rect = { x: 0, y: 0, w: W, h: oy + (content ? Math.max(0, content.y - clr) : g.safeRect.y) };
  const frameHole = [toMedia(content ? inflate(content, clr) : g.safeRect)];
  const fieldReport = (rect: Rect, overlap: boolean): PieceReport => ({
    id: "field",
    assetId: theme.assetId ?? theme.style,
    anchor: "field",
    rect,
    inkBox: rect,
    clippedShare: 0,
    overlapShare: 0,
    intentionalClip: true,
    allowContentOverlap: overlap,
    scale: 1,
    mode: "field",
    cells: [],
    bounds: null,
    knockout: false,
    attachedTo: [],
    targetGapIn: null,
  });
  const edge: EdgeTreatment = theme.edge ?? "contained";
  const run = (specs: Spec[]) => placeObjects(c, asset as Exclude<DesignAsset, { type: "marble" }>, withOverrides(specs, theme, comp));

  // ── Fields: solid, watercolor, marble ──
  if (theme.style === "solid" || theme.style === "watercolor" || theme.style === "marble") {
    const region = theme.placement === "header-band" ? band : media;
    const knock = theme.placement === "border-frame" ? frameHole : [];
    const feather = theme.style === "watercolor" && theme.placement === "border-frame" ? clr * WATERCOLOR_FEATHER_OF_CLEARANCE : 0;
    const reports = [fieldReport(region, theme.placement === "full-page")];
    if (theme.style === "solid") return plan([{ kind: "solid", rect: region, color: theme.colorA }], knock, reports, feather);
    if (theme.style === "watercolor") {
      const blooms = WATERCOLOR_BLOOMS.map((b) => ({
        cx: region.x + b.cx * region.w,
        cy: region.y + b.cy * region.h,
        r: b.r * Math.max(region.w, region.h),
        color: b.role === "base" ? theme.colorA : b.role === "vein" ? theme.colorB : theme.colorC,
        alpha: b.alpha,
      }));
      return plan([{ kind: "watercolor", rect: region, paper: "background", blooms }], knock, reports, feather);
    }
    const marble = findAsset(theme.assetId)!;
    return plan([{ kind: "raster", assetId: marble.id, rect: region, request: rasterFor(marble, region, theme, colors, "cover"), fallback: theme.colorA }], knock, reports);
  }

  const asset = findAsset(theme.assetId)!;
  if (asset.type === "marble") return null;
  const ar = asset.size.w / asset.size.h;
  const trimW = g.trimWidthIn;

  // ── Floral objects ──
  if (asset.type === "floral") {
    let specs: Spec[] = [];
    if (theme.placement === "corners") {
      const short = Math.min(g.trimWidthIn, g.trimHeightIn);
      const preferredW = short * FLORAL_CORNER_OF_SHORT_SIDE * theme.scale;
      const specsFor = (set: CornerSet) => cornerSpecs(comp, set, "floral", preferredW, edge);
      if (theme.corners) specs = specsFor(theme.corners);
      else {
        // Automatic: the opposite pair with the most room for the artwork (binding zones and content decide).
        const area = (set: CornerSet) => run(specsFor(set)).reports.reduce((sum, r) => sum + (r.rect ? r.rect.w * r.rect.h : 0), 0);
        const best = (["opposite-tl-br", "opposite-tr-bl"] as const).reduce((a, b) => (area(b) > area(a) + 1e-9 ? b : a));
        specs = specsFor(best);
      }
    } else if (theme.placement === "title-accent") {
      // JCS floralFlank sizing: the cluster is 1.5 title em tall — never smaller than the minimum ornament.
      const h = comp.titleEmIn * FLORAL_FLANK.heightPerTitleEm * theme.scale;
      const preferredW = Math.max(h * ar, ar >= 1 ? MIN_LONG_SIDE_IN : MIN_LONG_SIDE_IN * ar);
      if (theme.titlePosition) specs = titleAccentSpecs(comp, theme.titlePosition, preferredW);
      else {
        // Automatic: the balancing default, else the first position where the whole accent fits.
        const order = [defaultTitlePosition(comp), ...AUTO_TITLE_ORDER].filter((p) => titlePositionsFor(asset.id).includes(p));
        const pick = order.find((p) => run(titleAccentSpecs(comp, p, preferredW)).reports.every((r) => r.rect)) ?? order[0];
        specs = titleAccentSpecs(comp, pick, preferredW);
      }
    } else if (theme.placement === "top-bottom") {
      const preferredW = trimW * BOUQUET_WIDTH_OF_PAGE * theme.scale;
      specs = [
        { ...base({ anchor: "page", alignX: "center", alignY: "start" }), id: "top", mode: "bleed", preferredW, transform: { flipY: true } },
        { ...base({ anchor: "page", alignX: "center", alignY: "end" }), id: "bottom", mode: "bleed", preferredW, transform: {} },
      ];
    }
    const r = run(specs);
    return plan(r.pieces, [], r.reports);
  }

  // ── Line-art accents ──
  if (theme.placement === "header-band" || theme.placement === "border-frame") {
    // JCS "Top band" (mirror-tiled, tiles 1.4× band height) and "Full page repeat" (around content).
    const isBand = theme.placement === "header-band";
    const tileH = isBand ? band.h * ACCENT_BAND_TILE_FACTOR * theme.scale : (trimW * (REPEAT_TILE[asset.id] ?? REPEAT_TILE_DEFAULT) * theme.scale) / ar;
    const region = isBand ? band : media;
    const tile = { w: tileH * ar, h: tileH, ox: region.x + region.w / 2, oy: isBand ? region.y : region.y + region.h / 2 };
    return plan([{ kind: "tile", assetId: asset.id, url: asset.url, region, tile, color: theme.colorB }], isBand ? [] : frameHole, [fieldReport(region, false)]);
  }
  if (theme.placement === "top-bottom") {
    // JCS "Top + bottom edges": the art straddles each edge band (upside down at the top), clipped to the bands.
    const edge = g.trimHeightIn * ACCENT_EDGE_BAND;
    const size = trimW * ACCENT_CAPS.topBottom.maxScale * theme.scale;
    const h = size / ar;
    const top = toMedia({ x: (trimW - size) / 2, y: edge - h * EDGE_ART_INSIDE_TOP, w: size, h });
    const bottom = toMedia({ x: (trimW - size) / 2, y: g.trimHeightIn - edge - h * (1 - EDGE_ART_INSIDE_TOP), w: size, h });
    const topBand = { x: 0, y: 0, w: W, h: oy + edge };
    const bottomBand = { x: 0, y: oy + g.trimHeightIn - edge, w: W, h: H - (oy + g.trimHeightIn - edge) };
    const reports: PieceReport[] = [
      { ...fieldReport(topBand, false), id: "top", assetId: asset.id, anchor: "page" },
      { ...fieldReport(bottomBand, false), id: "bottom", assetId: asset.id, anchor: "page" },
    ];
    return plan(
      [
        { kind: "mask", assetId: asset.id, url: asset.url, rect: top, color: theme.colorB, transform: { flipX: true, flipY: true }, clip: topBand },
        { kind: "mask", assetId: asset.id, url: asset.url, rect: bottom, color: theme.colorB, clip: bottomBand },
      ],
      contentBlocks(comp).map(toMedia),
      reports,
    );
  }
  if (theme.placement === "behind-title") {
    // JCS "Behind the title (subtle)": overlaps the title by design, at ≤ 16% strength.
    const r = run([{ ...base({ anchor: "title", allowContentOverlap: true, allowBleed: false }), id: "behind", mode: "contained", preferredW: trimW, bounds: containedBounds(comp), transform: {} }]);
    return plan(r.pieces, [], r.reports);
  }
  const flourishW = trimW * LINE_FLOURISH_OF_PAGE * theme.scale;
  if (theme.placement === "header-flourish") {
    // In the header, resting on the title rule at the end opposite the title (or at the header's foot).
    const side = comp.titleAlign === "end" ? "start" : "end";
    const rule = comp.headerRule;
    const spec: Spec = rule
      ? {
          ...base({ anchor: "titleRule", alignX: side, alignY: "end", fit: "natural", allowBleed: false }),
          restOnY: rule.y - comp.gaps.toRule,
          ignore: (p) => sameRule(p, rule) || p.rect.y + comp.gaps.toContent >= rule.y - 1e-6,
          targetGapIn: comp.gaps.toRule,
          id: "header-flourish",
          mode: "contained",
          preferredW: flourishW,
          bounds: containedBounds(comp),
          transform: { flipX: side === "start" },
        }
      : { ...base({ anchor: "header", alignX: side, alignY: "end", fit: "natural", allowBleed: false }), id: "header-flourish", mode: "contained", preferredW: flourishW, bounds: containedBounds(comp), transform: { flipX: side === "start" } };
    const r = run([spec]);
    return plan(r.pieces, [], r.reports);
  }
  if (theme.placement === "footer-flourish") {
    // Centred in the space between the content's foot and the trim (inset), clear of content.
    const bottom = content ? content.y + content.h + clr : g.trimHeightIn / 2;
    const region = { x: 0, y: bottom, w: g.trimWidthIn, h: Math.max(0, g.trimHeightIn - comp.gaps.cornerInset - bottom) };
    const r = run([
      { ...base({ anchor: "page", alignX: "center", alignY: "center", fit: "natural", allowBleed: false }), id: "footer-flourish", mode: "contained", preferredW: flourishW, region, bounds: containedBounds(comp), transform: { flipY: true } },
    ]);
    return plan(r.pieces, [], r.reports);
  }
  if (theme.placement === "edge-accent") {
    // Along the outer (right) edge, centred on the content, running edgeBleedAmount off the page on purpose.
    const mid = content ?? { x: 0, y: 0, w: g.trimWidthIn, h: g.trimHeightIn };
    const region = { x: 0, y: mid.y, w: g.trimWidthIn, h: mid.h };
    const r = run([
      { ...base({ anchor: "page", alignX: "end", alignY: "center", fit: "natural" }), id: "edge-accent", mode: "bleed", preferredW: flourishW, region, bleedOut: comp.gaps.edgeBleed, transform: {} },
    ]);
    return plan(r.pieces, [], r.reports);
  }
  // Corners: CONTAINED by default (the whole artwork visible, clear of content); BLEED only when chosen
  // (JCS full-bleed corner crop: runs edgeBleedAmount past the trim, content masked away).
  const set = theme.corners ?? defaultCorners(asset.id);
  const scaleCap = CORNERS_OF[set].length === 1 ? ACCENT_CAPS.singleCorner.maxScale : ACCENT_CAPS.corners.maxScale;
  const r = run(cornerSpecs(comp, set, "accent", trimW * scaleCap * theme.scale, edge));
  return plan(r.pieces, r.knockout ? contentBlocks(comp).map(toMedia) : [], r.reports);
}

/** Every raster a set of pages needs (print pre-loading). */
export function rasterRequests(pages: { g: PageGeometry; comp: Composition }[], theme: DecorativeTheme, colors: ColorTokens): RasterRequest[] {
  return pages.flatMap(({ g, comp }) => planDecoration(g, theme, colors, comp)?.pieces ?? []).flatMap((p) => (p.kind === "raster" ? [p.request] : []));
}
