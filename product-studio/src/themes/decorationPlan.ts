/**
 * DECORATION PLANNER — pure. Page geometry + decorative theme + colors →
 * positioned decoration pieces in MEDIA coordinates (inches).
 *
 * Reads only trim / bleed / safe geometry. Never reads layout nodes, so line
 * spacing cannot move decoration and decoration cannot move functional
 * geometry. The preview, the print renderer and the print pre-loader all use
 * this same plan.
 */
import { DESIGN_ASSETS, SOLID_PLACEMENTS, WATERCOLOR_BLOOMS, WATERCOLOR_PLACEMENTS, findAsset, type DesignAsset } from "../design-library/library";
import type { PageGeometry, Rect } from "../types/geometry";
import type { DecorativePlacement, DecorativeTheme } from "../types/theme";
import type { ColorToken, ColorTokens } from "../types/tokens";
import type { RasterRequest } from "./recolor";

/** Raster decorations are rendered at this density (px per inch) for preview AND print. */
export const DECOR_DPI = 150;
/** Upper bound on a raster's long side, to keep large desk pads within canvas memory. */
const MAX_RASTER_PX = 3600;
/** Accent corner art width as a fraction of the media width (JCS "opposite corners" placement). */
const ACCENT_CORNER_FRACTION = 0.5;
/** Floral corner art width as a fraction of the short trim side. */
const FLORAL_CORNER_FRACTION = 0.42;
/** Floral sprig height as a fraction of the header band, and its offset from centre. */
const SPRIG_HEIGHT_FRACTION = 0.7;
const SPRIG_HALF_GAP_FRACTION = 0.18;

export type DecorPiece =
  | { kind: "solid"; rect: Rect; color: ColorToken }
  | { kind: "raster"; assetId: string; rect: Rect; request: RasterRequest; fallback: ColorToken | null; rotate180?: boolean; flipX?: boolean }
  | { kind: "mask"; assetId: string; url: string; rect: Rect; color: ColorToken; rotate180?: boolean }
  | { kind: "watercolor"; rect: Rect; paper: ColorToken; blooms: { cx: number; cy: number; r: number; color: ColorToken; alpha: number }[] };

export type DecorPlan = {
  pieces: DecorPiece[];
  /** Region the decoration is clipped to. */
  clip: Rect;
  /** Keep the safe (writing) area clean. */
  excludeSafe: boolean;
  opacity: number;
};

/** Placements genuinely implemented for a style / asset. */
export function placementsFor(theme: Pick<DecorativeTheme, "style" | "assetId">): DecorativePlacement[] {
  if (theme.style === "none") return [];
  if (theme.style === "solid") return SOLID_PLACEMENTS;
  if (theme.style === "watercolor") return WATERCOLOR_PLACEMENTS;
  return findAsset(theme.assetId)?.placements ?? [];
}

export function assetsFor(style: DecorativeTheme["style"]): DesignAsset[] {
  return DESIGN_ASSETS.filter((a) => a.type === style);
}

/** Bring any stored theme onto a valid style/asset/placement combination. */
export function normalizeDecoration(t: DecorativeTheme): DecorativeTheme {
  const styles = ["none", "solid", "marble", "watercolor", "floral", "accent"];
  if (!styles.includes(t.style)) return { ...t, style: "none" };
  let assetId = t.assetId;
  if (t.style === "marble" || t.style === "floral" || t.style === "accent") {
    if (!findAsset(assetId) || findAsset(assetId)!.type !== t.style) assetId = assetsFor(t.style)[0].id;
  }
  const next = { ...t, assetId };
  const allowed = placementsFor(next);
  return allowed.length && !allowed.includes(t.placement) ? { ...next, placement: allowed[0] } : next;
}

const HEX = /^#[0-9a-f]{6}$/i;
const hexOf = (colors: ColorTokens, token: ColorToken, fallback: string) => (HEX.test(colors[token]) ? colors[token] : fallback);

function rasterFor(asset: DesignAsset, rect: Rect, theme: DecorativeTheme, colors: ColorTokens): RasterRequest {
  let pxW = rect.w * DECOR_DPI, pxH = rect.h * DECOR_DPI;
  const k = Math.min(1, MAX_RASTER_PX / Math.max(pxW, pxH));
  pxW = Math.max(1, Math.round(pxW * k));
  pxH = Math.max(1, Math.round(pxH * k));
  return {
    assetId: asset.id,
    pxW,
    pxH,
    zoom: asset.type === "marble" || (asset.type === "floral" && asset.usage === "bouquet") ? Math.max(1, theme.scale) : 1,
    roles: {
      base: hexOf(colors, theme.colorA, "#630000"),
      vein: hexOf(colors, theme.colorB, "#E6A742"),
      highlight: hexOf(colors, theme.colorC, "#FDFDFD"),
      deep: hexOf(colors, "primary", "#630000"),
      paper: hexOf(colors, "background", "#FDFDFD"),
    },
  };
}

