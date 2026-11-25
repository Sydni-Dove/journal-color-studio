/**
 * COLORING BOOK — a finished product, start to end: the book's setup, its characters, its interior pages, its cover,
 * and the preview and print files. Plain data, no UI.
 *
 * The book keeps a Cover Studio brief (`brief`) underneath: the characters (cast), the scenes, the coloring style and
 * the print setup are the same data Cover Studio's coloring prompts and page assembly already use, so a coloring book
 * started in Cover Studio opens here unchanged (its characters, their reference images and its scenes).
 *
 * What a finished page shows is the customer's choice (`content`, per book, with per-page overrides): an illustration
 * alone, or with a title, a Bible verse, a lesson or reflection, custom text, in any combination. Nothing is assumed:
 * a book without lessons has no lesson label, heading or empty space anywhere.
 */
import { newBrief, type CoverBrief, type Scene } from "../cover/brief";

/** Scripture on a finished page: the full approved verse with its reference, the reference only, or none. */
export type ScriptureChoice = "full" | "reference" | "none";

/** What appears on a finished page besides the illustration. */
export type PageContent = {
  title: boolean;
  scripture: ScriptureChoice;
  lesson: boolean;
  customText: boolean;
};

export const DEFAULT_CONTENT: PageContent = { title: true, scripture: "none", lesson: false, customText: false };

/** The common combinations, offered as one-click choices (each part stays a separate switch). */
export const CONTENT_PRESETS: { id: string; label: string; content: PageContent }[] = [
  { id: "illustration", label: "Illustration only", content: { title: false, scripture: "none", lesson: false, customText: false } },
  { id: "title", label: "Illustration + title", content: { title: true, scripture: "none", lesson: false, customText: false } },
  { id: "verse", label: "Illustration + Bible verse", content: { title: true, scripture: "full", lesson: false, customText: false } },
  { id: "lesson", label: "Illustration + lesson or reflection", content: { title: true, scripture: "none", lesson: true, customText: false } },
  { id: "custom", label: "Illustration + custom text", content: { title: true, scripture: "none", lesson: false, customText: true } },
];

/**
 * Where the book is printed, and what that printer requires. Minimums are the platform's own:
 * KDP paperback (perfect bound) needs at least 24 pages and at most 828 (black and white).
 */
export type PrintFormatId = "kdp-paperback" | "home-print" | "spiral" | "digital";
export type PrintFormat = { id: PrintFormatId; label: string; blurb: string; binding: string; printProfile: string; minPages: number; maxPages: number | null; coverWrap: boolean };
export const PRINT_FORMATS: PrintFormat[] = [
  { id: "kdp-paperback", label: "Amazon KDP paperback", blurb: "Perfect bound. KDP requires at least 24 pages, and a full wrap cover (back, spine, front).", binding: "Perfect bound", printProfile: "kdp", minPages: 24, maxPages: 828, coverWrap: true },
  { id: "spiral", label: "Spiral bound (print shop)", blurb: "Lies flat for coloring. Print shops set their own minimums: ask yours.", binding: "Spiral / coil", printProfile: "coil-generic", minPages: 2, maxPages: null, coverWrap: false },
  { id: "home-print", label: "Print at home or stapled", blurb: "Loose or stapled pages on a home printer.", binding: "Loose / unbound", printProfile: "generic-commercial", minPages: 1, maxPages: null, coverWrap: false },
  { id: "digital", label: "Printable PDF download", blurb: "Customers print the pages themselves.", binding: "Loose / unbound", printProfile: "generic-commercial", minPages: 1, maxPages: null, coverWrap: false },
];
export const formatOf = (id: PrintFormatId) => PRINT_FORMATS.find((f) => f.id === id) ?? PRINT_FORMATS[0];

/** Coloring difficulty: what the customer sees; it sets line thickness and complexity together (both stay editable). */
export const DIFFICULTIES = [
  { id: "easy", label: "Easy (big shapes, thick lines)", lineThickness: "Thick", complexity: "Simple" },
  { id: "medium", label: "Medium", lineThickness: "Medium", complexity: "Moderate" },
  { id: "detailed", label: "Detailed (small shapes, fine lines)", lineThickness: "Thin", complexity: "Detailed" },
] as const;

