/**
 * COVER STUDIO — children's pages and coloring books.
 *
 * Interior pages (category "character") come in scene batches: every scene inherits the collection's saved cast
 * (with their reference images), palette and coloring defaults, and may override line thickness, illustration
 * complexity and the page's output type. Coloring pages are black outlines on white unless the maker explicitly
 * chooses "Hybrid · colored accents only"; they never take the cover's full-color treatment.
 *
 * The coloring book cover (category "coloring-cover") uses the SAME saved cast — only the members selected — and
 * names their reference images to attach, so the cover's children are the interior's children.
 *
 * Text is Product Studio's job: titles, Scripture and worksheet wording are typeset there (editable, in the final
 * PDF). Prompts leave room for them; a verse is never drawn by the image generator.
 */
import type { CastMember, Complexity, CoverBrief, LineThickness, PageOutput, Scene, TextPlacement } from "./brief";
import { DIRECTIONS, GENERIC_STYLE_GUIDE, STYLE_GUIDES } from "./guides";
import { paletteSpec } from "./prompt";
import { fmt, resolveCoverSpec } from "./spec";

export const LINE_THICKNESS: { value: LineThickness; label: string; pt: number; words: string }[] = [
  { value: "Thin", label: "Thin", pt: 0.5, words: "thin, fine lines (about 0.5 pt) for colored pencils and older children" },
  { value: "Medium", label: "Medium", pt: 1, words: "medium lines (about 1 pt), clean and even" },
  { value: "Thick", label: "Thick", pt: 2, words: "thick, bold lines (about 2 pt) that small hands can color inside with crayons" },
];
export const COMPLEXITY: { value: Complexity; label: string; words: string }[] = [
  { value: "Simple", label: "Simple", words: "simple: a few large, open shapes, minimal detail and a plain background" },
  { value: "Moderate", label: "Moderate", words: "moderate: clear main shapes with some detail and a light background" },
  { value: "Detailed", label: "Detailed", words: "detailed: many smaller shapes, patterns in clothing and setting, and a fuller background" },
];

export const PAGE_OUTPUTS: { value: PageOutput; label: string; blurb: string }[] = [
  { value: "coloring-page", label: "Finished coloring page", blurb: "Line art with room for a title and a Scripture verse (typeset in Product Studio)." },
  { value: "illustration", label: "Text-free illustration", blurb: "The scene only: no words anywhere." },
  { value: "worksheet", label: "Bible lesson worksheet", blurb: "A smaller illustration and empty text areas Product Studio fills with editable text." },
  { value: "drawing-page", label: "Drawing page", blurb: "A small starter illustration and a large empty area to draw in." },
  { value: "reference-sheet", label: "Character reference sheet", blurb: "Each character in several views and expressions, to keep them consistent." },
];
export const outputLabel = (o: PageOutput) => PAGE_OUTPUTS.find((x) => x.value === o)?.label ?? o;

export const TEXT_PLACEMENTS: { value: TextPlacement; label: string }[] = [
  { value: "top", label: "Text at the top" },
  { value: "bottom", label: "Text at the bottom" },
  { value: "top-and-bottom", label: "Title at the top, verse at the bottom" },
  { value: "none", label: "No text on the page" },
];

// ---- Scene batches ------------------------------------------------------------------------------

