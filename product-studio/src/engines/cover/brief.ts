/**
 * COVER STUDIO — the brief (everything the maker decides about one collection's covers) and the collection it is
 * saved in. Plain data, no UI. Numeric fields that can be "not entered yet" (the printer-confirmed spine width)
 * are null, never 0.
 */
import { DEFAULT_AVOID, DEFAULT_MOCKUPS, DEFAULT_SIZE, DEFAULT_STYLE, defaultBindingFor, type CoverProduct } from "./guides";

export type CoverFormat = "front" | "wrap";

/**
 * What is being designed (the first screen): a cover, art for interior pages, children's character illustrations,
 * or a coordinated collection. Briefs saved before categories existed are covers.
 */
export type CoverCategory = "cover" | "coloring-cover" | "interior" | "character" | "collection";

/** Coloring pages: black outlines on white (default), or colored accents only (borders and accents in the palette; the shapes children color stay white). */
export type ColoringStyle = "outline" | "hybrid";
export type LineThickness = "Thin" | "Medium" | "Thick";
export type Complexity = "Simple" | "Moderate" | "Detailed";
/** What one interior page is. Only a reference sheet asks for several views of a character. */
export type PageOutput = "coloring-page" | "illustration" | "worksheet" | "drawing-page" | "reference-sheet";
export type TextPlacement = "top" | "bottom" | "top-and-bottom" | "none";

/**
 * One character of the collection's saved cast. `traits` are what never changes (face, hair texture, proportions,
 * distinctive features); pose, expression, outfit and hairstyle may change per image when set.
 */
export type CastMember = {
  id: string;
  name: string;
  /** Other notes: who they are, personality, anything not covered below. */
  description: string;
  /** Distinctive traits always preserved. */
  traits: string;
  // The registry: what makes this character recognisable in every scene.
  age?: string;
  face?: string;
  /** Hair texture and hairstyle. */
  hair?: string;
  hairAccessories?: string;
  proportions?: string;
  /** Signature clothing. */
  clothing?: string;
  /** Distinctive accessories (glasses, a necklace…). */
  accessories?: string;
  /** An uploaded reference image (engines/artwork/store id) and its file name, if any. */
  refId?: string;
  refName?: string;
  pose?: string;
  expression?: string;
  outfit?: string;
  hairstyle?: string;
};

/** One scene of a batch: its text, which cast members are in it (all selected when absent), and its own overrides. */
export type Scene = {
  id: string;
  title: string;
  text: string;
  castIds?: string[];
  lineThickness?: LineThickness;
  complexity?: Complexity;
  output?: PageOutput;
  // Page text, typeset by Product Studio during page assembly (never sent to the image generator).
  pageTitle?: string;
  scriptureRef?: string;
  /** Verse wording, used on the page only once its wording and permission are verified. */
  verseText?: string;
  lessonText?: string;
  /** Who adds the Scripture on this page (the collection's choice when absent). */
  scriptureMode?: ScriptureMode;
  // The generated illustration for this scene, its pixel size, the consistency check and approval.
  illustrationId?: string;
  illustrationName?: string;
  illustrationW?: number;
  illustrationH?: number;
  checks?: Record<string, boolean>;
  approvedAt?: string;
  /** Regenerations so far, and why the last image was rejected. */
  attempts?: number;
  rejectNotes?: string;
  // Coloring Book (engines/coloringBook): what the finished page shows, and where its Scripture came from.
  /** This page's own choice of title / Scripture / lesson / custom text (the book's when absent). */
  content?: Partial<import("../coloringBook/book").PageContent>;
  customText?: string;
  /** When the customer approved this page's verse wording (it is printed in full only then). */
  verseApproved?: string;
  /** Which words print: the full verse (default) or a short excerpt typed by the maker (KJV only). */
  verseUse?: "full" | "excerpt";
  /** The short excerpt, taken from the verse's own wording. */
  verseExcerpt?: string;
  /** Where the wording came from: typed or pasted by the customer, or a public-domain text fetched for them. */
  verseSource?: "customer" | "public-domain";
  /** A suggested reference for a scene without one, waiting for the customer's approval. */
  suggestedRef?: string;
  /** Imported details kept with the scene (characters named, what they do, style notes). */
  characters?: string;
  actions?: string;
  styleNotes?: string;
  // Per-page lettering and Devotional Spreads (engines/coloringBook/spread.ts).
  /** This page's own lettering (the book's "Title and verse style" when absent). */
  letterStyle?: LetterStyle;
  /** Hide the app's words on this page (the lettering is already drawn into the art). */
  textOff?: boolean;
  /** "devotional-spread": two facing pages, the daughter page on the left and the Mommy page on the right. */
  pageType?: "devotional-spread";
  /** The page's theme, for its Art Prompt. */
  theme?: string;
  /** The saved art character chosen for this page's Art Prompt (ColoringBook.artCharacters). */
  artCharacterId?: string;
  /** The right-hand Mommy page of a Devotional Spread. */
  mommy?: MommyPage;
};

export type LetterStyle = "elegant" | "bubble";

