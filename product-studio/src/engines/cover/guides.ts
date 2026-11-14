/**
 * COVER STUDIO — the creative vocabulary: cover styles (with the self-contained descriptions a new chat needs,
 * because it cannot see Sydni's reference images), the five composition directions, and the choices of the
 * stationery cover generator this feature was ported from. Wording is copied from that generator on purpose:
 * the prompts it builds were tuned against rejected covers (see PROHIBITIONS in prompt.ts).
 */

/** Product choices, in the order the generator offered them. */
export const COVER_PRODUCTS = [
  "Journal", "Planner", "Notebook", "Devotional", "Workbook", "Scripture cards", "Bookmark", "Greeting card",
  "Notepad", "Notary journal", "Notary planner", "Notary record book", "Other stationery",
] as const;
export type CoverProduct = (typeof COVER_PRODUCTS)[number];

/** Products that are bound books, so a full wrap (back + spine + front) can apply. */
export const WRAP_PRODUCTS: readonly CoverProduct[] = ["Journal", "Planner", "Notebook", "Devotional", "Workbook", "Notary journal", "Notary planner", "Notary record book"];
export const isWrapProduct = (p: string): boolean => (WRAP_PRODUCTS as readonly string[]).includes(p);

/** The size a product starts at ("Custom" = the maker enters width and height). */
export const DEFAULT_SIZE: Record<CoverProduct, string> = {
  Journal: "6×9", Planner: "7×9", Notebook: "5.5×8.5", Devotional: "6×9", Workbook: "8.5×11", "Scripture cards": "4×6", Bookmark: "2×6",
  "Greeting card": "5×7", Notepad: "5.5×8.5", "Notary journal": "6×9", "Notary planner": "7×9", "Notary record book": "8.5×11", "Other stationery": "Custom",
};

/** Products that are not bound into a book start as loose pieces. */
const LOOSE_PRODUCTS: readonly CoverProduct[] = ["Scripture cards", "Bookmark", "Greeting card", "Notepad", "Other stationery"];
export const defaultBindingFor = (p: string): string => ((LOOSE_PRODUCTS as readonly string[]).includes(p) ? "Loose / unbound" : "Perfect bound");

/** The trim sizes offered, as the generator wrote them ("6×9" = inches, width × height). */
export const COVER_SIZES = ["3.5×5.5", "4.25×6.875", "5×8", "5.5×8.5", "6×9", "7×9", "7×10", "8.5×11", "8×8", "8.5×8.5", "4×6", "5×7", "2×6", "3×7", "Custom"] as const;

/** The bindings offered, mapped to Product Studio's binding profiles. */
export const COVER_BINDINGS = ["Perfect bound", "Case bound", "Spiral / coil", "Saddle stitch", "Loose / unbound"] as const;
export const BINDING_TYPE: Record<string, import("../../types/binding").BindingType> = {
  "Perfect bound": "perfect-bound", "Case bound": "case-bound", "Spiral / coil": "coil", "Saddle stitch": "saddle-stitch", "Loose / unbound": "none",
};

export const COVER_STATUSES = ["Idea", "Prompt ready", "Design in progress", "Proofing", "Ready to list", "Listed"] as const;
export const DPI_CHOICES = [300, 600, 150, 72] as const;

export const DEFAULT_AVOID = "generic sunrise, mountains, stacked books, ornate antique borders, clip-art leaves";
export const DEFAULT_MOCKUPS = "Front cover flat lay\nLifestyle scene\nInside spread\nSize comparison";

/** Cover style choices, grouped as the generator grouped them. */
export const STYLE_GROUPS: { label: string; styles: string[] }[] = [
  { label: "Based on your examples", styles: ["Expressive editorial type", "Formal notary register", "Abstract circle planner", "Soft watercolor typography", "Black and gold marble", "Peach and gold marble", "Oversized script statement"] },
  { label: "Other journal & planner covers", styles: ["Elegant editorial", "Minimal typography", "Painterly botanical", "Modern geometric", "Warm photography", "Vintage engraving", "Scripture-led typography", "Quiet devotional", "Prayer garden", "Watercolor landscape", "Abstract color field", "Classic leatherbound", "Soft linen texture", "Bold statement type", "Celestial night sky", "Seasonal collection"] },
  { label: "Notary & professional covers", styles: ["Professional seal & border", "Modern notary ledger", "Classic archival register", "Executive monogram", "Clean appointment planner", "Documentary blueprint"] },
  { label: "Cards, bookmarks & stationery", styles: ["Botanical line art", "Typographic scripture card", "Minimal icon series", "Patterned gift set", "Coordinated color blocks"] },
];
export const DEFAULT_STYLE = STYLE_GROUPS[0].styles[0];

