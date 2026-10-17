/**
 * HARDCOVER ASSEMBLY — the measurements for wrapping a printed cover around
 * chipboard on a Wire-O or disc-bound journal. Pure geometry from the
 * product's own trim, orientation and binding plus the maker's materials
 * (chipboard thickness, turn-in, laminate). Nothing here draws or changes a
 * design: the assembly guide, the alignment template and the cover-sheet marks
 * all read this one plan, so they always agree.
 *
 * Coordinates are inches on the printed side of the covering sheet, origin at
 * its top-left corner (the side you see, before wrapping). The back cover is
 * the front mirrored left↔right (its binding edge is on the other side when you
 * look at it from outside); a top-bound journal keeps the binding at the top.
 *
 *   ┌──────────────── covering sheet ────────────────┐
 *   │ turn-in + board edge                            │
 *   │   ┌──────────── chipboard ────────────┐         │
 *   │   │ ░ binding-edge clearance           │         │
 *   │   │ ░  ┌──── design (trim) ────┐       │ square  │
 *   │   │ ░  └───────────────────────┘       │         │
 *   │   └────────────────────────────────────┘         │
 *   └─────────────────────────────────────────────────┘
 */
import { COIL, DISC, WIRE_O } from "../../data/research/bindingGeometry";
import { measurementIn } from "../units/units";
import type { BindingType } from "../../types/binding";
import type { Edge, Rect } from "../../types/geometry";

export type LaminateMode = "wrap" | "full" | "inset" | "custom";

/** The maker's hardcover materials and choices (all inches). Absent = no hardcover features anywhere. */
export type HardcoverSettings = {
  enabled: boolean;
  /** Chipboard thickness (e.g. 0.08" ≈ 2 mm "80 pt"). */
  boardThicknessIn: number;
  /** How far the board sticks out past the pages on the edges that aren't bound. */
  squaresIn: number;
  /** Covering material folded onto the inside of the board, past the board's edge. */
  turnInIn: number;
  /** Distance kept between each board corner and the diagonal corner cut (default 1.5 × board thickness). */
  cornerGapIn?: number;
  laminate: {
    mode: LaminateMode;
    /** "wrap": how far the laminate runs onto the turn-in past the board's edge. */
    extendIn?: number;
    /** "inset": margin left unlaminated around the sheet. */
    insetIn?: number;
    /** "custom": the laminate piece's size, centred on the board. */
    widthIn?: number;
    heightIn?: number;
  };
  /** Wire-O diameter (3/4" = 0.75). Sets the hole pitch (2:1 from 9/16" up, 3:1 below). */
  wireSizeIn?: number;
  /** Your punch: board edge → hole centre (Wire-O) or slot depth (disc). Default from the binding research. */
  holeCenterIn?: number;
  /** Keep-clear depth on the cover face along the binding edge (default from the binding's keep-out). */
  clearanceIn?: number;
};

export const HARDCOVER_DEFAULTS: HardcoverSettings = {
  enabled: true,
  boardThicknessIn: 0.08,
  squaresIn: 0.125,
  turnInIn: 0.75,
  laminate: { mode: "wrap", extendIn: 0.25 },
  wireSizeIn: 0.75,
};

/** Common chipboard thicknesses (label, inches). */
export const BOARD_THICKNESSES: { label: string; in: number }[] = [
  { label: "1.5 mm (0.060\")", in: 0.06 },
  { label: "2 mm / 80 pt (0.080\")", in: 0.08 },
  { label: "2.5 mm / 98 pt (0.098\")", in: 0.098 },
  { label: "3 mm / 120 pt (0.120\")", in: 0.12 },
];

/** Wire-O sizes (inches); pitch 3:1 below 9/16", 2:1 from 9/16". */
export const WIRE_SIZES = [0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.75, 0.875, 1, 1.25];

export type Line = { x1: number; y1: number; x2: number; y2: number };
export type Hole = { cx: number; cy: number; w: number; h: number; shape: "rect" | "mushroom" };

