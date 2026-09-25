/**
 * COMPOSITION VALIDATION — objective visual-composition failures that pure
 * geometry validation cannot see. It does not judge beauty; it catches:
 *   decoration-clipped    artwork cropped where cropping was not intended
 *   decoration-no-room    an object could not be placed without breaking a rule
 *   decoration-overlap    artwork over protected content (or excessive intended overlap)
 *   decoration-dead-space an ornament floating away from the page edge and all content
 *   title-rule-gap        a title closer to the rule / content below than titleToRuleGap
 *   label-border-inset    a label closer to a border / rule than its inset token
 *   text-region           positioned text outside the print-safe area / its zone
 */
import type { PageGeometry, Rect } from "../../types/geometry";
import type { LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import type { ValidationIssue, ValidationRule } from "../../types/validation";
import { planDecoration } from "../../themes/decorationPlan";
import { resolveComposition } from "../composition/composition";
import type { ResolvedDocument } from "../document/resolve";
import { inkBoxFor } from "../typography/ink";
import type { TextMeasurer } from "../typography/textMeasure";
import { ptToIn } from "../units/units";

type Push = (rule: ValidationRule, id: string, message: string, m?: ValidationIssue["measurement"], severity?: ValidationIssue["severity"]) => void;

/** An ornament whose artwork is farther than this from the trim edge and all content is floating. */
export const DEAD_SPACE_IN = 0.5;
/** Intended overlap (e.g. behind-title) above this share of the artwork AND this opacity reads as clutter. */
const EXCESS_OVERLAP_SHARE = 0.6;
const EXCESS_OVERLAP_OPACITY = 0.3;
/** Objects placed below this share of their preferred size get an informational note. */
const SHRUNK_NOTE_SCALE = 0.5;
/** Tolerance for spacing checks (rounding of solved coordinates). */
const TOL_IN = 0.005;

const TITLE_KEYS = new Set(["pageTitle", "monthYear", "weekOf", "productTitle", "dateLabel"]);

const gapBetween = (a: Rect, b: Rect) => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
};

/** Straight border segments on the page: rules and box edges. */
function borders(nodes: LayoutNode[]): { id: string; x1: number; y1: number; x2: number; y2: number; header: boolean }[] {
  const out: { id: string; x1: number; y1: number; x2: number; y2: number; header: boolean }[] = [];
  for (const n of nodes) {
    if (n.type === "rule") out.push({ id: n.id, x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, header: n.component === "PageHeader" });
    if (n.type === "box" && n.stroke) {
      const { x, y, w, h } = n.rect;
      out.push({ id: `${n.id}:top`, x1: x, y1: y, x2: x + w, y2: y, header: false }, { id: `${n.id}:bottom`, x1: x, y1: y + h, x2: x + w, y2: y + h, header: false });
      out.push({ id: `${n.id}:left`, x1: x, y1: y, x2: x, y2: y + h, header: false }, { id: `${n.id}:right`, x1: x + w, y1: y, x2: x + w, y2: y + h, header: false });
    }
  }
  return out;
}

