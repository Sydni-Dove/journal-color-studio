/**
 * ARTWORK FILES — the uploaded images themselves, kept on this device in the
 * browser's IndexedDB (localStorage is far too small for print-size images),
 * keyed by the content id stored in the project. The original file is kept
 * byte for byte: nothing is re-encoded, so a transparent PNG stays
 * transparent and nothing loses print resolution.
 *
 * Where IndexedDB isn't available (tests, a private window that blocks it)
 * the files are held in memory for the session.
 */
import { useSyncExternalStore } from "react";
import type { ArtworkAsset, ArtworkMime } from "../../types/artwork";

const DB_NAME = "dove-product-studio-artwork";
const STORE = "files";
/** Largest file accepted (bytes). */
export const MAX_ARTWORK_BYTES = 40 * 1024 * 1024;
/** Largest image accepted (pixels on the long side). Browsers can't reliably draw bigger. */
export const MAX_ARTWORK_PX = 12_000;

const memory = new Map<string, Blob>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const req = run(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Keeps a file on this device. Resolves false when it could not be stored anywhere but memory. */
export async function putArtworkFile(id: string, blob: Blob): Promise<boolean> {
  memory.set(id, blob);
  const ok = await idb("readwrite", (s) => s.put(blob, id));
  return ok !== undefined;
}

export async function getArtworkFile(id: string): Promise<Blob | null> {
  const m = memory.get(id);
  if (m) return m;
  const b = await idb<Blob>("readonly", (s) => s.get(id) as IDBRequest<Blob>);
  if (b) memory.set(id, b);
  return b ?? null;
}

// ---- Image URLs for drawing (shared by the preview and print) -------------------------------

type UrlState = { url: string | null; missing: boolean };
const urls = new Map<string, UrlState>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Test seam: an image already known by URL (a data: URL in tests). */
export function setArtworkUrl(id: string, url: string | null) {
  urls.set(id, { url, missing: !url });
  notify();
}

function load(id: string) {
  if (urls.has(id) || loading.has(id)) return;
  loading.add(id);
  void getArtworkFile(id).then((blob) => {
    loading.delete(id);
    urls.set(id, blob ? { url: URL.createObjectURL(blob), missing: false } : { url: null, missing: true });
    notify();
  });
}

const PENDING: UrlState = { url: null, missing: false };
/** The drawable URL of a stored image: null while it loads; `missing` when this device doesn't have it. */
export function useArtworkUrl(id: string): UrlState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      load(id);
      return () => listeners.delete(l);
    },
    () => urls.get(id) ?? PENDING,
    () => urls.get(id) ?? PENDING,
  );
}

/** Loads every listed image; resolves with the ids this device doesn't have. */
export async function ensureArtworkLoaded(ids: string[]): Promise<string[]> {
  await Promise.all(
    ids.map(async (id) => {
      if (urls.get(id)?.url) return;
      const blob = await getArtworkFile(id);
      urls.set(id, blob ? { url: URL.createObjectURL(blob), missing: false } : { url: null, missing: true });
    }),
  );
  notify();
  return ids.filter((id) => !urls.get(id)?.url);
}

// ---- Reading an uploaded file ---------------------------------------------------------------

/** The image type from the file's first bytes (never trusts the file name). */
export function sniffMime(b: Uint8Array): ArtworkMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