export type CoverFace = {
  face: "front" | "back";
  /** The binding edge as seen on this face's printed side. */
  boundEdge: Edge;
  sheet: { w: number; h: number };
  board: Rect;
  /** Where the design's trim (the cover page as designed) sits. */
  trim: Rect;
  laminate: Rect;
  /** Diagonal cuts across each corner of the sheet (cut away the outer triangle). */
  cornerCuts: Line[];
  /** Keep important artwork out of this band along the binding edge (holes / slots go through it). */
  clearance: Rect;
  holes: Hole[];
};

export type HardcoverPlan = {
  binding: "wire-o" | "discbound";
  bindingLabel: string;
  problems: string[];
  boardThicknessIn: number;
  trim: { w: number; h: number };
  board: { w: number; h: number };
  sheet: { w: number; h: number };
  /** Board overhang past the pages, per edge (0 on the binding edge: boards and pages are punched together). */
  squares: Record<Edge, number>;
  /** Covering past the board on every side = board thickness (the edge) + turn-in. */
  wrapIn: number;
  turnInIn: number;
  cornerGapIn: number;
  /** Laminate piece size and its offset from the sheet's edges (front face). */
  laminate: { w: number; h: number; mode: LaminateMode; offsets: Record<Edge, number> };
  clearanceIn: number;
  holeCenterIn: number;
  pitchIn: number;
  front: CoverFace;
  back: CoverFace;
};

const mirrorEdge = (e: Edge): Edge => (e === "left" ? "right" : e === "right" ? "left" : e);
const vertical = (e: Edge) => e === "left" || e === "right";

/** Hole pitch for a Wire-O size: 2:1 (0.5") from 9/16" up, 3:1 (1/3") below. */
export const wirePitchIn = (sizeIn: number) => (sizeIn >= 0.5625 - 1e-6 ? 0.5 : 1 / 3);

/** Default punch depth: board edge → hole centre (Wire-O) or slot depth (disc). Your punch's own setting wins. */
export function defaultHoleCenterIn(binding: "wire-o" | "discbound", wireSizeIn = 0.75): number {
  if (binding === "discbound") return measurementIn(DISC.mushroomCutTypical);
  // 2:1 punches set their margin deeper than the 5 mm typical of 3:1 / coil punches.
  return wirePitchIn(wireSizeIn) === 0.5 ? 0.25 : measurementIn(COIL.holeCenterTypical);
}

export function defaultClearanceIn(binding: "wire-o" | "discbound"): number {
  return binding === "discbound" ? measurementIn(DISC.writingSafe) : measurementIn(WIRE_O.boundEdgeKeepOut);
}

/**
 * The plan for a product of this trim (as oriented), binding and bound edge.
 * `boundEdge` is the binding edge of the FRONT cover seen from outside.
 */
