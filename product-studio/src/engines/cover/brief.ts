/**
 * COVER STUDIO — the brief (everything the maker decides about one collection's covers) and the collection it is
 * saved in. Plain data, no UI. Numeric fields that can be "not entered yet" (the printer-confirmed spine width)
 * are null, never 0.
 */
import { DEFAULT_AVOID, DEFAULT_MOCKUPS, DEFAULT_SIZE, DEFAULT_STYLE, defaultBindingFor, type CoverProduct } from "./guides";

export type CoverFormat = "front" | "wrap";

export type CoverBrief = {
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
    collection: "", theme: "", season: "", audience: "", scripture: "", imagery: "", avoid: DEFAULT_AVOID, style: DEFAULT_STYLE,
    palette: DEFAULT_COVER_PALETTE, colorPrimary: "#630000", colorAccent: "#E6A742", colorPaper: "#FDFDFD", colorText: "#1B1717",
    product, size: DEFAULT_SIZE[product], customW: 6, customH: 9, format: "front", binding: defaultBindingFor(product), printProfile: "generic-commercial",
    pages: 120, spine: null, bleed: 0.125, safe: 0.25, medium: "Print", dpi: 300,
    title: "", subtitle: "", etsyTitle: "", angle: "", tags: "", mockups: DEFAULT_MOCKUPS, status: "Idea",
    ...over,
  };
}

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
