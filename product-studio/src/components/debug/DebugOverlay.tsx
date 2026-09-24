/**
 * DEBUG GEOMETRY OVERLAY — editor only. Never rendered by the print
 * renderer, and additionally hidden by print CSS (.ps-debug).
 */
import { memo } from "react";
import type { PageGeometry } from "../../types/geometry";
import type { LayoutNode } from "../../types/layout";

export type DebugFlags = {
  trim: boolean;
  bleed: boolean;
  safe: boolean;
  bindingKeepOut: boolean;
  glueKeepOut: boolean;
  grid: boolean;
  bounds: boolean;
  centerLines: boolean;
  rowLines: boolean;
  columnLines: boolean;
};

export const DEBUG_LABELS: Record<keyof DebugFlags, string> = {
  trim: "Trim",
  bleed: "Bleed",
  safe: "Safe area",
  bindingKeepOut: "Binding keep-out",
  glueKeepOut: "Glue keep-out",
  grid: "Grid / punch",
  bounds: "Component bounds",
  centerLines: "Center lines",
  rowLines: "Row lines",
  columnLines: "Column lines",
};

export const DEBUG_OFF: DebugFlags = {
  trim: false, bleed: false, safe: false, bindingKeepOut: false, glueKeepOut: false,
  grid: false, bounds: false, centerLines: false, rowLines: false, columnLines: false,
};
export const DEBUG_ALL: DebugFlags = Object.fromEntries(Object.keys(DEBUG_OFF).map((k) => [k, true])) as DebugFlags;

/** Hairline width in inches (≈0.5 pt). */
const HAIR = 0.5 / 72;

type Props = { geometry: PageGeometry; nodes: LayoutNode[]; flags: DebugFlags; issueIds: Set<string> };

export const DebugOverlay = memo(function DebugOverlay({ geometry: g, nodes, flags, issueIds }: Props) {
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const t = g.trimOffset;
  const groups = nodes.filter((n) => n.type === "group");
  return (
    <svg className="ps-layer ps-debug" viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}in`, height: `${H}in` }} aria-hidden>
      {flags.bleed && (g.bleed.top || g.bleed.bottom || g.bleed.left || g.bleed.right) ? (
        <path
          d={`M0 0H${W}V${H}H0Z M${t.x} ${t.y}V${t.y + g.trimHeightIn}H${t.x + g.trimWidthIn}V${t.y}Z`}
          fill="#e11d48"
          fillOpacity={0.12}
          fillRule="evenodd"
        />
      ) : null}
      <g transform={`translate(${t.x} ${t.y})`}>
        {flags.bindingKeepOut &&
          g.keepOuts.filter((k) => k.kind === "binding").map((k) => (
            <rect key={k.id} x={k.rect.x} y={k.rect.y} width={k.rect.w} height={k.rect.h} fill="#7c3aed" fillOpacity={0.16} stroke="#7c3aed" strokeWidth={HAIR} />
          ))}
        {flags.glueKeepOut &&
          g.keepOuts.filter((k) => k.kind === "glue").map((k) => (
            <rect key={k.id} x={k.rect.x} y={k.rect.y} width={k.rect.w} height={k.rect.h} fill="#d97706" fillOpacity={k.id === "glue-band" ? 0.28 : 0.12} stroke="#d97706" strokeWidth={HAIR} />
          ))}
        {flags.grid &&
          g.holes.map((h, i) =>
            h.shape === "round" ? (
              <circle key={i} cx={h.cx} cy={h.cy} r={h.w / 2} fill="none" stroke="#7c3aed" strokeWidth={HAIR} />
            ) : (
              <rect key={i} x={h.cx - h.w / 2} y={h.cy - h.h / 2} width={h.w} height={h.h} fill="none" stroke="#7c3aed" strokeWidth={HAIR} />
            ),
          )}
        {flags.trim && <rect x={0} y={0} width={g.trimWidthIn} height={g.trimHeightIn} fill="none" stroke="#111827" strokeWidth={HAIR * 2} />}
        {flags.safe && (
          <rect x={g.safeRect.x} y={g.safeRect.y} width={g.safeRect.w} height={g.safeRect.h} fill="none" stroke="#16a34a" strokeWidth={HAIR * 2} strokeDasharray="0.08 0.05" />
        )}
        {flags.centerLines && (
          <g stroke="#0ea5e9" strokeWidth={HAIR} strokeDasharray="0.1 0.06">
            <line x1={g.trimWidthIn / 2} y1={0} x2={g.trimWidthIn / 2} y2={g.trimHeightIn} />
            <line x1={0} y1={g.trimHeightIn / 2} x2={g.trimWidthIn} y2={g.trimHeightIn / 2} />
          </g>
        )}
        {(flags.columnLines || flags.rowLines) &&
          groups.map((n) =>
            n.type === "group" ? (
              <g key={n.id} stroke="#2563eb" strokeWidth={HAIR} strokeOpacity={0.8}>
                {flags.columnLines && n.columnEdges?.map((x, i) => <line key={`c${i}`} x1={x} y1={n.rect.y} x2={x} y2={n.rect.y + n.rect.h} />)}
                {flags.rowLines && n.rowEdges?.map((y, i) => <line key={`r${i}`} x1={n.rect.x} y1={y} x2={n.rect.x + n.rect.w} y2={y} />)}
              </g>
            ) : null,
          )}
        {flags.bounds &&
          nodes.map((n) => (
            <rect key={n.id} x={n.rect.x} y={n.rect.y} width={Math.max(n.rect.w, 0.001)} height={Math.max(n.rect.h, 0.001)} fill="none" stroke="#db2777" strokeOpacity={0.45} strokeWidth={HAIR} />
          ))}
        {/* Validation findings are always outlined in the editor. */}
        {nodes
          .filter((n) => issueIds.has(n.id))
          .map((n) => (
            <rect key={`issue-${n.id}`} x={n.rect.x} y={n.rect.y} width={Math.max(n.rect.w, 0.02)} height={Math.max(n.rect.h, 0.02)} fill="#dc2626" fillOpacity={0.12} stroke="#dc2626" strokeWidth={HAIR * 3} />
          ))}
      </g>
    </svg>
  );
});
