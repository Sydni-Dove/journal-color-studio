/**
 * The hardcover outputs as print sheets (rendered into #print-root like the ordinary pages):
 *   cover sheets — the cover page exactly as designed, its background carried out over the board's squares,
 *                  edges and turn-ins, with the marks the maker chose (cut / laminate / chipboard), each on its own;
 *   assembly guide — the measurements, a drawing of each cover and the steps, on Letter;
 *   alignment template — each cover at actual size, tiled across sheets when it's bigger than the paper.
 * Nothing here changes the design or the ordinary export.
 */
import type { ReactNode } from "react";
import { geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { assemblySteps, inches, linerSize, type CoverFace, type HardcoverPlan } from "../../engines/assembly/hardcover";
import { ASSEMBLY_PAPER, coverSheetLayout, templateLayout, TILE_OVERLAP_IN, type CoverSheetLayout, type TemplateTile } from "../../engines/assembly/assemblyPrint";
import { pageRuleCss } from "../../engines/print/printPlan";
import { PrintablePage } from "../../primitives/PrintablePage";
import type { AssemblyExport } from "../../types/project";
import type { PageGeometry } from "../../types/geometry";
import { ASSEMBLY_COLORS, DrawingDefs, FacePieces } from "./AssemblyDrawing";

export const coverIndexOf = (doc: ResolvedDocument, which: "front" | "back") => doc.recipe.pages.findIndex((p) => p.layoutId === (which === "front" ? "cover-page" : "back-cover-page"));

/** The cover's art runs this far past the board's edge onto the turn-in, so no paper shows at the fold. */
export const ART_PAST_EDGE_IN = 0.125;

/**
 * The cover page drawn over what shows once wrapped: the board face, its edges and a little past the fold. The
 * design keeps its trim and scale (the art grows only by that band, like an ordinary bleed); the rest of the
 * turn-in is the page's background colour. `at` is where this geometry's media sits on the sheet.
 */
export function sheetGeometry(g: PageGeometry, face: CoverFace, plan: Pick<HardcoverPlan, "boardThicknessIn">): { geometry: PageGeometry; at: { x: number; y: number } } {
  const e = plan.boardThicknessIn + ART_PAST_EDGE_IN;
  const v = { x: face.board.x - e, y: face.board.y - e, w: face.board.w + 2 * e, h: face.board.h + 2 * e };
  const tx = face.trim.x - v.x, ty = face.trim.y - v.y;
  const bleed = { left: tx, top: ty, right: v.w - tx - face.trim.w, bottom: v.h - ty - face.trim.h };
  const inside = face.boundEdge === "left" || face.boundEdge === "top" ? bleed.left : bleed.right;
  const outside = face.boundEdge === "left" || face.boundEdge === "top" ? bleed.right : bleed.left;
  return {
    geometry: { ...g, bleed, bleedTopIn: bleed.top, bleedBottomIn: bleed.bottom, bleedInsideIn: inside, bleedOutsideIn: outside, mediaWidthIn: v.w, mediaHeightIn: v.h, trimOffset: { x: tx, y: ty } },
    at: { x: v.x, y: v.y },
  };
}

export type AssemblyJob = { pageW: number; pageH: number; pages: number; errors: string[]; notes: string[]; coverIndices: number[]; render: () => ReactNode };

export function assemblyJob(doc: ResolvedDocument, plan: HardcoverPlan, exp: AssemblyExport): AssemblyJob {
  const errors = [...plan.problems.filter((p) => /isn't|doesn't|Wire-O and disc-bound/.test(p))];
  const notes: string[] = [];
  if (exp.output === "cover-sheets") {
    const front = coverIndexOf(doc, "front"), back = coverIndexOf(doc, "back");
    const marks = exp.marks ?? {};
    const layout = coverSheetLayout(plan, !!(marks.cut || marks.laminate || marks.board), exp.paper);
    if (layout.error) errors.push(layout.error);
    if (front < 0) errors.push("This product has no front cover page. Add one in Pages (“+ Add front cover”) to print cover sheets.");
    if (front >= 0 && back < 0) notes.push("No back cover page: the back sheet carries the front cover's background without its wording. Add a back cover in Pages for a designed back.");
    if (marks.board) notes.push("Chipboard marks print on the front of the sheet, in the outer part of the turn-in (hidden under the inside liner). To place the board on the adhesive side, use the alignment template.");
    return {
      pageW: layout.pageW, pageH: layout.pageH, pages: front < 0 ? 0 : 2, errors, notes, coverIndices: [front, back].filter((i) => i >= 0),
      render: () => front < 0 ? null : (
        <>
          <style>{pageRuleCss(layout.pageW, layout.pageH)}</style>
          <CoverSheet doc={doc} plan={plan} face={plan.front} index={front} layout={layout} marks={marks} />
          <CoverSheet doc={doc} plan={plan} face={plan.back} index={back >= 0 ? back : front} blank={back < 0} layout={layout} marks={marks} />
        </>
      ),
    };
  }
  if (exp.output === "guide") {
    return {
      pageW: 8.5, pageH: 11, pages: 2, errors, notes, coverIndices: [],
      render: () => (
        <>
          <style>{pageRuleCss(8.5, 11)}</style>
          <GuidePages doc={doc} plan={plan} />
        </>
      ),
    };
  }
  const t = templateLayout(plan, exp.paper ?? "letter");
  if (t.tiles.length > 1) notes.push(`Each cover's template is ${t.tiles.length} sheets (${t.tiles[0].cols} across × ${t.tiles[0].rows} down). Trim one edge of each overlap and tape the sheets so the + marks line up.`);
  notes.push("Print at 100% (Actual size), then check the 1-inch square with a ruler before using the template.");
  return {
    pageW: t.pageW, pageH: t.pageH, pages: t.tiles.length * 2, errors, notes, coverIndices: [],
    render: () => (
      <>
        <style>{pageRuleCss(t.pageW, t.pageH)}</style>
        {[plan.front, plan.back].flatMap((face) => t.tiles.map((tile, k) => <TemplateSheet key={`${face.face}-${k}`} plan={plan} face={face} tile={tile} pageW={t.pageW} pageH={t.pageH} />))}
      </>
    ),
  };
}

const sheetStyle = (w: number, h: number) => ({ position: "relative" as const, width: `${w}in`, height: `${h}in`, overflow: "hidden" as const, breakAfter: "page" as const });

function CoverSheet({ doc, plan, face, index, blank = false, layout, marks }: { doc: ResolvedDocument; plan: HardcoverPlan; face: CoverFace; index: number; blank?: boolean; layout: CoverSheetLayout; marks: NonNullable<AssemblyExport["marks"]> }) {
  const { geometry: g, at } = sheetGeometry(geometryFor(doc, doc.recipe.pages[index], index), face, plan);
  const solved = solvePage(doc, index);
  return (
    <div className="ps-print-sheet ps-cover-sheet" data-face={face.face} style={sheetStyle(layout.pageW, layout.pageH)}>
      <div style={{ position: "absolute", left: `${layout.x}in`, top: `${layout.y}in`, width: `${face.sheet.w}in`, height: `${face.sheet.h}in`, background: doc.colors.background }} />
      <div style={{ position: "absolute", left: `${layout.x + at.x}in`, top: `${layout.y + at.y}in` }}>
        <PrintablePage geometry={g} solved={blank ? { ...solved, nodes: [] } : solved} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" />
      </div>
      <SheetMarks face={face} layout={layout} marks={marks} />
    </div>
  );
}

const MARK = { gap: 0.0625, len: 0.3, tick: 0.3 };
const pt = (p: number) => p / 72;

/** Cut, laminate and chipboard marks — each drawn only when chosen. Page coordinates (inches). */
export function SheetMarks({ face, layout, marks }: { face: CoverFace; layout: Pick<CoverSheetLayout, "pageW" | "pageH" | "x" | "y" | "outsideMarks">; marks: NonNullable<AssemblyExport["marks"]> }) {
  const { x, y } = layout;
  const W = face.sheet.w, H = face.sheet.h;
  const lines: { k: string; kind: "cut" | "corner" | "laminate" | "board"; d: [number, number, number, number]; color: string; dash?: string; w: number }[] = [];
  const room = Math.min(x, y, layout.pageW - x - W, layout.pageH - y - H);
  // Crop-style marks in the margin, in line with a rectangle's edges; with no room, L's just inside its corners.
  const crop = (r: { x: number; y: number; w: number; h: number }, color: string, key: string, kind: "cut" | "laminate") => {
    if (!layout.outsideMarks || room < MARK.gap + 0.1) {
      for (const [cx, cy, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]] as const)
        lines.push({ k: `${key}${cx}${cy}a`, kind, d: [x + cx, y + cy, x + cx + sx * MARK.len, y + cy], color, w: 0.5 }, { k: `${key}${cx}${cy}b`, kind, d: [x + cx, y + cy, x + cx, y + cy + sy * MARK.len], color, w: 0.5 });
      return;
    }
    const len = Math.min(MARK.len, room - MARK.gap);
    for (const cx of [r.x, r.x + r.w]) lines.push({ k: `${key}v${cx}t`, kind, d: [x + cx, y - MARK.gap - len, x + cx, y - MARK.gap], color, w: 0.5 }, { k: `${key}v${cx}b`, kind, d: [x + cx, y + H + MARK.gap, x + cx, y + H + MARK.gap + len], color, w: 0.5 });
    for (const cy of [r.y, r.y + r.h]) lines.push({ k: `${key}h${cy}l`, kind, d: [x - MARK.gap - len, y + cy, x - MARK.gap, y + cy], color, w: 0.5 }, { k: `${key}h${cy}r`, kind, d: [x + W + MARK.gap, y + cy, x + W + MARK.gap + len, y + cy], color, w: 0.5 });
  };
  if (marks.cut) {
    crop({ x: 0, y: 0, w: W, h: H }, "#000", "cut", "cut");
    face.cornerCuts.forEach((l, i) => lines.push({ k: `corner${i}`, kind: "corner", d: [x + l.x1, y + l.y1, x + l.x2, y + l.y2], color: "#000", dash: "0.1 0.04 0.02 0.04", w: 0.5 }));
  }
  if (marks.laminate) {
    const l = face.laminate;
    if (l.x > 0.05 && l.y > 0.05) {
      // The laminate's edges continued a little past its corners (toward the sheet edge), so its corners can be lined up.
      for (const [cx, cy, sx, sy] of [[l.x, l.y, -1, -1], [l.x + l.w, l.y, 1, -1], [l.x, l.y + l.h, -1, 1], [l.x + l.w, l.y + l.h, 1, 1]] as const) {
        const ex = Math.max(-cx, Math.min(W - cx, sx * MARK.tick)), ey = Math.max(-cy, Math.min(H - cy, sy * MARK.tick));
        lines.push({ k: `lam${cx}${cy}h`, kind: "laminate", d: [x + cx, y + cy, x + cx + ex, y + cy], color: ASSEMBLY_COLORS.laminate, dash: "0.06 0.03", w: 0.75 });
        lines.push({ k: `lam${cx}${cy}v`, kind: "laminate", d: [x + cx, y + cy, x + cx, y + cy + ey], color: ASSEMBLY_COLORS.laminate, dash: "0.06 0.03", w: 0.75 });
      }
    } else crop(l, ASSEMBLY_COLORS.laminate, "lam", "laminate");
  }
  if (marks.board) {
    // The board's edge lines, from the sheet edge inward (turn-in, under the liner) and out into the margin.
    const b = face.board, out = layout.outsideMarks ? Math.max(0, Math.min(0.2, room - MARK.gap)) : 0;
    for (const bx of [b.x, b.x + b.w]) lines.push({ k: `bt${bx}`, kind: "board", d: [x + bx, y - out, x + bx, y + MARK.tick], color: ASSEMBLY_COLORS.board, w: 0.75 }, { k: `bb${bx}`, kind: "board", d: [x + bx, y + H - MARK.tick, x + bx, y + H + out], color: ASSEMBLY_COLORS.board, w: 0.75 });
    for (const by of [b.y, b.y + b.h]) lines.push({ k: `bl${by}`, kind: "board", d: [x - out, y + by, x + MARK.tick, y + by], color: ASSEMBLY_COLORS.board, w: 0.75 }, { k: `br${by}`, kind: "board", d: [x + W - MARK.tick, y + by, x + W + out, y + by], color: ASSEMBLY_COLORS.board, w: 0.75 });
  }
  if (!lines.length) return null;
  return (
    <svg data-testid="assembly-marks" viewBox={`0 0 ${layout.pageW} ${layout.pageH}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true">
      {lines.map((l) => <line key={l.k} data-mark={l.kind} x1={l.d[0]} y1={l.d[1]} x2={l.d[2]} y2={l.d[3]} stroke={l.color} strokeWidth={pt(l.w)} strokeDasharray={l.dash} />)}
    </svg>
  );
}

function GuidePages({ doc, plan }: { doc: ResolvedDocument; plan: HardcoverPlan }) {
  const steps = assemblySteps(plan);
  const liner = linerSize(plan);
  const rows: [string, string][] = [
    ["Journal pages (trim)", `${inches(plan.trim.w, true)} × ${inches(plan.trim.h, true)}`],
    ["Printed cover sheet (each)", `${inches(plan.sheet.w, true)} × ${inches(plan.sheet.h, true)}`],
    ["Chipboard (cut 2)", `${inches(plan.board.w, true)} × ${inches(plan.board.h, true)}, ${inches(plan.boardThicknessIn)} thick`],
    ["Board past the pages", `${inches(Math.max(plan.squares.top, plan.squares.bottom, plan.squares.left, plan.squares.right))} on the edges that aren't bound; flush on the binding edge`],
    ["Covering past the board, each side", `${inches(plan.wrapIn, true)} = board edge ${inches(plan.boardThicknessIn)} + turn-in ${inches(plan.turnInIn)}`],
    ["Place the board", `${inches(plan.wrapIn)} in from every edge of the sheet`],
    ["Laminate piece", `${inches(plan.laminate.w, true)} × ${inches(plan.laminate.h, true)}; ${inches(plan.laminate.offsets.left)} from the left, ${inches(plan.laminate.offsets.right)} right, ${inches(plan.laminate.offsets.top)} top, ${inches(plan.laminate.offsets.bottom)} bottom (front)`],
    ["Corner cuts", `45°, ${inches(plan.cornerGapIn)} from each board corner — the cut meets each sheet edge ${inches(2 * plan.wrapIn - plan.cornerGapIn * Math.SQRT2)} from the sheet's corner`],
    [plan.binding === "discbound" ? "Disc slots" : "Wire-O holes", plan.binding === "discbound" ? `${inches(plan.holeCenterIn)} deep, every ${inches(plan.pitchIn)}` : `${inches(plan.holeCenterIn)} from the board edge to the hole centre, ${plan.pitchIn === 0.5 ? "2:1" : "3:1"} pitch (${plan.front.holes.length} holes) — set to your punch`],
    ["Binding-edge keep-clear", `${inches(plan.clearanceIn, true)} from the binding edge (front: ${plan.front.boundEdge}, back: ${plan.back.boundEdge})`],
    ["Inside liner (optional)", `${inches(liner.w)} × ${inches(liner.h)}`],
  ];
  const drawing = (face: CoverFace, box: { w: number; h: number }) => {
    // Labels print at 8 pt: in drawing units that depends on the scale, and the margin for the dimension lines with it.
    let k = Math.min(box.w / plan.sheet.w, box.h / plan.sheet.h), pad = 0;
    for (let i = 0; i < 4; i++) {
      pad = (0.11 / k) * 3.4;
      k = Math.min(box.w / (plan.sheet.w + pad + 0.1), box.h / (plan.sheet.h + pad + 0.1));
    }
    const W = plan.sheet.w + pad + 0.1, H = plan.sheet.h + pad + 0.1;
    return (
      <svg viewBox={`${-pad} ${-pad} ${W} ${H}`} style={{ width: `${W * k}in`, height: `${H * k}in`, display: "block", margin: "0 auto" }}>
        <DrawingDefs />
        <FacePieces plan={plan} face={face} fontIn={0.11 / k} />
      </svg>
    );
  };
  const page = (children: ReactNode, key: string) => (
    <div key={key} className="ps-print-sheet ps-assembly-guide" style={{ ...sheetStyle(8.5, 11), padding: "0.5in", boxSizing: "border-box", fontFamily: "Lato, Helvetica, Arial, sans-serif", fontSize: "9.5pt", color: "#222", background: "#fff" }}>{children}</div>
  );
  return (
    <>
      {page(
        <>
          <h1 style={{ fontSize: "16pt", margin: "0 0 2pt" }}>Hardcover assembly — {doc.project.name}</h1>
          <p style={{ margin: "0 0 8pt" }}>{plan.bindingLabel} · {inches(plan.trim.w)} × {inches(plan.trim.h)} {doc.trim.orientation} · {inches(plan.boardThicknessIn)} chipboard · {inches(plan.turnInIn)} turn-in</p>
          {drawing(plan.front, { w: 7.5, h: 5.2 })}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8pt" }}>
            <tbody>
              {rows.map(([a, b]) => (
                <tr key={a} style={{ borderTop: "0.5pt solid #ccc" }}><td style={{ padding: "2.5pt 6pt 2.5pt 0", fontWeight: 700, width: "34%", verticalAlign: "top" }}>{a}</td><td style={{ padding: "2.5pt 0" }}>{b}</td></tr>
              ))}
            </tbody>
          </table>
          {plan.problems.length > 0 && <div style={{ marginTop: "6pt", color: "#b71c1c" }}>{plan.problems.map((p) => <p key={p} style={{ margin: "2pt 0" }}>⚠ {p}</p>)}</div>}
        </>,
        "guide-1",
      )}
      {page(
        <>
          <h2 style={{ fontSize: "13pt", margin: "0 0 6pt" }}>Steps</h2>
          <ol style={{ margin: 0, paddingLeft: "16pt" }}>
            {steps.map((s) => <li key={s.title} style={{ margin: "0 0 4pt" }}><b>{s.title}.</b> {s.text}</li>)}
          </ol>
          <h2 style={{ fontSize: "13pt", margin: "10pt 0 4pt" }}>Back cover (mirrored: binding on the {plan.back.boundEdge})</h2>
          {drawing(plan.back, { w: 7.5, h: 4.4 })}
          <p style={{ marginTop: "6pt", fontSize: "8.5pt" }}>Key: pink solid = chipboard · dotted grey = your cover design · blue dashed = laminate · dash-dot = corner cuts · orange band = binding-edge keep-clear and {plan.binding === "discbound" ? "disc slots" : "holes"}. Hole positions are approximate; your punch sets them.</p>
        </>,
        "guide-2",
      )}
    </>
  );
}

function TemplateSheet({ plan, face, tile, pageW, pageH }: { plan: HardcoverPlan; face: CoverFace; tile: TemplateTile; pageW: number; pageH: number }) {
  const ox = (pageW - tile.w) / 2, oy = (pageH - tile.h) / 2;
  const many = tile.cols * tile.rows > 1;
  // Registration crosses on the overlap strips: each one prints on both neighbouring sheets.
  const crosses: [number, number][] = [];
  const b = { x: -0.25, y: -0.25, w: plan.sheet.w + 0.5, h: plan.sheet.h + 0.5 };
  if (many) {
    const stepX = tile.w - TILE_OVERLAP_IN, stepY = tile.h - TILE_OVERLAP_IN;
    for (let c = 1; c < tile.cols; c++) for (let yy = b.y + 1; yy < b.y + b.h - 0.5; yy += 2) crosses.push([b.x + c * stepX + TILE_OVERLAP_IN / 2, yy]);
    for (let r = 1; r < tile.rows; r++) for (let xx = b.x + 1; xx < b.x + b.w - 0.5; xx += 2) crosses.push([xx, b.y + r * stepY + TILE_OVERLAP_IN / 2]);
  }
  const sq = { x: face.board.x + face.board.w - 1.5, y: face.board.y + face.board.h - 1.5 };
  return (
    <div className="ps-print-sheet ps-assembly-template" data-face={face.face} style={sheetStyle(pageW, pageH)}>
      <svg viewBox={`${tile.x0} ${tile.y0} ${tile.w} ${tile.h}`} style={{ position: "absolute", left: `${ox}in`, top: `${oy}in`, width: `${tile.w}in`, height: `${tile.h}in` }}>
        <DrawingDefs />
        <FacePieces plan={plan} face={face} layers={{ sheet: true, board: true, trim: true, laminate: true, cuts: true, clearance: true, holes: true, labels: true }} fontIn={0.16} />
        {/* 1-inch check square */}
        <rect x={sq.x} y={sq.y} width={1} height={1} fill="none" stroke="#000" strokeWidth={pt(0.75)} />
        <text x={sq.x + 0.5} y={sq.y + 0.5} fontSize={0.11} textAnchor="middle" dominantBaseline="middle" fontFamily="Lato, Helvetica, Arial, sans-serif">1 in — check</text>
        {crosses.map(([cx, cy], i) => (
          <g key={i} stroke="#000" strokeWidth={pt(0.5)}><line x1={cx - 0.15} y1={cy} x2={cx + 0.15} y2={cy} /><line x1={cx} y1={cy - 0.15} x2={cx} y2={cy + 0.15} /></g>
        ))}
        {many && tile.col < tile.cols - 1 && <line x1={tile.x0 + tile.w - TILE_OVERLAP_IN} y1={tile.y0} x2={tile.x0 + tile.w - TILE_OVERLAP_IN} y2={tile.y0 + tile.h} stroke="#999" strokeDasharray="0.08 0.08" strokeWidth={pt(0.5)} />}
        {many && tile.row < tile.rows - 1 && <line x1={tile.x0} y1={tile.y0 + tile.h - TILE_OVERLAP_IN} x2={tile.x0 + tile.w} y2={tile.y0 + tile.h - TILE_OVERLAP_IN} stroke="#999" strokeDasharray="0.08 0.08" strokeWidth={pt(0.5)} />}
      </svg>
      <div style={{ position: "absolute", left: `${ox}in`, top: `${Math.max(0.02, oy - 0.2)}in`, fontSize: "7pt", fontFamily: "Lato, Helvetica, Arial, sans-serif", color: "#444" }}>
        {face.face === "front" ? "Front" : "Back"} cover alignment template · actual size{many ? ` · sheet ${tile.row * tile.cols + tile.col + 1} of ${tile.cols * tile.rows} (row ${tile.row + 1}, column ${tile.col + 1}) — overlap the dashed strip with the next sheet` : ""}
      </div>
    </div>
  );
}

export const assemblyPaperLabel = (p: AssemblyExport["paper"]) => (!p || p === "sheet" ? "Exact size" : ASSEMBLY_PAPER[p].label);