export const AGE_RANGES = ["Ages 2–4", "Ages 4–8", "Ages 8–12", "Teens", "Adults", "All ages"] as const;

/** Pages before the scenes. All optional. */
export type FrontMatter = { titlePage: boolean; copyrightPage: boolean; belongsTo: boolean };

/** The cover the customer uploaded (the generated artwork), and how its words are added. */
export type CoverArt = { id: string; name: string; w: number; h: number };

export type BookStepId = "setup" | "characters" | "pages" | "cover" | "preview";

export type ColoringBook = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Characters, scenes, coloring style and print setup (shared with Cover Studio's coloring prompts and page assembly). */
  brief: CoverBrief;
  author: string;
  faithBased: boolean;
  /** What every finished page shows, unless the page chooses its own. */
  content: PageContent;
  printFormat: PrintFormatId;
  /** Double-sided: pictures back to back. Single-sided: every picture on its own sheet, the back left blank. */
  sides: "single" | "double";
  frontMatter: FrontMatter;
  /** "Draw your own picture" pages at the end (0 = none), e.g. to reach a printer's minimum page count. */
  drawingPages: number;
  difficulty: string;
  /** The complete text the scenes were imported from, kept so nothing the importer missed is lost. */
  importSource: string;
  cover: { front?: CoverArt; mode: "with-title" | "as-is"; approved?: string; backText: string };
  /** The customer has the translation publisher's written permission (for quotations beyond the free-use limits). */
  scripturePermission: boolean;
  /** Devotional Spreads: the Mommy page's split, sizes and writing-line spacing (DEFAULT_SPREAD when absent). */
  spread?: SpreadSettings;
  /** Saved characters for Art Prompts: each description is pasted word for word into the prompt. */
  artCharacters?: ArtCharacter[];
  /** The products the finished interior and cover were saved as (re-exporting updates the same ones). */
  interiorProjectId?: string;
  coverProjectId?: string;
  /** The printable digital PDF's product (re-exporting updates the same one). */
  digitalProjectId?: string;
  step: BookStepId;
  reached: number;
};

/**
 * The Mommy page of a Devotional Spread:
 *   split          the art's share of the page width (column) or height (band), 0.5–0.8
 *   headingPt      the section labels (Read the Word…)
 *   bodyPt         the excerpts, statements and questions
 *   lineSpacingIn  the writing lines' spacing
 */
export type SpreadSettings = { split: number; headingPt: number; bodyPt: number; lineSpacingIn: number };
export const DEFAULT_SPREAD: SpreadSettings = { split: 0.65, headingPt: 10.5, bodyPt: 9.5, lineSpacingIn: 0.3 };
export const spreadOf = (book: Pick<ColoringBook, "spread">): SpreadSettings => ({ ...DEFAULT_SPREAD, ...(book.spread ?? {}) });

/** A saved Art Prompt character: the description goes into prompts exactly as written. */
export type ArtCharacter = { id: string; name: string; description: string };
export const GIRL_1: ArtCharacter = {
  id: "girl-1",
  name: "Girl 1",
  description:
    "A joyful Black girl about 6 years old with long braids gathered into a high ponytail tied with a large bow. Round face, large gentle eyes and a small open smile. Knee-length dress with puffed short sleeves, a round collar, a sash tied in a bow at the waist and a full twirl skirt. Ankle socks and Mary Jane shoes.",
};
/** The book's saved Art Prompt characters (Girl 1 until the maker saves their own). */
export const artCharactersOf = (book: Pick<ColoringBook, "artCharacters">): ArtCharacter[] => (book.artCharacters?.length ? book.artCharacters : [GIRL_1]);

/** The content a scene's finished page uses: the scene's own choice where it made one, the book's otherwise. */
export function contentOf(book: ColoringBook, s: Scene): PageContent {
  return { ...book.content, ...(s.content ?? {}) };
}

/** The interior page brief every coloring book starts from: clean black outlines on white, 8.5 × 11 in, 300 DPI. */
/** The verse size a new coloring book starts with. */
export const NEW_BOOK_TEXT_PT = 18;

