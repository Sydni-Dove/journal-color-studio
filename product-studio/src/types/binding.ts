import type { Measurement, Provenance } from "./measurement";
import type { Edge } from "./geometry";

export type BindingType =
  | "none"
  | "digital"
  | "perfect-bound"
  | "case-bound"
  | "coil"
  | "wire-o"
  | "discbound"
  | "ring-6"
  | "ring-7"
  | "saddle-stitch"
  | "glued-pad";

/**
 * How the bound edge relates to page sides.
 *
 * book-spine    Leaves are gathered into a book. The bound edge is the
 *               inside/gutter: LEFT on a recto, RIGHT on a verso.
 *               (perfect-bound, case-bound, saddle-stitch, coil, wire-o)
 *
 * punched-leaf  Each leaf is punched on one fixed PHYSICAL edge by the way
 *               the product is constructed (disc, ring inserts). Printed
 *               single-sided, every page carries the keep-out on that same
 *               edge. Printed duplex, the back of the leaf sees the punched
 *               edge on the opposite side (geometry mirrors; the physical
 *               edge does not alternate by page number the way a book gutter
 *               alternates across a spread).
 *
 * glued-edge    Single-sided tear-off sheets; the glued edge is a fixed
 *               physical edge of every sheet (notepads, desk pads).
 *
 * unbound       No binding (loose sheets, digital).
 */
export type BoundEdgeMode = "book-spine" | "punched-leaf" | "glued-edge" | "unbound";

export type PunchSpec =
  | {
      kind: "coil";
      pitch: Measurement;
      holeCenterFromEdge: Measurement;
      holeDiameterIn: number;
    }
  | {
      kind: "disc";
      pitch: Measurement;
      mushroomDepth: Measurement;
      /** Disc count by product size is a product decision; derived from edge length by default. */
    }
  | {
      kind: "ring";
      /** Hole centres measured along the bound edge (mm), symmetric about the edge midpoint. */
      adjacentSpacing: Measurement;
      groupGap: Measurement;
      holesPerGroup: number;
      holeCenterFromEdge: Measurement;
      holeDiameterIn: number;
    };

export type BindingProfile = {
  id: BindingType;
  label: string;
  boundEdgeMode: BoundEdgeMode;
  /** Default physical bound edge for a recto / front side (book: left; pad: top). */
  defaultBoundEdge: Edge | null;
  /** Edges the user may choose for the bound edge. */
  allowedBoundEdges: Edge[];

  /** REQUIRED physical keep-out on the bound edge (printer/manufacturer/binding). */
  boundEdgeKeepOut?: { valueIn: number; provenance: Provenance; label: string };
  /** REQUIRED minimum on non-bound edges imposed by the binding. */
  otherEdgesRequired?: { valueIn: number; provenance: Provenance };

  /** STUDIO-RECOMMENDED writing-safe margin on the bound edge. */
  recommendedBoundMargin: { valueIn: number; provenance: Provenance };
  /** STUDIO-RECOMMENDED margin on the other edges. */
  recommendedOtherMargin: { valueIn: number; provenance: Provenance };

  /** Glue band drawn inside the keep-out (glued pads only). */
  glueBand?: { valueIn: number; provenance: Provenance };

  punch?: PunchSpec;

  /** Whether margins mirror between facing/back pages. */
  mirrorsMargins: boolean;
  /** Whether bleed may extend past the bound edge. */
  bleedOnBoundEdge: boolean;

  pageCountRules?: {
    multipleOf?: number;
    minPages?: number;
    maxPages?: number;
    provenance?: Provenance;
  };
  /** Bound-edge requirement grows with page count (resolved by the print profile gutter rule). */
  gutterGrowsWithPageCount: boolean;
  /** Pads/desk pads: sheet count is manufacturing metadata, not rendered pages. */
  sheetCountIsMetadata: boolean;
  notes: string[];
};
