/**
 * RASTER RECOLOR ENGINE (browser I/O). Loads a design-library snapshot,
 * crops/scales it to a physical size, runs the pure recolor math
 * (recolorMath.ts) and caches the result by content key.
 *
 * Formats (defined by the snapshot assets, implemented here independently):
 *   marble  layer map R = stone detail, G = vein coverage, B = highlight coverage,
 *           optionally with real vein artwork drawn over the recolored stone
 *   floral  full-colour art with alpha; Lab tone transfer per colour family
 *
 * Output is identical for preview and print because both read the same
 * cache entry (print waits for prepareRasters before opening the dialog).
 */
import { findAsset, type MarbleAsset } from "../design-library/library";
import { jcsPaletteRoles } from "../design-library/palettes";
import { floralSoftFill, marbleLUTs, marbleStats, paintMarblePixels, toneTransferPixels, veinCoverage, type MarbleStats } from "./recolorMath";

export type RasterRequest = {
  assetId: string;
  pxW: number;
  pxH: number;
  /** cover = crop to fill (materials); stretch = the whole artwork into its own-aspect rect (objects). */
  fit: "cover" | "stretch";
  /** Zoom into the artwork (1 = cover-fit). Materials only. */
  zoom: number;
  /** Role colors as hex. */
  roles: { base: string; vein: string; highlight: string; deep: string; paper: string };
};

/** Marble stone texture / vein strength used by the approved designs (JCS defaults: texture 60, veins 100). */
const MARBLE_TEXTURE = 0.6;
const MARBLE_VEIN_STRENGTH = 1;
/** Width of the sample JCS measures marble statistics on. */
const MARBLE_STATS_PX = 240;

export const rasterKey = (r: RasterRequest) => JSON.stringify([r.assetId, r.pxW, r.pxH, r.fit, +r.zoom.toFixed(3), r.roles]);

const done = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const images = new Map<string, Promise<HTMLImageElement>>();
const stats = new Map<string, MarbleStats>();
const listeners = new Set<() => void>();

export function onRasterReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function rasterUrl(r: RasterRequest): string | undefined {
  return done.get(rasterKey(r));
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

function statsFor(asset: MarbleAsset, img: HTMLImageElement): MarbleStats {
  let s = stats.get(asset.id);
  if (!s) {
    const w = MARBLE_STATS_PX, h = Math.round((w * img.naturalHeight) / img.naturalWidth);
    s = marbleStats(pixels(img, w, h, "cover", 1).data.data);
    stats.set(asset.id, s);
  }
  return s;
}

async function renderMarble(asset: MarbleAsset, img: HTMLImageElement, r: RasterRequest, w: number, h: number) {
  const out = pixels(img, w, h, "cover", r.zoom);
  const map = new Uint8ClampedArray(out.data.data);
  const luts = marbleLUTs(statsFor(asset, img), { stone: r.roles.base, vein: r.roles.vein, highlight: r.roles.highlight }, MARBLE_TEXTURE);
  paintMarblePixels(out.data.data, luts, MARBLE_VEIN_STRENGTH, !asset.veins);
  out.ctx.putImageData(out.data, 0, 0);
  if (asset.veins) {
    // Real vein artwork, cropped exactly like the layer map (the two share one frame).
    const veinImg = await loadImage(asset.veins.url);
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

function renderFloral(img: HTMLImageElement, r: RasterRequest, w: number, h: number) {
  const out = pixels(img, w, h, r.fit, r.zoom);
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
    p = loadImage(asset.url).then(async (img) => {
      const c = asset.type === "marble" ? await renderMarble(asset, img, r, w, h) : renderFloral(img, r, w, h);
      const url = await toUrl(c, asset.type === "floral");
      done.set(key, url);
      pending.delete(key);
      listeners.forEach((fn) => fn());
      return url;
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
