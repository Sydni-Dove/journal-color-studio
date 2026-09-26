/**
 * CONTENT TEMPLATES — reserved contract (not implemented yet; see
 * docs/roadmap.md, "Content Template Engine").
 *
 *   Content → Content Template → Layout → Theme → Book Recipe
 *
 * Content (a devotional's 30 entries, a workbook's lessons) is data the user
 * brings. A content template names the fields a kind of content has. Layouts
 * read those FIELDS, never specific content — the same devotional layout
 * prints any devotional. The book recipe decides which entry lands on which
 * page (e.g. a "daily" step consumes entry N on day N).
 *
 * Today's seam: layouts already receive per-page content through
 * LayoutContext.module (title, period label, prompts). A content entry will
 * travel the same way, as an additional field, without layouts or the
 * recipe engine needing to know where it came from.
 */

/** Example schema: one devotional entry. */
export type DevotionalEntry = {
  day?: number;
  title: string;
  scripture?: string;
  devotionalText: string;
  reflectionQuestions?: string[];
  prayerPrompt?: string;
  actionStep?: string;
};

/** A named field a layout can bind to, and whether content must supply it. */
export type ContentField = { key: string; label: string; kind: "text" | "longText" | "list" | "reference"; required: boolean };

/** A kind of content (devotional, workbook lesson, …) and its fields. */
export type ContentTemplate = { id: string; label: string; fields: ContentField[] };

/** A body of content: entries that follow one template. */
export type ContentCollection<Entry = Record<string, unknown>> = { templateId: string; title: string; entries: Entry[] };
