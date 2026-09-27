/**
 * CURATED DESIGN LIBRARY — what the editor offers, grouped the way a designer
 * thinks about it. The raw snapshot (library.ts) is never listed file by file.
 *
 *   BACKGROUND / SURFACE   Marble · Watercolor (Abstract) · Stripes · Solid
 *   DECORATIVE ELEMENTS    Floral · Line art
 *
 * A background is a surface the page is printed on (full background, header /
 * footer band, edge strip, margin frame). An element is a piece of artwork
 * placed against the page's structure (title rule, corner, edge, footer).
 */
import type { DecorativeStyle, DecorativeTheme } from "../types/theme";
import type { ColorToken } from "../types/tokens";
import { findAsset } from "./library";

export type CatalogDesign = { value: string; label: string; hint: string; style: DecorativeStyle; assetId?: string };
export type CatalogGroup = { id: string; label: string; designs: CatalogDesign[] };

const asset = (assetId: string, hint: string, label?: string): CatalogDesign => {
  const a = findAsset(assetId)!;
  return { value: assetId, label: label ?? a.label, hint, style: a.type, assetId };
};

export const BACKGROUND_GROUPS: CatalogGroup[] = [
  { id: "none", label: "None", designs: [{ value: "none", label: "None", hint: "Plain paper", style: "none" }] },
  {
    id: "marble",
    label: "Marble",
    designs: [
      asset("jcs-marble-rose", "Pink stone, gold seams", "Rose kintsugi"),
      asset("jcs-marble-burgundy", "Wine + cream, gold seams", "Burgundy + blush"),
      asset("jcs-marble-ember", "Black stone, glowing veins", "Black ember"),
      asset("jcs-marble-peach", "Coral + champagne, gold seams", "Peach kintsugi"),
      asset("jcs-marble-boldgold", "Flat stone, metallic veins", "Bold gold"),
      asset("jcs-marble-goldleaf", "Sweeping leaf veins", "Gold leaf"),
      asset("jcs-marble-veined", "Textured stone + cream", "Veined"),
      asset("jcs-marble-white", "Soft grey veining", "White"),
    ],
  },
  { id: "watercolor", label: "Watercolor", designs: [asset("jcs-watercolor-abstract", "Burgundy, blush + gold — your Canva page 64 art")] },
  {
    id: "stripes",
    label: "Stripes",
    designs: [asset("jcs-pattern-cabana", "Wide two-tone stripes", "Cabana"), asset("jcs-pattern-pinstripe", "Woven fabric stripes"), asset("jcs-pattern-bias", "Diagonal fabric stripes")],
  },
  { id: "solid", label: "Solid", designs: [{ value: "solid", label: "Solid color", hint: "One palette color", style: "solid" }] },
];

export const ELEMENT_GROUPS: CatalogGroup[] = [
  { id: "none", label: "None", designs: [{ value: "none", label: "None", hint: "No artwork", style: "none" }] },
  {
    id: "floral",
    label: "Floral",
    designs: [
      asset("jcs-floral-sprig", "Worn across the title rule", "Header sprigs"),
      asset("jcs-floral-bouquet", "Rule ornament, edge + footer flourish", "Bouquet"),
      asset("jcs-floral-corner", "Corner flourish", "Corner bouquet"),
    ],
  },
  {
    id: "line-art",
    label: "Line art",
    designs: [
      asset("jcs-accent-waves", "Header, footer + edge flourish"),
      asset("jcs-accent-topo", "Header, footer + edge flourish"),
      asset("jcs-accent-arcs", "Corner + edge flourish"),
      asset("jcs-accent-ribbon", "Corner + edge flourish"),
      asset("jcs-accent-dots", "Bands, border + corners"),
      asset("jcs-accent-stripes", "Bands, border + corners", "Stripe band"),
    ],
  },
];

export const designValue = (t: Pick<DecorativeTheme, "style" | "assetId">) => (t.assetId && t.style !== "solid" && t.style !== "none" ? t.assetId : t.style);
export const findDesign = (groups: CatalogGroup[], value: string) => groups.flatMap((g) => g.designs).find((d) => d.value === value);
export const groupOf = (groups: CatalogGroup[], value: string) => groups.find((g) => g.designs.some((d) => d.value === value)) ?? groups[0];

/** Default color roles of a design family (the roles its artwork is recolored onto). */
export function defaultRoles(style: DecorativeStyle): Pick<DecorativeTheme, "colorA" | "colorB" | "colorC"> {
  const r = (colorA: ColorToken, colorB: ColorToken, colorC: ColorToken) => ({ colorA, colorB, colorC });
  if (style === "pattern") return r("patternGround", "patternInk", "decorHighlight");
  if (style === "accent") return r("decorBase", "lineArt", "decorHighlight");
  return r("decorBase", "decorativeAccent", "decorHighlight");
}
