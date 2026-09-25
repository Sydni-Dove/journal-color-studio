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
 *   objects  corners, title-flank, top-bottom — fitted to their region
 *            against the artwork's real footprint (engines/composition/fit)
 *   line art bands / frames are mirror-tiled; corners overhang the edge as
 *            designed; content is masked away (knockout) with a clearance
 */
import { DESIGN_ASSETS, SOLID_PLACEMENTS, WATERCOLOR_BLOOMS, WATERCOLOR_PLACEMENTS, findAsset, type DesignAsset } from "../design-library/library";
import {
  ACCENT_BAND_TILE_FACTOR,
  ACCENT_CAPS,
  ACCENT_CORNER_OVERHANG,
  ACCENT_EDGE_BAND,
  ACCENT_PLACEMENTS,
  BOUQUET_WIDTH_OF_PAGE,
  FLORAL_CORNER_OF_SHORT_SIDE,
  FLORAL_FLANK,
} from "../design-library/placement";
import { inflate, union } from "../engines/composition/composition";
import { fitObject, MIN_LONG_SIDE_IN, type ArtTransform, type ObjectSpec } from "../engines/composition/fit";
import type { Composition, CompositionAnchor, DecorationPlacement } from "../types/composition";
import type { PageGeometry, Rect } from "../types/geometry";
import type { CornerSet, DecorativePlacement, DecorativeTheme } from "../types/theme";
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
  const asset = findAsset(theme.assetId);
  if (asset?.type === "accent") return ACCENT_PLACEMENTS[asset.id] ?? [];
  return asset?.placements ?? [];
}

export function assetsFor(style: DecorativeTheme["style"]): DesignAsset[] {
  return DESIGN_ASSETS.filter((a) => a.type === style);
}

/** Opacity ceiling per placement (JCS ACCENT_CAPS); other decoration is uncapped. */
export function opacityCap(theme: Pick<DecorativeTheme, "style" | "placement">): number {
  if (theme.style !== "accent") return 1;
  if (theme.placement === "corners") return ACCENT_CAPS.corners.maxOpacity;
  if (theme.placement === "top-bottom") return ACCENT_CAPS.topBottom.maxOpacity;
  if (theme.placement === "behind-title") return ACCENT_CAPS.behindTitle.maxOpacity;
  return 1;
}