/** Five distinct design directions: [name, description]. */
export const DIRECTIONS: readonly (readonly [string, string])[] = [
  ["Type as artwork", "Make the title the focal point with intentional scale, spacing, and asymmetry; use texture only to support the lettering."],
  ["Abstract composition", "Use bold shapes, tonal fields, or a single expressive mark with a clear hierarchy and no literal scenery."],
  ["Material & texture", "Build depth from paper, linen, ink, foil, or embossing cues with contemporary restraint."],
  ["Editorial image", "Use one carefully cropped image or illustration with strong art direction and ample space for typography."],
  ["Pattern system", "Create a repeatable motif that can extend across a journal, planner, bookmark, and cards without duplicating the layout."],
];

/** Self-contained descriptions of the styles (a new chat will not see the reference images). */
export const STYLE_GUIDES: Record<string, string> = {
  "Expressive editorial type": "Use oversized high-contrast serif letterforms that fill much of the cover, with deliberate overlaps, crops, or vertical side type. Black on white or another restrained high-contrast pair. Minimal decoration; the typography is the image. Build the letterforms and spacing deliberately; do not imitate a logo.",
  "Formal notary register": "Use a white field, black high-contrast serif hierarchy, precise thin double-line frame, spaced small capitals, and a single jurisdiction-specific silhouette only when jurisdiction is provided. Keep it credible, spare, and orderly. No faux seal or claim of official government status.",
  "Abstract circle planner": "Use a white ground with large cropped circles or arcs in burgundy, coral, blush, muted blue, and one fine warm metallic-looking line. Place expressive black title lettering across the shapes with a small clean subtitle. Keep forms asymmetrical and editorial. Use a fresh arrangement of shapes for this title.",
  "Soft watercolor typography": "Use a centered white title field with airy, translucent lavender, peach, and blush washes sweeping in from the margins. Oversized slender display lettering, restrained champagne rule, and a small subtitle. No landscape, sunset, mountains, or foliage. Keep the washes at the edges so the title remains crisp.",
  "Black and gold marble": "Use deep black stone with irregular fine champagne-gold veins and a simple central dark title panel. Large clean white serif title with ample breathing room. Keep gold accents thin and controlled; no ornate frame. Let the veining add energy without competing with the title.",
  "Peach and gold marble": "Use translucent peach, blush, and creamy stone fields with irregular fine warm-gold seams. Preserve mineral depth and uneven natural veining; pair with a clean high-contrast title zone or restrained lettering. Avoid a flat pink wash, glitter, or generic watercolor scenery. Let the title sit in a clean area with strong contrast.",
  "Oversized script statement": "Use one large expressive black script word that dominates a white or lightly colored cover, with very small supporting type. Allow confident cropping and plenty of open space. Keep the script legible and pair it with restrained sans-serif supporting type.",
  "Watercolor landscape": "Use watercolor as a restrained material treatment with unusual cropping and sophisticated color transitions; avoid a literal horizon, sunset, mountain range, lake, or decorative plant corners unless explicitly requested.",
  "Vintage engraving": "Use crisp archival linework as one contemporary focal element; avoid parchment, filigree frames, stacked books, and antique-looking filler.",
  "Classic leatherbound": "Use a clean book-cloth or leather texture and contemporary title placement; avoid faux antique borders and decorative corner scrolls.",
  "Scripture-led typography": "Treat the phrase as a modern typographic composition, with text hierarchy and generous space; do not add generic religious symbols.",
  "Professional seal & border": "Use a precise professional credential aesthetic, restrained rules, and an abstract seal area; avoid fake official seals or state insignia.",
  "Painterly botanical": "Use a single purposeful botanical gesture with negative space, not a leafy frame or scattered stock flowers.",
};

/** Used when a style has no description of its own. */
export const GENERIC_STYLE_GUIDE = "Use intentional typography, a controlled palette, and a distinct visual structure.";
export const STYLE_HINT_FALLBACK = "Choose a composition that fits the title and product.";

/** The weekly coordinated set: a journal, a planner, a bookmark and scripture cards. */
export const STARTER_SET: readonly { product: string; size: string }[] = [
  { product: "Journal", size: "6×9" }, { product: "Planner", size: "7×9" }, { product: "Bookmark", size: "2×6" }, { product: "Scripture cards", size: "4×6" },
];

/** "6×9" → [6, 9]; null for "Custom" or anything that is not two numbers. */
export function parseSize(size: string): [number, number] | null {
  const m = /^(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)$/.exec(size);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