export function hardcoverPlan(trimIn: { w: number; h: number }, bindingType: BindingType, boundEdge: Edge, settings: HardcoverSettings): HardcoverPlan {
  const problems: string[] = [];
  const binding: "wire-o" | "discbound" = bindingType === "discbound" ? "discbound" : "wire-o";
  if (bindingType !== "wire-o" && bindingType !== "discbound")
    problems.push(`The hardcover guide is for Wire-O and disc-bound journals; this product is set to ${bindingType}. Measurements below assume Wire-O — choose Wire-O or Discbound in Page setup.`);
  const t = Math.max(0, settings.boardThicknessIn);
  const sq = Math.max(0, settings.squaresIn);
  const turnIn = Math.max(0, settings.turnInIn);
  const wrap = t + turnIn;
  if (turnIn < 0.5) problems.push(`A turn-in of ${inches(turnIn)} is narrow; 5/8"–3/4" holds better on chipboard.`);

  // Boards and pages are punched together, so they line up on the binding edge; the other edges overhang.
  const squares: Record<Edge, number> = { top: sq, bottom: sq, left: sq, right: sq };
  squares[boundEdge] = 0;
  const board = { w: trimIn.w + squares.left + squares.right, h: trimIn.h + squares.top + squares.bottom };
  const sheet = { w: board.w + 2 * wrap, h: board.h + 2 * wrap };

  const cornerGap = settings.cornerGapIn ?? 1.5 * t;
  // The 45° cut must cross the corner square (it would miss the sheet past 2 × wrap, and touch the board at 0).
  if (cornerGap <= 0 || cornerGap * Math.SQRT2 >= 2 * wrap) problems.push(`A corner gap of ${inches(cornerGap)} doesn't fit this turn-in; use about 1.5 × the board thickness (${inches(1.5 * t)}).`);

  const wire = settings.wireSizeIn ?? 0.75;
  const pitch = binding === "discbound" ? measurementIn(DISC.holePitch) : wirePitchIn(wire);
  const holeCenter = settings.holeCenterIn ?? defaultHoleCenterIn(binding, wire);
  const clearance = Math.max(settings.clearanceIn ?? defaultClearanceIn(binding), holeCenter);

  // Laminate (front face; offsets from the sheet edges).
  const lam = laminateRect(settings.laminate, { x: wrap, y: wrap, w: board.w, h: board.h }, sheet, t, turnIn, problems);
  const offsets: Record<Edge, number> = { left: lam.x, top: lam.y, right: sheet.w - lam.x - lam.w, bottom: sheet.h - lam.y - lam.h };

  const face = (which: "front" | "back"): CoverFace => {
    const edge = which === "front" ? boundEdge : mirrorEdge(boundEdge);
    const sqs: Record<Edge, number> = which === "front" ? squares : { ...squares, left: squares.right, right: squares.left };
    const b: Rect = { x: wrap, y: wrap, w: board.w, h: board.h };
    const trim: Rect = { x: b.x + sqs.left, y: b.y + sqs.top, w: trimIn.w, h: trimIn.h };
    const l: Rect = which === "front" ? lam : { ...lam, x: sheet.w - lam.x - lam.w };
    const clear: Rect =
      edge === "left" ? { x: b.x, y: b.y, w: clearance, h: b.h }
      : edge === "right" ? { x: b.x + b.w - clearance, y: b.y, w: clearance, h: b.h }
      : edge === "top" ? { x: b.x, y: b.y, w: b.w, h: clearance }
      : { x: b.x, y: b.y + b.h - clearance, w: b.w, h: clearance };
    return { face: which, boundEdge: edge, sheet, board: b, trim, laminate: l, cornerCuts: cornerCuts(b, wrap, cornerGap), clearance: clear, holes: holesAlong(b, edge, holeCenter, pitch, binding) };
  };

  return {
    binding, bindingLabel: binding === "discbound" ? "Disc-bound" : `Wire-O ${fraction(wire)}"`, problems,
    boardThicknessIn: t, trim: trimIn, board, sheet, squares, wrapIn: wrap, turnInIn: turnIn, cornerGapIn: cornerGap,
    laminate: { w: lam.w, h: lam.h, mode: settings.laminate.mode, offsets }, clearanceIn: clearance, holeCenterIn: holeCenter, pitchIn: pitch,
    front: face("front"), back: face("back"),
  };
}

