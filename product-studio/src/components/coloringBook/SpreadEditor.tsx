/**
 * Interior Pages — a Devotional Spread (engines/coloringBook/spread.ts): the two facing pages side by side in print
 * order (daughter page left, Mommy page right), then everything on each page: its words, lettering, text off, the
 * Mommy page's activities (with the answer check), its art (upload, size check, approval) and its Art Prompt.
 * Also the book's spread settings (split, sizes, line spacing) and its saved Art Prompt characters.
 */
import { useState, type ReactNode } from "react";
import type { BlankLine, ExcerptKind, LetterStyle, MommyPage, ReadWordLine, Scene } from "../../engines/cover/brief";
import { artCharactersOf, DEFAULT_SPREAD, spreadOf, type ArtCharacter } from "../../engines/coloringBook/book";
import { briefFor } from "../../engines/coloringBook/assembleBook";
import { answerProblems, belowPrintSize, mommyOf, PRINT_PX, spreadArtPrompt, type SpreadSide } from "../../engines/coloringBook/spread";
import { fetchPublicDomain, normalizeReference, translationOf } from "../../engines/coloringBook/scripture";
import type { MissingIssue } from "../../engines/coloringBook/missing";
import { launchChatGpt } from "../../engines/cover/launch";
import { newId } from "../../presets/products/projectFactory";
import { Check } from "../editor/ui";
import { ImageButton } from "../cover/ColoringPanels";
import { FinishedPage, TextArea, TextInput, type StepProps } from "./shared";

const KINDS: { value: ExcerptKind; label: string }[] = [
  { value: "exact", label: "Exact quote" },
  { value: "paraphrase", label: "Paraphrase (labelled on the page)" },
  { value: "reflection", label: "Scripture-based reflection" },
];

/** Where a page of the book is (its index in the assembled interior), or -1. */
const indexOf = (book: StepProps["interior"], item: string) => book.recipe.pages.findIndex((p) => p.recipeItemId === item && (p.flowPart ?? 0) === 0);

/** The two facing pages, as they print: the daughter page on the left, the Mommy page on the right. */
export function SpreadPair({ interior, scene, height, caption = true }: { interior: StepProps["interior"]; scene: Scene; height: number; caption?: boolean }) {
  const l = indexOf(interior, `scene-${scene.id}`), r = indexOf(interior, `mommy-${scene.id}`);
  if (l < 0 || r < 0) return null;
  const pn = (i: number) => interior.recipe.pages[i].pageNumber;
  return (
    <div className="spread-pair" data-testid={`spread-pair-${scene.id}`} data-left={pn(l)} data-right={pn(r)}>
      <FinishedPage doc={interior} index={l} height={height} label={caption ? `Left · daughter page · page ${pn(l)}` : undefined} />
      <FinishedPage doc={interior} index={r} height={height} label={caption ? `Right · Mommy page · page ${pn(r)}` : undefined} />
    </div>
  );
}

function Select<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)} data-testid={testId}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const LETTERING: { value: LetterStyle; label: string }[] = [
  { value: "bubble", label: "Bubble letters (to color)" },
  { value: "elegant", label: "Elegant lettering" },
];

/** The Art Prompt: that page's art only, ready to paste into ChatGPT (copied as it opens). */
function ArtPrompt({ prompt, side, copy, say }: { prompt: string; side: SpreadSide; copy: (t: string) => void; say: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="art-prompt" data-testid={`art-prompt-${side}`}>
      <div className="row">
        <button type="button" className="btn btn--primary" aria-expanded={open} onClick={() => { setOpen(true); copy(prompt); }} data-testid={`art-prompt-button-${side}`}>Art Prompt</button>
        {open && (
          <button type="button" className="btn" onClick={() => {
            navigator.clipboard.writeText(prompt).catch(() => {});
            const r = launchChatGpt(prompt, (url, target) => window.open(url, target));
            say(r === "launched" ? "ChatGPT opened with the Art Prompt (also copied)." : r === "too-long" ? "The Art Prompt is copied and ChatGPT is open: paste it into the message box." : "Your browser blocked the new tab. The Art Prompt is copied: open ChatGPT and paste it.");
          }}>Open ChatGPT ↗</button>
        )}
        {open && <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Hide</button>}
      </div>
      {open && <pre className="cover-prompt" data-testid={`art-prompt-text-${side}`}>{prompt}</pre>}
    </div>
  );
}

