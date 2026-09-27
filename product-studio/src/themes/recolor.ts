/**
 * RASTER RECOLOR ENGINE (browser I/O). Loads a design-library snapshot,
 * crops/scales it to a physical size, runs the pure recolor math
 * (recolorMath.ts) and caches the result by content key.
 *
 * Formats (defined by the snapshot assets, implemented here independently):
 *   marble  layer map R = stone detail, G = vein coverage, B = highlight coverage,
 *           optionally with real vein artwork drawn over the recolored stone
 *   floral  full-colour art with alpha; Lab tone transfer per colour family
 *   pattern ink map (0 = ground, 255 = ink) rebuilt between two roles
 *
 * Output is identical for preview and print because both read the same
 * cache entry (print waits for prepareRasters before opening the dialog).
 */
import { findAsset, type MarbleAsset } from "../design-library/library";
import { jcsPaletteRoles } from "../design-library/palettes";
import { floralSoftFill, marbleLUTs, marbleStats, paintMarblePixels, paintPatternPixels, toneTransferPixels, veinCoverage, type MarbleStats } from "./recolorMath";

export type RasterRequest = {
  assetId: string;
  pxW: number;
  pxH: number;
  /** cover = crop to fill (materials); stretch = the whole artwork into its own-aspect rect (objects). */
  fit: "cover" | "stretch";
  /** Zoom into the artwork (1 = cover-fit). Materials only. */
  zoom: number;
  /** Role colors as hex (patterns: base = ground, vein = ink). */
  roles: { base: string; vein: string; highlight: string; deep: string; paper: string };
  /** Render from the small derived picker thumbnail instead of the print artwork (editor thumbnails only). */
  thumb?: boolean;
  /** Keep the artwork's own colors (florals "As designed"): no recolor. */
  original?: boolean;
};

/** Marble stone texture / vein strength used by the approved designs (JCS defaults: texture 60, veins 100). */
const MARBLE_TEXTURE = 0.6;
const MARBLE_VEIN_STRENGTH = 1;
/** Width of the sample JCS measures marble statistics on. */
const MARBLE_STATS_PX = 240;

export const rasterKey = (r: RasterRequest) => JSON.stringify([r.assetId, r.pxW, r.pxH, r.fit, +r.zoom.toFixed(3), r.roles, !!r.thumb, !!r.original]);

/** Recolored results kept (LRU). Each entry is a blob URL; old ones are revoked. */
const MAX_DONE = 400;

const done = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const images = new Map<string, Promise<HTMLImageElement>>();
const stats = new Map<string, MarbleStats>();
const listeners = new Set<() => void>();

/** Recolor timings (profiling: palette / background switches). */
const timings: { assetId: string; px: number; ms: number; thumb: boolean }[] = [];
export const rasterTimings = () => timings.slice();
if (typeof window !== "undefined") (window as unknown as { __psRasterTimings?: () => typeof timings }).__psRasterTimings = rasterTimings;

