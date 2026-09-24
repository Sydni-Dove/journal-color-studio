import { COIL, DISC, NOTEPAD_GLUE, PERFECT_BOUND, SADDLE_STITCH, SIX_RING, WIRE_O } from "../../data/research/bindingGeometry";
import { measurementIn } from "../../engines/units/units";
import type { BindingProfile, BindingType } from "../../types/binding";
import type { Measurement, Provenance } from "../../types/measurement";
import { STUDIO_MARGINS, STUDIO_PAD } from "../studioDefaults";

/** Provenance for a REQUIRED value that comes straight from research. */
export function required(mm: Measurement, basis?: string): Provenance {
  return { geometryClass: "required-production", confidence: mm.confidence, source: mm.source, basis: basis ?? mm.note };
}

const req = (mm: Measurement, label: string, basis?: string) => ({
  valueIn: measurementIn(mm),
  provenance: required(mm, basis),
  label,
});


export const BINDING_PROFILES: Record<BindingType, BindingProfile> = {
  none: {
    id: "none",
    label: "None (loose sheets)",
    boundEdgeMode: "unbound",
    defaultBoundEdge: null,
    allowedBoundEdges: [],
    recommendedBoundMargin: STUDIO_MARGINS.liveMargin,
    recommendedOtherMargin: STUDIO_MARGINS.liveMargin,
    mirrorsMargins: false,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: ["No binding keep-out. Printer profile margins still apply."],
  },
  digital: {
    id: "digital",
    label: "Digital (no physical binding)",
    boundEdgeMode: "unbound",
    defaultBoundEdge: null,
    allowedBoundEdges: [],
    recommendedBoundMargin: STUDIO_MARGINS.liveMargin,
    recommendedOtherMargin: STUDIO_MARGINS.liveMargin,
    mirrorsMargins: false,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: ["Digital products carry no physical keep-out."],
  },
  "perfect-bound": {
    id: "perfect-bound",
    label: "Perfect bound (paperback)",
    boundEdgeMode: "book-spine",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left"],
    // The bound-edge requirement is the printer's page-count gutter table
    // (resolved by the print profile). The binding itself contributes the
    // research inner-margin floor.
    boundEdgeKeepOut: {
      valueIn: PERFECT_BOUND.innerMargin.min,
      provenance: {
        geometryClass: "required-production",
        confidence: PERFECT_BOUND.innerMargin.confidence,
        source: PERFECT_BOUND.innerMargin.source,
        basis: "perfect-bound inner margin 0.5–0.75\" (grows with page count)",
      },
      label: "Perfect-bound gutter",
    },
    otherEdgesRequired: {
      valueIn: PERFECT_BOUND.otherEdges.min,
      provenance: {
        geometryClass: "required-production",
        confidence: PERFECT_BOUND.otherEdges.confidence,
        source: PERFECT_BOUND.otherEdges.source,
        basis: "perfect-bound other edges 0.25–0.375\"",
      },
    },
    recommendedBoundMargin: {
      valueIn: PERFECT_BOUND.innerMargin.min,
      provenance: {
        geometryClass: "studio-recommended",
        basis: "printer gutter table + 0.125\" comfort (resolved per page count)",
      },
    },
    recommendedOtherMargin: STUDIO_MARGINS.liveMargin,
    mirrorsMargins: true,
    bleedOnBoundEdge: false,
    pageCountRules: { minPages: 24 },
    gutterGrowsWithPageCount: true,
    sheetCountIsMetadata: false,
    notes: [
      "Gutter mirrors by page side: inside = left on recto, right on verso.",
      "KDP floor 24 pages; IngramSpark floor 18 pages.",
    ],
  },
  "case-bound": {
    id: "case-bound",
    label: "Hardcover / case bound",
    boundEdgeMode: "book-spine",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left"],
    boundEdgeKeepOut: {
      valueIn: PERFECT_BOUND.innerMargin.min,
      provenance: {
        geometryClass: "required-production",
        confidence: "printer-standard",
        source: PERFECT_BOUND.innerMargin.source,
        basis: "book-block inner margin (same text-block rules as perfect bound)",
      },
      label: "Case-bound gutter",
    },
    otherEdgesRequired: {
      valueIn: PERFECT_BOUND.otherEdges.min,
      provenance: { geometryClass: "required-production", confidence: "printer-standard", source: PERFECT_BOUND.otherEdges.source },
    },
    recommendedBoundMargin: {
      valueIn: PERFECT_BOUND.innerMargin.min,
      provenance: { geometryClass: "studio-recommended", basis: "printer gutter table + 0.125\" comfort" },
    },
    recommendedOtherMargin: STUDIO_MARGINS.liveMargin,
    mirrorsMargins: true,
    bleedOnBoundEdge: false,
    gutterGrowsWithPageCount: true,
    sheetCountIsMetadata: false,
    notes: ["Board = trim + 0.25\" (cover geometry; interior unaffected).", "Ingram case wrap: 0.625\" bleed + 0.5\" hinge."],
  },
  coil: {
    id: "coil",
    label: "Coil / spiral",
    boundEdgeMode: "book-spine",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left", "top"],
    boundEdgeKeepOut: req(COIL.boundEdgeKeepOut, "Coil keep-out"),
    otherEdgesRequired: { valueIn: measurementIn(COIL.otherEdges), provenance: required(COIL.otherEdges) },
    recommendedBoundMargin: STUDIO_MARGINS.punchedBoundEdge,
    recommendedOtherMargin: STUDIO_MARGINS.outer,
    punch: { kind: "coil", pitch: COIL.holePitch, holeCenterFromEdge: COIL.holeCenterTypical, holeDiameterIn: 0.125 },
    mirrorsMargins: true,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: [
      "Each leaf is punched on its bound edge; the back of a leaf sees the coil on the opposite side, so pages alternate like a book.",
      "Hole diameter for the overlay is a drawing aid only (not researched).",
    ],
  },
  "wire-o": {
    id: "wire-o",
    label: "Wire-O",
    boundEdgeMode: "book-spine",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left", "top"],
    boundEdgeKeepOut: req(WIRE_O.boundEdgeKeepOut, "Wire-O keep-out"),
    otherEdgesRequired: { valueIn: measurementIn(WIRE_O.otherEdges), provenance: required(WIRE_O.otherEdges) },
    recommendedBoundMargin: STUDIO_MARGINS.punchedBoundEdge,
    recommendedOtherMargin: STUDIO_MARGINS.outer,
    punch: { kind: "coil", pitch: COIL.holePitch, holeCenterFromEdge: COIL.holeCenterTypical, holeDiameterIn: 0.125 },
    mirrorsMargins: true,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: ["Same punch family as coil (research A4)."],
  },
  discbound: {
    id: "discbound",
    label: "Discbound",
    boundEdgeMode: "punched-leaf",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left", "top"],
    boundEdgeKeepOut: req(DISC.writingSafe, "Disc writing-safe keep-out"),
    otherEdgesRequired: { valueIn: measurementIn(DISC.otherEdges), provenance: required(DISC.otherEdges) },
    recommendedBoundMargin: {
      valueIn: STUDIO_MARGINS.punchedBoundEdge.valueIn,
      provenance: {
        geometryClass: "studio-recommended",
        basis: "0.5\" derived disc writing-safe + 0.25\" comfort (research 1.4 recommends 0.75–1.0\")",
      },
    },
    recommendedOtherMargin: STUDIO_MARGINS.outer,
    punch: { kind: "disc", pitch: DISC.holePitch, mushroomDepth: DISC.mushroomCutTypical },
    mirrorsMargins: true,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: [
      "Keep-out stays on the SAME physical (punched) edge of every leaf.",
      "Single-sided inserts: keep-out on the punched edge of every page. Duplex: the back side mirrors.",
      "Disc count derives from edge length and 0.98\" pitch (A-B3).",
    ],
  },
  "ring-6": {
    id: "ring-6",
    label: "6-ring insert",
    boundEdgeMode: "punched-leaf",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left"],
    boundEdgeKeepOut: req(SIX_RING.contentKeepOut, "Ring content keep-out", "A-B4 content keep-out 15 mm (derived)"),
    otherEdgesRequired: { valueIn: measurementIn(SIX_RING.otherEdges), provenance: required(SIX_RING.otherEdges) },
    recommendedBoundMargin: STUDIO_MARGINS.ringBoundEdge,
    recommendedOtherMargin: STUDIO_MARGINS.outer,
    punch: {
      kind: "ring",
      adjacentSpacing: SIX_RING.adjacentHoleSpacing,
      groupGap: SIX_RING.groupGapPersonalPocket,
      holesPerGroup: 3,
      holeCenterFromEdge: SIX_RING.holeCenterFromEdgeTypical,
      holeDiameterIn: 0.22,
    },
    mirrorsMargins: true,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: [
      "Hole layout per A-B4: 19 mm adjacent; 50 mm group gap (Personal/Pocket), 70 mm (A5).",
      "Hole-center to edge not published — 11.5 mm derived assumption.",
      "Hole diameter for the overlay is a drawing aid only (not researched).",
    ],
  },
  "ring-7": {
    id: "ring-7",
    label: "7-ring insert",
    boundEdgeMode: "punched-leaf",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left"],
    // The research does not cover 7-ring hole geometry. The 6-ring content
    // keep-out is reused as the closest researched punched-ring value.
    boundEdgeKeepOut: req(SIX_RING.contentKeepOut, "Ring content keep-out", "6-ring value reused — 7-ring not researched"),
    otherEdgesRequired: { valueIn: measurementIn(SIX_RING.otherEdges), provenance: required(SIX_RING.otherEdges) },
    recommendedBoundMargin: STUDIO_MARGINS.ringBoundEdge,
    recommendedOtherMargin: STUDIO_MARGINS.outer,
    mirrorsMargins: true,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: ["7-ring hole positions are NOT in the research; no holes are drawn. Verify with the ring manufacturer."],
  },
  "saddle-stitch": {
    id: "saddle-stitch",
    label: "Saddle stitch",
    boundEdgeMode: "book-spine",
    defaultBoundEdge: "left",
    allowedBoundEdges: ["left"],
    boundEdgeKeepOut: {
      valueIn: SADDLE_STITCH.innerMargin.min,
      provenance: {
        geometryClass: "required-production",
        confidence: SADDLE_STITCH.innerMargin.confidence,
        source: SADDLE_STITCH.innerMargin.source,
        basis: "saddle-stitch inner margin 0.25–0.375\"",
      },
      label: "Saddle-stitch inner margin",
    },
    otherEdgesRequired: { valueIn: measurementIn(SADDLE_STITCH.otherEdges), provenance: required(SADDLE_STITCH.otherEdges) },
    recommendedBoundMargin: STUDIO_MARGINS.saddleInner,
    recommendedOtherMargin: STUDIO_MARGINS.liveMargin,
    mirrorsMargins: true,
    bleedOnBoundEdge: false,
    pageCountRules: {
      multipleOf: SADDLE_STITCH.pageMultiple,
      minPages: SADDLE_STITCH.minPagesPractical,
      maxPages: SADDLE_STITCH.maxPagesPractical.max,
      provenance: { geometryClass: "required-production", confidence: "printer-standard", source: "designYourWay" },
    },
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: false,
    notes: ["Creep is applied by the printer at imposition — never baked into files."],
  },
  "glued-pad": {
    id: "glued-pad",
    label: "Glued pad (notepad / desk pad)",
    boundEdgeMode: "glued-edge",
    defaultBoundEdge: "top",
    allowedBoundEdges: ["top", "bottom", "left", "right"],
    boundEdgeKeepOut: req(NOTEPAD_GLUE.boundEdgeClearance, "Glue-edge clearance"),
    otherEdgesRequired: {
      valueIn: NOTEPAD_GLUE.otherEdges.min,
      provenance: {
        geometryClass: "required-production",
        confidence: NOTEPAD_GLUE.otherEdges.confidence,
        source: NOTEPAD_GLUE.otherEdges.source,
        basis: "notepad other edges 0.25–0.5\"",
      },
    },
    recommendedBoundMargin: STUDIO_MARGINS.padGlueEdge,
    recommendedOtherMargin: STUDIO_MARGINS.padOtherEdges,
    glueBand: STUDIO_PAD.glueBand,
    mirrorsMargins: false,
    bleedOnBoundEdge: true,
    gutterGrowsWithPageCount: false,
    sheetCountIsMetadata: true,
    notes: [
      "Glue on any edge (top standard). Sheets 25 / 50 / 100 (custom).",
      "Full-bleed backgrounds are discouraged on writable pads (UPrinting artwork guidance).",
    ],
  },
};

export function getBindingProfile(id: BindingType): BindingProfile {
  return BINDING_PROFILES[id];
}

export const BINDING_CHOICES: { id: string; label: string; bindingType: BindingType; boundEdge?: "top" | "left" }[] = [
  { id: "none", label: "None", bindingType: "none" },
  { id: "digital", label: "Digital", bindingType: "digital" },
  { id: "perfect-bound", label: "Perfect bound", bindingType: "perfect-bound" },
  { id: "case-bound", label: "Hardcover / case bound", bindingType: "case-bound" },
  { id: "coil", label: "Coil / spiral", bindingType: "coil" },
  { id: "wire-o", label: "Wire-O", bindingType: "wire-o" },
  { id: "discbound", label: "Discbound", bindingType: "discbound" },
  { id: "ring-6", label: "6-ring", bindingType: "ring-6" },
  { id: "ring-7", label: "7-ring", bindingType: "ring-7" },
  { id: "saddle-stitch", label: "Saddle stitch", bindingType: "saddle-stitch" },
  { id: "glued-top", label: "Top-glued pad", bindingType: "glued-pad", boundEdge: "top" },
  { id: "glued-side", label: "Side-glued pad", bindingType: "glued-pad", boundEdge: "left" },
];

