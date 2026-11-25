/**
 * Step 3 — Interior Pages. Settings for printable coloring pages only (no watercolor, painting or full-color
 * choices here: those belong to the cover), importing the scenes, the page list, and one page at a time:
 * its finished preview, its text (title, Bible verse, lesson, custom text), its artwork instructions and its artwork.
 */
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Complexity, LineThickness, Scene } from "../../engines/cover/brief";
import { BACKGROUND_DENSITY, COLORING_AREAS, COMPLEXITY, ILLUSTRATION_STYLES, LINE_THICKNESS, PROPORTIONS, TEXT_PLACEMENTS, castFor, scenePrompt, verseArtBlocker } from "../../engines/cover/coloring";
import { DIFFICULTIES, artCharactersOf, contentOf, type PageContent, type ScriptureChoice } from "../../engines/coloringBook/book";
import { castNamed, parseBookOutline, scenesFromImport, type ImportedBook } from "../../engines/coloringBook/importText";
import { fetchPublicDomain, normalizeReference, passageLink, suggestReferences, translationOf, wordingProblem } from "../../engines/coloringBook/scripture";
import { briefFor } from "../../engines/coloringBook/assembleBook";
import type { MissingIssue } from "../../engines/coloringBook/missing";
import { extractDocumentText } from "../../engines/import/documentText";
import { launchChatGpt } from "../../engines/cover/launch";
import { BOOK_TEXT_SIZES, bookTextPt, excerptFromVerse, pageCanvas } from "../../engines/cover/assemble";
import { newId } from "../../presets/products/projectFactory";
import { Check } from "../editor/ui";
import { CHECKS, IllustrationCheck, LineSample, ReferenceFiles, Regenerate } from "../cover/ColoringPanels";
import { FONT_CHOICES } from "../cover/fonts";
import { Choice, FinishedPage, TextArea, TextInput, pageIndexOf, type StepProps } from "./shared";
import { SpreadEditor, SpreadPair, SpreadSettingsPanel } from "./SpreadEditor";
import { QuickSpreadBook } from "./QuickSpreadBook";
import { isSpread, newSpread } from "../../engines/coloringBook/spread";

export function PagesStep(props: StepProps & { openScene: string | null; setOpenScene: (id: string | null) => void; issues: MissingIssue[] }) {
  const { book, openScene, setOpenScene } = props;
  const scene = book.brief.scenes.find((s) => s.id === openScene) ?? null;
  return (
    <section className="cover-step book-step" aria-label="Interior pages">
      {scene ? (
        <PageEditor key={scene.id} {...props} scene={scene} onClose={() => setOpenScene(null)} />
      ) : (
        <>
          {(book.spread || book.brief.scenes.some(isSpread)) && <QuickSpreadBook {...props} />}
          <ColoringSettings {...props} />
          {book.brief.scenes.some(isSpread) && <SpreadSettingsPanel {...props} />}
          <SceneImport {...props} />
          <PageList {...props} />
        </>
      )}
    </section>
  );
}

