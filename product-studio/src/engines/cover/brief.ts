/**
 * COVER STUDIO — the brief (everything the maker decides about one collection's covers) and the collection it is
 * saved in. Plain data, no UI. Numeric fields that can be "not entered yet" (the printer-confirmed spine width)
 * are null, never 0.
 */
import { DEFAULT_AVOID, DEFAULT_MOCKUPS, DEFAULT_SIZE, DEFAULT_STYLE, defaultBindingFor, type CoverProduct } from "./guides";

export type CoverFormat = "front" | "wrap";

/**
 * What is being designed (the first screen): a cover, art for interior pages, children's character illustrations,
 * or a coordinated collection. Briefs saved before categories existed are covers.
 */
export type CoverCategory = "cover" | "interior" | "character" | "collection";

export type CoverBrief = {
  category: CoverCategory;
  /** Lettering direction; "Let the style decide" adds nothing to the prompt. */
  typography: string;
  // Interior page design
  /** The kind of page the art is for ("Lined journal page", "Monthly calendar page"…). */
  pageKind: string;
  /** How the art is used on the page (one of ART_USES). */
  artUse: string;
  /** Where on the page the art sits ("Bottom right corner"…). */
  artPlacement: string;
  /** How much of the page is kept clear for the page's own lines, calendar and writing. */
  clearArea: string;
  // Children's character illustrations
  characters: string;
  ageGroup: string;
  expressions: string;
  characterCount: number;
  /** "transparent": cut-out characters on a transparent background; "scene": a full illustrated scene. */
  characterBackground: "transparent" | "scene";
  scene: string;
  // Collection brief
  collection: string;
  theme: string;
  season: string;
  audience: string;
  scripture: string;
  imagery: string;
  avoid: string;
  style: string;
  /** A Product Studio palette id, or "custom" (then the four colors below are used). */
  palette: string;
  colorPrimary: string;
  colorAccent: string;
  colorPaper: string;
  colorText: string;
  // Product & print setup
  product: string;
  /** "6×9" (inches, width × height) or "Custom". */
  size: string;
  customW: number;
  customH: number;
  format: CoverFormat;
  /** One of COVER_BINDINGS. */
  binding: string;
  /** A Product Studio print profile id: its bleed, margins and binding rules apply. */
  printProfile: string;
  pages: number | null;
  /** The printer-confirmed spine width in inches; null until the printer gives it. */
  spine: number | null;
  /** Bleed on each edge, inches. The print profile's own bleed is the floor. */
  bleed: number;
  /** Safe zone from trim, inches. Binding keep-outs and printer margins can only raise it. */
  safe: number;
  medium: "Print" | "Digital";
  dpi: number;
  // Cover text & listing
  title: string;
  subtitle: string;
  etsyTitle: string;
  angle: string;
  tags: string;
  mockups: string;
  status: string;
};

/** The default palette: the one the generator opened with. */
export const DEFAULT_COVER_PALETTE = "neutral-cheetah-luxe";

export function newBrief(over: Partial<CoverBrief> = {}): CoverBrief {
  const product: CoverProduct = "Journal";
  return {
    category: "cover", typography: DEFAULT_TYPOGRAPHY,
    pageKind: "Lined journal page", artUse: "Corner illustration", artPlacement: "Bottom right corner", clearArea: "Keep at least 75% of the page clear",
    characters: "", ageGroup: "Ages 4–8", expressions: "happy, curious, praying, helping a friend", characterCount: 4, characterBackground: "transparent", scene: "",
    collection: "", theme: "", season: "", audience: "", scripture: "", imagery: "", avoid: DEFAULT_AVOID, style: DEFAULT_STYLE,
    palette: DEFAULT_COVER_PALETTE, colorPrimary: "#630000", colorAccent: "#E6A742", colorPaper: "#FDFDFD", colorText: "#1B1717",
    product, size: DEFAULT_SIZE[product], customW: 6, customH: 9, format: "front", binding: defaultBindingFor(product), printProfile: "generic-commercial",
    pages: 120, spine: null, bleed: 0.125, safe: 0.25, medium: "Print", dpi: 300,
    title: "", subtitle: "", etsyTitle: "", angle: "", tags: "", mockups: DEFAULT_MOCKUPS, status: "Idea",
    ...over,
  };
}

export const DEFAULT_TYPOGRAPHY = "Let the style decide";

/** Choosing a product moves the size and binding to what that product usually is (the maker can change both after). */
export function withProduct(b: CoverBrief, product: string): CoverBrief {
  const size = DEFAULT_SIZE[product as CoverProduct] ?? b.size;
  return { ...b, product, size, binding: defaultBindingFor(product), format: "front" };
}

/** One product in a coordinated set: it shares the collection's title, style, palette and print setup. */
export type CoverItem = { id: string; product: string; size: string; status: string };

export const COVER_SCHEMA_VERSION = 1;

/** A saved collection: the brief, the chosen design direction and the set. */
export type CoverCollection = {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: CoverBrief;
  items: CoverItem[];
  direction: number;
};