/** "1. The recital", "Scene 2: Warm-up", "## 3 — Bows", "Page 4)" … a numbered heading starting a new scene. */
const HEADING = /^\s*(?:#{1,6}\s*)?(?:(?:scene|page|illustration)\s*)?(\d{1,3})\s*[.):\-–—]?\s*(.*)$/i;

/**
 * Splits a pasted or imported batch into scenes: at numbered headings when the text has them, else at blank lines.
 * A heading's words become the scene's title; the lines under it are its text.
 */
export function splitScenes(source: string, newSceneId: () => string): Scene[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const headings = lines.filter((l) => HEADING.test(l) && /^\s*(?:#{1,6}\s*)?(?:scene|page|illustration)?\s*\d/i.test(l));
  const out: Scene[] = [];
  if (headings.length >= 2) {
    let cur: { title: string; body: string[] } | null = null;
    const push = () => {
      if (cur && (cur.title || cur.body.join("").trim())) out.push({ id: newSceneId(), title: cur.title, text: cur.body.join("\n").trim() });
    };
    for (const l of lines) {
      const m = HEADING.exec(l);
      if (m && /^\s*(?:#{1,6}\s*)?(?:scene|page|illustration)?\s*\d/i.test(l)) {
        push();
        cur = { title: m[2].trim(), body: [] };
      } else if (cur) cur.body.push(l);
    }
    push();
    // A heading with its words on the next line ("1." then the scene): the words are its text, its title the first line.
    return out.map((s, i) => (s.title ? s : { ...s, title: firstWords(s.text) || `Scene ${i + 1}` }));
  }
  for (const block of source.replace(/\r\n?/g, "\n").split(/\n\s*\n+/)) {
    const text = block.trim();
    if (text) out.push({ id: newSceneId(), title: firstWords(text), text });
  }
  return out;
}
function firstWords(t: string): string {
  const s = t.split(/(?<=[.!?])\s|\n/)[0].trim();
  return s.length > 60 ? s.slice(0, 57).trimEnd() + "…" : s;
}

// ---- Layout: the space a page's text takes, and what is left ------------------------------------

/** Text bands (inches) each output needs, at the chosen placement. */
function textBands(output: PageOutput, placement: TextPlacement): { top: number; bottom: number } {
  if (placement === "none" || output === "illustration") return { top: 0, bottom: 0 };
  const need = output === "coloring-page" ? { title: 0.6, verse: 0.9 } : output === "worksheet" ? { title: 0.5, verse: 2.6 } : output === "drawing-page" ? { title: 0.5, verse: 0 } : { title: 0.35, verse: 0 };
  const total = need.title + need.verse;
  if (placement === "top") return { top: total, bottom: 0 };
  if (placement === "bottom") return { top: 0, bottom: total };
  return { top: need.title, bottom: need.verse };
}

export type SpaceEstimate = { pageW: number; pageH: number; usableW: number; usableH: number; artH: number; textH: number; gap: number; leftH: number; ok: boolean; summary: string };

/** The live estimate shown under the layout controls: the illustration's share, the text bands, and the room left. */
export function spaceEstimate(b: CoverBrief, output: PageOutput = b.output): SpaceEstimate {
  const spec = resolveCoverSpec({ ...b, format: "front" });
  const pageW = spec.trimW || 8.5, pageH = spec.trimH || 11;
  const usableW = Math.max(0, pageW - 2 * b.safe), usableH = Math.max(0, pageH - 2 * b.safe);
  const bands = textBands(output, b.textPlacement);
  const textH = bands.top + bands.bottom;
  const gap = (bands.top ? 0.2 : 0) + (bands.bottom ? 0.2 : 0);
  const drawing = output === "drawing-page" ? 0.6 : 0; // the empty drawing area takes the rest of the page
  const artH = (usableH * b.coverage) / 100 * (drawing ? 1 - drawing : 1);
  const leftH = usableH - artH - textH - gap;
  const ok = leftH >= -1e-6;
  const summary = ok
    ? `Illustration ${fmt(usableW)} × ${fmt(artH)} in · text ${fmt(textH)} in · ${fmt(leftH)} in left${output === "drawing-page" ? " (the drawing area)" : ""}`
    : `Over by ${fmt(-leftH)} in: lower the illustration coverage or move the text`;
  return { pageW, pageH, usableW, usableH, artH, textH, gap, leftH, ok, summary };
}

// ---- Prompt pieces ------------------------------------------------------------------------------

export function coloringStyleLine(b: CoverBrief, thickness: LineThickness, complexity: Complexity): string {
  const line = LINE_THICKNESS.find((x) => x.value === thickness)!.words;
  const detail = COMPLEXITY.find((x) => x.value === complexity)!.words;
  const color =
    b.coloringStyle === "hybrid"
      ? `Hybrid · colored accents only: use the palette (${paletteSpec(b).replace(/^Use the exact /, "").replace(/ Preserve the palette.*$/, "")}) ONLY for the page border and a few small accents; every shape a child colors stays white, with black outlines.`
      : "Black outlines on a pure white background. No color, no gray shading, no gradients and no filled black areas (except tiny details such as pupils). Every shape closed, so it can be colored.";
  return `COLORING STYLE\n${color}\nLine thickness: ${line}. Illustration complexity: ${detail}.`;
}

/** The cast members a scene (or the cover) uses: its own choice, else the collection's selection, else the whole cast. */
export function castFor(b: CoverBrief, ids?: string[]): CastMember[] {
  const pick = ids && ids.length ? ids : b.castSelected.length ? b.castSelected : b.cast.map((c) => c.id);
  return b.cast.filter((c) => pick.includes(c.id));
}

/** The reference images to attach with a prompt, by file name: the group image when chosen, else each character's own. */
export function referenceImages(b: CoverBrief, cast: CastMember[]): string[] {
  if (b.useGroupRef && b.groupRefName) return [b.groupRefName];
  return cast.flatMap((c) => (c.refName ? [c.refName] : []));
}

function castBlock(b: CoverBrief, cast: CastMember[], heading = "CHARACTERS"): string {
  if (!cast.length) return `${heading}\nNo saved characters: draw the scene's people simply, warm and age-appropriate.`;
  const refs = referenceImages(b, cast);
  const lines = cast.map((c) => {
    const changes = (["pose", "expression", "outfit", "hairstyle"] as const).filter((k) => c[k]).map((k) => `${k} ${c[k]}`);
    const keep = c.traits ? `Always keep: ${c.traits}.` : "";
    return `- ${c.name}: ${c.description}${c.description.endsWith(".") ? "" : "."} ${keep}${changes.length ? ` In this image: ${changes.join("; ")}.` : ""}${!b.useGroupRef && c.refName ? ` Reference image: ${c.refName}.` : ""}`.replace(/\s+/g, " ").trim();
  });
  const consistent = b.keepConsistent
    ? "Keep these characters exactly consistent with the attached reference images and the interior pages: the same facial features, hair texture, skin tone, proportions and distinctive traits. Only the pose, expression, outfit or hairstyle listed for this image may change."
    : "Use the characters as described; small differences from the references are acceptable.";
  return `${heading}\n${lines.join("\n")}\n${consistent}${refs.length ? `\nAttach these reference images with this prompt: ${refs.join(", ")}.` : ""}`;
}

function outputBlock(b: CoverBrief, output: PageOutput, cast: CastMember[], scene: Scene): string {
  const place = TEXT_PLACEMENTS.find((x) => x.value === b.textPlacement)!.label.toLowerCase();
  switch (output) {
    case "coloring-page":
      return `OUTPUT: a finished coloring page with a title and a Scripture verse.
Leave a clean, empty band for the title and the ${b.translation} verse (${place}). Do not draw any words, letters or verse text: the title “${scene.title}” and the verse${b.scripture ? ` (${b.scripture})` : ""} are typeset in Product Studio${b.verseVerified ? "" : " once their wording and permission are verified"}.`;
    case "illustration":
      return "OUTPUT: a text-free illustration. No words, letters, numbers, labels or signs anywhere in the image.";
    case "worksheet":
      return `OUTPUT: a Bible lesson worksheet. A smaller illustration of the scene, and clearly framed, EMPTY text areas (${place}) for questions, answers and the lesson: leave every box blank; Product Studio fills them with editable text. Draw no words.`;
    case "drawing-page":
      return `OUTPUT: a drawing page. A small starter illustration from the scene and a large, empty framed area for the child's own drawing. Leave a band (${place}) for the instruction, typeset in Product Studio. Draw no words.`;
    case "reference-sheet":
      return `OUTPUT: a character reference sheet. Show ${cast.length ? cast.map((c) => c.name).join(", ") : "each character"} in front, three-quarter, side and back views, plus three facial expressions each, evenly spaced on one sheet, in the same outline style. No scene background and no words.`;
  }
}

/** The prompt for one scene: the collection's settings, the scene's overrides, its cast and its page. */
export function scenePrompt(b: CoverBrief, scene: Scene, index = 0): string {
  const output = scene.output ?? b.output;
  const thickness = scene.lineThickness ?? b.lineThickness;
  const complexity = scene.complexity ?? b.complexity;
  const cast = castFor(b, scene.castIds);
  const spec = resolveCoverSpec({ ...b, format: "front" });
  const est = spaceEstimate(b, output);
  const style = `${b.style}. ${STYLE_GUIDES[b.style] || GENERIC_STYLE_GUIDE}`;
  const single = output === "reference-sheet" ? "" : "\nOne single image of this one scene: do not show several views, a turnaround or a character sheet.";
  return `Create ${output === "reference-sheet" ? "a character reference sheet" : `scene ${index + 1} of a children's coloring book`}: ${b.collection || b.title || "a children's coloring book"}${b.audience ? `, for ${b.audience}` : ` (${b.ageGroup.toLowerCase()})`}.

SCENE ${index + 1}: ${scene.title}
${scene.text || scene.title}${single}

${castBlock(b, cast)}

${coloringStyleLine(b, thickness, complexity)}
Visual language for the line art: ${style}

${outputBlock(b, output, cast, scene)}

PAGE
${fmt(spec.trimW)} × ${fmt(spec.trimH)} inch page, ${Math.round(spec.trimW * b.dpi)} × ${Math.round(spec.trimH * b.dpi)} pixels at ${b.dpi} DPI, portrait. Keep every line at least ${fmt(b.safe)} inches inside the page edge. The illustration takes about ${b.coverage}% of the safe area (${fmt(est.usableW)} × ${fmt(est.artH)} inches).

QUALITY GATES
Age-appropriate, warm and kind; respectful, diverse representation. No watermark, signature or frame unless asked.${b.avoid ? ` Avoid: ${b.avoid}.` : ""} After the image, state its pixel size and confirm it has no text.`;
}

export function allScenePrompts(b: CoverBrief): string {
  return b.scenes.map((s, i) => scenePrompt(b, s, i)).join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
}

// ---- Suggested directions (cards) ---------------------------------------------------------------

type CardFields = Pick<CoverBrief, "coverColor" | "coverComposition" | "titlePlacement" | "coverBackground" | "illustrationScale" | "starterScene">;
export const COLORING_COVER_CARDS: { id: string; title: string; blurb: string; fields: CardFields }[] = [
  {
    id: "storybook", title: "Full-Color Storybook", blurb: "Rich, painterly color like a picture-book cover.",
    fields: { coverColor: "full-color storybook painting in the collection palette", coverComposition: "the characters together in one warm moment, the main character slightly forward", titlePlacement: "title across the top third", coverBackground: "a softly painted setting from the book", illustrationScale: "characters fill the lower two-thirds", starterScene: "the characters together at the heart of the story" },
  },
  {
    id: "watercolor", title: "Soft Watercolor", blurb: "Gentle washes, airy and calm.",
    fields: { coverColor: "soft watercolor in the collection palette, light and airy", coverComposition: "a centered group with gentle space around it", titlePlacement: "title centered at the top", coverBackground: "loose watercolor washes fading to white at the edges", illustrationScale: "characters fill the middle half", starterScene: "the characters pausing together in a peaceful moment" },
  },
  {
    id: "cartoon", title: "Bright Cartoon", blurb: "Bold shapes, cheerful saturated color.",
    fields: { coverColor: "bright cartoon color with clean shapes and bold outlines", coverComposition: "a lively, dynamic group pose with movement", titlePlacement: "big playful title across the top", coverBackground: "a simple bright background with a few shapes", illustrationScale: "characters large, filling most of the cover", starterScene: "the characters mid-celebration, full of joy" },
  },
  {
    id: "hybrid", title: "Hybrid", blurb: "Line art like the inside, with color accents: says “coloring book” at a glance.",
    fields: { coverColor: "black line art on white, with the collection palette used for the background panel, border and a few accents", coverComposition: "the characters as clean line art, as they appear inside the book", titlePlacement: "title in a colored band at the top", coverBackground: "a solid palette-colored panel behind the line art", illustrationScale: "characters fill the center", starterScene: "the characters as they appear on the first interior page" },
  },
];

/** Cards for regular Cover Artwork: each sets a style and a composition, and fills imagery only if it is still empty. */
export const COVER_CARDS: { id: string; title: string; blurb: string; style: string; direction: number; imagery: string; typography: string }[] = [
  { id: "botanical", title: "Botanical Journal", blurb: "One elegant botanical gesture and quiet type.", style: "Painterly botanical", direction: 3, imagery: "a single olive branch or wildflower stem", typography: "Classic book serif" },
  { id: "editorial", title: "Bold Editorial", blurb: "The title is the artwork.", style: "Expressive editorial type", direction: 0, imagery: "", typography: "High-contrast display serif" },
  { id: "minimal", title: "Minimal Scripture", blurb: "Lots of space, the verse leads.", style: "Scripture-led typography", direction: 0, imagery: "", typography: "Modern clean sans-serif" },
  { id: "marble", title: "Marble Luxe", blurb: "Stone and fine gold veining.", style: "Black and gold marble", direction: 2, imagery: "", typography: "High-contrast display serif" },
  { id: "watercolor-type", title: "Soft Watercolor Type", blurb: "Airy washes around a crisp title.", style: "Soft watercolor typography", direction: 1, imagery: "", typography: "Elegant flowing script" },
];

/**
 * Fills a card's fields, respecting what the maker typed: a field is replaced only while it is empty or still holds
 * a card's own wording.
 */
export function applyColoringCard(b: CoverBrief, id: string): CoverBrief {
  const card = COLORING_COVER_CARDS.find((c) => c.id === id);
  if (!card) return b;
  const next = { ...b };
  for (const k of Object.keys(card.fields) as (keyof CardFields)[]) {
    const cur = (b[k] ?? "").trim();
    const fromCard = COLORING_COVER_CARDS.some((c) => c.fields[k] === cur);
    if (!cur || fromCard) next[k] = card.fields[k];
  }
  return next;
}

export function applyCoverCard(b: CoverBrief, id: string): { brief: CoverBrief; direction: number } | null {
  const card = COVER_CARDS.find((c) => c.id === id);
  if (!card) return null;
  const imageryFromCard = COVER_CARDS.some((c) => c.imagery && c.imagery === b.imagery.trim());
  const typoFromCard = COVER_CARDS.some((c) => c.typography === b.typography);
  return {
    brief: { ...b, style: card.style, imagery: !b.imagery.trim() || imageryFromCard ? card.imagery : b.imagery, typography: b.typography === "Let the style decide" || typoFromCard ? card.typography : b.typography },
    direction: card.direction,
  };
}

/** Which card the brief currently matches (for the cards' selected state). */
export const coloringCardOf = (b: CoverBrief) => COLORING_COVER_CARDS.find((c) => (Object.keys(c.fields) as (keyof CardFields)[]).every((k) => b[k] === c.fields[k]))?.id ?? null;

// ---- The coloring book cover --------------------------------------------------------------------

export function coloringCoverBlocker(b: CoverBrief): string | null {
  if (!b.title.trim()) return "Add the book's title: the prompt never uses a placeholder title.";
  return null;
}

export function coloringCoverPrompt(b: CoverBrief): string {
  const spec = resolveCoverSpec(b);
  const cast = castFor(b);
  const wrap = spec.wrap;
  const layout = DIRECTIONS[0];
  const artOnly = b.coverOutput === "artwork-only";
  return `Create ONE ${wrap ? "flat full-wrap cover spread" : "front cover"} for a children's coloring book: “${b.title.trim()}”${b.subtitle ? ` — ${b.subtitle}` : ""}. This is the book's cover; the interior pages are black-and-white line art${b.coloringStyle === "hybrid" ? " with small colored accents" : ""}, and only the cover is in color.

COVER DESIGN
Color: ${b.coverColor || "full color in the collection palette"}.
Composition: ${b.coverComposition || layout[1]}
Title placement: ${b.titlePlacement || "title across the top third"}.
Background: ${b.coverBackground || "a simple setting from the book"}.
Illustration scale: ${b.illustrationScale || "characters fill the lower two-thirds"}.
Scene: ${b.starterScene || "the characters together"}.
Palette: ${paletteSpec(b)}
Visual language: ${b.style}. ${STYLE_GUIDES[b.style] || GENERIC_STYLE_GUIDE}

${castBlock(b, cast, "COVER CAST (use only these characters, exactly as in the interior)")}

TEXT
${artOnly ? `Artwork only: draw NO title, words or letters. Keep the title area (${b.titlePlacement || "top third"}) calm and clear; the title${b.scripture ? ", the verse" : ""} and any other text are added as editable text in Product Studio.` : `Complete cover concept: letter the exact title “${b.title.trim()}”${b.subtitle ? ` and subtitle “${b.subtitle}”` : ""}. Never insert “Untitled” or filler text. Final editable text is set in Product Studio.`}

PRODUCTION GEOMETRY
Finished trim: ${fmt(spec.trimW)} × ${fmt(spec.trimH)} inches${wrap ? " per panel" : ""}. Outer bleed: ${fmt(spec.bleed)} inches per edge. Target canvas: ${fmt(spec.canvasW)} × ${fmt(spec.canvasH)} inches; ${spec.pxW} × ${spec.pxH} pixels at ${spec.dpi} DPI. Keep faces, the title area and important details ${spec.safeText}. ${wrap ? (spec.spine ? `Spine: ${fmt(spec.spine)} inches (printer-confirmed); keep text clear of the folds.` : "Spine width is unconfirmed; this concept is NOT a final print-ready wrap.") : "No spine on this canvas."} No mockup, no 3D book, no crop marks.

QUALITY GATES
Warm, joyful, age-appropriate; respectful, diverse representation. No watermark.${b.avoid ? ` Avoid: ${b.avoid}.` : ""} After the image, state its pixel size and list any text that must be typeset.`;
}
