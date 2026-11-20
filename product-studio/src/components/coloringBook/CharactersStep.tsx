/**
 * Step 2 — Characters ("My Characters"): create one with simple questions, import a description pasted from ChatGPT
 * or another source, or copy a prompt that asks ChatGPT for exactly the details Product Studio needs. Each character
 * keeps its reference image; characters can be reused from another book (their reference images come along).
 */
import { useState } from "react";
import type { CastMember } from "../../engines/cover/brief";
import { characterDescriptionPrompt, parseCharacters, type ImportedCharacter } from "../../engines/coloringBook/importText";
import { bookTitle, type ColoringBook } from "../../engines/coloringBook/book";
import { newId } from "../../presets/products/projectFactory";
import { CastPanel, ImageButton, RefThumb } from "../cover/ColoringPanels";
import { Choice, TextArea, TextInput, type StepProps } from "./shared";

type Mode = "create" | "import" | "prompt";

const QUESTIONS: { key: keyof CastMember; q: string; placeholder: string }[] = [
  { key: "name", q: "What is the character's name?", placeholder: "Jenny Ballerina" },
  { key: "age", q: "About how old are they?", placeholder: "about 9" },
  { key: "face", q: "What do their face and skin look like?", placeholder: "round face, deep brown skin, big bright eyes" },
  { key: "hair", q: "What is their hair like (texture and hairstyle)?", placeholder: "long cornrow braids" },
  { key: "hairAccessories", q: "Any bows, headbands or hair accessories?", placeholder: "large pink hair bow" },
  { key: "clothing", q: "What do they usually wear?", placeholder: "leotard with a tulle tutu, ballet slippers" },
  { key: "accessories", q: "Any other accessories?", placeholder: "none" },
  { key: "proportions", q: "How tall are they next to the others?", placeholder: "medium height" },
  { key: "description", q: "What is their personality?", placeholder: "brave and encouraging" },
  { key: "traits", q: "What must never change about them?", placeholder: "the cornrow braids and the large pink bow" },
];

