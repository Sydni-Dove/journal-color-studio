/**
 * GEOMETRY TURN — the landscape geometry a sideways page's content is laid
 * out in (the rotated monthly calendar).
 *
 * The content is printed turned a quarter turn counterclockwise, the book
 * convention for a sideways table: the top of the content runs along the
 * page's LEFT edge, and the reader turns the book clockwise to read it.
 *
 *   page (X, Y) in W×H  →  content (x, y) = (H − Y, X) in H×W
 *   content.top = page.left · content.right = page.top
 *   content.bottom = page.right · content.left = page.bottom
 *
 * Everything here (edges, margins, rects, holes, the trim's place in the
 * media) uses that one mapping, and the renderer draws the content back with
 * its exact inverse (contentToPageTransform), so the two can never disagree.
 */
import type { Edge, EdgeBox, KeepOutZone, PageGeometry, PunchHole } from "../../types/geometry";
import type { Rect } from "../../types/geometry";

function turnEdgeBox(e: EdgeBox): EdgeBox {
  return { top: e.left, right: e.top, bottom: e.right, left: e.bottom };
}

function turnEdge(e: Edge): Edge {
  return e === "top" ? "right" : e === "right" ? "bottom" : e === "bottom" ? "left" : "top";
}

/** A point in W×H page coordinates, in the H×W content coordinates. */
function turnPoint(x: number, y: number, h: number): { x: number; y: number } {
  return { x: h - y, y: x };
}

/** A rect in W×H page coordinates, in the H×W content coordinates. */
function turnRect(r: Rect, h: number): Rect {
  return { x: h - r.y - r.h, y: r.x, w: r.h, h: r.w };
}

export function sidewaysGeometry(g: PageGeometry): PageGeometry {
  const H = g.trimHeightIn;
  const turnKeepOut = (z: KeepOutZone): KeepOutZone => ({ ...z, edge: turnEdge(z.edge), rect: turnRect(z.rect, H) });
  const turnHole = (p: PunchHole): PunchHole => {
    const c = turnPoint(p.cx, p.cy, H);
    return { ...p, cx: c.x, cy: c.y, w: p.h, h: p.w };
  };
  // The trim's place inside the media: the trim rect turned within the media box.
  const trimInMedia = turnRect({ x: g.trimOffset.x, y: g.trimOffset.y, w: g.trimWidthIn, h: g.trimHeightIn }, g.mediaHeightIn);
  return {
    ...g,
    trimWidthIn: g.trimHeightIn,
    trimHeightIn: g.trimWidthIn,
    orientation: g.orientation === "portrait" ? "landscape" : "portrait",
    bleed: turnEdgeBox(g.bleed),
    bleedTopIn: g.bleed.left,
    bleedBottomIn: g.bleed.right,
    bleedInsideIn: g.bleedInsideIn,
    bleedOutsideIn: g.bleedOutsideIn,
    safe: turnEdgeBox(g.safe),
    safeTopIn: g.safe.left,
    safeBottomIn: g.safe.right,
    safeInsideIn: g.safeInsideIn,
    safeOutsideIn: g.safeOutsideIn,
    safeRect: turnRect(g.safeRect, H),
    usableWidthIn: g.usableHeightIn,
    usableHeightIn: g.usableWidthIn,
    mediaWidthIn: g.mediaHeightIn,
    mediaHeightIn: g.mediaWidthIn,
    trimOffset: { x: trimInMedia.x, y: trimInMedia.y },
    keepOuts: g.keepOuts.map(turnKeepOut),
    holes: g.holes.map(turnHole),
    margins: g.margins.map((m) => ({ ...m, edge: turnEdge(m.edge) })),
  };
}

/**
 * The CSS transform that draws content laid out in sidewaysGeometry(g) onto
 * the page g (origin at the top-left of the media box): the exact inverse of
 * the mapping above, content (x, y) → page (y, H − x).
 */
export function contentToPageTransform(g: PageGeometry): string {
  return `translateY(${g.mediaHeightIn}in) rotate(-90deg)`;
}