/** Upload a page's art, with its pixel size checked against 2550 × 3300, and approve it. */
function ArtUpload({ label, id, name, w, h, approvedAt, onImage, onApprove, testId }: { label: string; id?: string; name?: string; w?: number; h?: number; approvedAt?: string; onImage: (a: { id: string; name: string; widthPx: number; heightPx: number }) => void; onApprove: (at: string | undefined) => void; testId: string }) {
  const small = belowPrintSize(w, h);
  return (
    <div className="field" data-testid={testId}>
      <div className="row">
        <ImageButton label={id ? `Replace ${label}` : `Upload ${label}`} onImage={onImage} testId={`${testId}-input`} />
        {name && <span className="hint">{name}</span>}
      </div>
      {id && (
        <>
          <p className={`hint${small ? " art-ppi--soft" : ""}`} role={small ? "alert" : undefined} data-testid={`${testId}-size`}>
            {w} × {h} px.{" "}
            {small ? `Below ${PRINT_PX.w} × ${PRINT_PX.h}: it may print soft at 8.5 × 11 in. Upscale it or export it larger.` : `At least ${PRINT_PX.w} × ${PRINT_PX.h}: prints sharp at 8.5 × 11 in.`}
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={!!approvedAt} onClick={() => onApprove(new Date().toISOString())}>{approvedAt ? "Art approved" : "Approve this art"}</button>
            {approvedAt && <button type="button" className="btn btn--ghost" onClick={() => onApprove(undefined)}>Undo approval</button>}
          </div>
        </>
      )}
    </div>
  );
}

function CharacterSelect({ book, value, onChange, label = "Character in this page's art" }: { book: StepProps["book"]; value?: string; onChange: (id: string | undefined) => void; label?: string }) {
  const list = artCharactersOf(book);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">None chosen</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name || "Unnamed character"}</option>)}
      </select>
      <span className="hint">Its saved description is pasted word for word into the Art Prompt. Edit the list under “Devotional Spread settings”.</span>
    </label>
  );
}

