/**
 * GEOMETRY TURN — rotate a page geometry 90° clockwise.
 *
 * Used for content that is designed in landscape but printed on a portrait
 * sheet (the rotated monthly calendar): the layout solves against the turned
 * (landscape) geometry, and the renderer turns the painted content back onto
 * the portrait page with a CSS rotation.
 *
 * Content-top maps to page-right, so edge boxes rotate with it:
 * content.top = page.right, content.right = page.bottom, etc.
 */
import type { Edge, EdgeBox, KeepOutZone, PageGeometry, PunchHole } from "../../types/geometry";
import type { Rect } from "../../types/geometry";

function turnEdgeBox(e: EdgeBox): EdgeBox {
  return { top: e.right, right: e.bottom, bottom: e.left, left: e.top };
}

function turnEdge(e: Edge): Edge {
  return e === "top" ? "right" : e === "right" ? "bottom" : e === "bottom" ? "left" : "top";
}

/** 90° CW turn of a point in W×H trim coordinates into H×W coordinates. */
function turnPoint(x: number, y: number, h: number): { x: number; y: number } {
  return { x: h - y, y: x };
}

/** 90° CW turn of a rect in W×H trim coordinates into H×W coordinates. */
function turnRect(r: Rect, h: number): Rect {
  return { x: h - r.y - r.h, y: r.x, w: r.h, h: r.w };
}

export function turnGeometry90CW(g: PageGeometry): PageGeometry {
  const H = g.trimHeightIn;
  const turnKeepOut = (z: KeepOutZone): KeepOutZone => ({ ...z, edge: turnEdge(z.edge), rect: turnRect(z.rect, H) });
  const turnHole = (p: PunchHole): PunchHole => {
    const c = turnPoint(p.cx, p.cy, H);
    return { ...p, cx: c.x, cy: c.y, w: p.h, h: p.w };
  };
  return {
    ...g,
    trimWidthIn: g.trimHeightIn,
    trimHeightIn: g.trimWidthIn,
    orientation: g.orientation === "portrait" ? "landscape" : "portrait",
    bleed: turnEdgeBox(g.bleed),
    bleedTopIn: g.bleed.right,
    bleedBottomIn: g.bleed.left,
    bleedInsideIn: g.bleedInsideIn,
    bleedOutsideIn: g.bleedOutsideIn,
    safe: turnEdgeBox(g.safe),
    safeTopIn: g.safe.right,
    safeBottomIn: g.safe.left,
    safeInsideIn: g.safeInsideIn,
    safeOutsideIn: g.safeOutsideIn,
    safeRect: turnRect(g.safeRect, H),
    usableWidthIn: g.usableHeightIn,
    usableHeightIn: g.usableWidthIn,
    mediaWidthIn: g.mediaHeightIn,
    mediaHeightIn: g.mediaWidthIn,
    trimOffset: turnPoint(g.trimOffset.x, g.trimOffset.y, g.mediaHeightIn),
    keepOuts: g.keepOuts.map(turnKeepOut),
    holes: g.holes.map(turnHole),
  };
}
