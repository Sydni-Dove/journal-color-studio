/** Layout node constructors — keep solver code declarative. */
import type { Rect } from "../../types/geometry";
import type {
  BoxNode,
  CheckboxNode,
  GroupNode,
  LayoutDiagnostic,
  PrimitiveName,
  RuleNode,
  TextNode,
} from "../../types/layout";
import type { ColorToken, TextAlign, TypographyRole, TypographySettings } from "../../types/tokens";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { StackResult } from "../../engines/layout/math";
import { ptToIn } from "../../engines/units/units";

export function text(
  id: string,
  rect: Rect,
  value: string,
  role: TypographyRole,
  opts: { component?: PrimitiveName; align?: TextAlign; vAlign?: TextNode["vAlign"]; wrap?: boolean; color?: ColorToken; semantic?: TextNode["semantic"] } = {},
): TextNode {
  return {
    type: "text",
    id,
    component: opts.component ?? "Text",
    rect,
    functional: true,
    text: value,
    role,
    align: opts.align,
    vAlign: opts.vAlign ?? "middle",
    wrap: opts.wrap ?? false,
    color: opts.color,
    ...(opts.semantic ? { semantic: opts.semantic } : {}),
  };
}

export function box(
  id: string,
  rect: Rect,
  opts: { component?: PrimitiveName; stroke?: ColorToken | null; strokePt?: number; fill?: ColorToken | null; fillOpacity?: number; radiusIn?: number } = {},
): BoxNode {
  return {
    type: "box",
    id,
    component: opts.component ?? "Section",
    rect,
    functional: true,
    stroke: opts.stroke === undefined ? "border" : opts.stroke,
    strokePt: opts.strokePt ?? STUDIO_STROKES.boxRulePt,
    fill: opts.fill ?? null,
    fillOpacity: opts.fillOpacity ?? 1,
    radiusIn: opts.radiusIn ?? 0,
  };
}

export function rule(id: string, x1: number, y1: number, x2: number, y2: number, opts: { strokePt?: number; color?: ColorToken; component?: PrimitiveName } = {}): RuleNode {
  return {
    type: "rule",
    id,
    component: opts.component ?? "Divider",
    rect: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
    functional: true,
    x1,
    y1,
    x2,
    y2,
    strokePt: opts.strokePt ?? STUDIO_STROKES.headerRulePt,
    color: opts.color ?? "border",
  };
}

export function checkbox(id: string, rect: Rect): CheckboxNode {
  return { type: "checkbox", id, component: "Checkbox", rect, functional: true, strokePt: STUDIO_STROKES.checkboxPt, color: "border", radiusIn: 0 };
}

export function group(id: string, component: PrimitiveName, rect: Rect, extra: Partial<Pick<GroupNode, "columnEdges" | "rowEdges">> = {}): GroupNode {
  return { type: "group", id, component, rect, functional: false, ...extra };
}

/** Height of one line of text for a role (inches). */
export function lineBoxIn(typography: TypographySettings, role: TypographyRole): number {
  const r = typography.roles[role];
  return ptToIn(r.sizePt * r.lineHeight);
}

/** Convert a stack overflow into a solver diagnostic. */
export function stackDiagnostic(stack: StackResult, componentId: string, what: string): LayoutDiagnostic[] {
  if (stack.overflow <= 1e-6) return [];
  return [
    {
      severity: "error",
      rule: "layout-fit",
      componentId,
      message: `${what} needs ${stack.overflow.toFixed(3)}" more than the safe area provides. Reduce fixed zones or spacing — safety zones are never borrowed.`,
      measurement: { actualIn: stack.overflow, limitIn: 0 },
    },
  ];
}
