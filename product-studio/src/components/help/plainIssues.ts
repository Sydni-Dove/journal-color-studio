/**
 * PLAIN-LANGUAGE PAGE CHECK — what each validation finding means to a
 * stationery creator, and what to do about it. The original technical
 * message, rule id, component id and measurement stay available under
 * "Show details"; validation itself is unchanged.
 */
import type { ValidationIssue, ValidationSeverity } from "../../types/validation";

export type PlainIssue = { title: string; advice?: string };

export const SEVERITY_LABEL: Record<ValidationSeverity, string> = {
  error: "Needs fixing before export",
  warning: "Worth checking",
  info: "Good to know",
};

/** The quoted text a message is about ("Scripture", "IMPORTANT THINGS…"), if any. */
function quoted(m: string): string | null {
  // A real quotation: opens after a space / start, never an inch mark after a number (0.25").
  const q = /(?:^|[\s(])["“]([^"”\s][^"”]{0,79})["”](?=[\s.,;:)]|$)/.exec(m);
  return q ? q[1] : null;
}

/** Messages that are already plain pass through; technical ones get a plain title (the original stays in "Show details"). */
const TECHNICAL = /\d\.\d+"|\b(gutter|cadence|recto|verso|anchor|offset|pitch|solver|keep-out|safe area|geometry|usable|trim|region|component|node|st\d-)/i;
const orPlain = (m: string, generic: string): PlainIssue => ({ title: TECHNICAL.test(m) ? generic : m });

const SHORTEN = "Shorten the wording, choose a smaller text size, or use a wider layout.";

