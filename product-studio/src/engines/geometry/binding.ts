import type { BindingProfile } from "../../types/binding";
import type { Edge, LogicalEdge, PageSide } from "../../types/geometry";

export const OPPOSITE_EDGE: Record<Edge, Edge> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export const isHorizontalEdge = (e: Edge) => e === "left" || e === "right";

/**
 * Binding-aware page-side logic. Returns the PHYSICAL edge that carries the
 * binding (or glue) on the printed side being laid out.
 *
 * - book-spine: the gutter alternates by page side. The front/recto edge is
 *   `frontEdge`; a verso sees it mirrored (left ↔ right, top ↔ bottom).
 * - punched-leaf: the punched edge is a fixed physical edge of every leaf.
 *   Single-sided output keeps it on the same edge for every page. Only the
 *   BACK of a duplex leaf sees it mirrored.
 * - glued-edge: tear-off sheets are single-sided; the glued edge never moves.
 * - unbound: no bound edge.
 */
export function resolveBoundEdge(
  binding: BindingProfile,
  side: PageSide,
  duplex: boolean,
  frontEdge?: Edge,
): Edge | null {
  const front = frontEdge ?? binding.defaultBoundEdge;
  if (!front) return null;
  switch (binding.boundEdgeMode) {
    case "unbound":
      return null;
    case "glued-edge":
      return front;
    case "punched-leaf":
      return duplex && side === "verso" ? OPPOSITE_EDGE[front] : front;
    case "book-spine":
      return side === "verso" ? OPPOSITE_EDGE[front] : front;
  }
}

/** Page side for a 1-based physical page number in a bound book. */
export function pageSideFor(pageNumber: number, binding: BindingProfile, duplex: boolean): PageSide {
  const paged = binding.boundEdgeMode === "book-spine" || (binding.boundEdgeMode === "punched-leaf" && duplex);
  if (!paged) return "single";
  return pageNumber % 2 === 1 ? "recto" : "verso";
}

/**
 * Map logical edges (top/bottom/inside/outside) to physical edges.
 * inside/outside are the horizontal edges: inside is the bound edge when the
 * binding is on a vertical side; otherwise left on recto/single, right on verso.
 */
export function logicalToPhysical(boundEdge: Edge | null, side: PageSide): Record<LogicalEdge, Edge> {
  const inside: Edge =
    boundEdge && isHorizontalEdge(boundEdge) ? boundEdge : side === "verso" ? "right" : "left";
  return { top: "top", bottom: "bottom", inside, outside: OPPOSITE_EDGE[inside] };
}

export function physicalToLogical(boundEdge: Edge | null, side: PageSide): Record<Edge, LogicalEdge> {
  const map = logicalToPhysical(boundEdge, side);
  const out = {} as Record<Edge, LogicalEdge>;
  (Object.keys(map) as LogicalEdge[]).forEach((l) => (out[map[l]] = l));
  return out;
}
