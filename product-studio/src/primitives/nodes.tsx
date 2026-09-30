/**
 * Layout primitives. Each component draws one solved node type in inches.
 * They never compute geometry — positions come from the layout solvers —
 * so the editor preview and the print output are the same drawing.
 */
import { fontStack } from "../presets/typography/typography";
import { useId, memo, type CSSProperties } from "react";
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
    fontFamily: role.family ? fontStack(role.family) : `var(--f-${role.group})`,
    fontSize: `${node.fit?.sizePt ?? role.sizePt}pt`,
    fontWeight: role.weight,
    fontStyle: role.style,
    letterSpacing: `${node.fit?.trackingEm ?? role.trackingEm}em`,
    lineHeight: node.fit?.lineHeight ?? role.lineHeight,
    textTransform: role.transform === "small-caps" || role.transform === "none" ? "none" : role.transform,
    fontVariant: role.transform === "small-caps" ? "small-caps" : undefined,
    color: colorVar(node.color ?? role.color),
    whiteSpace: node.wrap && !node.fit ? "normal" : "nowrap",
  };
  return (
    <div className="ps-text" style={style} data-node={node.id} data-fit={node.fit ? `${node.fit.sizePt}pt×${node.fit.lines.length}` : undefined}>
      {node.fit?.failed ? (
        // Reported as a heading-fit error (export is blocked); never drawn across its borders meanwhile.
        node.fit.lines.map((l, i) => <span key={i} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</span>)
      ) : node.fit && node.fit.lines.length > 1 ? (
        node.fit.lines.map((l, i) => <span key={i} style={{ display: "block" }}>{l}</span>)
      ) : (
        node.text
      )}
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

/**
 * Cheetah print: one tile (a third of the circle, so every circle shows the same
 * number of rosettes) of broken dark rings around warm centres, with fine
 * speckles, on the palette's pattern ground. Fixed, seeded geometry — preview
 * and print draw the identical pattern.
 */
const CHEETAH_TILE = 0.4;
/** Rosette positions below are laid out on a tile of 1/3; they scale with the tile. */
const K = CHEETAH_TILE * 3;
const CHEETAH = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // [cx, cy, size] — each rosette (with its ring of spots) stays inside the tile, so tiles join without seams.
  const rosettes = [
    [0.1, 0.1, 0.075], [0.245, 0.19, 0.065], [0.1, 0.258, 0.055], [0.275, 0.045, 0.03],
  ].map(([x, y, z]) => {
    const cx = x * K, cy = y * K, s = z * K;
    const rot = rnd() * Math.PI * 2, n = 4 + Math.round(rnd());
    // Chunky, nearly round spots in a broken ring (as in a real cheetah/leopard rosette).
    const blobs = Array.from({ length: n }, (_, k) => {
      const a = rot + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.45, d = s * (0.68 + rnd() * 0.1);
      return { cx: cx + Math.cos(a) * d, cy: cy + Math.sin(a) * d, rx: s * (0.42 + rnd() * 0.1), ry: s * (0.33 + rnd() * 0.07), deg: (a * 180) / Math.PI + 90 };
    });
    return { cx, cy, core: s * 0.6, blobs };
  });
  const specks = Array.from({ length: 22 }, () => ({ cx: 0.01 + rnd() * (CHEETAH_TILE - 0.02), cy: 0.01 + rnd() * (CHEETAH_TILE - 0.02), r: 0.003 + rnd() * 0.005 }));
  return { rosettes, specks };
})();

function CheetahPattern({ id }: { id: string }) {
  const ink = { fill: colorVar("patternInk") };
  return (
    <pattern id={id} width={CHEETAH_TILE} height={CHEETAH_TILE} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox">
      <rect width={CHEETAH_TILE} height={CHEETAH_TILE} style={{ fill: colorVar("patternGround") }} />
      <ellipse cx={0.2 * K} cy={0.08 * K} rx={0.09 * K} ry={0.05 * K} style={{ fill: colorVar("background"), opacity: 0.18 }} />
      <ellipse cx={0.06 * K} cy={0.3 * K} rx={0.07 * K} ry={0.04 * K} style={{ fill: colorVar("background"), opacity: 0.14 }} />
      {CHEETAH.rosettes.map((r, i) => (
        <g key={i}>
          <circle cx={r.cx} cy={r.cy} r={r.core} style={{ ...ink, opacity: 0.42 }} />
          {r.blobs.map((b, j) => <ellipse key={j} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} transform={`rotate(${b.deg} ${b.cx} ${b.cy})`} style={ink} />)}
        </g>
      ))}
      {CHEETAH.specks.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} style={ink} />)}
    </pattern>
  );
}

/** Layer 4 — layout structure (boxes, cells, rules, checkboxes). */
export const StructureLayer = memo(function StructureLayer({ nodes }: { nodes: LayoutNode[] }) {
  const patternId = `leopard-${useId().replace(/:/g, "")}`;
  return (
    <>
      {nodes.some((n) => n.type === "circle" && n.leopard) && <defs><CheetahPattern id={patternId} /></defs>}
      {nodes.map((n) => {
        switch (n.type) {
          case "circle":
            return <ellipse key={n.id} cx={n.rect.x + n.rect.w / 2} cy={n.rect.y + n.rect.h / 2} rx={n.rect.w / 2} ry={n.rect.h / 2} style={{ fill: n.leopard ? `url(#${patternId})` : n.fill ? colorVar(n.fill) : "none", stroke: n.outline ? colorVar(n.stroke ?? "text") : "none" }} strokeWidth={n.outline ? ptToIn(n.strokePt ?? 0.58) : 0} data-node={n.id} />;
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