/** Pixel size and transparency, read from the file header (PNG IHDR, JPEG SOF, WebP VP8 / VP8L / VP8X). */
export function readHeader(b: Uint8Array, mime: ArtworkMime): { widthPx: number; heightPx: number; hasAlpha: boolean } | null {
  if (mime === "image/png") {
    if (b.length < 33) return null;
    const colorType = b[25];
    // Alpha channel (types 4 and 6), or a transparency chunk before the image data.
    let alpha = colorType === 4 || colorType === 6;
    for (let o = 8; !alpha && o + 8 <= b.length; ) {
      const len = u32be(b, o), type = String.fromCharCode(...b.subarray(o + 4, o + 8));
      if (type === "tRNS") alpha = true;
      if (type === "IDAT" || type === "IEND") break;
      o += 12 + len;
    }
    return { widthPx: u32be(b, 16), heightPx: u32be(b, 20), hasAlpha: alpha };
  }
  if (mime === "image/jpeg") {
    for (let o = 2; o + 9 < b.length; ) {
      if (b[o] !== 0xff) return null;
      const m = b[o + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = (b[o + 2] << 8) | b[o + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { heightPx: (b[o + 5] << 8) | b[o + 6], widthPx: (b[o + 7] << 8) | b[o + 8], hasAlpha: false };
      o += 2 + len;
    }
    return null;
  }
  const chunk = String.fromCharCode(...b.subarray(12, 16));
  if (chunk === "VP8X" && b.length >= 30) return { widthPx: u24le(b, 24) + 1, heightPx: u24le(b, 27) + 1, hasAlpha: (b[20] & 0x10) !== 0 };
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { widthPx: (bits & 0x3fff) + 1, heightPx: ((bits >> 14) & 0x3fff) + 1, hasAlpha: ((bits >> 28) & 1) === 1 };
  }
  if (chunk === "VP8 " && b.length >= 30) return { widthPx: (b[26] | (b[27] << 8)) & 0x3fff, heightPx: (b[28] | (b[29] << 8)) & 0x3fff, hasAlpha: false };
  return null;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * The edges a transparent image's design is cut off along: an edge where a real share of the pixels is opaque.
 * Read from a small copy drawn by the browser; undefined where the browser can't decode images (tests).
 */
export async function findCutEdges(blob: Blob, w: number, h: number): Promise<ArtworkAsset["cutEdges"]> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return undefined;
    const k = Math.min(1, 400 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const bmp = await createImageBitmap(blob, { resizeWidth: cw, resizeHeight: ch, resizeQuality: "low" });
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    const alpha = (x: number, y: number) => d[(y * cw + x) * 4 + 3];
    const share = (n: number, at: (i: number) => number) => {
      let on = 0;
      for (let i = 0; i < n; i++) if (at(i) > 128) on++;
      return on / n;
    };
    const out: ("top" | "bottom" | "left" | "right")[] = [];
    if (share(cw, (i) => alpha(i, 0)) > 0.04) out.push("top");
    if (share(cw, (i) => alpha(i, ch - 1)) > 0.04) out.push("bottom");
    if (share(ch, (i) => alpha(0, i)) > 0.04) out.push("left");
    if (share(ch, (i) => alpha(cw - 1, i)) > 0.04) out.push("right");
    return out;
  } catch {
    return undefined;
  }
}

export type ImportResult = { ok: true; asset: ArtworkAsset; savedOnDevice: boolean } | { ok: false; error: string };

/** Checks an uploaded file (PNG, JPG or WebP; size; dimensions), keeps it on this device and describes it. */
export async function importArtwork(file: Blob & { name?: string }): Promise<ImportResult> {
  if (file.size > MAX_ARTWORK_BYTES) return { ok: false, error: `That file is ${(file.size / 1048576).toFixed(0)} MB. Artwork can be up to ${MAX_ARTWORK_BYTES / 1048576} MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, error: "That file isn't a PNG, JPG or WebP image." };
  const head = readHeader(bytes, mime);
  if (!head || !head.widthPx || !head.heightPx) return { ok: false, error: "The image couldn't be read. Try saving it again as PNG or JPG." };
  if (Math.max(head.widthPx, head.heightPx) > MAX_ARTWORK_PX) return { ok: false, error: `The image is ${head.widthPx} × ${head.heightPx} pixels. Images up to ${MAX_ARTWORK_PX.toLocaleString()} pixels on the long side can be used.` };
  const id = await sha256(bytes);
  const blob = new Blob([bytes], { type: mime });
  const savedOnDevice = await putArtworkFile(id, blob);
  const cutEdges = head.hasAlpha ? await findCutEdges(blob, head.widthPx, head.heightPx) : undefined;
  if (!urls.get(id)?.url && typeof URL.createObjectURL === "function") urls.set(id, { url: URL.createObjectURL(blob), missing: false });
  notify();
  return {
    ok: true,
    savedOnDevice,
    asset: { id, name: (file.name ?? "Artwork").slice(0, 120), mime, widthPx: head.widthPx, heightPx: head.heightPx, hasAlpha: head.hasAlpha, bytes: bytes.length, addedAt: new Date().toISOString(), ...(cutEdges?.length ? { cutEdges } : {}) },
  };
}