function laminateRect(l: HardcoverSettings["laminate"], b: Rect, sheet: { w: number; h: number }, t: number, turnIn: number, problems: string[]): Rect {
  switch (l.mode) {
    case "full":
      return { x: 0, y: 0, w: sheet.w, h: sheet.h };
    case "inset": {
      const m = Math.max(0, Math.min(l.insetIn ?? 0.25, t + turnIn));
      if (m > turnIn) problems.push("The laminate inset reaches the board's edge; the cover's edges won't be laminated.");
      return { x: m, y: m, w: sheet.w - 2 * m, h: sheet.h - 2 * m };
    }
    case "custom": {
      const w = l.widthIn ?? sheet.w, h = l.heightIn ?? sheet.h;
      if (w < b.w + 2 * t - 1e-6 || h < b.h + 2 * t - 1e-6) problems.push(`A ${inches(w)} × ${inches(h)} laminate piece doesn't cover the board and its edges (${inches(b.w + 2 * t)} × ${inches(b.h + 2 * t)} needed).`);
      if (w > sheet.w + 1e-6 || h > sheet.h + 1e-6) problems.push("The laminate piece is larger than the printed cover sheet; trim it to the cut marks after laminating.");
      return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    }
    default: {
      // Over the board face and its edges, and a little onto the turn-in (the rest of the turn-in stays unlaminated so the adhesive grips).
      const e = t + Math.max(0, Math.min(l.extendIn ?? 0.25, turnIn));
      return { x: b.x - e, y: b.y - e, w: b.w + 2 * e, h: b.h + 2 * e };
    }
  }
}

/** One 45° cut per corner, `gap` from the board corner along the diagonal, running sheet edge to sheet edge. */
function cornerCuts(b: Rect, wrap: number, gap: number): Line[] {
  const c = gap * Math.SQRT2; // the cut line u + v = c, with u, v measured outward from the board corner
  const out: Line[] = [];
  for (const [cx, cy, sx, sy] of [[b.x, b.y, -1, -1], [b.x + b.w, b.y, 1, -1], [b.x, b.y + b.h, -1, 1], [b.x + b.w, b.y + b.h, 1, 1]] as const) {
    // Endpoints on the sheet's outer edges: (u = wrap, v = c − wrap) and (u = c − wrap, v = wrap).
    out.push({ x1: cx + sx * wrap, y1: cy + sy * (c - wrap), x2: cx + sx * (c - wrap), y2: cy + sy * wrap });
  }
  return out;
}

/** Hole (Wire-O) or slot (disc) positions along the board's binding edge, centred along its length. */
function holesAlong(b: Rect, edge: Edge, depth: number, pitch: number, binding: "wire-o" | "discbound"): Hole[] {
  const along = vertical(edge) ? b.h : b.w;
  // End holes stay at least half a pitch in from the board's ends.
  const n = Math.max(1, Math.floor((along - pitch) / pitch + 1e-9) + 1);
  const start = (along - (n - 1) * pitch) / 2;
  const [w, h] = binding === "discbound" ? [depth, 0.22] : [0.16, 0.25];
  return Array.from({ length: n }, (_, i) => {
    const s = start + i * pitch;
    const at = binding === "discbound" ? depth / 2 : depth;
    if (edge === "left") return { cx: b.x + at, cy: b.y + s, w, h, shape: binding === "discbound" ? "mushroom" : "rect" };
    if (edge === "right") return { cx: b.x + b.w - at, cy: b.y + s, w, h, shape: binding === "discbound" ? "mushroom" : "rect" };
    if (edge === "top") return { cx: b.x + s, cy: b.y + at, w: h, h: w, shape: binding === "discbound" ? "mushroom" : "rect" };
    return { cx: b.x + s, cy: b.y + b.h - at, w: h, h: w, shape: binding === "discbound" ? "mushroom" : "rect" };
  });
}