export function compositionChecks(doc: ResolvedDocument, g: PageGeometry, s: SolvedPage, measure: TextMeasurer, push: Push): void {
  const sp = doc.spacing;
  const comp = resolveComposition(g, s, doc.typography, sp);

  // ── Decoration ──
  const plan = planDecoration(g, doc.decorative, doc.colors, comp);
  if (plan) {
    const W = g.trimWidthIn, H = g.trimHeightIn, ox = g.trimOffset.x, oy = g.trimOffset.y;
    const content = s.nodes.filter((n) => n.functional && n.type !== "group").map((n) => (n.type === "text" ? inkBoxFor(n, doc.typography, measure) : n.rect));
    for (const r of plan.reports) {
      const id = `decor-${r.id}`;
      if (!r.rect) {
        push("decoration-no-room", id, `Decoration (${r.id}, anchored to ${r.anchor}) was not placed: ${r.reason}.`, undefined, "warning");
        continue;
      }
      if (r.scale < SHRUNK_NOTE_SCALE) {
        push("decoration-no-room", id, `Decoration (${r.id}) was placed at ${Math.round(r.scale * 100)}% of its size to stay clear of content.`, undefined, "info");
      }
      if (r.clippedShare > 0 && !r.intentionalClip) {
        push("decoration-clipped", id, `Decoration (${r.id}) is cropped at the page edge (${Math.round(r.clippedShare * 100)}% of its artwork) without clipping being allowed.`, { actual: r.clippedShare, limit: 0, unit: "in" }, "warning");
      }
      if (r.overlapShare > 0 && !r.allowContentOverlap) {
        push("decoration-overlap", id, `Decoration (${r.id}) covers protected content (${Math.round(r.overlapShare * 100)}% of its artwork).`, { actual: r.overlapShare, limit: 0, unit: "in" });
      } else if (r.allowContentOverlap && r.overlapShare > EXCESS_OVERLAP_SHARE && plan.opacity > EXCESS_OVERLAP_OPACITY) {
        push("decoration-overlap", id, `Decoration (${r.id}) sits over content at ${Math.round(plan.opacity * 100)}% opacity; keep intended overlap ≤ ${EXCESS_OVERLAP_OPACITY * 100}% so it stays legible.`, undefined, "warning");
      }
      if (r.anchor !== "field" && r.inkBox) {
        const ink = { x: r.inkBox.x - ox, y: r.inkBox.y - oy, w: r.inkBox.w, h: r.inkBox.h };
        const toEdge = Math.max(0, Math.min(ink.x, ink.y, W - (ink.x + ink.w), H - (ink.y + ink.h)));
        const toContent = content.reduce((m, c) => Math.min(m, gapBetween(ink, c)), Infinity);
        const d = Math.min(toEdge, toContent);
        if (d > DEAD_SPACE_IN) {
          push("decoration-dead-space", id, `Decoration (${r.id}) floats ${d.toFixed(2)}" from the page edge and all content — it frames nothing.`, { actual: d, limit: DEAD_SPACE_IN, unit: "in" }, "warning");
        }
      }
    }
  }

  // ── Text spacing ──
  const texts = s.nodes.filter((n): n is TextNode => n.type === "text" && !!n.text);
  const lines = borders(s.nodes);
  for (const t of texts) {
    const ink = inkBoxFor(t, doc.typography, measure);
    if (t.semantic) {
      const safe = g.safeRect;
      if (ink.x < safe.x - TOL_IN || ink.y < safe.y - TOL_IN || ink.x + ink.w > safe.x + safe.w + TOL_IN || ink.y + ink.h > safe.y + safe.h + TOL_IN) {
        push("text-region", t.id, `"${t.text}" extends outside the print-safe area.`);
      }
    }
    if (t.semantic && TITLE_KEYS.has(t.semantic)) {
      // Nearest functional element directly below the title's ink, across its width.
      let below = Infinity;
      let what = "";
      for (const n of s.nodes) {
        if (!n.functional || n.type === "group" || n.id === t.id) continue;
        const r = n.type === "text" ? inkBoxFor(n, doc.typography, measure) : n.type === "rule" ? { ...n.rect, h: ptToIn(n.strokePt) } : n.rect;
        const overlapX = Math.min(r.x + r.w, ink.x + ink.w) - Math.max(r.x, ink.x);
        if (overlapX <= 0 || r.y < ink.y + ink.h - TOL_IN) continue;
        const gap = r.y - (ink.y + ink.h);
        if (gap < below) {
          below = gap;
          what = n.id;
        }
      }
      if (below < sp.titleToRuleGap - TOL_IN) {
        push("title-rule-gap", t.id, `"${t.text}" sits ${below.toFixed(3)}" above ${what}; titles keep ${sp.titleToRuleGap}" (titleToRuleGap).`, { actual: below, limit: sp.titleToRuleGap, unit: "in" }, "warning");
      }
      continue;
    }
    if (t.component === "PageHeader" || t.component === "PageFooter") continue;
    const inset = t.component === "CalendarCell" ? sp.dateToCellInset : t.semantic === "sectionHeading" ? sp.sectionHeadingInset : sp.labelToBorderInset;
    for (const l of lines) {
      if (l.header) continue;
      const vertical = Math.abs(l.x1 - l.x2) < 1e-9;
      if (vertical) {
        const y0 = Math.min(l.y1, l.y2), y1 = Math.max(l.y1, l.y2);
        if (y1 <= ink.y || y0 >= ink.y + ink.h) continue;
        const gap = l.x1 <= ink.x ? ink.x - l.x1 : l.x1 >= ink.x + ink.w ? l.x1 - (ink.x + ink.w) : -1;
        if (gap >= 0 && gap < inset - TOL_IN) push("label-border-inset", t.id, `"${t.text}" is ${gap.toFixed(3)}" from a border (${l.id}); labels keep ${inset}".`, { actual: gap, limit: inset, unit: "in" }, "warning");
      } else {
        const x0 = Math.min(l.x1, l.x2), x1 = Math.max(l.x1, l.x2);
        if (x1 <= ink.x || x0 >= ink.x + ink.w) continue;
        const gap = l.y1 <= ink.y ? ink.y - l.y1 : l.y1 >= ink.y + ink.h ? l.y1 - (ink.y + ink.h) : -1;
        // A heading's own underline (a rule directly below a section heading) keeps headingToContentGap.
        const need = t.component === "SectionHeader" && l.y1 >= ink.y + ink.h ? Math.min(inset, sp.headingToContentGap) : inset;
        if (gap >= 0 && gap < need - TOL_IN) push("label-border-inset", t.id, `"${t.text}" is ${gap.toFixed(3)}" from a border (${l.id}); labels keep ${need}".`, { actual: gap, limit: need, unit: "in" }, "warning");
      }
    }
  }
}