export function SpreadEditor(props: StepProps & { scene: Scene; issues: MissingIssue[]; nav: ReactNode; scriptureEditor: ReactNode; previewHeight: number }) {
  const { book, scene, setScene, interior, issues, copy, say, nav, scriptureEditor } = props;
  const b = book.brief;
  const brief = briefFor(book);
  const i = b.scenes.indexOf(scene);
  const m = mommyOf(scene);
  const set = (patch: Partial<Scene>) => setScene(scene.id, patch);
  const setM = (patch: Partial<MommyPage>) => set({ mommy: { ...m, ...patch } });
  const mine = issues.filter((x) => x.sceneId === scene.id);
  const answers = answerProblems(scene);
  const t = translationOf(b.translation);
  const [busy, setBusy] = useState<number | null>(null);
  const setRead = (k: number, patch: Partial<ReadWordLine>) => setM({ readWord: m.readWord.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  const setBlank = (k: number, patch: Partial<BlankLine>) => setM({ blanks: m.blanks.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
  const fill = async (k: number) => {
    const ref = normalizeReference(m.readWord[k].ref);
    if (!ref) return say("Type the reference first, like “Psalm 139:14”.");
    setBusy(k);
    const r = await fetchPublicDomain(ref, b.translation);
    setBusy(null);
    if (r.ok) {
      setRead(k, { text: r.text, ref, kind: "exact" });
      say(`${ref} (${t.id}) filled in word for word. Shorten it to the words you want printed (keep them in order), and check it.`);
    } else say(r.reason);
  };
  const daughterLettering = scene.letterStyle ?? (b.pageTypography.letterStyle === "bubble" ? "bubble" : "elegant");
  return (
    <div className="page-editor spread-editor" data-testid={`spread-editor-${i + 1}`}>
      {nav}
      <div className="cover-panel">
        <h2 className="book-h">Devotional Spread {i + 1}: the facing pages, in print order</h2>
        <SpreadPair interior={interior} scene={scene} height={props.previewHeight} />
        {mine.length > 0 && (
          <ul className="issues book-issues" data-testid="page-issues">
            {mine.map((x) => <li key={x.id} className={`issue issue--${x.severity === "blocking" ? "error" : x.severity === "warning" ? "warning" : "info"}`}><div className="issue-title">{x.title}</div>{x.detail && <div className="issue-advice">{x.detail}</div>}</li>)}
          </ul>
        )}
      </div>
      <div className="spread-editor__grid">
        <div className="cover-panel" data-testid="daughter-page">
          <h2 className="book-h">Left · daughter page</h2>
          <TextInput label="Title" value={scene.pageTitle ?? scene.title} onChange={(v) => set({ pageTitle: v, ...(scene.title ? {} : { title: v }) })} testId="page-title" />
          {book.faithBased && scriptureEditor}
          <Select label="Lettering on this page" value={daughterLettering} options={LETTERING} onChange={(letterStyle) => set({ letterStyle })} testId="daughter-lettering" />
          <Check label="Text off (the lettering is already drawn into the art)" checked={!!scene.textOff} onChange={(textOff) => set({ textOff: textOff || undefined })} />
          <TextInput label="Theme" value={scene.theme ?? ""} onChange={(v) => set({ theme: v || undefined })} placeholder="God made me wonderfully" />
          <TextArea label="Scene (what the art shows)" value={scene.text} onChange={(text) => set({ text })} testId="scene-description" />
          <CharacterSelect book={book} value={scene.artCharacterId} onChange={(artCharacterId) => set({ artCharacterId })} />
          <ArtPrompt side="daughter" prompt={spreadArtPrompt(book, brief, scene, "daughter")} copy={copy} say={say} />
          <ArtUpload label="the daughter page's art" id={scene.illustrationId} name={scene.illustrationName} w={scene.illustrationW} h={scene.illustrationH} approvedAt={scene.approvedAt}
            onImage={(a) => set({ illustrationId: a.id, illustrationName: a.name, illustrationW: a.widthPx, illustrationH: a.heightPx, approvedAt: undefined, checks: undefined })}
            onApprove={(approvedAt) => set({ approvedAt })} testId="daughter-art" />
        </div>
        <div className="cover-panel" data-testid="mommy-page">
          <h2 className="book-h">Right · Mommy page</h2>
          <TextInput label="Declaration" value={m.title ?? ""} onChange={(v) => setM({ title: v || undefined })} placeholder="She is fearfully and wonderfully made" testId="mommy-title" />
          <Select label="Lettering on this page" value={m.letterStyle ?? "elegant"} options={LETTERING} onChange={(letterStyle) => setM({ letterStyle })} testId="mommy-lettering" />
          <Check label="Text off (the declaration is already drawn into the art)" checked={!!m.textOff} onChange={(textOff) => setM({ textOff: textOff || undefined })} />
          <Select label="Activities" value={m.layout ?? "column"} options={[{ value: "column", label: "Column on the outer side" }, { value: "band", label: "Band across the bottom" }]} onChange={(layout) => setM({ layout: layout === "band" ? "band" : undefined })} testId="mommy-layout" />
          <Check label="Reserve a QR code box (labelled; you add the code later)" checked={!!m.qr} onChange={(qr) => setM({ qr: qr || undefined })} />

          <fieldset className="spread-section" data-testid="read-the-word">
            <legend>Read the Word ({m.readWord.length} of 3)</legend>
            {m.readWord.map((r, k) => (
              <div key={k} className="spread-line">
                <div className="cover-two">
                  <label className="field"><span>Reference</span><input value={r.ref} placeholder="Psalm 139:14" onChange={(e) => setRead(k, { ref: e.target.value })} aria-label={`Read the Word ${k + 1} reference`} /></label>
                  <Select label="This line is" value={r.kind} options={KINDS} onChange={(kind) => setRead(k, { kind })} />
                </div>
                <label className="field"><span>Words printed</span><textarea rows={2} value={r.text} onChange={(e) => setRead(k, { text: e.target.value })} aria-label={`Read the Word ${k + 1}`} /></label>
                <div className="row">
                  {t.publicDomain && r.kind === "exact" && <button type="button" className="btn" disabled={busy === k} onClick={() => void fill(k)}>{busy === k ? "Fetching…" : `Fill in the ${t.id} wording`}</button>}
                  <button type="button" className="btn btn--ghost" onClick={() => setM({ readWord: m.readWord.filter((_, j) => j !== k) })}>Remove</button>
                </div>
              </div>
            ))}
            {m.readWord.length < 3 && <button type="button" className="btn" onClick={() => setM({ readWord: [...m.readWord, { text: "", ref: "", kind: "exact" }] })}>Add a Scripture excerpt</button>}
            <p className="hint">The translation is set for the whole book ({t.id}) under Book Setup. Exact quotes print with “({t.id})”{t.id === "KJV" ? " (the KJV prints its reference alone)" : ""}; paraphrases get a small “paraphrase” label; reflections print the reference alone.</p>
          </fieldset>

          <fieldset className="spread-section" data-testid="fill-in-the-blank">
            <legend>Fill in the Blank ({m.blanks.length} of 3)</legend>
            {m.blanks.map((x, k) => {
              const p = answers.find((a) => a.index === k);
              return (
                <div key={k} className="spread-line">
                  <label className="field"><span>Statement (type ___ where the blank goes)</span><input value={x.text} placeholder="I am fearfully and ___ made." onChange={(e) => setBlank(k, { text: e.target.value })} aria-label={`Blank ${k + 1} statement`} /></label>
                  <div className="cover-two">
                    <label className="field"><span>Answer (never printed)</span><input value={x.answer} onChange={(e) => setBlank(k, { answer: e.target.value })} aria-label={`Blank ${k + 1} answer`} /></label>
                    <label className="field"><span>Reference</span><input value={x.ref} placeholder="Psalm 139:14" onChange={(e) => setBlank(k, { ref: e.target.value })} aria-label={`Blank ${k + 1} reference`} /></label>
                  </div>
                  {x.text.trim() && (
                    <span className={`hint${p ? " art-ppi--soft" : ""}`} role={p ? "alert" : undefined} data-testid={`answer-check-${k + 1}`}>
                      {!p ? `✓ “${x.answer.trim()}” is in this page's excerpts.` : p.kind === "no-answer" ? "Type the answer so it can be checked against the excerpts." : `“${p.answer}” isn't in this page's printed excerpts.`}
                    </span>
                  )}
                  <button type="button" className="btn btn--ghost" onClick={() => setM({ blanks: m.blanks.filter((_, j) => j !== k) })}>Remove</button>
                </div>
              );
            })}
            {m.blanks.length < 3 && <button type="button" className="btn" onClick={() => setM({ blanks: [...m.blanks, { text: "", answer: "", ref: "" }] })}>Add a statement</button>}
          </fieldset>

          <fieldset className="spread-section">
            <legend>Listen & Reflect</legend>
            <TextArea label="Question" rows={2} value={m.reflect.question} onChange={(question) => setM({ reflect: { ...m.reflect, question } })} testId="reflect-question" />
            <Select label="Writing lines" value={String(m.reflect.lines) as "3" | "4"} options={[{ value: "3", label: "3 lines" }, { value: "4", label: "4 lines" }]} onChange={(v) => setM({ reflect: { ...m.reflect, lines: Number(v) } })} />
          </fieldset>
          <fieldset className="spread-section">
            <legend>Heart to Heart</legend>
            <TextArea label="Question" rows={2} value={m.heart} onChange={(heart) => setM({ heart })} testId="heart-question" />
          </fieldset>

          <TextInput label="Theme (for the Art Prompt)" value={m.theme ?? ""} onChange={(v) => setM({ theme: v || undefined })} placeholder={scene.theme ?? ""} />
          <TextArea label="Art for the Mommy page" value={m.scene ?? ""} onChange={(v) => setM({ scene: v || undefined })} placeholder="A garden arch of roses and climbing vines with butterflies." testId="mommy-scene" />
          <CharacterSelect book={book} value={m.artCharacterId} onChange={(artCharacterId) => setM({ artCharacterId })} label="Character in the Mommy page's art (optional)" />
          <ArtPrompt side="mommy" prompt={spreadArtPrompt(book, brief, scene, "mommy")} copy={copy} say={say} />
          <ArtUpload label="the Mommy page's art" id={m.illustrationId} name={m.illustrationName} w={m.illustrationW} h={m.illustrationH} approvedAt={m.approvedAt}
            onImage={(a) => setM({ illustrationId: a.id, illustrationName: a.name, illustrationW: a.widthPx, illustrationH: a.heightPx, approvedAt: undefined })}
            onApprove={(approvedAt) => setM({ approvedAt })} testId="mommy-art" />
        </div>
      </div>
    </div>
  );
}

/** The book's Devotional Spread settings: the Mommy page's split, sizes and line spacing, and the saved characters. */
export function SpreadSettingsPanel({ book, update }: StepProps) {
  const s = spreadOf(book);
  const set = (patch: Partial<typeof s>) => update({ spread: { ...s, ...patch } });
  const chars = artCharactersOf(book);
  const setChars = (next: ArtCharacter[]) => update({ artCharacters: next });
  const opt = (vals: number[], unit: string, d: number) => vals.map((v) => ({ value: String(v), label: `${v}${unit}${v === d ? " (standard)" : ""}` }));
  return (
    <details className="cover-panel book-settings" data-testid="spread-settings">
      <summary><h2 className="book-h">Devotional Spread settings</h2><span className="hint">Art {Math.round(s.split * 100)}% · text {s.bodyPt} pt · lines {s.lineSpacingIn} in · {chars.length} saved character{chars.length === 1 ? "" : "s"}</span></summary>
      <div className="cover-two">
        <Select label="Art's share of the Mommy page" value={String(s.split)} options={[0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8].map((v) => ({ value: String(v), label: `${Math.round(v * 100)}% art · ${Math.round((1 - v) * 100)}% activities${v === DEFAULT_SPREAD.split ? " (standard)" : ""}` }))} onChange={(v) => set({ split: Number(v) })} testId="spread-split" />
        <Select label="Section labels" value={String(s.headingPt)} options={opt([9, 9.5, 10, 10.5, 11, 12], " pt", DEFAULT_SPREAD.headingPt)} onChange={(v) => set({ headingPt: Number(v) })} />
        <Select label="Activity text" value={String(s.bodyPt)} options={opt([8, 8.5, 9, 9.5, 10, 10.5, 11, 12], " pt", DEFAULT_SPREAD.bodyPt)} onChange={(v) => set({ bodyPt: Number(v) })} testId="spread-body-pt" />
        <Select label="Writing-line spacing" value={String(s.lineSpacingIn)} options={opt([0.25, 0.28, 0.3, 0.33, 0.375], " in", DEFAULT_SPREAD.lineSpacingIn)} onChange={(v) => set({ lineSpacingIn: Number(v) })} />
      </div>
      <p className="hint">The split is the art's share of the width (column) or of the height (bottom band). The Mommy page's Art Prompt uses the same numbers.</p>
      <fieldset className="spread-section" data-testid="art-characters">
        <legend>Saved characters for Art Prompts</legend>
        {chars.map((c, k) => (
          <div key={c.id} className="spread-line">
            <TextInput label="Name" value={c.name} onChange={(name) => setChars(chars.map((x, j) => (j === k ? { ...x, name } : x)))} />
            <TextArea label="Description (pasted into prompts word for word)" rows={4} value={c.description} onChange={(description) => setChars(chars.map((x, j) => (j === k ? { ...x, description } : x)))} />
            {chars.length > 1 && <button type="button" className="btn btn--ghost" onClick={() => setChars(chars.filter((_, j) => j !== k))}>Remove {c.name || "character"}</button>}
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setChars([...chars, { id: newId("char"), name: `Character ${chars.length + 1}`, description: "" }])}>Add a character</button>
      </fieldset>
    </details>
  );
}