/** 0.75 → "3/4", 12.785 → "12 13/16" (nearest 1/16). */
export function fraction(v: number): string {
  const sixteenths = Math.round(v * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  return num ? (whole ? `${whole} ${num}/${den}` : `${num}/${den}`) : `${whole}`;
}

/**
 * Inches for the maker: a ruler fraction when it is exact (to 1/16"), else the decimal with the nearest
 * sixteenth as a guide — 0.75 → 3/4", 0.83 → 0.83" (≈ 13/16"). `detail` adds millimetres.
 */
export function inches(v: number, detail = false): string {
  const exact = Math.abs(v - Math.round(v * 16) / 16) <= 0.004;
  const dec = `${Math.round(v * 1000) / 1000}"`;
  const base = exact ? `${fraction(v)}"` : `${dec} (≈ ${fraction(v)}")`;
  return detail ? `${base} · ${Math.round(v * 254) / 10} mm` : base;
}

/** Inside liner (endsheet) that hides the turn-ins: the board less 1/8" on each side. */
export const linerSize = (p: HardcoverPlan) => ({ w: Math.max(0, p.board.w - 0.25), h: Math.max(0, p.board.h - 0.25) });

/** The assembly steps, in order, with this plan's numbers. */
export function assemblySteps(p: HardcoverPlan): { title: string; text: string }[] {
  const d = (v: number) => inches(v);
  const lam = p.laminate;
  const sameOffsets = (["top", "bottom", "left", "right"] as const).every((e) => Math.abs(lam.offsets[e] - lam.offsets.top) < 1e-6);
  const lamWhere = lam.mode === "full"
    ? "over the whole printed sheet"
    : sameOffsets
      ? `${d(lam.offsets.top)} in from every edge of the printed sheet`
      : `${d(lam.offsets.left)} from the left, ${d(lam.offsets.right)} from the right, ${d(lam.offsets.top)} from the top and ${d(lam.offsets.bottom)} from the bottom`;
  const liner = linerSize(p);
  return [
    { title: "Print", text: `Print the front and back cover sheets at 100% (Actual size). Each sheet is ${d(p.sheet.w)} × ${d(p.sheet.h)}.` },
    { title: "Laminate", text: `Apply a ${d(lam.w)} × ${d(lam.h)} piece of self-adhesive laminate ${lamWhere}${lam.mode === "wrap" ? ` — it covers the board face and edges and ${d(Math.max(0, lam.offsets.top < p.wrapIn ? p.wrapIn - lam.offsets.top - p.boardThicknessIn : 0))} of the turn-in; the rest of the turn-in stays bare so the adhesive grips` : ""}. Smooth from the centre out.` },
    { title: "Cut the sheet", text: `Cut on the cut marks: ${d(p.sheet.w)} × ${d(p.sheet.h)}.` },
    { title: "Cut the chipboard", text: `Cut two boards ${d(p.board.w)} × ${d(p.board.h)} (${d(p.boardThicknessIn)} thick). The boards are ${d(p.squares.top || p.squares.bottom || p.squares.left || p.squares.right)} bigger than the pages on the edges that aren't bound, and flush with the pages on the binding edge.` },
    { title: "Place the board", text: `On the back of the sheet, place the board ${d(p.wrapIn)} in from every edge (board thickness ${d(p.boardThicknessIn)} + ${d(p.turnInIn)} turn-in). The alignment template shows the exact spot.` },
    { title: "Cut the corners", text: `Cut each corner off at 45°, leaving ${d(p.cornerGapIn)} between the board's corner and the cut (about 1.5 × the board thickness) — enough paper to cover the board's corner.` },
    { title: "Wrap", text: `Fold the top and bottom turn-ins over the board first. Pinch each corner's extra paper in against the board edge, then fold the side turn-ins.` },
    { title: "Line the inside (optional)", text: `Cover the turn-ins with a liner ${d(liner.w)} × ${d(liner.h)}, centred (1/8" in from each board edge).` },
    p.binding === "discbound"
      ? { title: "Punch", text: `Punch the disc slots along the binding edge with the pages, ${d(p.holeCenterIn)} deep. Keep artwork that matters ${d(p.clearanceIn)} away from the binding edge.` }
      : { title: "Punch", text: `Punch both covers with the pages, binding edges flush: holes ${d(p.holeCenterIn)} in from the edge at ${p.pitchIn === 0.5 ? "2:1 (1/2\")" : "3:1 (1/3\")"} pitch (set to your punch). Keep artwork that matters ${d(p.clearanceIn)} away from the binding edge.` },
    { title: "Bind", text: p.binding === "discbound" ? "Insert the discs." : `Thread the ${p.bindingLabel} wire and close it.` },
  ];
}
