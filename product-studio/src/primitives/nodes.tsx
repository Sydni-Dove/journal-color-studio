/**
 * Layout primitives. Each component draws one solved node type in inches.
 * They never compute geometry — positions come from the layout solvers —
 * so the editor preview and the print output are the same drawing.
 */
import { memo, type CSSProperties } from "react";
import type { BoxNode, CheckboxNode, DotsNode, LayoutNode, LinesNode, RuleNode, TextNode } from "../types/layout";
import type { ColorToken, TypographySettings } from "../types/tokens";
import { ptToIn } from "../engines/units/units";

export const colorVar = (t: ColorToken) => `var(--c-${t})`;

/** Stroke opacity: functional `line` color is scaled by the palette's lineOpacity. */
const strokeOpacity = (color: ColorToken, opacity: number) =>
  color === "line" ? `calc(var(--c-line-opacity) * ${opacity})` : String(opacity);

/** Paint goes through `style` so CSS custom properties resolve in every browser. */
const strokeStyle = (color: ColorToken, opacity = 1): CSSProperties => ({ stroke: colorVar(color), strokeOpacity: strokeOpacity(color, opacity), fill: "none" });

// ─── Vector primitives (SVG, user unit = 1 inch) ───────────────────────────
export function WritingLines({ node }: { node: LinesNode }) {
  const sw = ptToIn(node.strokePt);
  const d = node.positions
    .map((p) => (node.orientation === "horizontal" ? `M${node.from} ${p}H${node.to}` : `M${p} ${node.from}V${node.to}`))
    .join("");
  return <path d={d} style={strokeStyle(node.color, node.opacity)} strokeWidth={sw} data-node={node.id} />;
}
/** Graph grids are line sets drawn by the same primitive. */
export const GraphGrid = WritingLines;

export function DotGrid({ node }: { node: DotsNode }) {
  const r = ptToIn(node.dotPt) / 2;
  const dots: string[] = [];
  // One path of zero-length round-capped segments = one DOM node for thousands of dots.
  for (const y of node.ys) for (const x of node.xs) dots.push(`M${x} ${y}h0`);
  return (
    <path d={dots.join("")} style={strokeStyle(node.color, node.opacity)} strokeWidth={r * 2} strokeLinecap="round" data-node={node.id} />
  );
}

export function Box({ node }: { node: BoxNode }) {
  const { x, y, w, h } = node.rect;
  const sw = ptToIn(node.strokePt);
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={node.radiusIn}
      style={{ fill: node.fill ? colorVar(node.fill) : "none", fillOpacity: node.fillOpacity, stroke: node.stroke ? colorVar(node.stroke) : "none" }}
      strokeWidth={sw}
      data-node={node.id}
    />
  );
}
/** Calendar cells and grid cells are boxes with semantic names. */
export const CalendarCell = Box;
export const GridCell = Box;

export function Checkbox({ node }: { node: CheckboxNode }) {
  const { x, y, w, h } = node.rect;
  const sw = ptToIn(node.strokePt);
  // Stroke is drawn inside the box so the outer edge equals the solved size.
  return <rect x={x + sw / 2} y={y + sw / 2} width={w - sw} height={h - sw} rx={node.radiusIn} style={strokeStyle(node.color)} strokeWidth={sw} data-node={node.id} />;
}

export function Divider({ node }: { node: RuleNode }) {
  return <line x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2} style={strokeStyle(node.color)} strokeWidth={ptToIn(node.strokePt)} data-node={node.id} />;
}

// ─── Text primitive (HTML, positioned in inches) ───────────────────────────
export function TextBlock({ node, typography }: { node: TextNode; typography: TypographySettings }) {
  const role = typography.roles[node.role];
  const align = node.align ?? role.align;
  const style: CSSProperties = {
    position: "absolute",
    left: `${node.rect.x}in`,
    top: `${node.rect.y}in`,
    width: `${node.rect.w}in`,
    height: `${node.rect.h}in`,
    display: "flex",
    flexDirection: "column",
    justifyContent: node.vAlign === "top" ? "flex-start" : node.vAlign === "bottom" ? "flex-end" : "center",
    textAlign: align,
    fontFamily: `var(--f-${role.group})`,
    fontSize: `${role.sizePt}pt`,
    fontWeight: role.weight,
    fontStyle: role.style,
    letterSpacing: `${role.trackingEm}em`,
    lineHeight: role.lineHeight,
    textTransform: role.transform === "small-caps" || role.transform === "none" ? "none" : role.transform,
    fontVariant: role.transform === "small-caps" ? "small-caps" : undefined,
    color: colorVar(node.color ?? role.color),
    whiteSpace: node.wrap ? "normal" : "nowrap",
  };
  return (
    <div className="ps-text" style={style} data-node={node.id}>
      {node.text}
    </div>
  );
}

// ─── Layer renderers ───────────────────────────────────────────────────────
const isPattern = (n: LayoutNode) => n.type === "lines" || n.type === "dots";

/** Layer 3 — functional pattern (writing lines, dots, graph). */
export const PatternLayer = memo(function PatternLayer({ nodes }: { nodes: LayoutNode[] }) {
  return (
    <>
      {nodes.filter(isPattern).map((n) =>
        n.type === "dots" ? <DotGrid key={n.id} node={n} /> : n.type === "lines" ? <WritingLines key={n.id} node={n} /> : null,
      )}
    </>
  );
});

/** Layer 4 — layout structure (boxes, cells, rules, checkboxes). */
export const StructureLayer = memo(function StructureLayer({ nodes }: { nodes: LayoutNode[] }) {
  return (
    <>
      {nodes.map((n) => {
        switch (n.type) {
          case "box":
            return <Box key={n.id} node={n} />;
          case "checkbox":
            return <Checkbox key={n.id} node={n} />;
          case "rule":
            return <Divider key={n.id} node={n} />;
          default:
            return null;
        }
      })}
    </>
  );
});

/** Layer 5 — text / labels. */
export const TextLayer = memo(function TextLayer({ nodes, typography }: { nodes: LayoutNode[]; typography: TypographySettings }) {
  return <>{nodes.map((n) => (n.type === "text" ? <TextBlock key={n.id} node={n} typography={typography} /> : null))}</>;
});
