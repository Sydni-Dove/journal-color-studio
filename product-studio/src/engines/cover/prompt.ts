/**
 * COVER STUDIO — the creative prompt. One finished-cover prompt per design direction, built from the brief, the
 * palette's exact hex values and the production specification (engines/cover/spec.ts). The wording is the stationery
 * cover generator's, including the prohibitions that came from covers Sydni rejected (generic sunrise / mountain
 * scenes, stacked books, faux antique parchment and ornate filler, a title that says "Untitled").
 *
 * Guards (never bypassed): no prompt is built without a cover title, and a full wrap without a printer-confirmed
 * spine width is described as an unconfirmed concept, never as print-ready.
 */
import { brandedName } from "../../design-library/colorNames";
import { COVER_PALETTES } from "../../presets/themes/palettes";
import type { ColorPalette } from "../../types/tokens";
import type { CoverBrief, CoverItem } from "./brief";
import { DIRECTIONS, GENERIC_STYLE_GUIDE, STYLE_GUIDES } from "./guides";
import { fmt, resolveCoverSpec } from "./spec";

const HEX = /^#[0-9a-f]{6}$/i;

/** The palette as the prompt describes it: its exact hex colors, in the order they matter, and what each is for. */
export type PaletteSummary = {
  name: string;
  group: string;
  colors: string[];
  main: string;
  accent: string;
  background: string;
  ink: string;
  /** Veins or fine detail, for palettes that have a separate one (marbles, Journal Color Studio palettes). */
  detail: string | null;
  draft: boolean;
};

export function groupOf(p: ColorPalette): string {
  if (p.id.startsWith("variant-")) return "Product Studio drafts";
  if (p.source) return p.group === "family" ? "Journal Color Studio · Color families" : "Journal Color Studio";
  return "Product Studio";
}

export function summarizePalette(p: ColorPalette): PaletteSummary {
  const c = p.colors;
  const colors = [...new Set([c.primary, c.decorBase, c.decorativeAccent, c.decorHighlight, c.accent, c.secondary, c.background].filter((h) => HEX.test(h)).map((h) => h.toUpperCase()))];
  const detail = p.source && HEX.test(c.decorativeAccent) && c.decorativeAccent.toUpperCase() !== c.accent.toUpperCase() ? c.decorativeAccent.toUpperCase() : null;
  return {
    name: brandedName(p), group: groupOf(p), colors, main: c.primary.toUpperCase(), accent: c.accent.toUpperCase(), background: c.background.toUpperCase(),
    ink: (HEX.test(c.text) ? c.text : c.secondary).toUpperCase(), detail, draft: /\bdraft\b/i.test(p.label),
  };
}

/** The four colors of a custom palette. */
export const customColors = (b: CoverBrief): string[] => [b.colorPrimary, b.colorAccent, b.colorPaper, b.colorText];

/** The colors to show as swatches for the brief's palette. */
export function paletteColors(b: CoverBrief): string[] {
  if (b.palette === "custom") return customColors(b);
  const p = COVER_PALETTES.find((x) => x.id === b.palette);
  return p ? summarizePalette(p).colors : [];
}

export function paletteSpec(b: CoverBrief): string {
  if (b.palette === "custom")
    return `Use these exact custom colors: main ${b.colorPrimary}, accent ${b.colorAccent}, background ${b.colorPaper}, text ${b.colorText}. Do not substitute approximate shades. Keep title contrast clear.`;
  const palette = COVER_PALETTES.find((p) => p.id === b.palette);
  if (!palette) return "Use a restrained palette with a clear text/background contrast.";
  const s = summarizePalette(palette);
  return `Use the exact ${s.name} palette from ${s.group}: ${s.colors.join(", ")}. Role guidance: main ${s.main}, accent ${s.accent}, background ${s.background}, title/ink ${s.ink}${s.detail ? ", veins or fine detail " + s.detail : ""}. Preserve the palette relationship and readable contrast; do not introduce unrelated colors.`;
}

/** Why a prompt cannot be built yet (null = it can). Shown to the maker, and enforced before anything is copied or sent. */
export function promptBlocker(b: CoverBrief): string | null {
  return b.title.trim() ? null : "Add a cover title: the prompt never uses a placeholder title.";
}

/** Why a cover cannot be handed to an image generator (null = it can): the title, and the printer's spine for a full wrap. */
export function createBlocker(b: CoverBrief, item?: CoverItem): string | null {
  const t = promptBlocker(b);
  if (t) return t;
  const spec = resolveCoverSpec(b, item);
  if (!spec.ok) return spec.errors[0];
  if (spec.needsSpine) return "Enter the printer-confirmed spine width for a full wrap.";
  return null;
}

