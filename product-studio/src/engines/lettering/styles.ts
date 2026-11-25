/**
 * Saved lettering styles ("presets"): kept on this device (localStorage), like the studio's other small settings.
 * The built-in Classic bubble is always offered. Every field is checked when read, so a damaged entry never breaks
 * the screen.
 */
import { DEFAULT_STYLE, type LetteringStyle } from "./bubble";

const KEY = "dove-product-studio:v1:lettering-styles";

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** A saved style, every number kept within the range its control offers. */
export function normalizeStyle(raw: unknown): LetteringStyle | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const c = r.canvas as Record<string, unknown> | undefined;
  const src = r.source as Record<string, unknown> | undefined;
  return {
    id: r.id, name: r.name,
    capHeightIn: num(r.capHeightIn, DEFAULT_STYLE.capHeightIn, 0.1, 10),
    outlinePt: num(r.outlinePt, DEFAULT_STYLE.outlinePt, 0.25, 24),
    puffIn: num(r.puffIn, DEFAULT_STYLE.puffIn, 0, 2),
    spacingIn: num(r.spacingIn, DEFAULT_STYLE.spacingIn, -3, 3),
    widthScale: num(r.widthScale, 1, 0.5, 2),
    lineGapIn: num(r.lineGapIn, DEFAULT_STYLE.lineGapIn, -2, 5),
    align: r.align === "left" || r.align === "right" ? r.align : "center",
    ...(c && typeof c.widthIn === "number" && typeof c.heightIn === "number" ? { canvas: { widthIn: num(c.widthIn, 1, 0.1, 60), heightIn: num(c.heightIn, 1, 0.1, 60) } } : {}),
    ...(src && typeof src.name === "string" ? { source: { name: src.name, widthPx: Number(src.widthPx) || 0, heightPx: Number(src.heightPx) || 0, dpi: Number(src.dpi) || 300, ...(typeof src.text === "string" ? { text: src.text } : {}) } } : {}),
    ...(r.measured && typeof r.measured === "object" ? { measured: r.measured as LetteringStyle["measured"] } : {}),
    ...(typeof r.createdAt === "string" ? { createdAt: r.createdAt } : {}),
  };
}

export function listStyles(): LetteringStyle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return (Array.isArray(raw) ? raw : []).flatMap((x) => normalizeStyle(x) ?? []);
  } catch {
    return [];
  }
}

/** Save (or replace, by id) a style. Throws when the browser refuses the write. */
export function saveStyle(s: LetteringStyle): LetteringStyle[] {
  const next = [...listStyles().filter((x) => x.id !== s.id), s];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteStyle(id: string): LetteringStyle[] {
  const next = listStyles().filter((x) => x.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