/** How a Read the Word line relates to the text of the Bible. Only exact quotes are Scripture wording. */
export type ExcerptKind = "exact" | "paraphrase" | "reflection";
export type ReadWordLine = { text: string; ref: string; kind: ExcerptKind };
/** A Fill in the Blank statement: "___" marks the blank (or it goes at the end). The answer is never printed. */
export type BlankLine = { text: string; answer: string; ref: string };

/** The Mommy page: art on the inner side, an activity column (or a bottom band) on the outer side. */
export type MommyPage = {
  /** The declaration lettered on the page (elegant script by default). */
  title?: string;
  /** What the Mommy page's art shows (its Art Prompt). */
  scene?: string;
  theme?: string;
  letterStyle?: LetterStyle;
  textOff?: boolean;
  artCharacterId?: string;
  /** "column" (default): the activities down the outer side. "band": across the bottom. */
  layout?: "column" | "band";
  /** A reserved, labelled box for a QR code added later (never generated). */
  qr?: boolean;
  illustrationId?: string;
  illustrationName?: string;
  illustrationW?: number;
  illustrationH?: number;
  approvedAt?: string;
  readWord: ReadWordLine[];
  blanks: BlankLine[];
  reflect: { question: string; lines: number };
  heart: string;
};

/**
 * Who adds a page's Scripture:
 *   page  Product Studio, as editable text at page assembly (default)
 *   art   the image generator letters the verse into the artwork, in hollow outline letters to color (a Scripture
 *         coloring page). Only with the exact wording entered and verified.
 */
export type ScriptureMode = "page" | "art";

/** Page typography: applied only when Product Studio assembles the pages; never part of an image prompt. */
export type PageTypography = {
  titleFont: string;
  scriptureFont: string;
  align: "left" | "center" | "right";
  titleSizePt: number;
  /** The verse, lesson and custom text size. Absent = 13 pt (BOOK_TEXT_PT). */
  textSizePt?: number;
  /**
   * How the page's words look: "elegant" (the fonts above, default) or "bubble" (chunky outlined bubble letters
   * to color, at the bottom under the picture, with hearts and bursts — layouts/book/coloringLettering.ts).
   */
  letterStyle?: LetterStyle;
  /** Bubble letters: the title and verse sizes (absent = Auto: they fill about the bottom quarter of the page). */
  bubbleTitlePt?: number;
  bubbleVersePt?: number;
  /** Bubble letters: how far the words sit up from the bottom, closer to the picture (inches; absent = 0). */
  bubbleRaiseIn?: number;
};

export type CoverBrief = {
  category: CoverCategory;
  /** Lettering direction; "Let the style decide" adds nothing to the prompt. */
  typography: string;
  // Interior page design
  /** The kind of page the art is for ("Lined journal page", "Monthly calendar page"…). */
  pageKind: string;
  /** How the art is used on the page (one of ART_USES). */
  artUse: string;
  /** Where on the page the art sits ("Bottom right corner"…). */
  artPlacement: string;
  /** How much of the page is kept clear for the page's own lines, calendar and writing. */
  clearArea: string;
  // Children's character illustrations
  characters: string;
  ageGroup: string;
  expressions: string;
  characterCount: number;
  /** "transparent": cut-out characters on a transparent background; "scene": a full illustrated scene. */
  characterBackground: "transparent" | "scene";
  scene: string;
  // Cast & references (shared by every scene and the coloring book cover in the collection)
  cast: CastMember[];
  /** An approved group image of the cast, used in place of the individual images when chosen. */
  groupRefId?: string;
  groupRefName?: string;
  useGroupRef: boolean;
  /** The cast members in the cover (and in scenes that don't choose their own). */
  castSelected: string[];
  keepConsistent: boolean;
  /** Established characters are locked: their registry can't be edited until unlocked, and every scene reuses them. */
  castLocked: boolean;
  /** Use the saved reference images (listed in prompts, offered to copy or download for the image generator). */
  useRefs: boolean;
  // Illustration styling (sent to the image generator)
  illustrationStyle: string;
  proportions: string;
  hairClothingDetail: string;
  backgroundDensity: string;
  coloringArea: string;
  /** Binding gutter kept clear (inches); the safe zone is the outer margin. */
  gutter: number;
  /** Each picture on its own sheet: a blank page after every scene, so markers don't bleed through (scenes fall on right-hand pages). */
  blankBacks: boolean;
  // Page typography (Product Studio only)
  pageTypography: PageTypography;
  // Coloring pages (collection defaults; a scene can override thickness, complexity and output)
  coloringStyle: ColoringStyle;
  lineThickness: LineThickness;
  complexity: Complexity;
  output: PageOutput;
  textPlacement: TextPlacement;
  /** Share of the safe area the illustration takes, in percent. */
  coverage: number;
  translation: string;
  /** The verse wording and its permission are verified; until then the prompt leaves room and draws no verse words. */
  verseVerified: boolean;
  /** Who adds the Scripture (scenes can choose their own). */
  scriptureMode: ScriptureMode;
  /**
   * Coloring Book: what every finished page shows (a page can choose its own). Absent in Cover Studio, where the
   * page shows its title and the Scripture reference as before.
   */
  pageContent?: import("../coloringBook/book").PageContent;
  /** The scene batch as pasted or imported (editable), and the scenes split from it. */
  sceneSource: string;
  scenes: Scene[];
  // Coloring book cover
  coverOutput: "artwork-only" | "complete-concept";
  coverColor: string;
  coverComposition: string;
  titlePlacement: string;
  coverBackground: string;
  illustrationScale: string;
  starterScene: string;
  /** The finished cover, uploaded to compare with the interior references, and the maker's approval. */
  finishedCoverId?: string;
  finishedCoverName?: string;
  coverApproved?: string;
  // Collection brief
  collection: string;
  theme: string;
  season: string;
  audience: string;
  scripture: string;
  imagery: string;
  avoid: string;
  style: string;
  /** A Product Studio palette id, or "custom" (then the four colors below are used). */
  palette: string;
  colorPrimary: string;
  colorAccent: string;
  colorPaper: string;
  colorText: string;
  // Product & print setup
  product: string;
  /** "6×9" (inches, width × height) or "Custom". */
  size: string;
  customW: number;
  customH: number;
  format: CoverFormat;
  /** One of COVER_BINDINGS. */
  binding: string;
  /** A Product Studio print profile id: its bleed, margins and binding rules apply. */
  printProfile: string;
  pages: number | null;
  /** The printer-confirmed spine width in inches; null until the printer gives it. */
  spine: number | null;
  /** Bleed on each edge, inches. The print profile's own bleed is the floor. */
  bleed: number;
  /** Safe zone from trim, inches. Binding keep-outs and printer margins can only raise it. */
  safe: number;
  medium: "Print" | "Digital";
  dpi: number;
  // Cover text & listing
  title: string;
  subtitle: string;
  etsyTitle: string;
  angle: string;
  tags: string;
  mockups: string;
  status: string;
};

