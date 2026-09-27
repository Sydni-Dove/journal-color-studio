/**
 * VISUAL HELP — tiny page diagrams that answer "what part of the page are you
 * talking about?" before the creator has to experiment. Presentation only:
 * nothing here reads or changes geometry.
 *
 * Every diagram is a 120 × 80 SVG: a page (or two), the area in question in
 * the accent tint, and a short caption.
 */
import type { ReactNode } from "react";
import type { DecorativePlacement } from "../../types/theme";

const W = 120, H = 80;
const PAGE = "help-page";
const AREA = "help-area";
const LINE = "help-line";

/** A portrait page centred in the frame (x, y, w, h). */
const page = (x: number, y: number, w: number, h: number, extra?: ReactNode, key?: string) => (
  <g key={key}>
    <rect className={PAGE} x={x} y={y} width={w} height={h} rx={1.5} />
    {extra}
  </g>
);
const lines = (x: number, y: number, w: number, n: number, gap: number) => Array.from({ length: n }, (_, i) => <line key={i} className={LINE} x1={x} y1={y + i * gap} x2={x + w} y2={y + i * gap} />);
const title = (x: number, y: number, w: number) => <rect x={x} y={y} width={w} height={3} rx={1} className="help-ink" />;
const sprig = (cx: number, cy: number, r = 4) => (
  <g className="help-art">
    <circle cx={cx} cy={cy} r={r} />
    <circle cx={cx + r * 1.3} cy={cy + r * 0.3} r={r * 0.7} />
    <circle cx={cx - r * 1.2} cy={cy + r * 0.4} r={r * 0.6} />
  </g>
);

export type VisualKind =
  | "orientation"
  | "binding"
  | "glue"
  | "margins"
  | "bleed"
  | "line-spacing"
  | "contained-vs-bleed"
  | "page-sides"
  | "daily-spread"
  | "background-vs-element"
  | "move"
  | `placement:${DecorativePlacement}`;

