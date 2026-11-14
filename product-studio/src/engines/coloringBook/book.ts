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
  /** The products the finished interior and cover were saved as (re-exporting updates the same ones). */
  interiorProjectId?: string;
  coverProjectId?: string;
  step: BookStepId;
  reached: number;
};

/** The content a scene's finished page uses: the scene's own choice where it made one, the book's otherwise. */
export function contentOf(book: ColoringBook, s: Scene): PageContent {
  return { ...book.content, ...(s.content ?? {}) };
}

/** The interior page brief every coloring book starts from: clean black outlines on white, 8.5 × 11 in, 300 DPI. */
export function coloringBrief(over: Partial<CoverBrief> = {}): CoverBrief {
  return newBrief({
    category: "character", coloringStyle: "outline", lineThickness: "Medium", complexity: "Moderate", output: "coloring-page",
    product: "Workbook", size: "8.5×11", bleed: 0, safe: 0.25, gutter: 0.5, dpi: 300, binding: "Perfect bound", printProfile: "kdp",
    backgroundDensity: "Light", textPlacement: "bottom", coverage: 70, blankBacks: true, illustrationStyle: "Clean storybook line art",
    coverOutput: "artwork-only", coverColor: "Full-color storybook painting", style: "Whimsical storybook illustration",
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
  return newBook(id, {
    name: brief.title || brief.collection || "Coloring book",
    brief: { ...brief, category: "character" },
    faithBased: anyVerse,
    content: { title: true, scripture: anyVerse ? "full" : "none", lesson: brief.scenes.some((s) => s.lessonText?.trim()), customText: false },
    sides: brief.blankBacks ? "single" : "double",
    importSource: brief.sceneSource,
  }, now);
}

/** The book's title: what the customer named it, else the brief's title. */
export const bookTitle = (b: ColoringBook) => b.brief.title.trim() || b.name.trim();
