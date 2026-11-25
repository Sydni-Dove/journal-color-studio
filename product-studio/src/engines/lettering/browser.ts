/**
 * The browser side of bubble lettering: load the bundled font, read an image's pixels (scaled down for very large
 * images, with the resolution adjusted to match), and draw the lettering as a print-resolution PNG from the same paths
 * as the SVG.
 */
import opentype, { type Font } from "opentype.js";
import fontUrl from "@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url";
import { PRINT_DPI, type LetteringLayout, type Pixels } from "./bubble";

let fontPromise: Promise<Font> | null = null;
export function loadLetteringFont(): Promise<Font> {
  fontPromise ??= fetch(fontUrl)
    .then((r) => r.arrayBuffer())
    .then((b) => opentype.parse(b))
    .catch((e) => {
      fontPromise = null;
      throw e;
    });
  return fontPromise;
}

/** Largest side read when measuring (larger images are scaled down; the resolution is scaled with them). */
const MEASURE_MAX_PX = 2400;

/** An image's pixels for measuring, and the scale it was read at (1 = full size). */
export async function readPixels(blob: Blob, maxPx = MEASURE_MAX_PX): Promise<{ pixels: Pixels; scale: number; widthPx: number; heightPx: number }> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, w, h);
  const out = { pixels: { width: w, height: h, data: x.getImageData(0, 0, w, h).data }, scale, widthPx: bmp.width, heightPx: bmp.height };
  bmp.close();
  return out;
}

/** The lettering as a PNG at print resolution: black outline, white inside, transparent (or white) elsewhere. */
export async function letteringPng(layout: LetteringLayout, opts: { dpi?: number; background?: "white" | "none" } = {}): Promise<Blob> {
  const dpi = opts.dpi ?? PRINT_DPI;
  const k = dpi / 72;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(layout.widthIn * dpi));
  c.height = Math.max(1, Math.round(layout.heightIn * dpi));
  const x = c.getContext("2d")!;
  if (opts.background === "white") {
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, c.width, c.height);
  }
  x.scale(k, k);
  x.lineJoin = "round";
  x.lineCap = "round";
  const path = new Path2D(layout.d);
  x.fillStyle = x.strokeStyle = "#000000";
  x.lineWidth = layout.blackStrokePt;
  x.fill(path, "nonzero");
  x.stroke(path);
  x.fillStyle = x.strokeStyle = "#ffffff";
  x.fill(path, "nonzero");
  if (layout.whiteStrokePt > 0) {
    x.lineWidth = layout.whiteStrokePt;
    x.stroke(path);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The PNG couldn't be made."))), "image/png"));
}

/** Save a file to the person's device. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Pixels → a PNG file. */
export function pixelsToPng(p: Pixels): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The PNG couldn't be made."))), "image/png"));
}
