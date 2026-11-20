/**
 * Step 4 — Cover Design, inside the book: the cover inherits the book's title, subtitle, audience and characters.
 * The cover is full color even when the interior is black and white, so this is where color, painting styles and
 * lettering are chosen. The finished cover artwork is uploaded here and previewed with the title as editable text.
 */
import { useMemo } from "react";
import { STYLE_GROUPS } from "../../engines/cover/guides";
import { TYPOGRAPHY_CHOICES } from "../../engines/cover/categories";
import { coloringCoverBlocker, coloringCoverPrompt, castFor } from "../../engines/cover/coloring";
import { resolveCoverSpec, fmt } from "../../engines/cover/spec";
import { launchChatGpt } from "../../engines/cover/launch";
import { resolveDocument } from "../../engines/document/resolve";
import { assembleCover, briefFor, kdpWrap } from "../../engines/coloringBook/assembleBook";
import { bookTitle, formatOf } from "../../engines/coloringBook/book";
import { COVER_PALETTES } from "../../presets/themes/palettes";
import { PalettePicker } from "../editor/PalettePicker";
import { CastPanel, ColoringCoverCards, ImageButton, ReferenceFiles } from "../cover/ColoringPanels";
import { PageThumb } from "../preview/PageThumb";
import { useFontLoader } from "../../utils/useFontLoader";
import { Choice, TextInput, type StepProps } from "./shared";