export function promptFor(b: CoverBrief, direction = 0, item?: Pick<CoverItem, "product" | "size">): string {
  const spec = resolveCoverSpec(b, item);
  const product = spec.product;
  const w = spec.trimW, h = spec.trimH, bleed = spec.bleed, sp = spec.spine ?? 0, wrap = spec.wrap;
  const cw = spec.canvasW, ch = spec.canvasH, dpi = spec.dpi;
  const notary = product.toLowerCase().includes("notary");
  const palette = paletteSpec(b);
  const layout = DIRECTIONS[direction] ?? DIRECTIONS[0];
  const title = b.title.trim() || "[TITLE REQUIRED]";
  return `Create ONE ${product.toLowerCase()} ${wrap ? "flat full-wrap cover spread" : "flat front-cover design"} for Etsy. This is a finished cover concept, not a product mockup. The design must feel like a purposeful piece of editorial stationery, with a strong focal point and clear title hierarchy.

DESIGN RECIPE
Chosen visual language: ${b.style}. ${STYLE_GUIDES[b.style] || GENERIC_STYLE_GUIDE}
Chosen composition: ${layout[0]}. ${layout[1]} Apply this composition in a way that suits the selected visual language; make it clearly different from the other directions.
Palette: ${palette} Keep color choices coherent; avoid adding all accents at once.
Theme: ${b.theme || "reflection and purposeful planning"}. Audience: ${b.audience || "adult readers"}. Collection: ${b.collection || "new stationery collection"}${b.season ? ", " + b.season : ""}.
Requested imagery: ${b.imagery || "none; let type, shapes, or material texture carry the design"}. Imagery is optional. Do not invent scenery or symbolic objects to fill space.

TYPE & CONTENT
Exact cover title: “${title}”. Subtitle: “${b.subtitle}”. Scripture or phrase: “${b.scripture}”. Give the title visual priority; make supporting text clearly secondary. Use a display serif, expressive script, or modern sans only where it serves the selected style. Never insert “Untitled,” extra verses, fake author names, or filler text. If image rendering cannot reproduce the wording accurately, leave a clean title area and provide a separate exact text-overlay plan.

PRODUCTION GEOMETRY
Product: ${product}. Finished trim: ${fmt(w)} × ${fmt(h)} inches${wrap ? " per panel" : ""}. Format: ${wrap ? "flat back + spine + front spread" : "front only"}. Outer bleed: ${fmt(bleed)} inches per edge. Target canvas: ${fmt(cw)} × ${fmt(ch)} inches; ${Math.round(cw * dpi)} × ${Math.round(ch * dpi)} pixels at ${dpi} DPI. Keep all title and important details ${spec.safeText}. Delivery: ${b.medium}. Binding: ${b.binding}. Page count: ${b.pages || "not applicable"}. ${wrap ? "Spine: " + (sp ? fmt(sp) + " inches; keep text clear of the folds." : "Spine width is unconfirmed; this concept is NOT a final print-ready wrap.") : "No spine on this canvas."} Do not draw crop marks, a fake binding, or a 3D book. If the image tool cannot output these exact pixels, create the best proportional artwork and state the actual pixel size; do not claim it is print-ready.

QUALITY GATES
Avoid: ${b.avoid || "generic scenery and decorative filler"}. No generic sunrise, mountains, stacked books, clip-art foliage, antique parchment, ornate corner decoration, or random gold flourish unless explicitly requested above. No watermark. Maintain readable contrast. ${notary ? "For this notary product, keep a precise professional appearance and do not imply a government endorsement or invent a jurisdiction." : "For this faith-based product, do not add crosses, doves, or other religious symbols unless requested."}

After the image, briefly identify the actual output size, any text that needs manual typesetting, and any production detail still needing printer confirmation.`;
}

/** The message sent to an image generator (the prompt with the one-line instruction the generator used). */
export function handoffPrompt(b: CoverBrief, direction: number): string {
  return "Please create a polished cover image from this brief. Preserve the exact production dimensions in your output and tell me if the print specification needs clarification.\n\n" + promptFor(b, direction);
}

/** Every item of the set as its own prompt, in order, separated the way the generator separated them. */
export function setPrompts(b: CoverBrief, items: CoverItem[], direction: number): string {
  return items.map((x) => promptFor(b, direction, x)).join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
}
