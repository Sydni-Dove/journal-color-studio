/**
 * Developer / internal view: every geometry number on the current page with
 * its class (Required / Studio Default / User Design), research confidence
 * and source. Kept out of the creative workflow (collapsed by default).
 */
import { RESEARCH_LIBRARY, RESEARCH_OPEN_QUESTIONS, SOURCES, type SourceKey } from "../../data/research/sources";
import { roundTo } from "../../engines/units/units";
import { CONFIDENCE_LABEL, GEOMETRY_CLASS_LABEL, type Provenance } from "../../types/measurement";
import type { PageGeometry } from "../../types/geometry";
import type { SolvedPage } from "../../types/layout";
import type { ResolvedDocument } from "../../engines/document/resolve";

function Prov({ p }: { p: Provenance }) {
  const src = p.source ? SOURCES[p.source as SourceKey] : undefined;
  return (
    <div>
      <div className={`geo-class geo-class--${p.geometryClass}`}>
        {GEOMETRY_CLASS_LABEL[p.geometryClass]}
        {p.confidence ? ` · ${CONFIDENCE_LABEL[p.confidence]}` : ""}
      </div>
      {p.basis && <div className="hint">{p.basis}</div>}
      {src && (src.url ? <a className="hint" href={src.url} target="_blank" rel="noreferrer">{src.label}</a> : <div className="hint">{src.label}</div>)}
    </div>
  );
}

const fmt = (v: number) => `${roundTo(v, 4)}"`;

export function GeometryInfo({ doc, geometry: g, solved }: { doc: ResolvedDocument; geometry: PageGeometry; solved: SolvedPage }) {
  return (
    <div className="section-body">
      <p className="hint">
        Source: {RESEARCH_LIBRARY.name} v{RESEARCH_LIBRARY.version} ({RESEARCH_LIBRARY.researchDate}; {RESEARCH_LIBRARY.verification}).
      </p>
      <table className="geo-table">
        <tbody>
          <tr>
            <th>Trim</th>
            <td>
              {fmt(g.trimWidthIn)} × {fmt(g.trimHeightIn)} ({g.orientation})
              <div className="hint">
                {doc.trim.label}
                {doc.trim.confidence ? ` · ${CONFIDENCE_LABEL[doc.trim.confidence]}` : " · no research row"}
                {doc.trim.note ? ` · ${doc.trim.note}` : ""}
              </div>
            </td>
          </tr>
          <tr>
            <th>Media</th>
            <td>
              {fmt(g.mediaWidthIn)} × {fmt(g.mediaHeightIn)} · bleed T{g.bleed.top} R{g.bleed.right} B{g.bleed.bottom} L{g.bleed.left}
            </td>
          </tr>
          <tr>
            <th>Page side</th>
            <td>
              {g.side} · bound edge: {g.boundEdge ?? "none"} · {doc.binding.label} · {doc.printProfile.label}
            </td>
          </tr>
          <tr>
            <th>Usable</th>
            <td>
              {fmt(g.usableWidthIn)} × {fmt(g.usableHeightIn)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="field-label">Margins per edge</div>
      <table className="geo-table">
        <thead>
          <tr>
            <th>Edge</th>
            <th>Required</th>
            <th>Studio</th>
            <th>Effective</th>
          </tr>
        </thead>
        <tbody>
          {g.margins.map((m) => (
            <tr key={m.edge}>
              <td>
                {m.edge}
                <div className="hint">{m.logicalEdge}</div>
              </td>
              <td>
                {fmt(m.requiredIn)}
                {m.requiredBasis[0] && <Prov p={m.requiredBasis[0]} />}
              </td>
              <td>
                {fmt(m.recommendedIn)}
                <Prov p={m.recommendedBasis} />
              </td>
              <td>
                <strong>{fmt(m.effectiveIn)}</strong>
                {m.userIn !== undefined && <div className="hint">user {fmt(m.userIn)}{m.clamped ? " → raised to required" : ""}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {g.keepOuts.length > 0 && (
        <>
          <div className="field-label">Keep-outs</div>
          <table className="geo-table">
            <tbody>
              {g.keepOuts.map((k) => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td>
                    {fmt(k.depthIn)} from {k.edge}
                    <Prov p={k.provenance} />
                  </td>
                </tr>
              ))}
              {g.holes.length > 0 && (
                <tr>
                  <td>Punch holes</td>
                  <td>{g.holes.length} ({g.holes[0].shape})</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <div className="field-label">Layout values (this page)</div>
      <table className="geo-table">
        <tbody>
          {solved.metrics.map((m, i) => (
            <tr key={i}>
              <td>{m.label}</td>
              <td>
                {m.unit === "in" ? fmt(m.value) : `${roundTo(m.value, 3)}${m.unit === "pt" ? " pt" : ""}`}
                <Prov p={m.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <details>
        <summary className="hint">Research open questions</summary>
        <ul className="hint">
          {RESEARCH_OPEN_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
