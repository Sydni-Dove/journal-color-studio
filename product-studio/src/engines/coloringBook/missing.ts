/**
 * WHAT'S MISSING? — the whole book checked before export: every page, the characters, the cover, the print format.
 *
 *   blocking    the book can't be called print-ready until it's fixed (export stays closed)
 *   warning     prints, but probably not as intended
 *   suggestion  worth a look
 *
 * Every issue names the step (and the page) where it is fixed. Text that doesn't fit, margins and the printer's rules
 * come from Product Studio's own page validator, run on the very pages the preview draws and the export prints.
 */
import { BOOK_TEXT_PT, bookTextPt, excerptAllowed, excerptFromVerse, illustrationPpi, isPageCanvas, pageContentOf } from "../cover/assemble";
import { validateProject } from "../validation/validate";
import { heuristicMeasurer, type TextMeasurer } from "../typography/textMeasure";
import { geometryFor, resolveDocument, solvePage } from "../document/resolve";
import { KDP } from "../../data/research/printerSpecs";
import { bookTitle, formatOf, type BookStepId, type ColoringBook } from "./book";
import { assembleInterior, bookLicense, briefFor, interiorPageCount, sceneOfStep } from "./assembleBook";
import { normalizeReference, wordingProblem } from "./scripture";

/** The size the verse, lesson and custom text are set at, and the smallest that still reads on a children's page. */
export { BOOK_TEXT_PT };
export const MIN_READABLE_PT = 10;

export type Severity = "blocking" | "warning" | "suggestion";
export type MissingIssue = {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  /** Where it is fixed. */
  step: BookStepId;
  /** The scene (page) it is on, if any. */
  sceneId?: string;
  /** "Scene 3", "Page 12", for the list. */
  where?: string;
};

