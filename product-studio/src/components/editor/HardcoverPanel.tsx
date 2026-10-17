/**
 * Page setup → Hardcover: the maker's chipboard, turn-in and laminate, and the measurements they give, live.
 * Off by default; turning it on changes no page or ordinary export — it adds the hardcover outputs to Export.
 */
import { useMemo } from "react";
import { BOARD_THICKNESSES, defaultClearanceIn, defaultHoleCenterIn, HARDCOVER_DEFAULTS, inches, WIRE_SIZES, fraction, type HardcoverSettings, type LaminateMode } from "../../engines/assembly/hardcover";
import { hardcoverPlanFor } from "../../engines/assembly/forDocument";
import type { ResolvedDocument } from "../../engines/document/resolve";
import type { ProductionSettings } from "../../types/project";
import { DrawingDefs, FacePieces } from "../assembly/AssemblyDrawing";
import { Check, NumberField, Select } from "./ui";

const LAMINATE_LABEL: Record<LaminateMode, string> = {
  wrap: "Board face and edges, a little onto the turn-in",
  full: "The whole printed sheet",
  inset: "The sheet, less a margin all round",
  custom: "A piece of a set size (centred)",
};

export function HardcoverControls({ doc, prod, set }: { doc: ResolvedDocument | null; prod: ProductionSettings; set: (patch: Partial<ProductionSettings>) => void }) {
  const h: HardcoverSettings | undefined = prod.hardcover;
  const on = !!h?.enabled;
  const s: HardcoverSettings = { ...HARDCOVER_DEFAULTS, ...h, laminate: { ...HARDCOVER_DEFAULTS.laminate, ...h?.laminate } };
  const put = (patch: Partial<HardcoverSettings>) => set({ hardcover: { ...s, ...patch } });
  const plan = useMemo(() => (doc && on ? hardcoverPlanFor(doc) : null), [doc, on]);
  const binding = prod.bindingType === "discbound" ? "discbound" : "wire-o";
  const presetBoard = BOARD_THICKNESSES.find((b) => Math.abs(b.in - s.boardThicknessIn) < 1e-6);
  return (
    <div className="hardcover" data-testid="hardcover-controls">
      <Check label="Hardcover with chipboard (assembly guide and templates)" checked={on} onChange={(enabled) => set({ hardcover: { ...s, enabled } })} />
      {!on && <p className="hint">For journals you wrap in chipboard yourself (Wire-O or disc-bound). Adds the cover sheets, an assembly guide and an alignment template to Export. Your pages and designs don't change.</p>}
      {on && (
        <>
          <Select
            label="Chipboard thickness"
            value={presetBoard ? String(presetBoard.in) : "custom"}
            options={[...BOARD_THICKNESSES.map((b) => ({ value: String(b.in), label: b.label })), { value: "custom", label: "Other…" }]}
            onChange={(v) => v !== "custom" && put({ boardThicknessIn: +v })}
          />
          {!presetBoard && <NumberField label="Chipboard thickness" suffix="in" step={0.005} min={0.02} max={0.25} value={s.boardThicknessIn} onChange={(boardThicknessIn) => put({ boardThicknessIn })} />}
          <NumberField label="Board past the pages (head, tail, fore-edge)" suffix="in" step={0.0625} min={0} max={0.5} value={s.squaresIn} onChange={(squaresIn) => put({ squaresIn })} />
          <NumberField label="Turn-in (covering folded onto the inside)" suffix="in" step={0.0625} min={0.25} max={2} value={s.turnInIn} onChange={(turnInIn) => put({ turnInIn })} />
          <NumberField label="Corner gap (board corner to the 45° cut)" suffix="in" step={0.01} min={0.02} max={0.5} value={s.cornerGapIn ?? 1.5 * s.boardThicknessIn} onChange={(cornerGapIn) => put({ cornerGapIn })} />
          <Select label="Laminate covers" value={s.laminate.mode} options={(Object.keys(LAMINATE_LABEL) as LaminateMode[]).map((m) => ({ value: m, label: LAMINATE_LABEL[m] }))} onChange={(mode) => put({ laminate: { ...s.laminate, mode } })} />
          {s.laminate.mode === "wrap" && <NumberField label="Laminate onto the turn-in" suffix="in" step={0.0625} min={0} max={s.turnInIn} value={s.laminate.extendIn ?? 0.25} onChange={(extendIn) => put({ laminate: { ...s.laminate, extendIn } })} />}
          {s.laminate.mode === "inset" && <NumberField label="Unlaminated margin" suffix="in" step={0.0625} min={0} max={1} value={s.laminate.insetIn ?? 0.25} onChange={(insetIn) => put({ laminate: { ...s.laminate, insetIn } })} />}
          {s.laminate.mode === "custom" && (
            <>
              <NumberField label="Laminate width" suffix="in" step={0.125} min={1} max={30} value={s.laminate.widthIn ?? plan?.sheet.w ?? 10} onChange={(widthIn) => put({ laminate: { ...s.laminate, widthIn } })} />
              <NumberField label="Laminate height" suffix="in" step={0.125} min={1} max={30} value={s.laminate.heightIn ?? plan?.sheet.h ?? 12} onChange={(heightIn) => put({ laminate: { ...s.laminate, heightIn } })} />
            </>
          )}
          {binding === "wire-o" && (
            <Select label="Wire-O size" value={String(s.wireSizeIn ?? 0.75)} options={WIRE_SIZES.map((w) => ({ value: String(w), label: `${fraction(w)}"` }))} onChange={(v) => put({ wireSizeIn: +v })} />
          )}
          <NumberField
            label={binding === "discbound" ? "Your punch: slot depth" : "Your punch: edge to hole centre"}
            suffix="in" step={0.01} min={0.1} max={0.75}
            value={s.holeCenterIn ?? defaultHoleCenterIn(binding, s.wireSizeIn)}
            onChange={(holeCenterIn) => put({ holeCenterIn })}
          />
          <NumberField label="Keep artwork clear of the binding edge" suffix="in" step={0.0625} min={0.25} max={1.5} value={s.clearanceIn ?? defaultClearanceIn(binding)} onChange={(clearanceIn) => put({ clearanceIn })} />
          {plan && (
            <div className="hardcover-summary" data-testid="hardcover-summary">
              <svg viewBox={`-0.1 -0.1 ${plan.sheet.w + 0.2} ${plan.sheet.h + 0.2}`} style={{ width: "100%", maxWidth: 320, display: "block", margin: "8px auto" }} role="img" aria-label="Front cover: printed sheet, chipboard, laminate and corner cuts">
                <DrawingDefs />
                <FacePieces plan={plan} face={plan.front} layers={{ sheet: true, board: true, trim: true, laminate: true, cuts: true, clearance: true, holes: true }} />
              </svg>
              <dl className="hardcover-dims">
                <dt>Printed cover (each)</dt><dd>{inches(plan.sheet.w, true)} × {inches(plan.sheet.h, true)}</dd>
                <dt>Chipboard (cut 2)</dt><dd>{inches(plan.board.w, true)} × {inches(plan.board.h, true)}</dd>
                <dt>Place the board</dt><dd>{inches(plan.wrapIn)} in from every edge ({inches(plan.boardThicknessIn)} edge + {inches(plan.turnInIn)} turn-in)</dd>
                <dt>Laminate</dt><dd>{inches(plan.laminate.w)} × {inches(plan.laminate.h)}, {inches(plan.laminate.offsets.top)} from the sheet edges</dd>
                <dt>Corner cuts</dt><dd>45°, {inches(plan.cornerGapIn)} from each board corner</dd>
                <dt>Binding edge</dt><dd>{plan.bindingLabel}: keep clear {inches(plan.clearanceIn)}; {plan.binding === "discbound" ? `slots ${inches(plan.holeCenterIn)} deep` : `holes ${inches(plan.holeCenterIn)} in, ${plan.pitchIn === 0.5 ? "2:1" : "3:1"} pitch`}</dd>
              </dl>
              {plan.problems.map((p) => <p key={p} className="issue issue--warning">{p}</p>)}
              <p className="hint">Print the cover sheets, guide or alignment template from Export.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