/** Placements made of anchored objects (these take the advanced anchor / alignment / size controls). */
export function isObjectPlacement(theme: Pick<DecorativeTheme, "style" | "placement">): boolean {
  if (theme.style === "floral") return true;
  return theme.style === "accent" && (theme.placement === "corners" || theme.placement === "behind-title");
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
  // Header sprigs used "header-band"; the floral equivalent is now "title-flank" (placementsFor re-validates below).
  if (placement === "header-band" && t.style === "floral") placement = "title-flank";
  const next: DecorativeTheme = { ...t, assetId, placement: placement as DecorativePlacement };
  delete next.applyToInterior;
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
type Spec = Omit<ObjectSpec, "assetId" | "aspect"> & { id: string };

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

type Corner = "tl" | "tr" | "bl" | "br";
const CORNER_DEF = {
  tl: { anchor: "topLeftAccent", alignX: "start", alignY: "start" },
  tr: { anchor: "topRightAccent", alignX: "end", alignY: "start" },
  bl: { anchor: "bottomLeftAccent", alignX: "start", alignY: "end" },
  br: { anchor: "bottomRightAccent", alignX: "end", alignY: "end" },
} as const;

/** Corners of a set, with the transform that turns the art into each corner. */
function cornersOf(set: CornerSet, kind: "floral" | "accent") {
  // Floral corner art grows from its top-left; JCS line-art corners are designed for the top-right.
  const t = (k: Corner): ArtTransform =>
    kind === "floral" ? { flipX: k === "tr" || k === "br", flipY: k === "bl" || k === "br" } : { flipX: k === "tl" || k === "bl", flipY: k === "bl" || k === "br" };
  const list: Corner[] = set === "opposite-tl-br" ? ["tl", "br"] : set === "opposite-tr-bl" ? ["tr", "bl"] : [set];
  return list.map((k) => ({ ...CORNER_DEF[k], transform: t(k) }));
}

/** Base object placement before user overrides. */
function base(p: Partial<DecorationPlacement>): DecorationPlacement {
  return { anchor: "page", attach: "inside", alignX: "center", alignY: "center", fit: "contain", offsetXIn: 0, offsetYIn: 0, allowContentOverlap: false, allowBleed: true, allowClipping: false, ...p };
}

/** Apply the user's advanced overrides; an overridden anchor turns a mirrored pair into one piece there. */
function withOverrides(specs: Spec[], theme: DecorativeTheme): Spec[] {
  const o = theme.layout;
  if (!o) return specs;
  const list = o.anchor && specs.length > 1 ? specs.slice(0, 1) : specs;
  return list.map((s) => {
    const next: Spec = { ...s };
    if (o.anchor && o.anchor !== s.anchor) {
      next.anchor = o.anchor;
      next.attach = "inside";
      next.restOnY = undefined;
      next.overhang = 0;
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
    return next;
  });
}

function placeObjects(c: Ctx, asset: Exclude<DesignAsset, { type: "marble" }>, specs: Spec[]) {
  const ar = asset.size.w / asset.size.h;
  const pieces: DecorPiece[] = [];
  const reports: PieceReport[] = [];
  let knockout = false;
  for (const s of specs) {
    const fit = fitObject({ ...s, assetId: asset.id, aspect: ar }, c.comp);
    reports.push({
      id: s.id,
      assetId: asset.id,
      anchor: s.anchor,
      rect: fit.rect ? c.toMedia(fit.rect) : null,
      inkBox: fit.inkBox ? c.toMedia(fit.inkBox) : null,
      reason: fit.reason,
      clippedShare: fit.clippedShare,
      // Knockout pieces never paint over content: it is masked away.
      overlapShare: s.avoid === "knockout" && !s.allowContentOverlap ? 0 : fit.overlapShare,
      intentionalClip: fit.intentionalClip,
      allowContentOverlap: s.allowContentOverlap,
      scale: fit.scale,
    });
    if (!fit.rect) continue;
    const rect = c.toMedia(fit.rect);
    if (s.avoid === "knockout" && !s.allowContentOverlap) knockout = true;
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
  const fieldReport = (rect: Rect, overlap: boolean): PieceReport => ({ id: "field", assetId: theme.assetId ?? theme.style, anchor: "field", rect, inkBox: rect, clippedShare: 0, overlapShare: 0, intentionalClip: true, allowContentOverlap: overlap, scale: 1 });

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
      const specsFor = (set: CornerSet): Spec[] =>
        cornersOf(set, "floral").map((k, i) => ({
          ...base({ anchor: k.anchor, alignX: k.alignX, alignY: k.alignY }),
          id: `corner${i}`,
          preferredW: short * FLORAL_CORNER_OF_SHORT_SIDE * theme.scale,
          transform: k.transform,
        }));
      if (theme.corners) specs = specsFor(theme.corners);
      else {
        // Default: the opposite pair with the most room for the artwork (binding zones and content decide).
        const area = (set: CornerSet) =>
          placeObjects(c, asset, withOverrides(specsFor(set), theme)).reports.reduce((sum, r) => sum + (r.rect ? r.rect.w * r.rect.h : 0), 0);
        const best = (["opposite-tl-br", "opposite-tr-bl"] as const).reduce((a, b) => (area(b) > area(a) + 1e-9 ? b : a));
        specs = specsFor(best);
      }
    } else if (theme.placement === "title-flank") {
      // JCS floralFlank: clusters flank the title on its header rule (resting on the rule here, so they
      // never hang into the content just below it). Without a rule they centre on the title.
      const h = comp.titleEmIn * FLORAL_FLANK.heightPerTitleEm * theme.scale;
      const rule = comp.headerRule;
      // Rest on the header rule; with no rule, rest on the title's own line (rising into the header).
      const title = comp.regions.title;
      const rest = rule ? rule.y : title ? title.y + title.h : undefined;
      specs = (["end", "start"] as const).map((side) => ({
        ...base({ anchor: "title", attach: "outside", alignX: side, alignY: rest !== undefined ? "end" : "center", fit: "natural", allowBleed: false }),
        id: side === "end" ? "flank-after" : "flank-before",
        // Never a speck: at least the minimum ornament size even beside small titles.
        preferredW: Math.max(h * ar, ar >= 1 ? MIN_LONG_SIDE_IN : MIN_LONG_SIDE_IN * ar),
        restOnY: rest,
        // The flank sits ON its line (the header rule, or the title's own line) and never crosses it, so the
        // rule itself and content on the far side of the line are separated by the line, not by clearance.
        ignore: (p) =>
          rest !== undefined &&
          ((!!rule && p.kind === "rule" && Math.abs(p.rect.y + p.rect.h / 2 - (rule.y + rule.h / 2)) < 1e-6) || p.rect.y + comp.clearanceIn >= rest - 1e-6),
        transform: { flipX: side === "start" },
      }));
    } else if (theme.placement === "top-bottom") {
      const preferredW = trimW * BOUQUET_WIDTH_OF_PAGE * theme.scale;
      specs = [
        { ...base({ anchor: "page", alignX: "center", alignY: "start" }), id: "top", preferredW, transform: { flipY: true } },
        { ...base({ anchor: "page", alignX: "center", alignY: "end" }), id: "bottom", preferredW, transform: {} },
      ];
    }
    const r = placeObjects(c, asset, withOverrides(specs, theme));
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
    const specs = withOverrides([{ ...base({ anchor: "title", allowContentOverlap: true, allowBleed: false }), id: "behind", preferredW: trimW, transform: {} }], theme);
    const r = placeObjects(c, asset, specs);
    return plan(r.pieces, [], r.reports);
  }
  // Corners (JCS opposite / single corners): overhang the page edge as designed; content masked away.
  const set = theme.corners ?? defaultCorners(asset.id);
  const scaleCap = set.startsWith("opposite") ? ACCENT_CAPS.corners.maxScale : ACCENT_CAPS.singleCorner.maxScale;
  const specs: Spec[] = cornersOf(set, "accent").map((k, i) => ({
    ...base({ anchor: k.anchor, alignX: k.alignX, alignY: k.alignY, fit: "natural" }),
    id: `corner${i}`,
    preferredW: trimW * scaleCap * theme.scale,
    overhang: ACCENT_CORNER_OVERHANG,
    avoid: "knockout",
    transform: k.transform,
  }));
  const r = placeObjects(c, asset, withOverrides(specs, theme));
  return plan(r.pieces, r.knockout ? contentBlocks(comp).map(toMedia) : [], r.reports);
}

/** Every raster a set of pages needs (print pre-loading). */
export function rasterRequests(pages: { g: PageGeometry; comp: Composition }[], theme: DecorativeTheme, colors: ColorTokens): RasterRequest[] {
  return pages.flatMap(({ g, comp }) => planDecoration(g, theme, colors, comp)?.pieces ?? []).flatMap((p) => (p.kind === "raster" ? [p.request] : []));
}
