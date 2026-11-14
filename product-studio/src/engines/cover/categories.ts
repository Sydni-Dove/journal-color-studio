/**
 * COVER STUDIO — the four design categories and their prompts.
 *   cover       a finished cover (prompt.ts promptFor, unchanged: the stationery cover generator's wording)
 *   interior    art for interior pages, made to be uploaded into Product Studio (Artwork and style → Artwork)
 *               as a page background or an illustration: the page's own lines, calendars and text are added by
 *               Product Studio, never drawn by the image generator
 *   character   children's character illustrations: a consistent cast, on a transparent background or in a scene
 *   collection  a coordinated set (journal, planner, bookmark, cards…) sharing one design system
 * Every prompt carries the palette's exact hex colors (paletteSpec) and the category's own details.
 */
import { DEFAULT_TYPOGRAPHY, type CoverBrief, type CoverCategory, type CoverItem } from "./brief";
import { GENERIC_STYLE_GUIDE, STARTER_SET, STYLE_GUIDES } from "./guides";
import { createBlocker, paletteSpec, promptBlocker, promptFor, setPrompts } from "./prompt";
import { fmt, resolveCoverSpec } from "./spec";

export const CATEGORIES: { id: CoverCategory; title: string; blurb: string }[] = [
  { id: "cover", title: "Cover Artwork", blurb: "A finished front cover or full wrap for one product, with its title." },
  { id: "interior", title: "Interior Page Design", blurb: "Art for the inside pages: a background, a corner piece or a band. Product Studio adds the lines, calendars and text." },
  { id: "character", title: "Children’s Character Illustrations", blurb: "A consistent cast of characters for children's journals, lessons and activity pages." },
  { id: "collection", title: "Coordinated Collection Design", blurb: "One design system across a set: journal, planner, bookmark, cards and more." },
];
export const categoryTitle = (c: CoverCategory) => CATEGORIES.find((x) => x.id === c)?.title ?? "Cover Artwork";

export const TYPOGRAPHY_CHOICES = [DEFAULT_TYPOGRAPHY, "High-contrast display serif", "Modern clean sans-serif", "Elegant flowing script", "Hand-lettered brush", "Classic book serif", "Playful rounded lettering", "No lettering in the artwork"] as const;

export const INTERIOR_KINDS = ["Lined journal page", "To-do list page", "Monthly calendar page", "Weekly planner page", "Lesson / devotional page", "Prayer page", "Notes page", "Activity / coloring page"] as const;
export const ART_USES = ["Corner illustration", "Page background", "Header band", "Footer band", "Border frame"] as const;
export const ART_PLACEMENTS = ["Bottom right corner", "Bottom left corner", "Top right corner", "Top left corner", "Along the bottom edge", "Along the top edge", "Around the edges"] as const;
export const CLEAR_AREAS = ["Keep at least 75% of the page clear", "Keep the center two-thirds clear", "Keep everything inside the margins clear", "Light texture over the whole page (lines and text go on top)"] as const;
export const AGE_GROUPS = ["Ages 2–4", "Ages 4–8", "Ages 8–12", "Teens"] as const;

/** The typography line a prompt carries (nothing for "Let the style decide", so cover prompts stay as they were). */
export function typographyLine(b: CoverBrief): string {
  if (!b.typography || b.typography === DEFAULT_TYPOGRAPHY) return "";
  if (b.typography === "No lettering in the artwork") return "Typography: draw no lettering at all; any words are typeset separately.";
  return `Typography: ${b.typography}. Keep the lettering in this one direction throughout.`;
}

/** Interior art runs off the page on the edges it touches: which edges, for the placement chosen. */
function runOff(b: CoverBrief): string {
  const p = b.artPlacement.toLowerCase();
  if (b.artUse === "Page background") return "Fill the whole canvas edge to edge, into the bleed.";
  if (b.artUse === "Border frame" || p.includes("around")) return "Let the frame run off every outer edge into the bleed; keep the inside clear.";
  const edges = [p.includes("bottom") ? "bottom" : p.includes("top") ? "top" : "", p.includes("right") ? "right" : p.includes("left") ? "left" : ""].filter(Boolean);
  return edges.length ? `The shapes must run off the ${edges.join(" and ")} edge${edges.length > 1 ? "s" : ""} of the canvas (cropped by the edge, not stopping short), so the art bleeds off the trimmed page there.` : "";
}