export function onRasterReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function rasterUrl(r: RasterRequest): string | undefined {
  const key = rasterKey(r), url = done.get(key);
  if (url) {
    // Most recently used goes last, so eviction only ever drops rasters nothing has shown lately.
    done.delete(key);
    done.set(key, url);
  }
  return url;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`Could not load ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { c, ctx };
}

/** Draw the artwork into a w×h canvas — cover-cropped (and zoomed) or whole — and return its pixels. */
function pixels(img: HTMLImageElement, w: number, h: number, fit: RasterRequest["fit"], zoom: number) {
  const { c, ctx } = canvas(w, h);
  if (fit === "stretch") ctx.drawImage(img, 0, 0, w, h);
  else {
    const ir = img.naturalWidth / img.naturalHeight, r = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (ir > r) sw = sh * r;
    else sh = sw / r;
    sw /= Math.max(1, zoom);
    sh /= Math.max(1, zoom);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
  }
  return { canvas: c, ctx, data: ctx.getImageData(0, 0, w, h) };
}

/**
 * Tone statistics of the WHOLE layer map (a thumbnail is a centre crop, whose
 * own statistics would differ). Pages measure the print map, as JCS does;
 * thumbnails measure its whole-frame 240 px sample, so opening the picker never
 * decodes the multi-megabyte print files.
 */
async function statsFor(asset: MarbleAsset, img: HTMLImageElement, thumb: boolean): Promise<MarbleStats> {
  const key = thumb && asset.statsSample ? `${asset.id}:sample` : asset.id;
  let s = stats.get(key);
  if (!s) {
    const full = thumb ? await loadImage(asset.statsSample ?? asset.url) : img;
    const w = MARBLE_STATS_PX, h = Math.round((w * full.naturalHeight) / full.naturalWidth);
    s = marbleStats(pixels(full, w, h, "cover", 1).data.data);
    stats.set(key, s);
  }
  return s;
}

async function renderMarble(asset: MarbleAsset, img: HTMLImageElement, r: RasterRequest, w: number, h: number) {
  const out = pixels(img, w, h, "cover", r.zoom);
  const map = new Uint8ClampedArray(out.data.data);
  const luts = marbleLUTs(await statsFor(asset, img, !!r.thumb), { stone: r.roles.base, vein: r.roles.vein, highlight: r.roles.highlight }, MARBLE_TEXTURE, asset.texScale ?? 1);
  // A transparent overlay carries only the seams: the second stone (map B) is painted under it.
  paintMarblePixels(out.data.data, luts, MARBLE_VEIN_STRENGTH, !asset.veins, !!asset.veins?.alpha);
  out.ctx.putImageData(out.data, 0, 0);
  if (asset.veins) {
    // Real vein artwork, cropped exactly like the layer map (the two share one frame).
    const veinImg = await loadImage(r.thumb && asset.veins.thumb ? asset.veins.thumb : asset.veins.url);
    const v = pixels(veinImg, w, h, "cover", r.zoom);
    const own = jcsPaletteRoles(asset.veins.originalPalette);
    const original = !!own && own.vein.toLowerCase() === r.roles.vein.toLowerCase() && own.highlight.toLowerCase() === r.roles.highlight.toLowerCase();
    if (!original) toneTransferPixels(v.data.data, "veins", { gold: r.roles.vein, light: r.roles.highlight, stone: r.roles.base });
    veinCoverage(v.data.data, map, asset.veins.alpha, MARBLE_VEIN_STRENGTH);
    v.ctx.putImageData(v.data, 0, 0);
    out.ctx.drawImage(v.canvas, 0, 0);
  }
  return out.canvas;
}

function renderPattern(img: HTMLImageElement, r: RasterRequest, w: number, h: number) {
  // Always cover-fitted: stripes keep their proportions in every band shape (never stretched).
  const out = pixels(img, w, h, "cover", r.zoom);
  paintPatternPixels(out.data.data, r.roles.base, r.roles.vein);
  out.ctx.putImageData(out.data, 0, 0);
  return out.canvas;
}

function renderFloral(img: HTMLImageElement, r: RasterRequest, w: number, h: number) {
  const out = pixels(img, w, h, r.fit, r.zoom);
  if (r.original) return out.canvas;
  toneTransferPixels(out.data.data, "floral", {
    paper: r.roles.paper,
    gold: r.roles.vein,
    leaf: r.roles.base,
    blush: floralSoftFill(r.roles.highlight, r.roles.paper, r.roles.deep),
    deep: r.roles.deep,
  });
  out.ctx.putImageData(out.data, 0, 0);
  return out.canvas;
}

function toUrl(c: HTMLCanvasElement, alpha: boolean): Promise<string> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error("Recolor failed"))), alpha ? "image/png" : "image/jpeg", 0.92));
}

export function ensureRaster(r: RasterRequest): Promise<string> {
  const key = rasterKey(r);
  const hit = done.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    const asset = findAsset(r.assetId);
    if (!asset || asset.type === "accent" || typeof document === "undefined") return Promise.reject(new Error("Raster recolor unavailable"));
    const w = Math.max(1, Math.round(r.pxW)), h = Math.max(1, Math.round(r.pxH));
    const src = r.thumb && asset.thumb ? asset.thumb : asset.url;
    p = loadImage(src).then(async (img) => {
      const t0 = performance.now();
      const c = asset.type === "marble" ? await renderMarble(asset, img, r, w, h) : asset.type === "pattern" ? renderPattern(img, r, w, h) : renderFloral(img, r, w, h);
      const url = await toUrl(c, asset.type === "floral");
      done.set(key, url);
      if (done.size > MAX_DONE) {
        const [oldKey, oldUrl] = done.entries().next().value!;
        done.delete(oldKey);
        URL.revokeObjectURL(oldUrl);
      }
      pending.delete(key);
      timings.push({ assetId: r.assetId, px: w * h, ms: performance.now() - t0, thumb: !!r.thumb });
      if (timings.length > 200) timings.shift();
      listeners.forEach((fn) => fn());
      return url;
    }).catch((e) => {
      pending.delete(key);
      throw e;
    });
    pending.set(key, p);
  }
  return p;
}

/** Wait for every raster a print job needs (print must never capture a placeholder). */
export async function prepareRasters(requests: RasterRequest[]): Promise<void> {
  const unique = new Map(requests.map((r) => [rasterKey(r), r]));
  await Promise.all([...unique.values()].map((r) => ensureRaster(r)));
}