/** Coloring-page settings only: printable black outlines on white, open coloring spaces, no shading or gradients. */
function ColoringSettings({ book, setBrief, update }: StepProps) {
  const b = book.brief;
  const pg = pageCanvas(briefFor(book));
  return (
    <details className="cover-panel book-settings" open={!b.scenes.length} data-testid="coloring-settings">
      <summary><h2 className="book-h">Coloring page settings</h2><span className="hint">{b.lineThickness} lines · {b.complexity} · {b.backgroundDensity} background · {b.ageGroup}</span></summary>
      <p className="hint">Interior pages are printable coloring pages: clean black outlines on white, open spaces to color, no shading or gradients. (Color, painting styles and lettering are for the cover.)</p>
      <Choice
        label="Coloring difficulty"
        value={book.difficulty}
        options={DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))}
        onChange={(id) => {
          const d = DIFFICULTIES.find((x) => x.id === id)!;
          update({ difficulty: id, brief: { ...b, lineThickness: d.lineThickness, complexity: d.complexity, coloringArea: id === "easy" ? "Large" : id === "detailed" ? "Small" : "Medium" } });
        }}
        testId="difficulty"
      />
      <div className="coloring-style__row">
        <div>
          <Choice<LineThickness> label="Line thickness" value={b.lineThickness} options={LINE_THICKNESS.map((x) => ({ value: x.value, label: x.label }))} onChange={(lineThickness) => setBrief({ lineThickness })} />
          <Choice<Complexity> label="Illustration complexity" value={b.complexity} options={COMPLEXITY.map((x) => ({ value: x.value, label: x.label }))} onChange={(complexity) => setBrief({ complexity })} />
        </div>
        <LineSample thickness={b.lineThickness} complexity={b.complexity} />
      </div>
      <div className="cover-two">
        <Select label="Background detail" value={b.backgroundDensity} options={BACKGROUND_DENSITY.map((x) => x.value)} onChange={(backgroundDensity) => setBrief({ backgroundDensity })} />
        <Select label="Coloring-space size" value={b.coloringArea} options={COLORING_AREAS.map((x) => x.value)} onChange={(coloringArea) => setBrief({ coloringArea })} />
        <Select label="Line-art style" value={b.illustrationStyle} options={[...ILLUSTRATION_STYLES]} onChange={(illustrationStyle) => setBrief({ illustrationStyle })} />
        <Select label="Character proportions" value={b.proportions} options={[...PROPORTIONS]} onChange={(proportions) => setBrief({ proportions })} />
        <Select label="Age range" value={b.ageGroup} options={["Ages 2–4", "Ages 4–8", "Ages 8–12", "Teens", "Adults", "All ages"]} onChange={(ageGroup) => setBrief({ ageGroup })} />
        <Select
          label="Title and verse style"
          value={b.pageTypography.letterStyle ?? "elegant"}
          options={["elegant", "bubble"]}
          labels={{ elegant: "Elegant fonts", bubble: "Bubble letters to color (title, verse and reference at the bottom)" }}
          onChange={(v) => setBrief({ pageTypography: { ...b.pageTypography, letterStyle: v === "bubble" ? "bubble" : undefined } })}
        />
        {b.pageTypography.letterStyle === "bubble" ? (
          <>
            <Select
              label="Title letter size"
              value={String(b.pageTypography.bubbleTitlePt ?? "auto")}
              options={["auto", "48", "56", "64", "72", "84", "96", "110"]}
              labels={{ auto: "Auto (as big as fits)", ...Object.fromEntries(["48", "56", "64", "72", "84", "96", "110"].map((n) => [n, `${n} pt`])) }}
              onChange={(v) => setBrief({ pageTypography: { ...b.pageTypography, bubbleTitlePt: v === "auto" ? undefined : Number(v) } })}
            />
            <Select
              label="Verse letter size"
              value={String(b.pageTypography.bubbleVersePt ?? "auto")}
              options={["auto", "24", "28", "32", "36", "42", "48", "54"]}
              labels={{ auto: "Auto (as big as fits on 4 lines)", ...Object.fromEntries(["24", "28", "32", "36", "42", "48", "54"].map((n) => [n, `${n} pt`])) }}
              onChange={(v) => setBrief({ pageTypography: { ...b.pageTypography, bubbleVersePt: v === "auto" ? undefined : Number(v) } })}
            />
            <Select
              label="Move the words up, closer to the picture"
              value={String(b.pageTypography.bubbleRaiseIn ?? 0)}
              options={["0", "0.25", "0.5", "0.75", "1", "1.5", "2"]}
              labels={{ "0": "No — at the bottom of the page", "0.25": "¼ inch", "0.5": "½ inch", "0.75": "¾ inch", "1": "1 inch", "1.5": "1½ inches", "2": "2 inches" }}
              onChange={(v) => setBrief({ pageTypography: { ...b.pageTypography, bubbleRaiseIn: Number(v) || undefined } })}
            />
          </>
        ) : (
          <>
            <Select label="Where the page text goes" value={b.textPlacement} options={TEXT_PLACEMENTS.filter((t) => t.value !== "none").map((t) => t.value)} labels={Object.fromEntries(TEXT_PLACEMENTS.map((t) => [t.value, t.label.replace("verse", "verse and other text")]))} onChange={(v) => setBrief({ textPlacement: v as typeof b.textPlacement })} />
            <Select label="Title font" value={b.pageTypography.titleFont} options={FONT_CHOICES} onChange={(titleFont) => setBrief({ pageTypography: { ...b.pageTypography, titleFont } })} />
            <Select label="Verse and text font" value={b.pageTypography.scriptureFont} options={FONT_CHOICES} onChange={(scriptureFont) => setBrief({ pageTypography: { ...b.pageTypography, scriptureFont } })} />
            <Select
              label="Verse and text size"
              value={String(bookTextPt(b))}
              options={BOOK_TEXT_SIZES.map(String)}
              labels={Object.fromEntries(BOOK_TEXT_SIZES.map((n) => [String(n), `${n} pt${n === 13 ? " (standard)" : ""}`]))}
              onChange={(v) => setBrief({ pageTypography: { ...b.pageTypography, textSizePt: Number(v) } })}
            />
          </>
        )}
      </div>
      <div className="content-switches">
        <Check label="Keep characters consistent on every page" checked={b.keepConsistent} onChange={(keepConsistent) => setBrief({ keepConsistent })} />
        <Check label="Use my characters' reference pictures" checked={b.useRefs} onChange={(useRefs) => setBrief({ useRefs })} />
      </div>
      <p className="hint">Pages: {pg.trimW} × {pg.trimH} in at {pg.dpi} DPI ({pg.pxW} × {pg.pxH} px) · {book.sides === "single" ? "single-sided" : "double-sided"} · white paper. Change the size and printing under Book Setup.</p>
    </details>
  );
}

