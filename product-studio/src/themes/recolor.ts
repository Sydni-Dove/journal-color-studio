/**
 * RASTER RECOLOR ENGINE (browser). Turns a design-library snapshot plus role
 * colors into a recolored bitmap at a physical size, cached by content key.
 *
 * Formats (defined by the snapshot assets, implemented here independently):
 *   marble  R = stone detail, G = vein coverage, B = highlight coverage
 *   floral  full-color art; each pixel's hue family maps to a role
 *
 * Output is identical for preview and print because both read the same
 * cache entry (print waits for prepareRasters before opening the dialog).
 */
import { findAsset, type FloralAsset, type MarbleAsset } from "../design-library/library";

export type RasterRequest = {
  assetId: string;
  pxW: number;
  pxH: number;
  /** Zoom into the artwork (1 = cover-fit). */
  zoom: number;
  /** Role colors as hex. */
  roles: { base: string; vein: string; highlight: string; deep: string; paper: string };
};

/** Marble texture strength / vein strength used by the approved designs (JCS defaults). */
const MARBLE_TEXTURE = 0.6;
const MARBLE_VEIN_STRENGTH = 1;

export const rasterKey = (r: RasterRequest) => JSON.stringify([r.assetId, r.pxW, r.pxH, +r.zoom.toFixed(3), r.roles]);

const done = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const images = new Map<string, Promise<HTMLImageElement>>();
const listeners = new Set<() => void>();

export function onRasterReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function rasterUrl(r: RasterRequest): string | undefined {
  return done.get(rasterKey(r));
}

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

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

/** Draw the artwork cover-cropped (and zoomed) into a w×h canvas; return its pixels. */
function coverPixels(img: HTMLImageElement, w: number, h: number, zoom: number): { canvas: HTMLCanvasElement; data: ImageData } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > r) sw = sh * r;
  else sh = sw / r;
  sw /= Math.max(1, zoom);
  sh /= Math.max(1, zoom);
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return { canvas: c, data: ctx.getImageData(0, 0, w, h) };
}

function recolorMarble(asset: MarbleAsset, data: ImageData, roles: RasterRequest["roles"]) {
  const d = data.data;
  const stone = hexRgb(roles.base), vein = hexRgb(roles.vein), hi = hexRgb(roles.highlight);
  const stoneLum = (stone[0] * 0.2126 + stone[1] * 0.7152 + stone[2] * 0.0722) / 255;
  const isLight = stoneLum > 0.5;
  // Dark stone lightens where the texture rises; light stone darkens slightly.
  const shadow = stone.map((c) => (isLight ? mix(c, 255, 0.25 * MARBLE_TEXTURE) : c * (1 - 0.45 * MARBLE_TEXTURE)));
  const light = stone.map((c) => (isLight ? c * (1 - 0.2 * MARBLE_TEXTURE) : mix(c, 255, 0.38 * MARBLE_TEXTURE)));
  for (let i = 0; i < d.length; i += 4) {
    const det = d[i] / 255, g = (d[i + 1] / 255) * MARBLE_VEIN_STRENGTH, cr = (d[i + 2] / 255) * MARBLE_VEIN_STRENGTH;
    const shade = asset.shadeBase + asset.shadeAmt * det;
    for (let k = 0; k < 3; k++) {
      let v = mix(shadow[k], light[k], det);
      v = mix(v, Math.min(255, vein[k] * shade), g);
      v = mix(v, hi[k], cr);
      d[i + k] = v;
    }
    d[i + 3] = 255;
  }
}

function recolorFloral(data: ImageData, roles: RasterRequest["roles"]) {
  const d = data.data;
  const deep = hexRgb(roles.deep), soft = hexRgb(roles.highlight), gold = hexRgb(roles.vein), leaf = hexRgb(roles.base), paper = hexRgb(roles.paper);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
    const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), l = (mx + mn) / 2;
    let hue = 0, sat = 0;
    if (mx !== mn) {
      const dl = mx - mn;
      sat = l > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn);
      hue = (mx === r0 ? (g0 - b0) / dl + (g0 < b0 ? 6 : 0) : mx === g0 ? (b0 - r0) / dl + 2 : (r0 - g0) / dl + 4) * 60;
    }
    let target: number[] | null = null;
    if (l > 0.93 && sat < 0.15) target = paper;
    else if (sat < 0.08 || l < 0.06) target = null;
    else if (hue >= 60 && hue < 170) target = leaf;
    else if (hue >= 30 && hue < 60) target = gold;
    else if (hue < 30 || hue >= 300) target = l > 0.55 ? soft : deep;
    else target = soft;
    if (target) {
      const f = Math.min(1, Math.max(0.05, sat * 1.3));
      d[i] = mix(d[i], target[0], f);
      d[i + 1] = mix(d[i + 1], target[1], f);
      d[i + 2] = mix(d[i + 2], target[2], f);
    }
  }
}

function toUrl(canvas: HTMLCanvasElement, alpha: boolean): Promise<string> {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error("Recolor failed"))), alpha ? "image/png" : "image/jpeg", 0.92),
  );
}

export function ensureRaster(r: RasterRequest): Promise<string> {
  const key = rasterKey(r);
  const hit = done.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    const asset = findAsset(r.assetId);
    if (!asset || asset.type === "accent" || typeof document === "undefined") return Promise.reject(new Error("Raster recolor unavailable"));
    p = loadImage(asset.url).then(async (img) => {
      const { canvas, data } = coverPixels(img, Math.max(1, Math.round(r.pxW)), Math.max(1, Math.round(r.pxH)), r.zoom);
      if (asset.type === "marble") recolorMarble(asset, data, r.roles);
      else recolorFloral(data, r.roles);
      canvas.getContext("2d")!.putImageData(data, 0, 0);
      const url = await toUrl(canvas, asset.type === "floral" && (asset as FloralAsset).usage !== "bouquet");
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