export function plainIssue(i: ValidationIssue): PlainIssue {
  const m = i.message;
  const q = quoted(m);
  switch (i.rule) {
    case "invalid-dimensions":
      return { title: "The page size or dates aren't valid.", advice: "Check the width, height and date range." };
    case "negative-geometry":
      return { title: "The margins are bigger than the page, so nothing fits.", advice: "Use smaller custom margins or a bigger page size." };
    case "safe-area":
      if (/^Your .* margin/.test(m)) return { title: "One of your margins was smaller than this printer allows, so Product Studio made it bigger.", advice: "Nothing to do unless you want a different printer." };
      return { title: "Something on this page is too close to the cut edge and could be trimmed off.", advice: "Choose a larger size or a different page style." };
    case "binding-keep-out":
      return { title: "Something sits in the binding space, where it would be punched, bound or hidden.", advice: "Choose a different page style or binding, or move the item away from the binding edge." };
    case "glue-keep-out":
      return { title: "Something sits in the glued strip at the top of the pad.", advice: "Choose a different page style or move the item down." };
    case "bleed":
      if (i.severity === "info") return { title: "This printer prints exactly to the page size — nothing extends past the cut edge." };
      return { title: "This background reaches the page edge, but the page doesn't extend past the cut edge. A thin white line may show after trimming.", advice: "Turn on “Extend background past the cut edge” under Binding & printing." };
    case "component-bounds":
      return { title: "Part of the page doesn't fit in its space.", advice: "Choose a larger size or a different page style." };
    case "text-overflow":
      return { title: q ? `“${q}” doesn't fit in its space.` : "Some text doesn't fit in its space.", advice: SHORTEN };
    case "heading-fit":
      return { title: q ? `The heading “${q}” is too long for this box.` : "A heading is too long for its box.", advice: SHORTEN };
    case "text-too-small":
      return { title: "Some text is smaller than prints clearly.", advice: "Choose a larger text size under Typography." };
    case "line-overflow":
      return { title: "A writing line falls outside its writing area.", advice: "Choose a different line spacing or page style." };
    case "grid-overflow":
      return { title: "The dot or graph grid runs past the printable area.", advice: "Choose a different grid size or page style." };
    case "calendar-overflow":
      return { title: "A calendar box runs past the printable area.", advice: "Choose a larger size or a compact calendar style." };
    case "footer-collision":
    case "page-number-collision":
      return { title: "The footer or page number overlaps the page content.", advice: "Turn off the footer or page numbers, or choose a larger size." };
    case "text-collision":
      return { title: "Two pieces of text overlap.", advice: SHORTEN };
    case "layout-incompatible":
    case "book-structure":
      if (/does not fit this page size|engineered for|doesn't fit|not enough|needs a usable area/i.test(m))
        return { title: "This page style doesn't have enough room at this size.", advice: "Choose a larger size or a different page style." };
      return orPlain(m, "Part of the page plan doesn't work at this size or with these settings.");
    case "min-cell":
      return { title: i.severity === "info" ? orPlain(m, "Some rows were left out so each one keeps room to write.").title : "Some calendar or schedule boxes are very small at this size.", advice: i.severity === "info" ? undefined : "Choose a larger size or fewer rows." };
    case "min-writing-area":
      return { title: "A writing area is too small to hold writing lines.", advice: "Choose a larger size, fewer sections, or a smaller line spacing." };
    case "sidebar-balance":
      return { title: "The sidebar is too narrow or too wide for this page.", advice: "Adjust the sidebar width or turn the sidebar off." };
    case "page-count": {
      const need = /at least (\d+)/.exec(m), has = /has (\d+)/.exec(m);
      if (need && has) return { title: `This printer and binding need at least ${need[1]} pages. Your product has ${has[1]}.`, advice: "Add pages or copies under Pages." };
      if (/divisible by (\d+)/.test(m)) return { title: `This printer needs the page count to be a multiple of ${/divisible by (\d+)/.exec(m)![1]}.`, advice: "Add or remove pages under Pages." };
      return { title: "This printer has page-count limits this product doesn't meet.", advice: "Adjust the number of pages under Pages." };
    }
    case "printer-profile":
      if (/does not support/.test(m)) return { title: "This printer can't do this binding.", advice: "Choose another printer or binding under Binding & printing." };
      if (/not in .* listed trim sizes/.test(m)) return { title: "This printer doesn't list this page size.", advice: "Check with the printer before ordering, or choose one of its listed sizes." };
      return orPlain(m, "Check this printer's requirements before ordering.");
    case "decoration":
      return { title: "A full-page background on a writing pad makes writing harder to read.", advice: "Use a header band instead, or lower the background's strength." };
    case "decoration-clipped":
      return { title: "The decoration gets cut off.", advice: "Choose a smaller size or a different position." };
    case "decoration-no-room":
      return { title: "There isn't room for this decoration without covering page content.", advice: "Try other corners, a smaller size, or a different position." };
    case "decoration-overlap":
      return { title: "The decoration covers writing space or text.", advice: "Choose a smaller size or a different position." };
    case "decoration-dead-space":
      return { title: "The decoration leaves an awkward empty gap.", advice: "Try a different position or size." };
    case "decoration-outside-region":
      return { title: "The decoration sits outside the area it belongs to.", advice: "Reset its placement or choose a different position." };
    case "decoration-too-close":
      return { title: "The decoration is very close to page content.", advice: "Choose a smaller size or a different position." };
    case "decoration-bleed-contained":
      return { title: "Artwork meant to stay inside the page runs off the edge.", advice: "Choose “Keep the whole artwork on the page” or a smaller size." };
    case "title-rule-gap":
      return { title: "The title sits too close to the line under it.", advice: "Choose a smaller title size." };
    case "label-border-inset":
      return { title: q ? `“${q}” sits too close to the edge of its box.` : "A label sits too close to the edge of its box.", advice: SHORTEN };
    case "text-region":
      return { title: q ? `“${q}” was kept inside its area.` : "Some text was kept inside its area.", advice: "Your position was limited so it stays on the page." };
    case "layout-solver":
      if (/prompt space/.test(m)) return { title: "The headings take too much of this page for its size — there isn't enough writing room.", advice: "Choose a larger size, or turn off an optional section." };
      if (/gets .* of writing space/.test(m)) return { title: q ? `“${q}” doesn't get enough writing room at this size.` : "A section doesn't get enough writing room at this size.", advice: "Choose a larger size, give it More space, or turn off an optional section." };
      if (/column headings need|Column ".*" would be/.test(m)) return { title: "The table's columns don't fit across this page.", advice: "Choose a wider page size." };
      if (i.severity === "info") return orPlain(m.split(/(?<=\.)\s/)[0], "Good to know about this page.");
      return { title: "Part of this page couldn't be laid out as designed.", advice: "Choose a larger size or a different page style." };
  }
  return orPlain(m, "Something on this page needs a look.");
}
