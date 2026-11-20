/** Step 1 — Book Setup: the book's title and audience, whether it includes Scripture, what each page shows, and how it is printed. */
import { AGE_RANGES, CONTENT_PRESETS, PRINT_FORMATS, bookTitle, formatOf, type PageContent, type ScriptureChoice } from "../../engines/coloringBook/book";
import { TRANSLATIONS, translationOf } from "../../engines/coloringBook/scripture";
import { bookLicense, interiorPageCount } from "../../engines/coloringBook/assembleBook";
import { Check } from "../editor/ui";
import { Choice, TextInput, type StepProps } from "./shared";

const SIZES = ["8.5×11", "8×10", "8.25×11", "8.5×8.5", "6×9", "Custom"];

export function SetupStep({ book, update, setBrief }: StepProps) {
  const b = book.brief;
  const c = book.content;
  const setContent = (patch: Partial<PageContent>) => update({ content: { ...c, ...patch } });
  const preset = CONTENT_PRESETS.find((p) => p.content.title === c.title && p.content.lesson === c.lesson && p.content.customText === c.customText && (p.content.scripture !== "none") === (c.scripture !== "none"))?.id;
  const t = translationOf(b.translation);
  const lic = bookLicense(book);
  const f = formatOf(book.printFormat);
  return (
    <section className="cover-step book-step" aria-label="Book setup">
      <div className="cover-two">
        <TextInput id="book-title" label="Book title" value={b.title} placeholder="She Is Gracious" onChange={(title) => update({ name: title, brief: { ...b, title } })} testId="book-title" />
        <TextInput label="Subtitle (optional)" value={b.subtitle} placeholder="A Ballet Coloring Book" onChange={(subtitle) => setBrief({ subtitle })} />
      </div>
      <div className="cover-two">
        <TextInput label="Author or publisher (optional)" value={book.author} placeholder="Dove Expressions" onChange={(author) => update({ author })} hint="Printed on the title and copyright pages." />
        <label className="field">
          <span>Age range</span>
          <select value={b.ageGroup} aria-label="Age range" onChange={(e) => setBrief({ ageGroup: e.target.value, audience: b.audience || e.target.value })}>
            {[...new Set([b.ageGroup, ...AGE_RANGES])].map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <div className="cover-two">
        <TextInput label="Who it's for (optional)" value={b.audience} placeholder="Girls ages 4–8 who love ballet" onChange={(audience) => setBrief({ audience })} />
        <TextInput label="Theme (optional)" value={b.theme} placeholder="Grace, courage, friendship" onChange={(theme) => setBrief({ theme })} />
      </div>

      <div className="cover-panel">
        <h2 className="book-h">Bible verses</h2>
        <Choice
          label="Is this a faith-based book?"
          value={book.faithBased ? "yes" : "no"}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
          onChange={(v) => update({ faithBased: v === "yes", content: { ...c, scripture: v === "yes" ? (c.scripture === "none" ? "full" : c.scripture) : "none" } })}
          testId="faith"
        />
        {book.faithBased && (
          <>
            <Choice<ScriptureChoice>
              label="Would you like Bible verses included?"
              value={c.scripture}
              options={[{ value: "full", label: "Full Bible verse and reference" }, { value: "reference", label: "Scripture reference only" }, { value: "none", label: "No Scripture" }]}
              onChange={(scripture) => setContent({ scripture })}
              testId="scripture-choice"
            />
            {c.scripture !== "none" && (
              <label className="field">
                <span>Translation</span>
                <select value={b.translation} aria-label="Translation" onChange={(e) => setBrief({ translation: e.target.value })}>
                  {[...new Set([b.translation, ...TRANSLATIONS.map((x) => x.id)])].map((id) => <option key={id} value={id}>{translationOf(id).label}</option>)}
                </select>
                <span className="hint">
                  {t.publicDomain
                    ? `${t.id} is in the public domain: Product Studio can fetch its exact wording for you to approve.`
                    : `${t.id} is copyrighted. Product Studio never types verse wording itself: paste it from your Bible or the publisher's site and approve it. Free use is limited to ${t.maxVerses ?? "a set number of"} verses${t.maxShare ? `, under ${Math.round(t.maxShare * 100)}% of the book's words` : ""}, with the publisher's notice on the copyright page (added for you).`}
                </span>
              </label>
            )}
            {lic && (lic.overShare || lic.overVerses) && (
              <div className="notice notice--warn" role="status" data-testid="license-warning">
                <p>
                  Scripture is {Math.round(lic.share * 100)}% of this book's printed words{lic.overVerses ? ` (${lic.verses} verses)` : ""}. {t.id}'s publisher allows {t.maxVerses} verses under {Math.round((t.maxShare ?? 0) * 100)}% without written permission.
                  A coloring book is mostly pictures, so its verses are a large share of its words: ask the publisher ({t.permissions}), switch to a public-domain translation (KJV or WEB), or print references only.
                </p>
                <Check label={`I have the publisher's written permission to quote ${t.id} in this book`} checked={book.scripturePermission} onChange={(scripturePermission) => update({ scripturePermission })} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="cover-panel">
        <h2 className="book-h">What appears on each finished page</h2>
        <div className="row content-presets" role="group" aria-label="Page content presets">
          {CONTENT_PRESETS.filter((p) => book.faithBased || p.id !== "verse").map((p) => (
            <button key={p.id} type="button" className="btn" aria-pressed={preset === p.id} onClick={() => update({ content: { ...p.content, scripture: p.content.scripture === "full" ? (book.faithBased ? (c.scripture === "none" ? "full" : c.scripture) : "none") : "none" } })}>{p.label}</button>
          ))}
        </div>
        <div className="content-switches" data-testid="page-content">
          <Check label="Page title" checked={c.title} onChange={(title) => setContent({ title })} />
          {book.faithBased && <Check label="Bible verse" checked={c.scripture !== "none"} onChange={(on) => setContent({ scripture: on ? "full" : "none" })} />}
          <Check label="Lesson or reflection" checked={c.lesson} onChange={(lesson) => setContent({ lesson })} />
          <Check label="Custom text" checked={c.customText} onChange={(customText) => setContent({ customText })} />
        </div>
        <p className="hint">Every part is optional and editable on each page; any page can choose differently. A part that's off prints nothing at all: no label, heading or empty space.</p>
      </div>

      <div className="cover-panel">
        <h2 className="book-h">Printing</h2>
        <div className="cover-two">
          <label className="field">
            <span>Page size (inches)</span>
            <select value={SIZES.includes(b.size) ? b.size : "Custom"} aria-label="Page size" onChange={(e) => setBrief({ size: e.target.value })}>
              {SIZES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="hint">8.5 × 11 in is the usual coloring-book size (2550 × 3300 pixels at 300 DPI).</span>
          </label>
          {b.size === "Custom" && (
            <div className="cover-two">
              <TextInput label="Width (in)" value={String(b.customW)} onChange={(v) => setBrief({ customW: Math.max(2, Number(v) || b.customW) })} />
              <TextInput label="Height (in)" value={String(b.customH)} onChange={(v) => setBrief({ customH: Math.max(2, Number(v) || b.customH) })} />
            </div>
          )}
        </div>
        <div className="field">
          <span className="field-label">Where will it be printed?</span>
          <div className="format-cards" role="radiogroup" aria-label="Print format">
            {PRINT_FORMATS.map((x) => (
              <label key={x.id} className={`format-card${book.printFormat === x.id ? " format-card--on" : ""}`}>
                <input type="radio" name="print-format" checked={book.printFormat === x.id} onChange={() => update({ printFormat: x.id })} />
                <strong>{x.label}</strong>
                <span className="hint">{x.blurb}</span>
              </label>
            ))}
          </div>
        </div>
        <Choice
          label="Printing"
          value={book.sides}
          options={[{ value: "single", label: "Single-sided (blank back behind every picture)" }, { value: "double", label: "Double-sided (pictures back to back)" }]}
          onChange={(sides) => update({ sides })}
          testId="sides"
        />
        <p className="hint">Single-sided keeps markers from bleeding into the next picture. Blank backs count as printed pages.</p>
        <div className="content-switches">
          <Check label="Title page" checked={book.frontMatter.titlePage} onChange={(titlePage) => update({ frontMatter: { ...book.frontMatter, titlePage } })} />
          <Check label="Copyright page" checked={book.frontMatter.copyrightPage} onChange={(copyrightPage) => update({ frontMatter: { ...book.frontMatter, copyrightPage } })} />
          <Check label="“This book belongs to” page" checked={book.frontMatter.belongsTo} onChange={(belongsTo) => update({ frontMatter: { ...book.frontMatter, belongsTo } })} />
        </div>
        <p className="hint" data-testid="page-count">
          {bookTitle(book) ? `“${bookTitle(book)}”` : "This book"} has {interiorPageCount(book)} interior pages{f.minPages > 1 ? `; ${f.label} needs at least ${f.minPages}` : ""}.
          {f.minPages > interiorPageCount(book) && b.scenes.length > 0 ? ` Add ${f.minPages - interiorPageCount(book)} more before it can be printed there (Preview and Export can add “Draw your own picture” pages).` : ""}
        </p>
      </div>
    </section>
  );
}
