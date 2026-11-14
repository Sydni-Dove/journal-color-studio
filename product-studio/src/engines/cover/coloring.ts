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
import { artRegion, pageCanvas, type ArtRegion } from "./assemble";

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

// ---- Illustration styling (sent to the image generator) ----------------------------------------
// Page typography (title and Scripture fonts, alignment, size, lesson text, placement) is NOT here: Product Studio
// applies it when it assembles the page (engines/cover/assemble.ts), and it never reaches an image prompt.

export const ILLUSTRATION_STYLES = ["Clean storybook line art", "Classic coloring-book line art", "Modern cartoon line art", "Gentle realistic line art", "Whimsical hand-drawn line art"] as const;
export const PROPORTIONS = ["Natural child proportions", "Slightly stylized (a little larger heads)", "Cute and rounded (larger heads, small bodies)"] as const;
export const DETAIL_LEVELS = ["Simple", "Moderate", "Detailed"] as const;
export const BACKGROUND_DENSITY: { value: string; words: string }[] = [
  { value: "Minimal", words: "minimal background: a floor line or a few simple props" },
  { value: "Light", words: "a light background: a few setting details that frame the characters" },
  { value: "Full", words: "a full background: the whole setting drawn, still in open, colorable shapes" },
];
export const COLORING_AREAS: { value: string; words: string }[] = [
  { value: "Large", words: "large coloring areas, easy for younger hands" },
  { value: "Medium", words: "medium coloring areas" },
  { value: "Small", words: "smaller coloring areas for patient, older colorists" },
];

export function coloringStyleLine(b: CoverBrief, thickness: LineThickness, complexity: Complexity): string {
  const line = LINE_THICKNESS.find((x) => x.value === thickness)!.words;
  const detail = COMPLEXITY.find((x) => x.value === complexity)!.words;
  const area = COLORING_AREAS.find((x) => x.value === b.coloringArea)?.words ?? b.coloringArea;
  const color =
    b.coloringStyle === "hybrid"
      ? `Hybrid · colored accents only: black outlines on a pure white background; the palette (${paletteSpec(b).replace(/^Use the exact /, "").replace(/ Preserve the palette.*$/, "")}) is used ONLY for a few small accents; every shape a child colors stays white. No gradients, grayscale, shadows or watercolor washes.`
      : "Pure white background. Bold, clean black outlines. Closed coloring shapes. No shading, no grayscale, no color, no gradients, no watercolor washes, no shadows, no hatching and no filled black areas (tiny details such as pupils may be solid black).";
  return `COLORING STYLE\n${color}\nLine thickness: ${line}. Illustration complexity: ${detail}. Coloring areas: ${area}.`;
}

/** The cast members a scene (or the cover) uses: its own choice, else the collection's selection, else the whole cast. */
export function castFor(b: CoverBrief, ids?: string[]): CastMember[] {
  const pick = ids && ids.length ? ids : b.castSelected.length ? b.castSelected : b.cast.map((c) => c.id);
  return b.cast.filter((c) => pick.includes(c.id));
}

/** The reference images to attach with a prompt, by file name: the group image when chosen, else each character's own. */
export function referenceImages(b: CoverBrief, cast: CastMember[]): string[] {
  if (!b.useRefs) return [];
  if (b.useGroupRef && b.groupRefName) return [b.groupRefName];
  return cast.flatMap((c) => (c.refName ? [c.refName] : []));
}

/** The reference images as stored files (id + name), for copying or downloading them to hand to the image generator. */
export function referenceFiles(b: CoverBrief, cast: CastMember[]): { id: string; name: string; who: string }[] {
  if (!b.useRefs) return [];
  if (b.useGroupRef && b.groupRefId) return [{ id: b.groupRefId, name: b.groupRefName ?? "group-reference", who: "Group" }];
  return cast.flatMap((c) => (c.refId ? [{ id: c.refId, name: c.refName ?? `${c.name}-reference`, who: c.name }] : []));
}

/** One character's registry entry as prompt text. */
export function registryLine(c: CastMember, n: number, withRef: boolean): string {
  const parts: string[] = [];
  const add = (label: string, v?: string) => v?.trim() && parts.push(`${label}: ${v.trim()}`);
  add("Age", c.age);
  add("Face", c.face);
  add("Hair", c.hair);
  add("Hair accessories", c.hairAccessories);
  add("Body proportions", c.proportions);
  add("Signature clothing", c.clothing);
  add("Distinctive accessories", c.accessories);
  add("Always keep", c.traits);
  add("Notes", c.description);
  return `${n}. ${c.name}${parts.length ? ": " + parts.join("; ") : ""}.${withRef && c.refName ? ` Reference image: ${c.refName}.` : ""}`.replace(/\.\./g, ".");
}