export function CharactersStep({ book, setBrief, say, copy, otherBooks }: StepProps & { otherBooks: ColoringBook[] }) {
  const b = book.brief;
  const [mode, setMode] = useState<Mode>("create");
  const [draft, setDraft] = useState<Partial<CastMember>>({});
  const [pasted, setPasted] = useState("");
  const [found, setFound] = useState<ImportedCharacter[] | null>(null);
  const add = (cs: Omit<CastMember, "id">[]) => {
    const made = cs.map((c) => ({ ...c, id: newId("c") }) as CastMember);
    setBrief({ cast: [...b.cast, ...made], castSelected: [...(b.castSelected.length ? b.castSelected : b.cast.map((c) => c.id)), ...made.map((c) => c.id)] });
    say(`${made.length === 1 ? made[0].name : `${made.length} characters`} added to My Characters.`);
  };
  const reusable = otherBooks.flatMap((o) => o.brief.cast.map((c) => ({ c, from: bookTitle(o) || "Another book" }))).filter(({ c }) => !b.cast.some((x) => x.name === c.name && x.refId === c.refId));

  return (
    <section className="cover-step book-step" aria-label="Characters">
      <p className="hint">Recurring characters are what make a book feel like one story. Describe each one once here, with a reference picture, and every page and the cover reuse them. No recurring characters? Skip this step.</p>
      <Choice<Mode>
        label="Add a character"
        value={mode}
        options={[{ value: "create", label: "Create a character" }, { value: "import", label: "Import a description" }, { value: "prompt", label: "Get a description prompt" }]}
        onChange={setMode}
        testId="character-mode"
      />
      {mode === "create" && (
        <div className="cover-panel" data-testid="character-create">
          <div className="cover-two">
            {QUESTIONS.map((q) => (
              <TextInput key={q.key} label={q.q} value={(draft[q.key] as string | undefined) ?? ""} placeholder={q.placeholder} onChange={(v) => setDraft({ ...draft, [q.key]: v })} />
            ))}
          </div>
          <div className="row">
            {draft.refId ? <RefThumb id={draft.refId} name={draft.refName} size={56} /> : null}
            <ImageButton label={draft.refId ? "Replace reference picture" : "Add a reference picture (optional)"} onImage={(a) => setDraft({ ...draft, refId: a.id, refName: a.name })} testId="new-character-ref" />
            <button type="button" className="btn btn--primary" disabled={!draft.name?.trim()} onClick={() => { add([{ name: draft.name!.trim(), description: draft.description ?? "", traits: draft.traits ?? "", ...Object.fromEntries(Object.entries(draft).filter(([k, v]) => v && !["name", "description", "traits"].includes(k))) }]); setDraft({}); }}>Save character</button>
          </div>
        </div>
      )}
      {mode === "import" && (
        <div className="cover-panel" data-testid="character-import">
          <TextArea label="Paste a character description (one or several characters)" rows={8} value={pasted} onChange={setPasted} placeholder={"Name: Jenny Ballerina\nAge: about 9\nHair: long cornrow braids\nHair accessories: large pink hair bow\n…"} testId="character-paste" />
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={!pasted.trim()} onClick={() => { const r = parseCharacters(pasted); setFound(r); if (!r.length) say("No character found in that text. Add a Name: line, or use Create a character."); }}>Read the description</button>
          </div>
          {found && found.length > 0 && (
            <div className="import-review" data-testid="character-review">
              <p className="hint">Check what was read into each field, correct anything, then add them. The text you pasted stays above until you add them.</p>
              {found.map((c, i) => (
                <fieldset key={i} className="cast-card">
                  <legend>{c.name || `Character ${i + 1}`}</legend>
                  <div className="cover-two">
                    {QUESTIONS.map((q) => (
                      <TextInput key={q.key} label={q.q} value={(c[q.key as keyof ImportedCharacter] as string | undefined) ?? ""} onChange={(v) => setFound(found.map((x, j) => (j === i ? { ...x, [q.key]: v } : x)))} />
                    ))}
                  </div>
                </fieldset>
              ))}
              <button type="button" className="btn btn--primary" onClick={() => { add(found); setFound(null); setPasted(""); }} data-testid="add-imported-characters">Add {found.length === 1 ? found[0].name || "this character" : `these ${found.length} characters`}</button>
            </div>
          )}
        </div>
      )}
      {mode === "prompt" && (
        <div className="cover-panel" data-testid="character-prompt">
          <p className="hint">Copy this into ChatGPT (or any assistant). Paste its answer under “Import a description”: every field is read for you.</p>
          <pre className="cover-prompt">{characterDescriptionPrompt({ title: bookTitle(book), audience: b.audience || b.ageGroup, names: b.cast.map((c) => c.name) })}</pre>
          <button type="button" className="btn btn--primary" onClick={() => copy(characterDescriptionPrompt({ title: bookTitle(book), audience: b.audience || b.ageGroup, names: b.cast.map((c) => c.name) }))}>Copy the prompt</button>
        </div>
      )}

      <div className="cover-panel">
        <h2 className="book-h">My Characters{b.cast.length ? ` · ${b.cast.length}` : ""}</h2>
        {b.cast.length ? (
          <CastPanel brief={b} set={setBrief} copy={copy} />
        ) : (
          <p className="hint">No characters yet.</p>
        )}
        <p className="hint">
          Reference pictures stay with each character in this book. Image generators like ChatGPT can't receive them through a link, so when you generate a page,
          use “Copy image” beside each character (then paste it into ChatGPT) or “Download references” and attach the files.
        </p>
      </div>

      {reusable.length > 0 && (
        <details className="section cover-advanced">
          <summary>Use characters from another book ({reusable.length})</summary>
          <div className="section-body">
            <ul className="cast-list">
              {reusable.map(({ c, from }) => (
                <li key={`${from}-${c.id}`} className="cast-card">
                  <RefThumb id={c.refId} name={c.refName} size={56} />
                  <div className="cast-card__body">
                    <strong>{c.name}</strong>
                    <span className="hint">From “{from}” · {[c.hair, c.hairAccessories, c.clothing].filter(Boolean).join(" · ")}</span>
                    <button type="button" className="btn" onClick={() => { const { id: _id, ...rest } = c; void _id; add([rest]); }}>Add {c.name} to this book</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </section>
  );
}