export function coloringBrief(over: Partial<CoverBrief> = {}): CoverBrief {
  return newBrief({
    category: "character", coloringStyle: "outline", lineThickness: "Medium", complexity: "Moderate", output: "coloring-page",
    product: "Workbook", size: "8.5×11", bleed: 0, safe: 0.25, gutter: 0.5, dpi: 300, binding: "Perfect bound", printProfile: "kdp",
    backgroundDensity: "Light", textPlacement: "bottom", coverage: 70, blankBacks: true, illustrationStyle: "Clean storybook line art",
    coverOutput: "artwork-only", coverColor: "Full-color storybook painting", style: "Whimsical storybook illustration",
    // A new book's verse starts large and graceful: 18 pt Cormorant Garamond (saved books keep their own choice).
    pageTypography: { titleFont: "Playfair Display", scriptureFont: "Cormorant Garamond", align: "center", titleSizePt: 24, textSizePt: NEW_BOOK_TEXT_PT },
    ...over,
  });
}

export function newBook(id: string, over: Partial<ColoringBook> = {}, now = new Date().toISOString()): ColoringBook {
  return {
    schemaVersion: 1, id, name: "", createdAt: now, updatedAt: now,
    brief: coloringBrief(), author: "", faithBased: false, content: { ...DEFAULT_CONTENT }, printFormat: "kdp-paperback", sides: "single",
    frontMatter: { titlePage: true, copyrightPage: true, belongsTo: false }, drawingPages: 0, difficulty: "medium", importSource: "",
    cover: { mode: "with-title", backText: "" }, scripturePermission: false, step: "setup", reached: 0,
    ...over,
  };
}

/** A coloring book started in Cover Studio (Children's Character Illustrations): every character, reference and scene kept as it is. */
export function bookFromCoverBrief(id: string, brief: CoverBrief, now?: string): ColoringBook {
  const anyVerse = brief.scenes.some((s) => s.scriptureRef?.trim()) || !!brief.scripture.trim();
  // Cover Studio's Scripture choice, as the book's: none / reference only / full verse (lettered-in pages print the full verse too).
  const show = (brief as CoverBrief & { scriptureShow?: "full" | "reference" | "none" }).scriptureShow;
  const scripture: PageContent["scripture"] = !anyVerse || show === "none" ? "none" : show === "reference" ? "reference" : "full";
  // Wording the collection marked verified in Cover Studio counts as approved here (it was approved there): nothing to redo.
  const stamp = now ?? new Date().toISOString();
  const scenes = brief.scenes.map((s) => (brief.verseVerified && s.verseText?.trim() && s.scriptureRef?.trim() && !s.verseApproved ? { ...s, verseApproved: stamp, verseSource: s.verseSource ?? ("customer" as const) } : s));
  // The binding chosen there is the print format here.
  const printFormat: PrintFormatId = /spiral|coil/i.test(brief.binding) ? "spiral" : /loose|unbound/i.test(brief.binding) ? "home-print" : "kdp-paperback";
  const difficulty = DIFFICULTIES.find((d) => d.lineThickness === brief.lineThickness && d.complexity === brief.complexity)?.id ?? "medium";
  return newBook(id, {
    name: brief.title || brief.collection || "Coloring book",
    brief: { ...brief, category: "character", scenes, title: brief.title || brief.collection },
    faithBased: anyVerse && show !== "none",
    content: { title: true, scripture, lesson: brief.scenes.some((s) => s.lessonText?.trim()), customText: false },
    sides: brief.blankBacks ? "single" : "double",
    printFormat,
    difficulty,
    importSource: brief.sceneSource,
    // A finished cover already uploaded there is this book's cover.
    ...(brief.finishedCoverId
      ? { cover: { mode: brief.coverOutput === "complete-concept" ? ("as-is" as const) : ("with-title" as const), backText: "", front: { id: brief.finishedCoverId, name: brief.finishedCoverName ?? "cover", w: 0, h: 0 }, ...(brief.coverApproved ? { approved: brief.coverApproved } : {}) } }
      : {}),
  }, now);
}

/** The book's title: what the customer named it, else the brief's title. */
export const bookTitle = (b: ColoringBook) => b.brief.title.trim() || b.name.trim();
