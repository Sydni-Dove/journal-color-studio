/**
 * ARTWORK PLACEMENT — where an uploaded image prints on a page, in inches.
 *
 * One pure function decides it (`placeArtwork`), and the editor preview, the
 * page thumbnails and the print output all draw from its answer, so the
 * preview and the exported pages always show the same placement and crop.
 *
 * Boxes are in MEDIA coordinates (inches, origin at the top-left of the
 * printed media = trim + bleed), the same space PrintablePage draws in.
 *   cover / full-page background  the whole media box: to the trim plus the bleed the printer allows
 *                                 (no bleed is added at a gutter that can't bleed)
 *   safe background / illustration  inside the print-safe area: clear of the trim, the binding gutter
 *                                 and the printer's unprintable edge
 * An illustration's dedicated area also moves the page's own content out of
 * the way: the page is laid out in the safe area left beside it
 * (`reservedBand`, applied by resolve.ts geometryFor).
 */
import type { ArtworkAsset, ArtworkCrop, ArtworkFit, ArtworkPlacement, ArtworkTarget, IllustrationAnchor, IllustrationArtwork, ProjectArtwork } from "../../types/artwork";
import type { PageGeometry, PageSide, Rect } from "../../types/geometry";

/** Space kept between a dedicated illustration area and the page's content (inches). */
export const AREA_GAP_IN = 0.125;
/** A dedicated area never takes more than this share of the safe height. */
export const AREA_MAX_SHARE = 0.5;
export const MIN_ART_IN = 0.25;
export const MAX_ZOOM = 4;