function Diagram({ kind, side = "left" }: { kind: VisualKind; side?: "left" | "right" | "both" }): ReactNode {
  const px = 40, py = 6, pw = 40, ph = 60; // single centred page
  switch (kind) {
    case "orientation":
      return (
        <>
          {page(14, 8, 36, 50)}
          {lines(19, 20, 26, 5, 7)}
          {page(62, 18, 50, 36)}
          {lines(67, 28, 40, 3, 7)}
        </>
      );
    case "binding":
      return page(px, py, pw, ph, (
        <>
          <rect className={AREA} x={px} y={py} width={9} height={ph} />
          {Array.from({ length: 7 }, (_, i) => <circle key={i} className="help-hole" cx={px + 4} cy={py + 6 + i * 8} r={1.4} />)}
          {lines(px + 13, py + 12, pw - 18, 6, 8)}
        </>
      ));
    case "glue":
      return page(px, py, pw, ph, (
        <>
          <rect className={AREA} x={px} y={py} width={pw} height={8} />
          {lines(px + 5, py + 18, pw - 10, 5, 8)}
        </>
      ));
    case "margins":
      return page(px, py, pw, ph, (
        <>
          <rect className="help-safe" x={px + 6} y={py + 6} width={pw - 12} height={ph - 12} />
          {lines(px + 9, py + 16, pw - 18, 5, 8)}
        </>
      ));
    case "bleed":
      return (
        <>
          <rect className={AREA} x={px - 5} y={py - 4} width={pw + 10} height={ph + 8} />
          {page(px, py, pw, ph, lines(px + 6, py + 14, pw - 12, 5, 8))}
          <rect className="help-cut" x={px} y={py} width={pw} height={ph} />
        </>
      );
    case "line-spacing":
      return (
        <>
          {page(px, py, pw, ph, lines(px + 5, py + 14, pw - 10, 6, 8))}
          <line className="help-arrow" x1={px + pw + 6} y1={py + 22} x2={px + pw + 6} y2={py + 30} markerStart="url(#help-ah)" markerEnd="url(#help-ah)" />
        </>
      );
    case "contained-vs-bleed":
      return (
        <>
          {page(12, 8, 40, 56, sprig(42, 16, 4))}
          {page(68, 8, 40, 56, sprig(106, 12, 5))}
          <rect className="help-cut" x={68} y={8} width={40} height={56} />
        </>
      );
    case "page-sides":
      return (
        <>
          {page(20, 8, 40, 56, side !== "right" ? <rect className={AREA} x={20} y={8} width={40} height={56} /> : null)}
          {page(60, 8, 40, 56, side !== "left" ? <rect className={AREA} x={60} y={8} width={40} height={56} /> : null)}
          <line className="help-spine" x1={60} y1={6} x2={60} y2={66} />
        </>
      );
    case "daily-spread":
      return (
        <>
          {page(8, 10, 34, 50, lines(12, 22, 26, 4, 8))}
          {page(58, 10, 27, 50, lines(61, 22, 21, 4, 8))}
          {page(85, 10, 27, 50, lines(88, 22, 21, 4, 8))}
          <line className="help-spine" x1={85} y1={8} x2={85} y2={62} />
        </>
      );
    case "background-vs-element":
      return (
        <>
          {page(12, 8, 40, 56, <rect className={AREA} x={12} y={8} width={40} height={12} />)}
          {page(68, 8, 40, 56, <>{title(73, 14, 16)}{sprig(96, 15, 3)}</>)}
        </>
      );
    case "move":
      return page(px, py, pw, ph, (
        <>
          {sprig(px + pw / 2, py + ph / 2, 4)}
          <line className="help-arrow" x1={px + 6} y1={py + ph / 2} x2={px + pw - 6} y2={py + ph / 2} markerStart="url(#help-ah)" markerEnd="url(#help-ah)" />
          <line className="help-arrow" x1={px + pw / 2} y1={py + 8} x2={px + pw / 2} y2={py + ph - 8} markerStart="url(#help-ah)" markerEnd="url(#help-ah)" />
        </>
      ));
  }
  // Decoration placements: where on the page the design goes.
  const p = kind.slice("placement:".length) as DecorativePlacement;
  const body = (
    <>
      {title(px + 5, py + 6, 18)}
      <line className={LINE} x1={px + 5} y1={py + 12} x2={px + pw - 5} y2={py + 12} />
      {lines(px + 5, py + 22, pw - 10, 4, 8)}
    </>
  );
  const areas: Record<DecorativePlacement, ReactNode> = {
    "full-page": <rect className={AREA} x={px} y={py} width={pw} height={ph} />,
    "header-band": <rect className={AREA} x={px} y={py} width={pw} height={10} />,
    "footer-band": <rect className={AREA} x={px} y={py + ph - 10} width={pw} height={10} />,
    "edge-strip": <rect className={AREA} x={px + pw - 5} y={py} width={5} height={ph} />,
    "border-frame": <path className={AREA} fillRule="evenodd" d={`M${px},${py}h${pw}v${ph}h${-pw}z M${px + 4},${py + 4}v${ph - 8}h${pw - 8}v${-(ph - 8)}z`} />,
    corners: <>{sprig(px + 5, py + 6, 3)}{sprig(px + pw - 6, py + ph - 6, 3)}</>,
    "table-corner": <><rect className="help-safe" x={px + 6} y={py + 20} width={pw - 12} height={30} />{sprig(px + pw - 6, py + 20, 3)}</>,
    "title-accent": sprig(px + 28, py + 8, 3),
    "top-bottom": <>{sprig(px + pw / 2, py + 2, 3)}{sprig(px + pw / 2, py + ph - 2, 3)}</>,
    "behind-title": <rect className={AREA} x={px + 3} y={py + 3} width={24} height={9} />,
    "edge-accent": sprig(px + pw - 2, py + ph / 2, 4),
    "header-flourish": <path className="help-art-line" d={`M${px + 6},${py + 12} q8,-6 16,0 t16,0`} />,
    "footer-flourish": <path className="help-art-line" d={`M${px + 6},${py + ph - 6} q8,-6 16,0 t16,0`} />,
  };
  return page(px, py, pw, ph, <>{areas[p]}{body}</>);
}

const CAPTION: Record<string, string> = {
  orientation: "Portrait (tall) · Landscape (wide)",
  binding: "Binding space: kept clear for rings, coil or the spine",
  glue: "The glued strip where pad sheets tear off",
  margins: "Important content stays inside the dashed line",
  bleed: "Color runs past the cut edge, so no white sliver shows after trimming",
  "line-spacing": "Space between writing lines",
  "contained-vs-bleed": "Inside the page · Runs off the edge",
  "page-sides": "An open book: left-hand page · right-hand page",
  "daily-spread": "One page · Two-page spread",
  "background-vs-element": "Background: covers an area · Element: one piece of art",
  move: "Nudge left / right and up / down",
};

/** A compact diagram with a one-line caption. `caption` overrides the default. */
export function Visual({ kind, caption, side }: { kind: VisualKind; caption?: string; side?: "left" | "right" | "both" }) {
  const cap = caption ?? CAPTION[kind] ?? "";
  return (
    <figure className="help-visual" data-visual={kind}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={cap}>
        <defs>
          <marker id="help-ah" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" className="help-ink" />
          </marker>
        </defs>
        <Diagram kind={kind} side={side} />
      </svg>
      {cap && <figcaption>{cap}</figcaption>}
    </figure>
  );
}

/** Advanced users only: exact measurements, ids and sources, collapsed by default. */
export function TechnicalDetails({ children, label = "Technical details" }: { children: ReactNode; label?: string }) {
  return (
    <details className="tech-details">
      <summary>{label}</summary>
      <div className="tech-details__body">{children}</div>
    </details>
  );
}

/** Settings most creators never need, collapsed by default. */
export function Advanced({ children, label = "Advanced settings" }: { children: ReactNode; label?: string }) {
  return (
    <details className="advanced">
      <summary>{label}</summary>
      <div className="advanced__body">{children}</div>
    </details>
  );
}