export const REUSE_INSTRUCTION =
  "Reuse the exact established characters from this collection. Preserve facial features, hairstyle, hair accessories, body proportions, and signature clothing. Change only the expressions, poses, and actions required by this scene. Do not redesign or replace characters.";

/** The established characters, their references, and the reuse instruction. Only called when the collection has a cast. */
function registryBlock(b: CoverBrief, cast: CastMember[]): string {
  // A book without recurring characters: the people in each scene are drawn from the scene's own description.
  if (!cast.length) return "CHARACTERS\nNo recurring characters in this book: draw the people and animals this scene describes, appropriate for the audience.";
  const refs = referenceImages(b, cast);
  const missing = b.useRefs && !(b.useGroupRef && b.groupRefName) ? cast.filter((c) => !c.refName).map((c) => c.name) : [];
  return [
    "CHARACTERS",
    "Established characters for this collection:",
    ...cast.map((c, i) => registryLine(c, i + 1, b.useRefs && !(b.useGroupRef && b.groupRefName))),
    REUSE_INSTRUCTION,
    refs.length ? `Attached reference images (use them as the visual identity anchors): ${refs.join(", ")}.` : "",
    missing.length ? `No reference image yet for ${missing.join(", ")}: follow the description above exactly.` : "",
  ].filter(Boolean).join("\n");
}

/** The words a coloring page must never contain in its image (Product Studio adds all text afterwards). */
export const NO_TEXT_RULE =
  "Generate only the illustration. Do not include text, lettering, words, numbers, title banners, scripture boxes, frames, borders, ribbons intended for text, or decorative text containers. Reserve unobstructed white space for Product Studio to add editable titles, Scripture, and lesson content during page assembly. This white space must have no visible outline or boundary.";

/** Why scene prompts can't be built yet (null = they can): a collection's scenes need its cast first. */
export function sceneBlocker(b: CoverBrief): string | null {
  if (!b.cast.length) return "Create your cast before the first scene: add your characters under Cast & references (or copy the cast-design prompt there to have them designed first).";
  // A scene whose verse isn't ready waits on its own; the batch is blocked only when no scene is ready.
  const waiting = b.scenes.map((s, i) => [i, verseArtBlocker(b, s)] as const).filter(([, why]) => why);
  if (b.scenes.length && waiting.length === b.scenes.length) return `Scene ${waiting[0][0] + 1}: ${waiting[0][1]}`;
  return null;
}

/** A verse to be lettered into the artwork needs its exact wording, entered and verified (image tools misspell lettering). */
export function verseArtBlocker(b: CoverBrief, s: Scene): string | null {
  if ((s.scriptureMode ?? b.scriptureMode) !== "art") return null;
  if (!s.verseText?.trim() || !(s.scriptureRef || b.scripture).trim()) return "the verse is to be drawn into the artwork: enter its exact wording and reference first.";
  if (!b.verseVerified) return "the verse is to be drawn into the artwork: tick “Verse wording and permission verified” first.";
  return null;
}

/** The verse the image generator letters into a Scripture coloring page (null = Product Studio adds the Scripture). */
export function letteredVerse(b: CoverBrief, s: Scene): { words: string; ref: string } | null {
  if ((s.scriptureMode ?? b.scriptureMode) !== "art" || verseArtBlocker(b, s)) return null;
  return { words: s.verseText!.trim(), ref: `${(s.scriptureRef || b.scripture).trim()} (${b.translation})` };
}

/** The no-text rule, or, on a Scripture coloring page, the one exception: the verse, lettered exactly. */
function textRule(verse: { words: string; ref: string } | null): string {
  if (!verse) return NO_TEXT_RULE;
  return `The only lettering in the image is this Scripture verse, as part of the coloring art. Do not include any other text, words, numbers, title banners, scripture boxes, frames, borders, ribbons intended for text, or decorative text containers. Reserve unobstructed white space for Product Studio to add the editable title during page assembly. This white space must have no visible outline or boundary.`;
}