/** What one page draws for one placement. */
export type PageArt = {
  /** The placement's id (stable React key). */
  key: string;
  assetId: string;
  use: ArtworkPlacement["use"];
  /** The box the image is clipped to (media inches). */
  box: Rect;
  /** Where the whole image is drawn (media inches); outside `box` it is clipped away. */
  draw: Rect;
  opacity: number;
  /** Drawn flipped left to right (a background mirrored on a left-hand page). */
  flipX?: boolean;
  /** Cover only: hide the page's own design under the artwork; "with-title" keeps its wording on top. */
  coverMode?: "as-is" | "with-title";
  titleColor?: "palette" | "light" | "dark";
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const DEFAULT_CROP: ArtworkCrop = { x: 0.5, y: 0.5, zoom: 1 };

export function normalizeCrop(c: Partial<ArtworkCrop> | undefined): ArtworkCrop {
  return {
    x: clamp(Number.isFinite(c?.x) ? c!.x! : 0.5, 0, 1),
    y: clamp(Number.isFinite(c?.y) ? c!.y! : 0.5, 0, 1),
    zoom: clamp(Number.isFinite(c?.zoom) ? c!.zoom! : 1, 1, MAX_ZOOM),
  };
}

/**
 * The image's drawn rectangle for a box. "fill" scales the image to cover the
 * box (× zoom) and slides it so the chosen part shows; "fit" shows the whole
 * image, aligned inside the box by the same x / y.
 */
export function drawRect(box: Rect, imgW: number, imgH: number, fit: ArtworkFit, crop: ArtworkCrop): Rect {
  const c = normalizeCrop(crop);
  const iw = Math.max(1, imgW), ih = Math.max(1, imgH);
  const s = fit === "fill" ? Math.max(box.w / iw, box.h / ih) * c.zoom : Math.min(box.w / iw, box.h / ih);
  const w = iw * s, h = ih * s;
  return { x: box.x + (box.w - w) * c.x, y: box.y + (box.h - h) * c.y, w, h };
}

/** The whole media box (trim + bleed). */
export const mediaBox = (g: PageGeometry): Rect => ({ x: 0, y: 0, w: g.mediaWidthIn, h: g.mediaHeightIn });
/** The print-safe area, in media coordinates. */
export const safeBox = (g: PageGeometry): Rect => ({ x: g.trimOffset.x + g.safeRect.x, y: g.trimOffset.y + g.safeRect.y, w: g.safeRect.w, h: g.safeRect.h });

/** Does a placement go on this printed page? (`nth` = the page's place among the pages of its Pages-list item.) */
export function targets(list: ArtworkTarget[], item: string, nth: number, wholeItemsOnly = false): boolean {
  return list.some((t) => t.item === item && (wholeItemsOnly || t.nth === undefined || t.nth === nth));
}

/** Left and right swap on a left-hand page when the art follows the outer edge. */
function horizontal(a: IllustrationArtwork, side: PageSide): "left" | "center" | "right" {
  const h = a.anchor.endsWith("left") ? "left" : a.anchor.endsWith("right") ? "right" : "center";
  if (!a.mirror || side !== "verso" || h === "center") return h;
  return h === "left" ? "right" : "left";
}
const vertical = (a: IllustrationArtwork): "top" | "bottom" => (a.anchor.startsWith("bottom") ? "bottom" : "top");

/** A dedicated area's height (inches), kept to at most half the safe height. */
export const areaHeight = (a: IllustrationArtwork, safeH: number) => clamp(a.sizeIn, MIN_ART_IN, Math.max(MIN_ART_IN, safeH * AREA_MAX_SHARE));

/**
 * The room a page gives up to its dedicated illustration areas, per edge
 * (inches, area + gap). Matched by Pages-list item only, so every printed
 * page of that item — including pages its content continues onto — is laid
 * out in the same, smaller space.
 */
export function reservedBand(art: ProjectArtwork | undefined, item: string, safeH: number): { top: number; bottom: number } {
  const out = { top: 0, bottom: 0 };
  if (!art) return out;
  for (const p of art.placements) {
    if (p.use !== "illustration" || p.placement !== "area" || !targets(p.targets, item, 0, true)) continue;
    if (!art.assets.some((x) => x.id === p.assetId)) continue;
    const e = vertical(p);
    out[e] = Math.max(out[e], areaHeight(p, safeH) + AREA_GAP_IN);
  }
  // Never squeeze the content below a third of the page.
  const total = out.top + out.bottom, max = safeH * (2 / 3);
  if (total > max) {
    const k = max / total;
    out.top *= k;
    out.bottom *= k;
  }
  return out;
}

/** The page's geometry with its dedicated illustration areas taken out of the safe area. */
export function withReservedBand(g: PageGeometry, band: { top: number; bottom: number }): PageGeometry {
  if (!band.top && !band.bottom) return g;
  const safeRect = { ...g.safeRect, y: g.safeRect.y + band.top, h: g.safeRect.h - band.top - band.bottom };
  return {
    ...g,
    safe: { ...g.safe, top: g.safe.top + band.top, bottom: g.safe.bottom + band.bottom },
    safeTopIn: g.safeTopIn + band.top,
    safeBottomIn: g.safeBottomIn + band.bottom,
    safeRect,
    usableHeightIn: safeRect.h,
  };
}

/**
 * Everything this printed page draws from the project's artwork, bottom to
 * top: the cover artwork (one per page; the last one set wins), then
 * backgrounds, then illustrations, each in the order they were added.
 *
 * `g` is the page's FULL geometry (before any dedicated area was taken out);
 * `side` decides mirroring on left-hand pages.
 */
export function placeArtwork(art: ProjectArtwork | undefined, page: { item: string; nth: number; side: PageSide; cover: boolean }, g: PageGeometry): PageArt[] {
  if (!art?.placements.length) return [];
  const asset = new Map(art.assets.map((a) => [a.id, a] as const));
  const out: PageArt[] = [];
  let cover: PageArt | null = null;
  const bandTop = { used: 0 }, bandBottom = { used: 0 };
  const safe = safeBox(g);
  for (const p of art.placements) {
    const a = asset.get(p.assetId);
    if (!a) continue;
    if (p.use === "cover") {
      if (!page.cover || !targets(p.targets, page.item, page.nth)) continue;
      const box = mediaBox(g);
      cover = { key: p.id, assetId: a.id, use: "cover", box, draw: drawRect(box, a.widthPx, a.heightPx, p.fit, p.crop), opacity: 1, coverMode: p.mode, titleColor: p.titleColor ?? "palette" };
    } else if (p.use === "background") {
      if (!targets(p.targets, page.item, page.nth)) continue;
      const box = p.extent === "region" && p.region ? { x: g.trimOffset.x + p.region.x, y: g.trimOffset.y + p.region.y, w: p.region.w, h: p.region.h } : p.extent === "safe" ? safe : mediaBox(g);
      // Mirrored: the image is flipped inside its box, and so is the crop, so the chosen part shows on the outer edge.
      const flip = !!p.mirror && page.side === "verso";
      const crop = flip ? { ...p.crop, x: 1 - p.crop.x } : p.crop;
      out.push({ key: p.id, assetId: a.id, use: "background", box, draw: drawRect(box, a.widthPx, a.heightPx, p.fit, crop), opacity: clamp(p.opacity, 0.05, 1), ...(flip ? { flipX: true } : {}) });
    } else {
      const area = p.placement === "area";
      if (!targets(p.targets, page.item, page.nth, area)) continue;
      const edge = !area && !!p.toEdge;
      const box = area ? areaBox(p, a, safe, bandTop, bandBottom, page.side) : edge ? edgeBox(p, a, g, page.side) : cornerBox(p, a, safe, page.side);
      // Run off the page and mirrored onto a left-hand page: flipped too, so the art's cut edges still face out.
      const flip = edge && horizontal(p, page.side) !== horizontal({ ...p, mirror: false }, page.side);
      out.push({ key: p.id, assetId: a.id, use: "illustration", box, draw: drawRect(box, a.widthPx, a.heightPx, "fit", { x: 0.5, y: 0.5, zoom: 1 }), opacity: clamp(p.opacity, 0.05, 1), ...(flip ? { flipX: true } : {}) });
    }
  }
  // Backgrounds sit under illustrations whatever order they were added in.
  out.sort((x, y) => (x.use === y.use ? 0 : x.use === "background" ? -1 : 1));
  return cover ? [cover, ...out] : out;
}

/** A corner illustration: its width (height follows the image), held inside the safe area. */
function cornerBox(p: IllustrationArtwork, a: ArtworkAsset, safe: Rect, side: PageSide): Rect {
  const ratio = a.heightPx / Math.max(1, a.widthPx);
  let w = clamp(p.sizeIn, MIN_ART_IN, safe.w), h = w * ratio;
  if (h > safe.h) {
    h = safe.h;
    w = h / ratio;
  }
  const ox = clamp(p.offsetXIn, 0, Math.max(0, safe.w - w)), oy = clamp(p.offsetYIn, 0, Math.max(0, safe.h - h));
  const hz = horizontal(p, side);
  const x = hz === "left" ? safe.x + ox : hz === "right" ? safe.x + safe.w - w - ox : safe.x + (safe.w - w) / 2;
  const y = vertical(p) === "top" ? safe.y + oy : safe.y + safe.h - h - oy;
  return { x, y, w, h };
}

/**
 * Art that runs off the page: flush with the media edge (the trim plus its bleed) on the anchored sides, so
 * its cut edges print right to the edge of the trimmed page. A centred anchor stays centred on the trim. The
 * nudge pulls it back in from the edge. Width up to the trim's width.
 */
function edgeBox(p: IllustrationArtwork, a: ArtworkAsset, g: PageGeometry, side: PageSide): Rect {
  const ratio = a.heightPx / Math.max(1, a.widthPx);
  let w = clamp(p.sizeIn, MIN_ART_IN, g.trimWidthIn), h = w * ratio;
  if (h > g.trimHeightIn) {
    h = g.trimHeightIn;
    w = h / ratio;
  }
  const ox = Math.max(0, p.offsetXIn), oy = Math.max(0, p.offsetYIn);
  const hz = horizontal(p, side);
  const x = hz === "left" ? ox : hz === "right" ? g.mediaWidthIn - w - ox : g.trimOffset.x + (g.trimWidthIn - w) / 2;
  const y = vertical(p) === "top" ? oy : g.mediaHeightIn - h - oy;
  return { x, y, w, h };
}

/** The anchor that runs art off the edges its design is cut along (undefined: not cut along the bottom or top). */
export function edgeAnchor(cut: ArtworkAsset["cutEdges"]): IllustrationAnchor | undefined {
  if (!cut?.length) return undefined;
  const v = cut.includes("bottom") ? "bottom" : cut.includes("top") ? "top" : undefined;
  if (!v) return undefined;
  const h = cut.includes("right") && !cut.includes("left") ? "-right" : cut.includes("left") && !cut.includes("right") ? "-left" : "";
  return (v + h) as IllustrationAnchor;
}

/**
 * A dedicated area: a band across the top or bottom of the safe area, the
 * image fitted inside it and aligned left / centre / right. Several areas on
 * one edge stack inward.
 */
function areaBox(p: IllustrationArtwork, a: ArtworkAsset, safe: Rect, top: { used: number }, bottom: { used: number }, side: PageSide): Rect {
  const h = areaHeight(p, safe.h);
  const edge = vertical(p) === "top" ? top : bottom;
  const band: Rect = vertical(p) === "top" ? { x: safe.x, y: safe.y + edge.used, w: safe.w, h } : { x: safe.x, y: safe.y + safe.h - edge.used - h, w: safe.w, h };
  edge.used += h + AREA_GAP_IN;
  const fitted = drawRect(band, a.widthPx, a.heightPx, "fit", { x: 0.5, y: 0.5, zoom: 1 });
  const hz = horizontal(p, side);
  const x = hz === "left" ? band.x : hz === "right" ? band.x + band.w - fitted.w : band.x + (band.w - fitted.w) / 2;
  return { x, y: fitted.y, w: fitted.w, h: fitted.h };
}

/**
 * The image's print resolution where it is placed (pixels per inch, the lower
 * of width and height). 300+ prints sharp; under 150 looks soft.
 */
export function effectivePpi(a: Pick<ArtworkAsset, "widthPx" | "heightPx">, draw: Rect): number {
  return Math.round(Math.min(a.widthPx / Math.max(1e-6, draw.w), a.heightPx / Math.max(1e-6, draw.h)));
}

export function ppiAdvice(ppi: number): { level: "ok" | "soft" | "blurry"; text: string } {
  if (ppi >= 300) return { level: "ok", text: `${ppi} pixels per inch: prints sharp.` };
  if (ppi >= 150) return { level: "soft", text: `${ppi} pixels per inch: may print a little soft. 300 or more is best for print.` };
  return { level: "blurry", text: `${ppi} pixels per inch: will look blurry in print. Use a larger image, or place it smaller.` };
}

/** Artwork the pages use (for export: every image must be on this device). */
export function usedAssetIds(art: ProjectArtwork | undefined): string[] {
  if (!art) return [];
  const have = new Set(art.assets.map((a) => a.id));
  return [...new Set(art.placements.map((p) => p.assetId))].filter((id) => have.has(id));
}

/** Repairs the shape of saved artwork (absent stays absent; unknown placements and lost assets are dropped). */
export function normalizeArtwork(art: ProjectArtwork | undefined): ProjectArtwork | undefined {
  if (!art || typeof art !== "object") return undefined;
  const assets = (Array.isArray(art.assets) ? art.assets : []).filter((a) => a && typeof a.id === "string" && a.widthPx > 0 && a.heightPx > 0);
  const have = new Set(assets.map((a) => a.id));
  const placements = (Array.isArray(art.placements) ? art.placements : []).filter(
    (p) => p && ["cover", "background", "illustration"].includes(p.use) && have.has(p.assetId) && Array.isArray(p.targets),
  ).map((p) => (p.use === "illustration" ? p : { ...p, crop: normalizeCrop(p.crop) }));
  return { assets, placements };
}
