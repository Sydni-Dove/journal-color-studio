/**
 * COLOR NAMES — a palette described by what it looks like ("Burgundy + Cream
 * + Gold"), so a maker chooses by sight and plain words, with the branded name
 * second. Read-only: names are derived from the palette's own hex values.
 */
import type { ColorPalette } from "../types/tokens";

/** Named reference colors a maker would use, each with the family it is filtered under. */
const NAMED: { name: string; hex: string; family: ColorFamily }[] = [
  { name: "Burgundy", hex: "#630000", family: "Burgundy" },
  { name: "Wine", hex: "#5b0610", family: "Burgundy" },
  { name: "Red", hex: "#b3261e", family: "Burgundy" },
  { name: "Coral", hex: "#d96248", family: "Orange" },
  { name: "Terracotta", hex: "#c5674a", family: "Orange" },
  { name: "Orange", hex: "#e07a1f", family: "Orange" },
  { name: "Peach", hex: "#f2b38f", family: "Orange" },
  { name: "Gold", hex: "#e6a742", family: "Neutral" },
  { name: "Mustard", hex: "#c9a227", family: "Neutral" },
  { name: "Cream", hex: "#f4ecdc", family: "Neutral" },
  { name: "Ivory", hex: "#fbf7ee", family: "Neutral" },
  { name: "White", hex: "#fdfdfd", family: "Neutral" },
  { name: "Blush", hex: "#f2d8cd", family: "Pink" },
  { name: "Pink", hex: "#e89aae", family: "Pink" },
  { name: "Rose", hex: "#c46b7c", family: "Pink" },
  { name: "Mauve", hex: "#a57c8a", family: "Purple" },
  { name: "Plum", hex: "#5e2750", family: "Purple" },
  { name: "Purple", hex: "#6b4c9a", family: "Purple" },
  { name: "Lavender", hex: "#c7b8e0", family: "Purple" },
  { name: "Navy", hex: "#1f2d4d", family: "Blue" },
  { name: "Blue", hex: "#3c6ea8", family: "Blue" },
  { name: "Slate blue", hex: "#718496", family: "Blue" },
  { name: "Sky", hex: "#a9c9e2", family: "Blue" },
  { name: "Teal", hex: "#2f7a78", family: "Green" },
  { name: "Emerald", hex: "#1f5e45", family: "Green" },
  { name: "Sage", hex: "#9aaa8a", family: "Green" },
  { name: "Green", hex: "#4f7a3c", family: "Green" },
  { name: "Olive", hex: "#6f6a3a", family: "Green" },
  { name: "Brown", hex: "#6b4a33", family: "Neutral" },
  { name: "Tan", hex: "#d6a47c", family: "Neutral" },
  { name: "Taupe", hex: "#a3968a", family: "Neutral" },
  { name: "Gray", hex: "#8a8a8a", family: "Neutral" },
  { name: "Charcoal", hex: "#1b1717", family: "Neutral" },
  { name: "Black", hex: "#0a0a0a", family: "Neutral" },
];

export type ColorFamily = "Burgundy" | "Neutral" | "Pink" | "Orange" | "Blue" | "Green" | "Purple";
export const COLOR_FAMILIES: ColorFamily[] = ["Burgundy", "Neutral", "Pink", "Orange", "Blue", "Green", "Purple"];

const HEX = /^#([0-9a-f]{6})$/i;
function rgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceptual-ish distance (weighted RGB, "redmean"). */
function distance(a: [number, number, number], b: [number, number, number]): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function nearestName(hex: string): { name: string; family: ColorFamily } | null {
  const c = rgb(hex);
  if (!c) return null;
  let best = NAMED[0], d = Infinity;
  for (const n of NAMED) {
    const e = distance(c, rgb(n.hex)!);
    if (e < d) (d = e), (best = n);
  }
  return best;
}

/** The colors a maker sees first on a page: the main color, its accents, the paper. */
export function swatchesOf(p: ColorPalette): string[] {
  const c = p.colors;
  return [...new Set([c.primary, c.decorHighlight, c.accent, c.decorativeAccent, c.secondary, c.background].filter((h) => HEX.test(h)))].slice(0, 5);
}

/** "Burgundy + Cream + Gold": up to three distinct color words, main color first. */
export function describePalette(p: ColorPalette): string {
  const c = p.colors;
  const words: string[] = [];
  for (const h of [c.primary, c.decorHighlight, c.background, c.accent, c.decorativeAccent, c.secondary]) {
    const n = nearestName(h)?.name;
    if (!n || words.includes(n)) continue;
    // Plain white paper goes without saying.
    if (n === "White" && words.length) continue;
    words.push(n);
    if (words.length === 3) break;
  }
  return words.join(" + ");
}

/** The palette's own (branded) name, without the color list some labels carry. */
export const brandedName = (p: ColorPalette) => p.label.split(" — ")[0].replace(/\s*\((draft[^)]*)\)/i, "").trim();

/** The family a palette is filtered under: its main color's. */
export const familyOf = (p: ColorPalette): ColorFamily => nearestName(p.colors.primary)?.family ?? "Neutral";