export function CoverStep({ book, update, setBrief, say, copy }: StepProps) {
  const b = book.brief;
  const coverBrief = useMemo(() => ({ ...briefFor(book), category: "coloring-cover" as const, format: "front" as const, bleed: 0.125 }), [book]);
  const blocked = coloringCoverBlocker(coverBrief);
  const prompt = blocked ? null : coloringCoverPrompt(coverBrief);
  const spec = resolveCoverSpec(coverBrief);
  const f = formatOf(book.printFormat);
  const wrap = f.coverWrap ? kdpWrap(book) : null;
  const doc = useMemo(() => resolveDocument(assembleCover(book)), [book]);
  useFontLoader(doc.typography.fonts, []);
  const generate = () => {
    if (!prompt) return say(blocked!);
    navigator.clipboard.writeText(prompt).catch(() => {});
    const r = launchChatGpt(prompt, (url, target) => window.open(url, target));
    say(r === "launched" ? "ChatGPT opened with the cover instructions in its message box (also copied). Attach your characters' reference pictures, then press send." : r === "too-long" ? "The cover instructions are copied and ChatGPT is open: paste them in." : "Your browser blocked the new tab. The cover instructions are copied: open ChatGPT and paste them.");
  };
  return (
    <section className="cover-step book-step" aria-label="Cover design">
      <p className="hint">The cover uses this book's title{b.subtitle ? " and subtitle" : ""}, audience and characters. It's full color, even though the pages inside are black and white.</p>
      <div className="cover-two">
        <TextInput label="Title on the cover" value={b.title} onChange={(title) => update({ name: title, brief: { ...b, title } })} testId="cover-title" />
        <TextInput label="Subtitle" value={b.subtitle} onChange={(subtitle) => setBrief({ subtitle })} />
      </div>
      <div className="cover-panel">
        <h2 className="book-h">Characters on the cover</h2>
        <CastPanel brief={b} set={setBrief} selecting emptyHint="No characters saved for this book. Add them under Characters (optional)." />
      </div>
      <ColoringCoverCards brief={b} set={(nb) => update({ brief: nb })} />
      <div className="cover-panel">
        <h2 className="book-h">Color and lettering</h2>
        <label className="field">
          <span>Illustration style</span>
          <select value={b.style} aria-label="Cover illustration style" onChange={(e) => setBrief({ style: e.target.value })}>
            {STYLE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.styles.map((s) => <option key={s}>{s}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Color palette</span>
          <PalettePicker value={b.palette} palettes={COVER_PALETTES} onPick={(palette) => setBrief({ palette })} />
        </div>
        <label className="field">
          <span>Lettering style</span>
          <select value={b.typography} aria-label="Lettering style" onChange={(e) => setBrief({ typography: e.target.value })}>
            {TYPOGRAPHY_CHOICES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <div className="cover-two">
          <TextInput label="Cover color" value={b.coverColor} placeholder="Full-color storybook painting" onChange={(coverColor) => setBrief({ coverColor })} />
          <TextInput label="Scene on the cover" value={b.starterScene} placeholder="The three friends mid-twirl on stage" onChange={(starterScene) => setBrief({ starterScene })} />
          <TextInput label="Title placement" value={b.titlePlacement} placeholder="Across the top third" onChange={(titlePlacement) => setBrief({ titlePlacement })} />
          <TextInput label="Background" value={b.coverBackground} placeholder="A soft stage with curtains" onChange={(coverBackground) => setBrief({ coverBackground })} />
        </div>
        <Choice
          label="What the image tool draws"
          value={b.coverOutput}
          options={[{ value: "artwork-only", label: "Artwork only (I'll add the title here)" }, { value: "complete-concept", label: "Artwork with the title lettered in" }]}
          onChange={(coverOutput) => update({ brief: { ...b, coverOutput }, cover: { ...book.cover, mode: coverOutput === "artwork-only" ? "with-title" : "as-is" } })}
        />
      </div>

      <div className="cover-panel">
        <h2 className="book-h">Generate and upload the cover</h2>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={!prompt} onClick={generate} data-testid="generate-cover">Generate cover artwork in ChatGPT ↗</button>
          <button type="button" className="btn" disabled={!prompt} onClick={() => prompt && copy(prompt)}>Copy cover instructions</button>
        </div>
        {blocked && <p className="hint" role="status">{blocked}</p>}
        {castFor(b).length > 0 && <ReferenceFiles brief={b} cast={castFor(b)} say={say} />}
        <details className="cast-changes">
          <summary>Show the cover instructions</summary>
          <pre className="cover-prompt" data-testid="cover-instructions">{prompt ?? blocked}</pre>
        </details>
        <div className="row">
          <ImageButton label={book.cover.front ? "Replace the cover artwork" : "Upload the finished cover artwork"} onImage={(a) => update({ cover: { ...book.cover, front: { id: a.id, name: a.name, w: a.widthPx, h: a.heightPx }, approved: undefined } })} testId="cover-upload" />
          {book.cover.front && <span className="hint">{book.cover.front.name} · {book.cover.front.w} × {book.cover.front.h} px{book.cover.front.w < spec.pxW * 0.9 ? ` (smaller than the ${spec.pxW} × ${spec.pxH} px it prints at: it may look soft)` : ""}</span>}
        </div>
        {book.cover.front && (
          <Choice
            label="The title"
            value={book.cover.mode}
            options={[{ value: "with-title", label: "Add my title as text over the artwork" }, { value: "as-is", label: "The title is already in the artwork" }]}
            onChange={(mode) => update({ cover: { ...book.cover, mode } })}
          />
        )}
        <div className="cover-preview-row">
          <figure className="finished-page" data-testid="cover-preview">
            <PageThumb doc={doc} index={0} heightPx={460} />
            <figcaption className="hint">Front cover · {fmt(spec.trimW)} × {fmt(spec.trimH)} in{book.cover.front ? "" : " (no artwork yet)"}</figcaption>
          </figure>
        </div>
        {book.cover.front && (
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={!!book.cover.approved} onClick={() => update({ cover: { ...book.cover, approved: new Date().toISOString() } })} data-testid="approve-cover">{book.cover.approved ? "Cover approved" : "Approve the cover"}</button>
            {book.cover.approved && <button type="button" className="btn btn--ghost" onClick={() => update({ cover: { ...book.cover, approved: undefined } })}>Undo approval</button>}
          </div>
        )}
      </div>

      <div className="cover-panel" data-testid="cover-sizes">
        <h2 className="book-h">Cover sizes for {f.label}</h2>
        <p>Front cover artwork: {fmt(spec.canvasW)} × {fmt(spec.canvasH)} in with {fmt(spec.bleed)} in bleed, {spec.pxW} × {spec.pxH} pixels at {spec.dpi} DPI.</p>
        {wrap ? (
          <p>
            Full wrap for KDP (back, spine, front) at {wrap.pages} pages on white paper: {wrap.widthIn} × {wrap.heightIn} in, spine {wrap.spineIn} in.
            {wrap.spineText ? " The spine can carry the title." : ` Under ${79} pages KDP doesn't allow spine text.`} The spine changes with the page count: check it again after adding pages.
          </p>
        ) : (
          <p className="hint">{f.label} uses a front cover (and a back, if you print one) without a spine.</p>
        )}
        <p className="hint">“{bookTitle(book) || "Your book"}”: the interior and the cover are separate print files. Export both under Preview and Export.</p>
      </div>
    </section>
  );
}
