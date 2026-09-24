/**
 * FUNCTIONAL PATTERN ENGINE — writing surfaces as mathematical definitions.
 * Never raster images, never decorative. Output is layout nodes positioned
 * from physical geometry.
 */
import { GRIDS, RULINGS } from "../../data/research/rulings";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { DotsNode, LayoutNode, LinesNode } from "../../types/layout";
import type { MeasurementConfidence } from "../../types/measurement";
import type { FunctionalPattern, GridPresetId, RulingPresetId } from "../../types/theme";
import { gridPositions, writingLinePositions } from "../layout/math";
import { measurementIn } from "../units/units";

export type PatternPreset<T extends string> = {
  id: T;
  label: string;
  valueIn: number;
  confidence?: MeasurementConfidence;
  note?: string;
};

export const RULING_PRESETS: PatternPreset<RulingPresetId>[] = [
  { id: "wide", label: "Wide ruled (11/32\")", valueIn: measurementIn(RULINGS.wide.spacing), confidence: RULINGS.wide.spacing.confidence },
  { id: "college", label: "College ruled (9/32\")", valueIn: measurementIn(RULINGS.college.spacing), confidence: RULINGS.college.spacing.confidence },
  { id: "narrow", label: "Narrow ruled (1/4\")", valueIn: measurementIn(RULINGS.narrow.spacing), confidence: RULINGS.narrow.spacing.confidence },
  { id: "a5-refill", label: "A5 refill (7 mm)", valueIn: measurementIn(RULINGS.a5RefillLined.spacing), confidence: RULINGS.a5RefillLined.spacing.confidence },
  { id: "custom", label: "Custom", valueIn: 0 },
];

export const GRID_PRESETS: PatternPreset<GridPresetId>[] = [
  { id: "dot-5mm", label: "5 mm dot grid", valueIn: measurementIn(GRIDS.dotGrid5mm), confidence: GRIDS.dotGrid5mm.confidence },
  { id: "graph-5mm", label: "5 mm graph", valueIn: measurementIn(GRIDS.graphGrid5mm), confidence: GRIDS.graphGrid5mm.confidence },
  { id: "hobonichi-daily", label: "Fine grid 3.7 mm", valueIn: measurementIn(GRIDS.hobonichiDaily), confidence: GRIDS.hobonichiDaily.confidence, note: "Hobonichi-style fine grid" },
  { id: "hobonichi-monthly", label: "Fine grid 3.45 mm", valueIn: measurementIn(GRIDS.hobonichiMonthly), confidence: GRIDS.hobonichiMonthly.confidence },
  { id: "custom", label: "Custom", valueIn: 0 },
];

export function lineSpacingIn(p: FunctionalPattern): number {
  if (p.rulingPreset === "custom") return p.customLineSpacingIn;
  return RULING_PRESETS.find((r) => r.id === p.rulingPreset)!.valueIn;
}

export function gridPitchIn(p: FunctionalPattern): number {
  if (p.gridPreset === "custom") return p.customPitchIn;
  return GRID_PRESETS.find((g) => g.id === p.gridPreset)!.valueIn;
}

export const DEFAULT_FUNCTIONAL_PATTERN: FunctionalPattern = {
  kind: "ruled",
  rulingPreset: "college",
  customLineSpacingIn: 0.3,
  gridPreset: "dot-5mm",
  customPitchIn: 0.2,
  dotSizePt: STUDIO_STROKES.dotPt,
  lineWeightPt: STUDIO_STROKES.writingLinePt,
  majorEvery: 0,
  majorWeightPt: STUDIO_STROKES.boxRulePt,
  marginLineIn: measurementIn(RULINGS.wide.marginLine),
  color: "line",
  opacity: 1,
};