/** The prompt for one scene, in the collection's structure: collection, characters, scene, style, composition, restrictions, production, output. */
export function scenePrompt(b: CoverBrief, scene: Scene, index = 0, region?: ArtRegion): string {
  const output = scene.output ?? b.output;
  const thickness = scene.lineThickness ?? b.lineThickness;
  const complexity = scene.complexity ?? b.complexity;
  const cast = castFor(b, scene.castIds);
  const page = pageCanvas(b);
  const r = region ?? artRegion(b, scene);
  const total = Math.max(b.scenes.length, index + 1);
  const bg = BACKGROUND_DENSITY.find((x) => x.value === b.backgroundDensity)?.words ?? b.backgroundDensity;
  const sheet = output === "reference-sheet";
  const verse = sheet ? null : letteredVerse(b, scene);
  const white: string[] = [];
  if (r.topTextPx) white.push(`the top ${r.topTextPx} px`);
  if (r.bottomTextPx) white.push(`the bottom ${r.bottomTextPx} px`);
  const regen = scene.attempts
    ? `\nREGENERATION (attempt ${scene.attempts + 1}): the previous image was not approved${scene.rejectNotes?.trim() ? ` because: ${scene.rejectNotes.trim()}` : ""}. Fix that, and keep exactly the same established characters.`
    : "";
  return `COLLECTION
${b.collection || b.title || "Children's coloring book"}. Audience: ${b.audience || b.ageGroup}. Established illustration style: ${b.illustrationStyle}; ${b.proportions.toLowerCase()}; ${b.hairClothingDetail.toLowerCase()} hair and clothing detail; ${bg}.

${registryBlock(b, cast)}

SCENE
Scene ${index + 1} of ${total}: ${scene.title}.
${scene.text.trim() || scene.title}
${cast.length ? `Characters in this scene: ${cast.map((c) => c.name).join(", ")}. Show the actions, expressions and interactions this scene describes; the setting changes, the characters do not.` : "Show the actions, expressions and interactions this scene describes."}${scene.styleNotes?.trim() ? `\nArt notes for this scene: ${scene.styleNotes.trim()}` : ""}${regen}${verse ? `

SCRIPTURE LETTERING
Hand-letter this verse into the illustration, spelled exactly, word for word, with its reference:
“${verse.words}” — ${verse.ref}
Use large, hollow outline letters with black outlines and white insides that children can color, placed as part of the design inside the artwork area. No banner, ribbon, scroll, plaque or box behind or around the words. Check every word and its spelling against the text above.` : ""}

${coloringStyleLine(b, thickness, complexity)}

COMPOSITION
${sheet
    ? `A character reference sheet: ${cast.map((c) => c.name).join(", ")} each in front, three-quarter, side and back views plus three facial expressions, evenly spaced on one sheet. No scene background.`
    : "One scene only. No character sheets, multiple views, or alternate compositions."} Keep all artwork inside x ${r.px.left}–${r.px.right} px and y ${r.px.top}–${r.px.bottom} px of the ${r.canvas.pxW} × ${r.canvas.pxH} px canvas; everything outside it stays pure, unobstructed white${white.length ? ` (${white.join(" and ")} are where Product Studio places the page text` : " ("}${white.length ? "; " : ""}the left and right ${r.px.left} px keep the outer margin and binding gutter clear). Preserve unobstructed white space where the final layout requires it.

RESTRICTIONS
${textRule(verse)} ${verse ? "No" : "No Scripture text,"} watermarks, signatures, or unnecessary borders. Age-appropriate for ${b.audience || b.ageGroup.toLowerCase()}: modest clothing, kind and joyful expressions.${b.avoid ? ` Avoid: ${b.avoid}.` : ""}

PRODUCTION
Portrait illustration intended for assembly onto an ${fmt(page.trimW)} × ${fmt(page.trimH)}-inch, ${page.dpi}-DPI print canvas (${page.pxW} × ${page.pxH} pixels). If the tool cannot output exactly ${page.pxW} × ${page.pxH} pixels, keep the portrait ${fmt(page.trimW)}:${fmt(page.trimH)} proportion and state the actual size; do not claim a higher resolution than the image has. Every measurement in this prompt is an instruction only: never draw numbers, sizes, pixel counts or labels on the image.

OUTPUT
${verse ? "One standalone illustration asset with the verse lettered in. Product Studio adds the editable title afterward. After the image, state its pixel size and write out the lettered verse exactly as drawn, so it can be proofread." : "One standalone illustration asset. Product Studio adds all editable text afterward. After the image, state its pixel size and confirm it contains no text."}`;
}

/** Every ready scene's prompt (a scene waiting for its verse wording is left out, and listed at the end). */
export function allScenePrompts(b: CoverBrief): string {
  const ready = b.scenes.map((s, i) => [s, i] as const).filter(([s]) => !verseArtBlocker(b, s));
  const waiting = b.scenes.map((s, i) => [i, verseArtBlocker(b, s)] as const).filter(([, why]) => why);
  const all = ready.map(([s, i]) => scenePrompt(b, s, i)).join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
  return waiting.length ? `${all}\n\n(Not included yet: ${waiting.map(([i, why]) => `scene ${i + 1}, ${why}`).join("; ")})` : all;
}

/**
 * Before the first scene, when no characters exist yet: a prompt to design the cast as a reference sheet, from
 * the collection's notes ("Your characters"). Its result becomes the group reference image and the registry.
 */
export function castDesignPrompt(b: CoverBrief): string {
  const who = b.characters.trim() || `${b.characterCount} recurring children for ${b.collection || "this coloring book"}`;
  return `COLLECTION
${b.collection || b.title || "Children's coloring book"}. Audience: ${b.audience || b.ageGroup}. Illustration style: ${b.illustrationStyle}; ${b.proportions.toLowerCase()}.

CHARACTERS TO DESIGN
${who}
Design each as an original, recognisable character: a clear age, face, hair texture and hairstyle, hair accessories, body proportions, signature clothing and one distinctive accessory, all different enough to tell apart at a glance in black-and-white line art.

COMPOSITION
A character reference sheet: each character in front, three-quarter, side and back views plus three facial expressions, evenly spaced on one sheet, with the character's name under each. No scene background.

${coloringStyleLine(b, b.lineThickness, b.complexity)}

OUTPUT
One reference sheet. After the image, list each character with the age, face, hair, hair accessories, proportions, signature clothing and accessories you drew, so they can be saved in the collection's character registry.`;
}

/** Cast lines for the coloring book cover (a pose, outfit or hairstyle set for the cover applies to the cover only). */
function coverCastBlock(b: CoverBrief, cast: CastMember[]): string {
  if (!cast.length) return "COVER CAST\nThis collection has no established characters yet: draw the children simply, warm and age-appropriate.";
  const refs = referenceImages(b, cast);
  const lines = cast.map((c, i) => {
    const changes = (["pose", "expression", "outfit", "hairstyle"] as const).filter((k) => c[k]).map((k) => `${k} ${c[k]}`);
    return `${registryLine(c, i + 1, b.useRefs && !(b.useGroupRef && b.groupRefName))}${changes.length ? ` On the cover: ${changes.join("; ")}.` : ""}`;
  });
  const consistent = b.keepConsistent
    ? "Keep these characters exactly consistent with the attached reference images and the interior pages: the same facial features, hair texture, skin tone, proportions and distinctive traits. Only the pose, expression, outfit or hairstyle listed for the cover may change."
    : "Use the characters as described; small differences from the references are acceptable.";
  return `COVER CAST (use only these characters, exactly as in the interior)\n${lines.join("\n")}\n${consistent}${refs.length ? `\nAttach these reference images with this prompt: ${refs.join(", ")}.` : ""}`;
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

${coverCastBlock(b, cast)}

TEXT
${artOnly ? `Artwork only: draw NO title, words or letters. Keep the title area (${b.titlePlacement || "top third"}) as open, uncluttered background (sky, wall or soft color) with no plaque, banner, ribbon, frame, cartouche or empty box; the title${b.scripture ? ", the verse" : ""} and any other text are added as editable text in Product Studio.` : `Complete cover concept: letter the exact title “${b.title.trim()}”${b.subtitle ? ` and subtitle “${b.subtitle}”` : ""}. Never insert “Untitled” or filler text. Final editable text is set in Product Studio.`}

PRODUCTION GEOMETRY
Finished trim: ${fmt(spec.trimW)} × ${fmt(spec.trimH)} inches${wrap ? " per panel" : ""}. Outer bleed: ${fmt(spec.bleed)} inches per edge. Target canvas: ${fmt(spec.canvasW)} × ${fmt(spec.canvasH)} inches; ${spec.pxW} × ${spec.pxH} pixels at ${spec.dpi} DPI. Keep faces, the title area and important details ${spec.safeText}. ${wrap ? (spec.spine ? `Spine: ${fmt(spec.spine)} inches (printer-confirmed); keep text clear of the folds.` : "Spine width is unconfirmed; this concept is NOT a final print-ready wrap.") : "No spine on this canvas."} No mockup, no 3D book, no crop marks. Every measurement in this prompt is an instruction only: never draw numbers, sizes, pixel counts or labels on the image.

QUALITY GATES
Warm, joyful, age-appropriate; respectful, diverse representation. No watermark.${b.avoid ? ` Avoid: ${b.avoid}.` : ""} After the image, state its pixel size and list any text that must be typeset.`;
}
