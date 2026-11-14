/**
 * UPLOADED ARTWORK — images the maker made elsewhere (from an artwork prompt)
 * and brings into the product: a cover, a page background or a page
 * illustration.
 *
 * The project stores only what the artwork IS (its id, name, type and pixel
 * size) and where it goes. The image file itself is kept on this device
 * (engines/artwork/store.ts), keyed by the same id, so the saved project
 * stays small and the original file is printed unchanged (a transparent PNG
 * stays transparent).
 */

export type ArtworkMime = "image/png" | "image/jpeg" | "image/webp";

export type ArtworkAsset = {
  /** Content id: the SHA-256 of the file's bytes (the same image added twice is stored once). */
  id: string;
  /** The file's name when it was added. */
  name: string;
  mime: ArtworkMime;
  widthPx: number;
  heightPx: number;
  /** The file has a transparency channel (PNG with alpha, WebP with alpha). */
  hasAlpha: boolean;
  bytes: number;
  addedAt: string;
  /**
   * Transparent artwork only: the edges its design is cut off along (opaque pixels reach the edge), found
   * when it is added. Art cut along the bottom (and a side) is made to run off the page there.
   */
  cutEdges?: ("top" | "bottom" | "left" | "right")[];
};

/**
 * Which printed pages a background or illustration goes on: a page in the
 * Pages list (every page made from it), or just one of its printed pages
 * (`nth`, 0-based, in book order).
 */
export type ArtworkTarget = { item: string; nth?: number };

/**
 * How the image fills its box.
 *   fill  covers the whole box; what doesn't fit is cropped (choose which part shows)
 *   fit   the whole image shows inside the box (any spare room stays empty)
 */
export type ArtworkFit = "fill" | "fit";

/**
 * Which part of the image shows when it is cropped, and how far it is zoomed
 * in: x / y 0 = left / top edge of the image, 0.5 = centre, 1 = right /
 * bottom edge; zoom 1 = just fills the box, up to 4×.
 */
export type ArtworkCrop = { x: number; y: number; zoom: number };

/** Corners and edges an illustration can sit at, as seen on a right-hand (or single) page. */
export type IllustrationAnchor = "top-left" | "top" | "top-right" | "bottom-left" | "bottom" | "bottom-right";

export type CoverArtwork = {
  id: string;
  use: "cover";
  assetId: string;
  /** The cover page(s) it is on (Pages list ids of cover / back cover pages). */
  targets: ArtworkTarget[];
  fit: ArtworkFit;
  crop: ArtworkCrop;
  /**
   * as-is       a finished cover: the image is the whole printed cover
   * with-title  the cover's own title and wording (edited like any cover) printed over the artwork
   */
  mode: "as-is" | "with-title";
  /** The title's color over the artwork (with-title): the palette's colors, or light / dark for legibility. */
  titleColor?: "palette" | "light" | "dark";
};

export type BackgroundArtwork = {
  id: string;
  use: "background";
  assetId: string;
  targets: ArtworkTarget[];
  fit: ArtworkFit;
  crop: ArtworkCrop;
  /** 0.05–1. */
  opacity: number;
  /**
   * bleed  the whole page, past the trim where the printer allows bleed (never into a gutter that can't bleed)
   * safe   inside the print-safe area (clear of the binding gutter and trim)
   */
  extent: "bleed" | "safe";
  /** On left-hand pages, flip the image left to right, so art made for the outer edge stays there (away from the binding). */
  mirror?: boolean;
};

export type IllustrationArtwork = {
  id: string;
  use: "illustration";
  assetId: string;
  targets: ArtworkTarget[];
  /**
   * corner  sits at a corner or edge of the print-safe area, over the page (best with a transparent PNG)
   * area    a dedicated band at the top or bottom: the page's content is laid out in the space left below / above it
   */
  placement: "corner" | "area";
  anchor: IllustrationAnchor;
  /** Corner: the illustration's width (inches; height follows the image). Area: the band's height (inches). */
  sizeIn: number;
  /** Corner: nudge inward from the anchored edges (inches, ≥ 0). */
  offsetXIn: number;
  offsetYIn: number;
  /** On left-hand pages, swap left and right so the art stays on the outer edge, away from the binding. */
  mirror: boolean;
  /**
   * Corner: run off the page at the anchored edges — flush with the page's edge, out into the bleed — instead of
   * sitting inside the margins. For art whose design is cut along those edges. On a mirrored left-hand page the
   * image is also flipped, so its cut edges still face out.
   */
  toEdge?: boolean;
  /** 0.05–1. */
  opacity: number;
};

export type ArtworkPlacement = CoverArtwork | BackgroundArtwork | IllustrationArtwork;

export type ProjectArtwork = {
  assets: ArtworkAsset[];
  placements: ArtworkPlacement[];
};