function Select({ label, value, options, onChange, labels }: { label: string; value: string; options: string[]; onChange: (v: string) => void; labels?: Record<string, string> }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {[...new Set([value, ...options])].map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}

/** Paste or import a complete outline; review what was read; then add the pages. The original text is kept with the book. */
function SceneImport({ book, update, say }: StepProps) {
  const b = book.brief;
  const [text, setText] = useState("");
  const [found, setFound] = useState<ImportedBook | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setReading(true);
    try {
      const doc = await extractDocumentText(f);
      setText((t) => (t.trim() ? `${t.trimEnd()}\n\n` : "") + doc.text);
      say(`Read “${f.name}”. Check the text, then choose Read my outline.`);
    } catch (err) {
      say(err instanceof Error ? err.message : "The file couldn't be read.");
    } finally {
      setReading(false);
    }
  };
  const read = () => {
    const r = parseBookOutline(text);
    if (!r.scenes.length) return say("No scenes found. Start each one with “Scene 1:”, “Page 1:” or a numbered line, or add pages one by one below.");
    setFound(r);
  };
  const add = (replace: boolean) => {
    if (!found) return;
    const scenes = scenesFromImport(found, () => newId("s")).map((s) => ({ ...s, ...(s.characters && b.cast.length ? { castIds: castNamed(s.characters, b.cast) } : {}) }));
    const anyRef = scenes.some((s) => s.scriptureRef);
    const anyLesson = scenes.some((s) => s.lessonText);
    update({
      importSource: [book.importSource, text].filter((x) => x.trim()).join("\n\n— — —\n\n"),
      brief: {
        ...b,
        scenes: replace ? scenes : [...b.scenes, ...scenes],
        title: b.title || found.title, subtitle: b.subtitle || found.subtitle, audience: b.audience || found.audience, theme: b.theme || found.theme,
      },
      name: book.name || found.title,
      ...(anyRef && !book.faithBased ? { faithBased: true, content: { ...book.content, scripture: "full" } } : {}),
    });
    say(`${scenes.length} page${scenes.length === 1 ? "" : "s"} added${anyRef ? ", with the Bible references found" : ""}${anyLesson && !book.content.lesson ? ". Lessons were found: switch “Lesson or reflection” on in Book Setup to print them" : ""}.`);
    setFound(null);
    setText("");
  };
  return (
    <div className="cover-panel" data-testid="scene-import">
      <h2 className="book-h">Add your scenes</h2>
      <TextArea label="Paste your book outline or scenes (from ChatGPT, Claude, a document…)" rows={8} value={text} onChange={setText} placeholder={"# She Is Gracious\n\nScene 1: The Brave First Step\nDescription: …\nCharacters: …\nScripture: Proverbs 31:26\nLesson: …"} testId="outline-text" />
      <div className="row">
        <input ref={fileRef} type="file" accept=".docx,.txt,.md,.markdown,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={importFile} data-testid="outline-file" />
        <button type="button" className="btn" disabled={reading} onClick={() => fileRef.current?.click()}>{reading ? "Reading…" : "Import a Word, text or Markdown file"}</button>
        <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={read} data-testid="read-outline">Read my outline</button>
      </div>
      <p className="hint">Product Studio finds the book title, each scene's number and title, its description, characters, actions, Bible references (and verse wording, if you included it), lessons and art notes. You review everything before it's added.</p>
      {found && (
        <div className="import-review" data-testid="outline-review">
          <p><strong>{found.scenes.length} scene{found.scenes.length === 1 ? "" : "s"} found</strong>{found.title ? ` in “${found.title}”` : ""}. Check them, then add them.</p>
          <div className="table-scroll">
            <table className="import-table">
              <thead><tr><th>#</th><th>Title</th><th>Description</th><th>Characters</th><th>Bible verse</th><th>Lesson</th><th>Art notes</th></tr></thead>
              <tbody>
                {found.scenes.map((s, i) => (
                  <tr key={i} data-row={i + 1}>
                    <td>{s.number}</td>
                    <td><input value={s.title} aria-label={`Scene ${i + 1} title`} onChange={(e) => setFound({ ...found, scenes: found.scenes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></td>
                    <td className="import-table__text">{s.description}{s.actions ? ` ${s.actions}` : ""}</td>
                    <td>{s.characters || "—"}</td>
                    <td>{s.scriptureRef ? `${s.scriptureRef}${s.verseText ? " (wording included)" : ""}` : "—"}</td>
                    <td className="import-table__text">{s.lesson || "—"}</td>
                    <td className="import-table__text">{s.style || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {found.notes.length > 0 && <p className="hint">Not part of a scene (kept with the book's imported text): {found.notes.join(" · ")}</p>}
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={() => add(false)} data-testid="add-scenes">{b.scenes.length ? `Add after my ${b.scenes.length} pages` : `Add ${found.scenes.length} pages`}</button>
            {b.scenes.length > 0 && <button type="button" className="btn" onClick={() => { if (window.confirm(`Replace your ${b.scenes.length} pages with these ${found.scenes.length}? Their illustrations and approvals are removed from the book.`)) add(true); }}>Replace my pages</button>}
            <button type="button" className="btn btn--ghost" onClick={() => setFound(null)}>Cancel</button>
          </div>
        </div>
      )}
      {book.importSource.trim() && (
        <details className="cast-changes">
          <summary>The text you imported</summary>
          <pre className="cover-prompt" data-testid="import-source">{book.importSource}</pre>
        </details>
      )}
    </div>
  );
}

function status(book: StepProps["book"], s: Scene) {
  const c = contentOf(book, s);
  const verseNeeded = book.faithBased && c.scripture === "full" && !!s.scriptureRef;
  return {
    art: s.illustrationId ? (s.approvedAt ? "Artwork approved" : "Artwork added") : "No artwork yet",
    verse: !book.faithBased || c.scripture === "none" ? null : !s.scriptureRef ? "No verse yet" : verseNeeded && !s.verseApproved ? "Verse not approved" : "Verse ready",
  };
}

function PageList({ book, setOpenScene, update, interior, issues }: StepProps & { setOpenScene: (id: string | null) => void; issues: MissingIssue[] }) {
  const b = book.brief;
  const move = (i: number, d: number) => {
    const next = [...b.scenes];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    update({ brief: { ...b, scenes: next } });
  };
  return (
    <div className="cover-panel" data-testid="page-list">
      <h2 className="book-h">Your pages · {b.scenes.length}</h2>
      {!b.scenes.length && <p className="hint">No pages yet: paste your outline above, or add a page.</p>}
      <ol className="book-pages">
        {b.scenes.map((s, i) => {
          const st = status(book, s);
          const idx = pageIndexOf(interior, s.id);
          const n = issues.filter((x) => x.sceneId === s.id && x.severity === "blocking").length;
          return (
            <li key={s.id} className={`book-page-card${isSpread(s) ? " book-page-card--spread" : ""}`} data-scene={i + 1}>
              <button type="button" className="book-page-card__open" onClick={() => setOpenScene(s.id)} aria-label={`Open ${isSpread(s) ? "spread" : "scene"} ${i + 1}: ${s.pageTitle ?? s.title}`}>
                {isSpread(s) ? <SpreadPair interior={interior} scene={s} height={150} caption={false} /> : idx >= 0 && <FinishedPage doc={interior} index={idx} height={180} />}
                <strong>{i + 1}. {isSpread(s) ? "Devotional Spread: " : ""}{s.pageTitle ?? s.title}</strong>
              </button>
              <span className={`book-chip${s.approvedAt ? " book-chip--ok" : s.illustrationId ? "" : " book-chip--todo"}`}>{st.art}</span>
              {st.verse && <span className={`book-chip${st.verse === "Verse ready" ? " book-chip--ok" : " book-chip--todo"}`}>{st.verse}</span>}
              {n > 0 && <span className="book-chip book-chip--todo">{n} to fix</span>}
              <div className="row">
                <button type="button" className="btn btn--ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move scene ${i + 1} earlier`}>↑</button>
                <button type="button" className="btn btn--ghost" disabled={i === b.scenes.length - 1} onClick={() => move(i, 1)} aria-label={`Move scene ${i + 1} later`}>↓</button>
                <button type="button" className="btn btn--ghost" onClick={() => { if (window.confirm(`Remove scene ${i + 1}, “${s.pageTitle ?? s.title}”, from the book?`)) update({ brief: { ...b, scenes: b.scenes.filter((x) => x.id !== s.id) } }); }}>Remove</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button type="button" className="btn" onClick={() => { const s: Scene = { id: newId("s"), title: `Scene ${b.scenes.length + 1}`, text: "" }; update({ brief: { ...b, scenes: [...b.scenes, s] } }); setOpenScene(s.id); }}>Add a page</button>
        <button type="button" className="btn" onClick={() => { const s = newSpread(newId("s"), b.scenes.length + 1); update({ brief: { ...b, scenes: [...b.scenes, s] }, ...(book.artCharacters?.length ? {} : { artCharacters: artCharactersOf(book) }) }); setOpenScene(s.id); }} data-testid="add-spread">Add a Devotional Spread</button>
      </div>
      <p className="hint">A Devotional Spread is two facing pages: a daughter coloring page on the left and a Mommy page on the right, with Read the Word, Fill in the Blank, Listen & Reflect and Heart to Heart.</p>
    </div>
  );
}

/** The finished page as large as fits: 560 px tall, less on a phone (the page is 8.5 wide by 11 tall). */
const previewHeight = () => (typeof window === "undefined" ? 560 : Math.max(240, Math.min(560, Math.floor((window.innerWidth - 40) * 1.28))));

/** One page: its finished preview beside everything that goes on it. */
function PageEditor({ book, scene, setScene, say, copy, interior, issues, onClose, setOpenScene, update, setBrief, go }: StepProps & { scene: Scene; onClose: () => void; setOpenScene: (id: string | null) => void; issues: MissingIssue[] }) {
  const b = book.brief;
  const i = b.scenes.indexOf(scene);
  const brief = useMemo(() => briefFor(book), [book]);
  const c = contentOf(book, scene);
  const idx = pageIndexOf(interior, scene.id);
  const mine = issues.filter((x) => x.sceneId === scene.id);
  const set = (patch: Partial<Scene>) => setScene(scene.id, patch);
  const setContent = (patch: Partial<PageContent>) => set({ content: { ...(scene.content ?? {}), ...patch } });
  const own = !!scene.content && Object.keys(scene.content).length > 0;
  const cast = castFor(brief, scene.castIds);
  const prompt = verseArtBlocker(brief, scene) ? null : scenePrompt(brief, scene, i);
  const [showPrompt, setShowPrompt] = useState(false);
  const nav = (
    <div className="page-editor__nav row">
      <button type="button" className="btn" onClick={onClose}>‹ All pages</button>
      <button type="button" className="btn btn--ghost" disabled={i === 0} onClick={() => setOpenScene(b.scenes[i - 1].id)}>‹ Previous</button>
      <strong>{isSpread(scene) ? "Spread" : "Scene"} {i + 1} of {b.scenes.length}</strong>
      <button type="button" className="btn btn--ghost" disabled={i === b.scenes.length - 1} onClick={() => setOpenScene(b.scenes[i + 1].id)}>Next ›</button>
    </div>
  );
  if (isSpread(scene)) {
    return <SpreadEditor book={book} scene={scene} setScene={setScene} say={say} copy={copy} interior={interior} issues={issues} update={update} setBrief={setBrief} go={go} nav={nav} previewHeight={Math.min(440, previewHeight())} scriptureEditor={c.scripture !== "none" ? <ScriptureEditor key={scene.id} book={book} scene={scene} set={set} say={say} /> : null} />;
  }
  const generate = () => {
    if (!prompt) return;
    const message = `Please create this coloring-page illustration. I will attach the reference pictures of the characters with this message if I have them.\n\n${prompt}`;
    navigator.clipboard.writeText(message).catch(() => {});
    const r = launchChatGpt(message, (url, target) => window.open(url, target));
    say(r === "launched" ? "ChatGPT opened with the artwork instructions in its message box (also copied). Paste or attach the reference pictures too, then press send." : r === "too-long" ? "The instructions are copied and ChatGPT is open: paste them into the message box, with the reference pictures." : "Your browser blocked the new tab. The instructions are copied: open ChatGPT and paste them.");
  };
  return (
    <div className="page-editor" data-testid={`page-editor-${i + 1}`}>
      <div className="page-editor__nav row">
        <button type="button" className="btn" onClick={onClose}>‹ All pages</button>
        <button type="button" className="btn btn--ghost" disabled={i === 0} onClick={() => setOpenScene(b.scenes[i - 1].id)}>‹ Previous scene</button>
        <strong>Scene {i + 1} of {b.scenes.length}</strong>
        <button type="button" className="btn btn--ghost" disabled={i === b.scenes.length - 1} onClick={() => setOpenScene(b.scenes[i + 1].id)}>Next scene ›</button>
      </div>
      <div className="page-editor__grid">
        <div className="page-editor__preview">
          <h2 className="book-h">Finished page</h2>
          {idx >= 0 ? <FinishedPage doc={interior} index={idx} height={previewHeight()} label={`Page ${interior.recipe.pages[idx].pageNumber} of ${interior.recipe.pages.length} · exactly as it prints`} /> : null}
          {!scene.illustrationId && <p className="hint">The empty area is where the illustration goes once you upload it.</p>}
          {mine.length > 0 && (
            <ul className="issues book-issues" data-testid="page-issues">
              {mine.map((x) => <li key={x.id} className={`issue issue--${x.severity === "blocking" ? "error" : x.severity === "warning" ? "warning" : "info"}`}><div className="issue-title">{x.title}</div>{x.detail && <div className="issue-advice">{x.detail}</div>}</li>)}
            </ul>
          )}
          {mine.some((x) => /doesn't fit|too long/.test(x.title)) && (
            <div className="row" data-testid="fit-fixes">
              {c.scripture === "full" && <button type="button" className="btn" onClick={() => setContent({ scripture: "reference" })}>Show the reference only on this page</button>}
              {b.textPlacement !== "top" && <button type="button" className="btn" onClick={() => say("Move text above the picture: change “Where the page text goes” in Coloring page settings (all pages).")}>Move the text above the picture</button>}
              {c.lesson && <button type="button" className="btn" onClick={() => setContent({ lesson: false })}>Hide the lesson on this page</button>}
            </div>
          )}
        </div>
        <div className="page-editor__fields">
          <div className="cover-panel">
            <h2 className="book-h">Page text</h2>
            <TextInput label="Title" value={scene.pageTitle ?? scene.title} onChange={(v) => set({ pageTitle: v, ...(scene.title ? {} : { title: v }) })} testId="page-title" />
            <div className="field">
              <span className="field-label">On this page</span>
              <div className="content-switches">
                <Check label="Title" checked={c.title} onChange={(title) => setContent({ title })} />
                {book.faithBased && (
                  <select value={c.scripture} aria-label="Scripture on this page" onChange={(e) => setContent({ scripture: e.target.value as ScriptureChoice })}>
                    <option value="full">Full verse and reference</option>
                    <option value="reference">Reference only</option>
                    <option value="none">No Scripture</option>
                  </select>
                )}
                <Check label="Lesson or reflection" checked={c.lesson} onChange={(lesson) => setContent({ lesson })} />
                <Check label="Custom text" checked={c.customText} onChange={(customText) => setContent({ customText })} />
              </div>
              {own && <button type="button" className="btn btn--ghost" onClick={() => set({ content: undefined })}>Use the book's settings on this page</button>}
            </div>
            <label className="field">
              <span>Lettering on this page</span>
              <select value={scene.letterStyle ?? ""} aria-label="Lettering on this page" onChange={(e) => set({ letterStyle: (e.target.value || undefined) as Scene["letterStyle"] })} data-testid="page-lettering">
                <option value="">The book's choice ({b.pageTypography.letterStyle === "bubble" ? "bubble letters" : "elegant"})</option>
                <option value="bubble">Bubble letters (to color)</option>
                <option value="elegant">Elegant lettering</option>
              </select>
            </label>
            <Check label="Text off (the lettering is already drawn into the art)" checked={!!scene.textOff} onChange={(textOff) => set({ textOff: textOff || undefined })} />
            {book.faithBased && c.scripture !== "none" && <ScriptureEditor key={scene.id} book={book} scene={scene} set={set} say={say} />}
            {c.lesson && <TextArea label="Lesson or reflection" value={scene.lessonText ?? ""} onChange={(v) => set({ lessonText: v || undefined })} testId="lesson-text" />}
            {c.customText && <TextArea label="Custom text" rows={2} value={scene.customText ?? ""} onChange={(v) => set({ customText: v || undefined })} testId="custom-text" />}
          </div>
          <div className="cover-panel">
            <h2 className="book-h">Illustration</h2>
            <TextArea label="What happens in this scene" value={scene.text} onChange={(text) => set({ text })} testId="scene-description" />
            {b.cast.length > 0 && (
              <div className="field">
                <span className="field-label">Characters in this scene</span>
                <div className="row">
                  {b.cast.map((m) => {
                    const on = !scene.castIds || scene.castIds.includes(m.id);
                    return (
                      <label key={m.id} className="check">
                        <input type="checkbox" checked={on} onChange={(e) => { const cur = scene.castIds ?? b.cast.map((x) => x.id); set({ castIds: e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id) }); }} />
                        <span>{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <TextInput label="Art notes (optional)" value={scene.styleNotes ?? ""} onChange={(v) => set({ styleNotes: v || undefined })} />
            <ol className="how-steps">
              <li><strong>Generate the illustration</strong> in ChatGPT (or another image tool) with these artwork instructions and your characters' reference pictures. Product Studio doesn't make images itself.</li>
              <li><strong>Upload the finished illustration</strong> below. Product Studio adds the title and text to build the finished page.</li>
              <li><strong>Check and approve</strong> it against your characters.</li>
            </ol>
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={!prompt} onClick={generate} data-testid="generate-artwork">Generate artwork in ChatGPT ↗</button>
              <button type="button" className="btn" disabled={!prompt} onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>{showPrompt ? "Hide artwork instructions" : "Show artwork instructions"}</button>
              <button type="button" className="btn" disabled={!prompt} onClick={() => prompt && copy(prompt)}>Copy artwork instructions</button>
            </div>
            {showPrompt && prompt && <pre className="cover-prompt" data-testid="artwork-instructions">{prompt}</pre>}
            <p className="hint">The instructions ask for a clean, text-free picture with white space left for your words. Your title and Scripture are added by Product Studio as editable text, so they're always spelled right.</p>
            {cast.length > 0 && <ReferenceFiles brief={brief} cast={cast} say={say} />}
            <IllustrationCheck brief={brief} scene={scene} index={i} cast={cast} setScene={set} onNext={() => { if (b.scenes[i + 1]) setOpenScene(b.scenes[i + 1].id); }} preview={false} />
            {scene.illustrationId && <Regenerate scene={scene} onRegenerate={(notes) => {
              const next = { ...scene, attempts: (scene.attempts ?? 0) + 1, rejectNotes: notes || undefined };
              set({ attempts: next.attempts, rejectNotes: next.rejectNotes, approvedAt: undefined, checks: undefined });
              copy(scenePrompt(brief, next, i));
            }} />}
            <p className="hint">The consistency check: {CHECKS.length} points, compared by eye with the reference pictures.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A page's Bible verse: reference (found, typed or suggested), its exact wording (pasted or fetched), approval. */
function ScriptureEditor({ book, scene, set, say }: { book: StepProps["book"]; scene: Scene; set: (p: Partial<Scene>) => void; say: (m: string) => void }) {
  const b = book.brief;
  const c = contentOf(book, scene);
  const t = translationOf(b.translation);
  const [ref, setRef] = useState(scene.scriptureRef ?? "");
  const [busy, setBusy] = useState(false);
  const canonical = scene.scriptureRef ? normalizeReference(scene.scriptureRef) : null;
  const suggestions = !scene.scriptureRef ? suggestReferences(`${scene.pageTitle ?? scene.title} ${scene.text} ${scene.lessonText ?? ""}`) : [];
  const problem = scene.verseText ? wordingProblem(scene.verseText, scene.scriptureRef ?? "") : null;
  const commitRef = (v: string) => {
    const n = v.trim() ? normalizeReference(v) ?? v.trim() : "";
    setRef(n);
    if (n !== (scene.scriptureRef ?? "")) set({ scriptureRef: n || undefined, verseText: undefined, verseApproved: undefined, verseSource: undefined, suggestedRef: undefined });
  };
  const fetchWords = async () => {
    if (!scene.scriptureRef) return;
    setBusy(true);
    const r = await fetchPublicDomain(scene.scriptureRef, b.translation);
    setBusy(false);
    if (r.ok) {
      set({ verseText: r.text, verseSource: "public-domain", verseApproved: undefined });
      say(`${scene.scriptureRef} (${t.id}) filled in from the public-domain text. Read it, then approve it.`);
    } else say(r.reason);
  };
  return (
    <div className="scripture-editor" data-testid="scripture-editor">
      <label className="field">
        <span>Bible reference ({t.id})</span>
        <input value={ref} placeholder="Proverbs 31:26" onChange={(e) => setRef(e.target.value)} onBlur={(e) => commitRef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitRef((e.target as HTMLInputElement).value); }} aria-label="Bible reference" data-testid="verse-ref" />
        {scene.scriptureRef && !canonical && <span className="hint" role="alert">“{scene.scriptureRef}” isn't a reference Product Studio recognises. Write it like “Proverbs 31:26”.</span>}
      </label>
      {!scene.scriptureRef && (
        <div className="field" data-testid="verse-suggestions">
          <span className="field-label">Suggested verses for this scene (references only: you choose, and you supply the wording)</span>
          <div className="row">
            {suggestions.length ? suggestions.map((r) => <button key={r} type="button" className="btn" onClick={() => { setRef(r); set({ scriptureRef: r, suggestedRef: undefined, verseText: undefined, verseApproved: undefined }); }}>Use {r}</button>) : <span className="hint">No suggestion for this scene's words: type a reference.</span>}
            {suggestions.map((r) => <a key={`l-${r}`} className="btn btn--ghost" href={passageLink(r, t.id)} target="_blank" rel="noreferrer">Read {r} ↗</a>)}
          </div>
        </div>
      )}
      {scene.scriptureRef && c.scripture === "full" && (
        <>
          <label className="field">
            <span>Verse wording ({t.id}){scene.verseApproved ? " · approved" : ""}</span>
            <textarea rows={3} value={scene.verseText ?? ""} placeholder={t.publicDomain ? "Fetch the wording, or paste it" : `Paste the exact ${t.id} wording of ${scene.scriptureRef}`} onChange={(e) => set({ verseText: e.target.value || undefined, verseApproved: undefined, verseSource: "customer" })} aria-label="Verse wording" data-testid="verse-text" />
          </label>
          <div className="row">
            <a className="btn" href={passageLink(scene.scriptureRef, t.id)} target="_blank" rel="noreferrer">Read {scene.scriptureRef} in the {t.id} ↗</a>
            {t.publicDomain && <button type="button" className="btn" disabled={busy} onClick={() => void fetchWords()} data-testid="fetch-verse">{busy ? "Fetching…" : `Fill in the ${t.id} wording`}</button>}
            <button type="button" className="btn btn--primary" disabled={!scene.verseText?.trim() || !!problem || !!scene.verseApproved} onClick={() => set({ verseApproved: new Date().toISOString() })} data-testid="approve-verse">{scene.verseApproved ? "Wording approved" : "I checked it word for word — approve"}</button>
            {scene.verseApproved && <button type="button" className="btn btn--ghost" onClick={() => set({ verseApproved: undefined })}>Undo approval</button>}
          </div>
          {problem && <p className="hint" role="alert">{problem}</p>}
          <p className="hint">{t.publicDomain ? "Fetched word for word from a public-domain text; still read it before approving." : `Product Studio never writes ${t.id} wording itself. Copy it from your Bible or the publisher's site, check it, then approve. Only approved wording prints.`}</p>
          {t.id === "KJV" ? (
            <div className="field" data-testid="verse-use">
              <span>Words on the page</span>
              <div className="row" role="group" aria-label="Words on the page">
                <button type="button" className="btn" aria-pressed={scene.verseUse !== "excerpt"} onClick={() => set({ verseUse: undefined })}>Full verse</button>
                <button type="button" className="btn" aria-pressed={scene.verseUse === "excerpt"} onClick={() => set({ verseUse: "excerpt" })}>Short excerpt</button>
              </div>
              {scene.verseUse === "excerpt" && (
                <>
                  <input value={scene.verseExcerpt ?? ""} placeholder="Be strong and of a good courage; be not afraid." onChange={(e) => set({ verseExcerpt: e.target.value || undefined })} aria-label="Short excerpt" data-testid="verse-excerpt" />
                  <span className="hint" role={scene.verseExcerpt?.trim() && scene.verseText && !excerptFromVerse(scene.verseExcerpt, scene.verseText) ? "alert" : undefined}>
                    {scene.verseExcerpt?.trim() && scene.verseText && !excerptFromVerse(scene.verseExcerpt, scene.verseText)
                      ? "Use the verse's own words, in order: this excerpt has words that aren't in the KJV wording above."
                      : "Type the part of the verse to print, in its own words (the reference stays the same). Only the KJV can be shortened."}
                  </span>
                </>
              )}
            </div>
          ) : (
            <p className="hint">Short excerpts are offered for the KJV only; other translations print their full approved wording.</p>
          )}
        </>
      )}
    </div>
  );
}

export type { MissingIssue };
