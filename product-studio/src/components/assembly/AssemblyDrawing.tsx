/**
 * One cover face of a hardcover plan, drawn in inches (the SVG's units are the sheet's inches). The assembly
 * guide shows it scaled down with labels; the alignment template prints it at actual size; the cover-sheet
 * marks reuse its pieces. Lines keep their printed width at any scale (non-scaling strokes, in points).
 */
import type { CoverFace, HardcoverPlan } from "../../engines/assembly/hardcover";
import { inches } from "../../engines/assembly/hardcover";

export type DrawingLayers = {
  sheet?: boolean;
  board?: boolean;
  trim?: boolean;
  laminate?: boolean;
  cuts?: boolean;
  clearance?: boolean;
  holes?: boolean;
  labels?: boolean;
  dimensions?: boolean;
};

const ALL: DrawingLayers = { sheet: true, board: true, trim: true, laminate: true, cuts: true, clearance: true, holes: true, labels: true, dimensions: true };
/** Colours chosen to stay distinct in greyscale too: board solid, laminate dashed, cuts dash-dot, trim dotted. */
export const ASSEMBLY_COLORS = { sheet: "#222", board: "#c2185b", boardFill: "rgba(236, 64, 122, 0.12)", laminate: "#1565c0", cut: "#222", trim: "#6d6d6d", clearance: "rgba(255, 152, 0, 0.18)", clearanceLine: "#e65100", hole: "#e65100" };

/** Stroke widths in points; non-scaling so a thumbnail and the actual-size template print the same line weight. */
const stroke = (pt: number) => ({ strokeWidth: pt * (96 / 72), vectorEffect: "non-scaling-stroke" as const });

export function FacePieces({ plan, face, layers = ALL, fontIn = 0.16 }: { plan: HardcoverPlan; face: CoverFace; layers?: DrawingLayers; fontIn?: number }) {
  const { sheet, board, trim, laminate, clearance } = face;
  const c = ASSEMBLY_COLORS;
  const label = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", color = "#222", rotate = 0) => (
    <text x={x} y={y} fontSize={fontIn} fill={color} textAnchor={anchor} dominantBaseline="middle" fontFamily="Lato, Helvetica, Arial, sans-serif" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>{text}</text>
  );
  return (
    <g data-face={face.face}>
      {layers.sheet && <rect x={0} y={0} width={sheet.w} height={sheet.h} fill="#fff" stroke={c.sheet} {...stroke(0.75)} />}
      {layers.clearance && (
        <rect data-piece="clearance" x={clearance.x} y={clearance.y} width={clearance.w} height={clearance.h} fill={c.clearance} stroke={c.clearanceLine} strokeDasharray="0.06 0.04" {...stroke(0.5)} />
      )}
      {layers.board && <rect data-piece="board" x={board.x} y={board.y} width={board.w} height={board.h} fill={c.boardFill} stroke={c.board} {...stroke(1)} />}
      {layers.trim && <rect data-piece="trim" x={trim.x} y={trim.y} width={trim.w} height={trim.h} fill="none" stroke={c.trim} strokeDasharray="0.02 0.05" {...stroke(0.5)} />}
      {layers.laminate && <rect data-piece="laminate" x={laminate.x} y={laminate.y} width={laminate.w} height={laminate.h} fill="none" stroke={c.laminate} strokeDasharray="0.12 0.06" {...stroke(0.75)} />}
      {layers.holes && face.holes.map((h, i) => (
        <rect key={i} data-piece="hole" x={h.cx - h.w / 2} y={h.cy - h.h / 2} width={h.w} height={h.h} rx={h.shape === "mushroom" ? Math.min(h.w, h.h) / 2 : 0.01} fill="none" stroke={c.hole} {...stroke(0.5)} />
      ))}
      {layers.cuts && face.cornerCuts.map((l, i) => (
        <line key={i} data-piece="corner-cut" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={c.cut} strokeDasharray="0.1 0.04 0.02 0.04" {...stroke(0.75)} />
      ))}
      {layers.labels && (
        <>
          {label(board.x + board.w / 2, board.y + board.h / 2 - fontIn * 1.3, face.face === "front" ? "FRONT COVER — chipboard here" : "BACK COVER — chipboard here", "middle", c.board)}
          {label(board.x + board.w / 2, board.y + board.h / 2 + fontIn * 0.2, `Board ${inches(plan.board.w)} × ${inches(plan.board.h)}`, "middle", c.board)}
          {label(board.x + board.w / 2, board.y + board.h / 2 + fontIn * 1.6, `Design (cover page) ${inches(plan.trim.w)} × ${inches(plan.trim.h)} — dotted`, "middle", c.trim)}
          {label(laminate.x + laminate.w / 2, Math.max(fontIn, laminate.y - fontIn * 0.8), `Laminate ${inches(plan.laminate.w)} × ${inches(plan.laminate.h)} — dashed`, "middle", c.laminate)}
          {/* Beside the band (not over the holes), on the board side. */}
          {face.boundEdge === "left"
            ? label(clearance.x + clearance.w + fontIn * 0.9, clearance.y + clearance.h / 2, `Binding edge — keep clear ${inches(plan.clearanceIn)}`, "middle", c.clearanceLine, -90)
            : face.boundEdge === "right"
              ? label(clearance.x - fontIn * 0.9, clearance.y + clearance.h / 2, `Binding edge — keep clear ${inches(plan.clearanceIn)}`, "middle", c.clearanceLine, 90)
              : face.boundEdge === "top"
                ? label(clearance.x + clearance.w / 2, clearance.y + clearance.h + fontIn * 0.9, `Binding edge — keep clear ${inches(plan.clearanceIn)}`, "middle", c.clearanceLine)
                : label(clearance.x + clearance.w / 2, clearance.y - fontIn * 0.9, `Binding edge — keep clear ${inches(plan.clearanceIn)}`, "middle", c.clearanceLine)}
          {label(sheet.w / 2, sheet.h - fontIn * 0.9, `Corner cuts (dash-dot): ${inches(plan.cornerGapIn)} from each board corner`, "middle")}
        </>
      )}
      {layers.dimensions && <Dimensions plan={plan} face={face} fontIn={fontIn} />}
    </g>
  );
}