export function planDecoration(g: PageGeometry, input: DecorativeTheme, colors: ColorTokens): DecorPlan | null {
  const theme = normalizeDecoration(input);
  if (theme.style === "none") return null;
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const media: Rect = { x: 0, y: 0, w: W, h: H };
  // The header band is the top MARGIN (bleed + safe top): decoration never sits
  // behind functional content such as titles.
  const band: Rect = { x: 0, y: 0, w: W, h: g.trimOffset.y + g.safeRect.y };
  const region = theme.placement === "header-band" ? band : media;
  // Decoration stays out of the safe (functional) area unless the user
  // explicitly extends a full-page design under the writing areas.
  const excludeSafe = !(theme.placement === "full-page" && theme.applyToInterior);
  const plan = (pieces: DecorPiece[], clip = region): DecorPlan => ({ pieces, clip, excludeSafe, opacity: theme.opacity });

  if (theme.style === "solid") return plan([{ kind: "solid", rect: region, color: theme.colorA }]);

  if (theme.style === "watercolor") {
    return plan([
      {
        kind: "watercolor",
        rect: region,
        paper: "background",
        blooms: WATERCOLOR_BLOOMS.map((b) => ({
          cx: region.x + b.cx * region.w,
          cy: region.y + b.cy * region.h,
          r: b.r * Math.max(region.w, region.h),
          color: b.role === "base" ? theme.colorA : b.role === "vein" ? theme.colorB : theme.colorC,
          alpha: b.alpha,
        })),
      },
    ]);
  }

  const asset = findAsset(theme.assetId)!;
  const ar = asset.size.w / asset.size.h;

  if (asset.type === "marble" || (asset.type === "floral" && asset.usage === "bouquet")) {
    return plan([{ kind: "raster", assetId: asset.id, rect: region, request: rasterFor(asset, region, theme, colors), fallback: asset.type === "marble" ? theme.colorA : null }]);
  }

  if (asset.type === "floral" && asset.usage === "corner") {
    const w = Math.min(g.trimWidthIn, g.trimHeightIn) * FLORAL_CORNER_FRACTION * theme.scale;
    const h = w / ar;
    const tl: Rect = { x: 0, y: 0, w, h };
    const br: Rect = { x: W - w, y: H - h, w, h };
    const req = rasterFor(asset, tl, theme, colors);
    return plan(
      [
        { kind: "raster", assetId: asset.id, rect: tl, request: req, fallback: null },
        { kind: "raster", assetId: asset.id, rect: br, request: req, fallback: null, rotate180: true },
      ],
      media,
    );
  }

  if (asset.type === "floral" && asset.usage === "sprig") {
    const h = band.h * SPRIG_HEIGHT_FRACTION * theme.scale;
    const w = h * ar;
    const y = (band.h - h) / 2;
    const half = W * SPRIG_HALF_GAP_FRACTION;
    const right: Rect = { x: W / 2 + half, y, w, h };
    const left: Rect = { x: W / 2 - half - w, y, w, h };
    const req = rasterFor(asset, right, theme, colors);
    return plan(
      [
        { kind: "raster", assetId: asset.id, rect: left, request: req, fallback: null, flipX: true },
        { kind: "raster", assetId: asset.id, rect: right, request: req, fallback: null },
      ],
      band,
    );
  }

  // Line-art accents: single-color masks tinted with colorB.
  const color = theme.colorB;
  if (theme.placement === "corners") {
    const w = W * ACCENT_CORNER_FRACTION * theme.scale;
    const h = w / ar;
    return plan(
      [
        { kind: "mask", assetId: asset.id, url: asset.url, rect: { x: W - w * 0.8, y: -h * 0.2, w, h }, color },
        { kind: "mask", assetId: asset.id, url: asset.url, rect: { x: -w * 0.2, y: H - h * 0.8, w, h }, color, rotate180: true },
      ],
      media,
    );
  }
  // Full page / band: cover the region, preserving aspect ratio (cropped by the clip).
  const w = Math.max(region.w * 1.05, region.h * 1.05 * ar) * theme.scale;
  const h = w / ar;
  return plan([{ kind: "mask", assetId: asset.id, url: asset.url, rect: { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h }, color }]);
}

/** Every raster a set of page geometries needs (print pre-loading). */
export function rasterRequests(geometries: PageGeometry[], theme: DecorativeTheme, colors: ColorTokens): RasterRequest[] {
  return geometries.flatMap((g) => planDecoration(g, theme, colors)?.pieces ?? []).flatMap((p) => (p.kind === "raster" ? [p.request] : []));
}