/** The default palette: the one the generator opened with. */
export const DEFAULT_COVER_PALETTE = "neutral-cheetah-luxe";

export function newBrief(over: Partial<CoverBrief> = {}): CoverBrief {
  const product: CoverProduct = "Journal";
  return {
    category: "cover", typography: DEFAULT_TYPOGRAPHY,
    pageKind: "Lined journal page", artUse: "Corner illustration", artPlacement: "Bottom right corner", clearArea: "Keep at least 75% of the page clear",
    characters: "", ageGroup: "Ages 4–8", expressions: "happy, curious, praying, helping a friend", characterCount: 4, characterBackground: "transparent", scene: "",
    cast: [], useGroupRef: false, castSelected: [], keepConsistent: true, castLocked: false, useRefs: true,
    illustrationStyle: "Clean storybook line art", proportions: "Natural child proportions", hairClothingDetail: "Moderate", backgroundDensity: "Light", coloringArea: "Medium", gutter: 0.5, blankBacks: true,
    pageTypography: { titleFont: "Playfair Display", scriptureFont: "Lato", align: "center", titleSizePt: 24 },
    coloringStyle: "outline", lineThickness: "Medium", complexity: "Moderate", output: "coloring-page", textPlacement: "bottom", coverage: 70, translation: "NIV", verseVerified: false, scriptureMode: "page",
    sceneSource: "", scenes: [],
    coverOutput: "artwork-only", coverColor: "", coverComposition: "", titlePlacement: "", coverBackground: "", illustrationScale: "", starterScene: "",
    collection: "", theme: "", season: "", audience: "", scripture: "", imagery: "", avoid: DEFAULT_AVOID, style: DEFAULT_STYLE,
    palette: DEFAULT_COVER_PALETTE, colorPrimary: "#630000", colorAccent: "#E6A742", colorPaper: "#FDFDFD", colorText: "#1B1717",
    product, size: DEFAULT_SIZE[product], customW: 6, customH: 9, format: "front", binding: defaultBindingFor(product), printProfile: "generic-commercial",
    pages: 120, spine: null, bleed: 0.125, safe: 0.25, medium: "Print", dpi: 300,
    title: "", subtitle: "", etsyTitle: "", angle: "", tags: "", mockups: DEFAULT_MOCKUPS, status: "Idea",
    ...over,
  };
}

export const DEFAULT_TYPOGRAPHY = "Let the style decide";

/** Choosing a product moves the size and binding to what that product usually is (the maker can change both after). */
export function withProduct(b: CoverBrief, product: string): CoverBrief {
  const size = DEFAULT_SIZE[product as CoverProduct] ?? b.size;
  return { ...b, product, size, binding: defaultBindingFor(product), format: "front" };
}

/** One product in a coordinated set: it shares the collection's title, style, palette and print setup. */
export type CoverItem = { id: string; product: string; size: string; status: string };

export const COVER_SCHEMA_VERSION = 1;

/** A saved collection: the brief, the chosen design direction and the set. */
export type CoverCollection = {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: CoverBrief;
  items: CoverItem[];
  direction: number;
};
