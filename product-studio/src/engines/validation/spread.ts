/**
 * SPREAD ALIGNMENT — facing pages share one header zone. Where both pages of
 * an opening declare a header (headerIn), their header zones must end at the
 * same height, so the header rules and title bottoms line up across the open
 * book. Layouts with their own designed header (covers, dividers, Luxury
 * Daily, stationery) declare none and are the intended exceptions.
 */
import { getLayout } from "../../layouts/registry";
import { facingIndex, solvePage, type ResolvedDocument } from "../document/resolve";

export const SPREAD_HEADER_TOLERANCE_IN = 0.01;

export type SpreadMisalignment = { left: number; right: number; leftHeaderBottomIn: number; rightHeaderBottomIn: number };

/** Header bottom of a solved page: its frame's header zone (pageFrame's `p0-header` group). */
function headerBottom(doc: ResolvedDocument, i: number): number | null {
  const n = solvePage(doc, i).nodes.find((x) => x.id === "p0-header");
  return n ? n.rect.y + n.rect.h : null;
}

/** Every opening whose two headers do not line up (page numbers, left then right). */
export function spreadHeaderMisalignments(doc: ResolvedDocument): SpreadMisalignment[] {
  const out: SpreadMisalignment[] = [];
  doc.recipe.pages.forEach((p, i) => {
    if (p.side !== "verso") return;
    const j = facingIndex(doc, i);
    if (j === null) return;
    const a = getLayout(p.layoutId), b = getLayout(doc.recipe.pages[j].layoutId);
    if (!a.headerIn || !b.headerIn) return;
    const l = headerBottom(doc, i), r = headerBottom(doc, j);
    if (l === null || r === null) return;
    if (Math.abs(l - r) > SPREAD_HEADER_TOLERANCE_IN) out.push({ left: p.pageNumber, right: doc.recipe.pages[j].pageNumber, leftHeaderBottomIn: l, rightHeaderBottomIn: r });
  });
  return out;
}