export function whatsMissing(book: ColoringBook, measure: TextMeasurer = heuristicMeasurer): MissingIssue[] {
  const out: MissingIssue[] = [];
  const push = (i: MissingIssue) => out.push(i);
  const b = briefFor(book);
  const f = formatOf(book.printFormat);

  // ---- Book setup
  if (!bookTitle(book)) push({ id: "title", severity: "blocking", title: "The book has no title", detail: "The title page and the cover print it.", step: "setup" });
  if (!b.scenes.length) push({ id: "no-scenes", severity: "blocking", title: "No interior pages yet", detail: "Import your scenes or add them one by one.", step: "pages" });

  // ---- Characters
  if (!b.cast.length && b.scenes.length) push({ id: "no-cast", severity: "warning", title: "No characters saved", detail: "Without saved characters, each picture may draw them differently. Add them under Characters (only if the book has recurring characters).", step: "characters" });
  for (const c of b.cast) {
    if (!c.refId) push({ id: `ref-${c.id}`, severity: "warning", title: `${c.name || "A character"} has no reference image`, detail: "A reference picture is what keeps a character the same on every page. Upload one, then attach it whenever you generate artwork.", step: "characters" });
    const missing = [!c.hair?.trim() && "hair", !c.face?.trim() && "face", !c.clothing?.trim() && "clothing"].filter(Boolean);
    if (missing.length) push({ id: `desc-${c.id}`, severity: "suggestion", title: `${c.name || "A character"}'s description is missing ${missing.join(", ")}`, step: "characters" });
  }

  // ---- Pages
  b.scenes.forEach((s, i) => {
    const where = `Scene ${i + 1}`;
    const c = pageContentOf(b, s)!;
    const name = (s.pageTitle ?? s.title).trim();
    // A short excerpt: KJV only, typed, and in the verse's own words.
    if (s.verseUse === "excerpt" && c.scripture === "full") {
      if (!excerptAllowed(b)) push({ id: `excerpt-${s.id}`, severity: "warning", title: `${where}: short excerpts are for the KJV only`, detail: `This book uses the ${b.translation}, so the full approved verse prints. Choose the KJV under Book Setup to print a short excerpt.`, step: "pages", sceneId: s.id, where });
      else if (!s.verseExcerpt?.trim()) push({ id: `excerpt-${s.id}`, severity: "warning", title: `${where}: the short excerpt is empty`, detail: "Type the part of the verse to print, or choose “Full verse”. Until then the full verse prints.", step: "pages", sceneId: s.id, where });
      else if (s.verseText && !excerptFromVerse(s.verseExcerpt, s.verseText)) push({ id: `excerpt-${s.id}`, severity: "blocking", title: `${where}: the excerpt isn't the verse's own words`, detail: "Use the KJV words of the verse, in order, without adding or rewording any.", step: "pages", sceneId: s.id, where });
    }
    if (!s.illustrationId) push({ id: `art-${s.id}`, severity: "blocking", title: `${where}${name ? ` (“${name}”)` : ""} has no illustration`, detail: "Generate the artwork, then upload the finished image to this page.", step: "pages", sceneId: s.id, where });
    else {
      if (!s.approvedAt) push({ id: `approve-${s.id}`, severity: "warning", title: `${where}'s illustration isn't approved yet`, detail: "Check the characters match their references, then approve it.", step: "pages", sceneId: s.id, where });
      if (!isPageCanvas(b, s.illustrationW, s.illustrationH)) {
        // Measured where the finished page draws it: the same number the page's own check shows.
        const ppi = illustrationPpi(b, s) ?? 0;
        if (ppi < 150) push({ id: `ppi-${s.id}`, severity: "blocking", title: `${where}'s illustration is too small to print sharply`, detail: `${ppi} pixels per inch where it's placed (300 is needed). Upload a larger image.`, step: "pages", sceneId: s.id, where });
        else if (ppi < 300) push({ id: `ppi-${s.id}`, severity: "warning", title: `${where}'s illustration may print a little soft`, detail: `${ppi} pixels per inch where it's placed; 300 or more prints sharp.`, step: "pages", sceneId: s.id, where });
      }
    }
    if (c.title && !name) push({ id: `ptitle-${s.id}`, severity: "blocking", title: `${where} shows a title, but it has none`, detail: "Type the title, or switch the title off for this page.", step: "pages", sceneId: s.id, where });
    if (book.faithBased && c.scripture !== "none") {
      const ref = s.scriptureRef?.trim();
      if (!ref) push({ id: `ref-${s.id}`, severity: "blocking", title: `${where} has no Bible verse`, detail: s.suggestedRef ? `Suggested: ${s.suggestedRef}. Approve it or choose another.` : "Add a reference, use a suggestion, or switch Scripture off for this page.", step: "pages", sceneId: s.id, where });
      else if (!normalizeReference(ref)) push({ id: `badref-${s.id}`, severity: "blocking", title: `${where}'s reference “${ref}” isn't a Bible reference Product Studio recognises`, detail: "Write it like “Proverbs 31:26”.", step: "pages", sceneId: s.id, where });
      else if (c.scripture === "full") {
        if (!s.verseText?.trim()) push({ id: `words-${s.id}`, severity: "blocking", title: `${where} needs the wording of ${ref} (${b.translation})`, detail: "Full verses print only approved wording. Paste it from your Bible (or fetch a public-domain translation), then approve it.", step: "pages", sceneId: s.id, where });
        else if (!s.verseApproved) push({ id: `verse-${s.id}`, severity: "blocking", title: `${where}'s verse wording isn't approved`, detail: `Check it word for word against your ${b.translation} Bible, then approve it.`, step: "pages", sceneId: s.id, where });
        else {
          const p = wordingProblem(s.verseText, ref);
          if (p) push({ id: `wording-${s.id}`, severity: "warning", title: `${where}: check the verse wording`, detail: p, step: "pages", sceneId: s.id, where });
        }
      }
    }
    if (c.lesson && !s.lessonText?.trim()) push({ id: `lesson-${s.id}`, severity: "warning", title: `${where} shows a lesson, but it has no text`, detail: "Nothing will print there. Write it, or switch lessons off for this page.", step: "pages", sceneId: s.id, where });
    if (c.customText && !s.customText?.trim()) push({ id: `custom-${s.id}`, severity: "warning", title: `${where} shows custom text, but it has none`, step: "pages", sceneId: s.id, where });
  });

  // ---- Scripture licensing
  const lic = bookLicense(book);
  if (lic && (lic.overVerses || lic.overShare) && !book.scripturePermission) {
    const t = lic.translation;
    push({
      id: "license", severity: "blocking",
      title: `This book quotes more ${t.id} than its publisher allows without written permission`,
      detail: `${lic.overVerses ? `${lic.verses} verses (the limit is ${t.maxVerses}). ` : ""}${lic.overShare ? `Scripture is ${Math.round(lic.share * 100)}% of the book's printed words (the limit is under ${Math.round((t.maxShare ?? 0) * 100)}%). ` : ""}Ask the publisher for permission (${t.permissions ?? "see the publisher's site"}) and tick “I have written permission”, or choose a public-domain translation (KJV or WEB), or print references only.`,
      step: "setup",
    });
  }

  // ---- Cover
  if (!book.cover.front) push({ id: "cover", severity: "blocking", title: "No cover artwork yet", detail: "Generate the cover, then upload it under Cover Design.", step: "cover" });
  else if (!book.cover.approved) push({ id: "cover-approve", severity: "warning", title: "The cover isn't approved yet", step: "cover" });
  if (f.coverWrap) push({ id: "wrap", severity: "suggestion", title: `${f.label} needs a full wrap cover file (back, spine and front)`, detail: "Product Studio prints the front cover. Use the wrap size under Cover Design to finish the back and spine in your cover tool, or with KDP's Cover Creator.", step: "cover" });

  // ---- Print format: page count, margins
  const pages = interiorPageCount(book);
  if (b.scenes.length && pages < f.minPages) {
    const need = f.minPages - pages;
    push({
      id: "min-pages", severity: "blocking",
      title: `${f.label} needs at least ${f.minPages} pages; this book has ${pages}`,
      detail: `Add ${need} more page${need === 1 ? "" : "s"}: more scenes, “Draw your own picture” pages, or front matter. Blank backs count as pages, but ${book.sides === "single" ? "they're already included" : "this book prints double-sided"}. Or choose another print format.`,
      step: "preview",
    });
  }
  if (f.maxPages && pages > f.maxPages) push({ id: "max-pages", severity: "blocking", title: `${f.label} allows at most ${f.maxPages} pages; this book has ${pages}`, step: "preview" });
  if (b.safe < 0.25) push({ id: "safe", severity: "blocking", title: "The outer margin is under 0.25 in", detail: "Printers trim up to 1/8 in: keep text and art at least 0.25 in from the edge.", step: "setup" });
  if (book.printFormat === "kdp-paperback") {
    const band = KDP.gutterByPageCount.find((g) => pages >= g.minPages && pages <= g.maxPages) ?? KDP.gutterByPageCount[0];
    if (b.gutter < band.gutter.value) push({ id: "gutter", severity: "blocking", title: `The binding margin is ${b.gutter} in; KDP needs ${band.gutter.value} in for ${pages} pages`, step: "setup" });
  }

  // ---- The pages themselves: text that doesn't fit, collisions, printer rules (Product Studio's validator)
  if (b.scenes.length) {
    try {
      const project = assembleInterior(book);
      const doc = resolveDocument(project);
      const report = validateProject(project, measure);
      const seen = new Set<string>();
      for (const i of report.issues) {
        if (i.severity !== "error" || i.rule === "page-count") continue;
        const p = i.page ? doc.recipe.pages[i.page - 1] : undefined;
        const s = p ? sceneOfStep(book, p.recipeItemId) : null;
        const idx = s ? b.scenes.indexOf(s) : -1;
        const key = `${i.rule}:${s?.id ?? i.page}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const text = /overflow|fit|collision|text-region/.test(i.rule);
        push({
          id: `v-${key}`, severity: "blocking",
          title: text ? `${s ? `Scene ${idx + 1}` : `Page ${i.page}`}: the text doesn't fit` : `${s ? `Scene ${idx + 1}` : i.page ? `Page ${i.page}` : "The book"}: ${i.message}`,
          detail: text ? "Shorten the text, show less on this page (for example the reference instead of the full verse), give the illustration less room, or move the text above the picture." : undefined,
          step: s ? "pages" : "preview", sceneId: s?.id, where: s ? `Scene ${idx + 1}` : i.page ? `Page ${i.page}` : undefined,
        });
      }
      // Each scene page as laid out: text the layout had to shrink (or that still doesn't fit), and a squeezed picture.
      for (const [k, sc] of b.scenes.entries()) {
        const pi = doc.recipe.pages.findIndex((p) => p.recipeItemId === `scene-${sc.id}`);
        if (pi < 0) continue;
        const solved = solvePage(doc, pi);
        const where = `Scene ${k + 1}`;
        let worst: { want: number; got: number; what: string } | null = null;
        let clipped = false;
        // Bubble letters size themselves to the page (Auto, or the maker's size); only words that still spill over count.
        const bubble = b.pageTypography.letterStyle === "bubble";
        for (const node of solved.nodes) {
          // Hearts and other drawn shapes aren't words.
          if (node.type !== "text" || !node.fit || node.glyph) continue;
          if (bubble) {
            if (node.fit.lines.length * node.fit.sizePt * node.fit.lineHeight / 72 > node.rect.h + 0.02) clipped = true;
            continue;
          }
          const isTitle = /-title-title$/.test(node.id);
          const want = isTitle ? b.pageTypography.titleSizePt : bookTextPt(b);
          const got = Math.round(node.fit.sizePt * 10) / 10;
          const what = isTitle ? "title" : /-verse-/.test(node.id) ? "verse" : /-lesson-/.test(node.id) ? "lesson" : "text";
          if (got < want - 0.25 && (!worst || got / want < worst.got / worst.want)) worst = { want, got, what };
          if (node.fit.lines.length * node.fit.sizePt * node.fit.lineHeight / 72 > node.rect.h + 0.02) clipped = true;
        }
        // The bubble layout's own notes (a verse too long for four lines, little room left for the picture).
        if (bubble) for (const d of solved.diagnostics.filter((x) => x.componentId.startsWith("cl-"))) push({ id: `${d.componentId}-${sc.id}`, severity: "warning", title: `${where}: ${d.componentId === "cl-verse" ? "the verse is long for bubble letters" : "the lettering is large for the page"}`, detail: d.message, step: "pages", sceneId: sc.id, where });
        if (clipped || (worst && worst.got < MIN_READABLE_PT)) {
          push({ id: `fit-${sc.id}`, severity: "blocking", title: `${where}: the text doesn't fit`, detail: `${worst ? `The ${worst.what} would have to shrink to ${worst.got} pt to fit (it's set at ${worst.want} pt; under ${MIN_READABLE_PT} pt is too small to read). ` : ""}Shorten it, show less on this page (for example the reference instead of the full verse), or move the text above the picture.`, step: "pages", sceneId: sc.id, where });
        } else if (worst) {
          push({ id: `shrink-${sc.id}`, severity: "warning", title: `${where}: the ${worst.what} was made smaller to fit`, detail: `${worst.want} pt → ${worst.got} pt. Shorten it if you want it at full size.`, step: "pages", sceneId: sc.id, where });
        }
        const art = solved.nodes.find((x) => x.type === "group" && /-art$/.test(x.id)) as { rect: { h: number } } | undefined;
        const g = geometryFor(doc, doc.recipe.pages[pi], pi);
        if (art && art.rect.h < g.safeRect.h * 0.5) push({ id: `art-small-${sc.id}`, severity: "warning", title: `${where}: the text leaves the picture only ${art.rect.h.toFixed(1)} in tall`, detail: "Shorten the text on this page so the illustration has more room.", step: "pages", sceneId: sc.id, where });
      }
      // Text too long for one page continues on another: never silently.
      const continued = new Set(doc.recipe.pages.filter((p) => (p.flowPart ?? 0) > 0).map((p) => p.recipeItemId));
      for (const sid of continued) {
        const s = sceneOfStep(book, sid);
        if (!s) continue;
        const idx = b.scenes.indexOf(s);
        push({ id: `flow-${s.id}`, severity: "blocking", title: `Scene ${idx + 1}: the text is too long for one page`, detail: "It runs onto an extra page. Shorten it, show less, or give the illustration less room.", step: "pages", sceneId: s.id, where: `Scene ${idx + 1}` });
      }
    } catch (e) {
      push({ id: "assemble", severity: "blocking", title: "The pages couldn't be built", detail: (e as Error).message, step: "preview" });
    }
  }
  const rank: Record<Severity, number> = { blocking: 0, warning: 1, suggestion: 2 };
  return out.sort((a, b2) => rank[a.severity] - rank[b2.severity]);
}

/** Print-ready: nothing blocking. */
export const printReady = (issues: MissingIssue[]) => !issues.some((i) => i.severity === "blocking");