export function interiorPrompt(b: CoverBrief): string {
  const spec = resolveCoverSpec({ ...b, format: "front" });
  const corner = b.artUse !== "Page background";
  const style = `${b.style}. ${STYLE_GUIDES[b.style] || GENERIC_STYLE_GUIDE}`;
  const canvas = corner && b.artUse === "Corner illustration"
    ? `A square canvas, ${Math.round(Math.min(spec.trimW, spec.trimH) * 0.45 * b.dpi)} × ${Math.round(Math.min(spec.trimW, spec.trimH) * 0.45 * b.dpi)} pixels (about ${fmt(Math.min(spec.trimW, spec.trimH) * 0.45)} inches at ${b.dpi} DPI), PNG with a fully transparent background.`
    : `The full page with bleed: ${fmt(spec.canvasW)} × ${fmt(spec.canvasH)} inches, ${spec.pxW} × ${spec.pxH} pixels at ${b.dpi} DPI (trim ${fmt(spec.trimW)} × ${fmt(spec.trimH)} inches plus ${fmt(spec.bleed)} inch bleed).${corner ? " PNG with a fully transparent background wherever there is no art." : ""}`;
  return `Create ONE piece of interior page artwork for a printed ${b.product.toLowerCase()} (${b.pageKind.toLowerCase()}). This is decorative art for the page, not a finished page: the writing lines, calendar grid, headings and text are added later in Product Studio, so draw NO lines, grids, boxes, text, numbers or labels.

DESIGN RECIPE
Use: ${b.artUse}. Placement: ${b.artPlacement}. ${runOff(b)}
Writing space: ${b.clearArea}. The clear area must stay calm and empty so lines and handwriting read easily.
Visual language: ${style}
Palette: ${paletteSpec(b)} Keep the art light enough that black writing on top stays readable.
${typographyLine(b) ? typographyLine(b) + "\n" : ""}Theme: ${b.theme || "purposeful planning"}. Audience: ${b.audience || "adult journal users"}. Collection: ${b.collection || "new stationery collection"}${b.season ? ", " + b.season : ""}.
Requested imagery: ${b.imagery || "abstract shapes, pattern and texture from the visual language"}.

OUTPUT
${canvas}
Flat artwork only: no mockup, no page curl, no shadow, no paper texture unless asked, no watermark.

QUALITY GATES
Avoid: ${b.avoid || "generic scenery and decorative filler"}. Nothing important closer than ${fmt(b.safe)} inches to the trim except the parts meant to run off the edge. Matching pieces for the same collection should feel like one family.

After the image, state the actual pixel size and whether the background is truly transparent.`;
}

export function characterPrompt(b: CoverBrief): string {
  const cast = b.characters.trim() || "[CHARACTERS REQUIRED]";
  const style = `${b.style}. ${STYLE_GUIDES[b.style] || GENERIC_STYLE_GUIDE}`;
  const out = b.characterBackground === "transparent"
    ? `${b.characterCount} separate character illustrations on ONE sheet, evenly spaced with clear space between them, on a fully transparent background (PNG), so each can be cut out and placed on a page. ${Math.round(8.5 * b.dpi)} × ${Math.round(11 * b.dpi)} pixels at ${b.dpi} DPI.`
    : `One illustrated scene, ${fmt(resolveCoverSpec({ ...b, format: "front" }).canvasW)} × ${fmt(resolveCoverSpec({ ...b, format: "front" }).canvasH)} inches at ${b.dpi} DPI, with the characters in it: ${b.scene || "a simple, uncluttered setting"}.`;
  return `Create children's character illustrations for a Christian ${b.product.toLowerCase()} for ${b.ageGroup.toLowerCase()}.

CHARACTERS
${cast}
Show them: ${b.expressions || "happy and curious"}. Keep every character exactly consistent from pose to pose (face, hair, skin tone, clothing, proportions), so they read as the same children throughout the series. Warm, kind, age-appropriate; respectful, diverse representation; no scary or mature content.

DESIGN RECIPE
Visual language: ${style}
Palette: ${paletteSpec(b)}
${typographyLine(b) ? typographyLine(b) + "\n" : ""}Theme: ${b.theme || "learning and growing in faith"}. Collection: ${b.collection || "children's series"}${b.season ? ", " + b.season : ""}.
Requested imagery: ${b.imagery || "simple props that suit the pose"}.

OUTPUT
${out}
Clean outlines and flat or gently shaded color that print well; no text, speech bubbles, logos or watermark unless asked. Do not add crosses, doves or other religious symbols unless requested.

QUALITY GATES
Avoid: ${b.avoid || "generic clip-art"}. After the image, list each pose shown and state the actual pixel size and whether the background is transparent.`;
}

/** A coordinated collection: a shared design system, then one prompt per piece (the set; the starter set if none yet). */
export function collectionPrompt(b: CoverBrief, items: CoverItem[], direction: number): string {
  const set = items.length ? items : STARTER_SET.map((s, i) => ({ id: `starter-${i}`, product: s.product, size: s.size, status: "Idea" }));
  const system = `COORDINATED COLLECTION DESIGN SYSTEM
Collection: ${b.collection || b.title || "new stationery collection"}${b.season ? ", " + b.season : ""}. Pieces: ${set.map((x) => `${x.product} (${x.size} in)`).join(", ")}.
Every piece shares one visual language (${b.style}), one palette (${paletteSpec(b)})${typographyLine(b) ? ", and one lettering direction (" + b.typography + ")" : ""}. Repeat motifs and color proportions so the pieces read as one family on an Etsy listing, but compose each piece for its own shape; never shrink one layout onto another.`;
  return `${system}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${setPrompts(b, set, direction)}`;
}

/** The prompt for the brief's category. */
export function categoryPrompt(b: CoverBrief, direction: number, items: CoverItem[]): string {
  switch (b.category) {
    case "interior":
      return interiorPrompt(b);
    case "character":
      return characterPrompt(b);
    case "collection":
      return collectionPrompt(b, items, direction);
    default: {
      const t = typographyLine(b);
      const p = promptFor(b, direction);
      return t ? p.replace("\n\nTYPE & CONTENT\n", `\n${t}\n\nTYPE & CONTENT\n`) : p;
    }
  }
}

/** Why the category's prompt can't be built yet (null = it can). */
export function categoryBlocker(b: CoverBrief): string | null {
  if (b.category === "interior") return null;
  if (b.category === "character") return b.characters.trim() ? null : "Describe your characters: who they are, how they look and what they wear.";
  return promptBlocker(b);
}

/** Why it can't be handed to an image generator yet (adds the printer's spine for a cover wrap). */
export function categoryCreateBlocker(b: CoverBrief): string | null {
  if (b.category === "cover") return createBlocker(b);
  return categoryBlocker(b);
}