// ─── Node generators ───────────────────────────────────────────────────────
export function ruledLines(id: string, region: Rect, spacing: number, p: Pick<FunctionalPattern, "lineWeightPt" | "color" | "opacity">): LinesNode {
  const ys = writingLinePositions(region.y, region.y + region.h, spacing);
  return {
    type: "lines",
    id,
    component: "WritingLines",
    rect: region,
    functional: true,
    orientation: "horizontal",
    positions: ys,
    from: region.x,
    to: region.x + region.w,
    strokePt: p.lineWeightPt,
    color: p.color,
    opacity: p.opacity,
  };
}

export function dotGrid(id: string, region: Rect, pitch: number, p: FunctionalPattern): DotsNode {
  const xs = gridPositions(region.x, region.w, pitch).positions;
  const ys = gridPositions(region.y, region.h, pitch).positions;
  return { type: "dots", id, component: "DotGrid", rect: region, functional: true, xs, ys, dotPt: p.dotSizePt, color: p.color, opacity: p.opacity };
}

export function graphGrid(id: string, region: Rect, pitch: number, p: FunctionalPattern): LinesNode[] {
  const gx = gridPositions(region.x, region.w, pitch);
  const gy = gridPositions(region.y, region.h, pitch);
  const x0 = gx.positions[0], x1 = gx.positions[gx.positions.length - 1];
  const y0 = gy.positions[0], y1 = gy.positions[gy.positions.length - 1];
  const bounds: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const isMajor = (i: number) => p.majorEvery > 0 && i % p.majorEvery === 0;
  const mk = (suffix: string, orientation: "horizontal" | "vertical", positions: number[], from: number, to: number, weight: number): LinesNode => ({
    type: "lines",
    id: `${id}-${suffix}`,
    component: "GraphGrid",
    rect: bounds,
    functional: true,
    orientation,
    positions,
    from,
    to,
    strokePt: weight,
    color: p.color,
    opacity: p.opacity,
  });
  const nodes = [
    mk("h", "horizontal", gy.positions.filter((_, i) => !isMajor(i)), x0, x1, p.lineWeightPt),
    mk("v", "vertical", gx.positions.filter((_, i) => !isMajor(i)), y0, y1, p.lineWeightPt),
  ];
  if (p.majorEvery > 0) {
    nodes.push(mk("H", "horizontal", gy.positions.filter((_, i) => isMajor(i)), x0, x1, p.majorWeightPt));
    nodes.push(mk("V", "vertical", gx.positions.filter((_, i) => isMajor(i)), y0, y1, p.majorWeightPt));
  }
  return nodes;
}

/**
 * Fill a writing region with the project's functional pattern.
 * `marginLineX` is an absolute trim x for margin-ruled paper.
 */
export function fillWritingRegion(id: string, region: Rect, p: FunctionalPattern, marginLineX?: number): LayoutNode[] {
  switch (p.kind) {
    case "blank":
      return [];
    case "dot-grid":
      return [dotGrid(id, region, gridPitchIn(p), p)];
    case "graph-grid":
      return graphGrid(id, region, gridPitchIn(p), p);
    case "margin-ruled": {
      const nodes: LayoutNode[] = [ruledLines(id, region, lineSpacingIn(p), p)];
      // Research: margin line measured from the LEFT TRIM edge (1.25" wide rule).
      const x = marginLineX ?? p.marginLineIn;
      if (x > region.x && x < region.x + region.w) {
        nodes.push({
          type: "rule",
          id: `${id}-margin`,
          component: "Divider",
          rect: { x, y: region.y, w: 0, h: region.h },
          functional: true,
          x1: x,
          y1: region.y,
          x2: x,
          y2: region.y + region.h,
          strokePt: p.lineWeightPt,
          color: "accent",
        });
      }
      return nodes;
    }
    // Checklist / Cornell / split-column are page structures solved by layouts;
    // inside a generic writing region they fall back to ruled lines.
    case "ruled":
    case "checklist":
    case "cornell":
    case "split-column":
      return [ruledLines(id, region, lineSpacingIn(p), p)];
  }
}