/** Dimension call-outs: sheet width/height outside the sheet, the wrap on one side. */
function Dimensions({ plan, face, fontIn }: { plan: HardcoverPlan; face: CoverFace; fontIn: number }) {
  const { sheet, board } = face;
  const off = fontIn * 1.6;
  const t = (x: number, y: number, s: string, rot = 0) => (
    <text x={x} y={y} fontSize={fontIn} textAnchor="middle" dominantBaseline="middle" fontFamily="Lato, Helvetica, Arial, sans-serif" fill="#222" transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{s}</text>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" markerStart="url(#ps-arrow)" markerEnd="url(#ps-arrow)" {...stroke(0.5)} />;
  return (
    <g data-piece="dimensions">
      {arrow(0, -off, sheet.w, -off)}
      {t(sheet.w / 2, -off - fontIn * 0.9, `Printed cover ${inches(sheet.w, true)}`)}
      {arrow(-off, 0, -off, sheet.h)}
      {t(-off - fontIn * 0.9, sheet.h / 2, `${inches(sheet.h, true)}`, -90)}
      {/* The wrap, on the side away from the binding, its words inside the board. */}
      {face.boundEdge === "right" ? arrow(0, board.y + board.h * 0.3, board.x - 0.02, board.y + board.h * 0.3) : arrow(board.x + board.w + 0.02, board.y + board.h * 0.3, sheet.w, board.y + board.h * 0.3)}
      <text x={face.boundEdge === "right" ? board.x + fontIn * 0.4 : board.x + board.w - fontIn * 0.4} y={board.y + board.h * 0.3} fontSize={fontIn} textAnchor={face.boundEdge === "right" ? "start" : "end"} dominantBaseline="middle" fontFamily="Lato, Helvetica, Arial, sans-serif" fill="#222">{`wrap ${inches(plan.wrapIn)} each side`}</text>
    </g>
  );
}

/** Arrowhead marker shared by every drawing on the page. */
export function DrawingDefs() {
  return (
    <defs>
      <marker id="ps-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#222" />
      </marker>
    </defs>
  );
}
