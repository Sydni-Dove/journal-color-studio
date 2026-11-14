/**
 * CARD SHEET EDITOR — the cards on a card sheet page (layouts/book/cardSheet.ts): how they print
 * (cards per page, both sides, how the printer turns the paper, the picture space) and each card's
 * front and back. Every card is edited in place; a new card copies the last card's back labels so
 * a set of cards keeps one shape.
 */
import { useState } from "react";
import type { CardContent, CardSheetContent } from "../../types/recipe";
import { cardSheetPages, cardsPerSheet } from "../../layouts/book/cardSheet";
import { Check, Field, Select } from "./ui";

const DEFAULT_BACK = ["What it means", "Scripture", "Example", "Talk about it", "Try it"];
const move = <T,>(xs: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

/** A new card shaped like the last one (its back labels, empty text). */
export function newCard(cards: CardContent[]): CardContent {
  const last = cards.at(-1);
  return { title: `Card ${cards.length + 1}`, back: (last?.back.map((p) => p.label) ?? DEFAULT_BACK).map((label) => ({ label, text: "" })) };
}

function CardFields({ card, n, count, set, remove, shift, duplicate, open }: { card: CardContent; n: number; count: number; set: (c: CardContent) => void; remove: () => void; shift: (d: -1 | 1) => void; duplicate: () => void; open: boolean }) {
  return (
    <details className="subsection" open={open} data-card={n}>
      <summary>{`Card ${n + 1}: ${card.title || "Untitled"}`}</summary>
      <Field label="Title (front)">
        <input type="text" value={card.title} aria-label={`Card ${n + 1} title`} onChange={(e) => set({ ...card, title: e.target.value })} />
      </Field>
      <Field label="Under the title (optional)">
        <input type="text" value={card.subtitle ?? ""} onChange={(e) => set({ ...card, subtitle: e.target.value || undefined })} />
      </Field>
      <Field label="Line at the foot of the front (optional)">
        <input type="text" value={card.front ?? ""} placeholder="e.g. Romans 12:8" onChange={(e) => set({ ...card, front: e.target.value || undefined })} />
      </Field>
      <p className="hint">Back of the card, top to bottom:</p>
      {card.back.map((p, k) => (
        <div className="card-part" key={k}>
          <div className="row">
            <Field label="Label">
              <input type="text" value={p.label} aria-label={`Card ${n + 1} back part ${k + 1} label`} onChange={(e) => set({ ...card, back: card.back.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
            </Field>
            <button type="button" className="btn btn--ghost" aria-label={`Remove back part ${k + 1}`} onClick={() => set({ ...card, back: card.back.filter((_, j) => j !== k) })}>Remove</button>
          </div>
          <textarea className="data-textarea" rows={2} value={p.text} aria-label={`Card ${n + 1} back part ${k + 1} text`} onChange={(e) => set({ ...card, back: card.back.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn" onClick={() => set({ ...card, back: [...card.back, { label: "", text: "" }] })}>+ Add a part to the back</button>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost" disabled={n === 0} aria-label={`Move card ${n + 1} up`} onClick={() => shift(-1)}>↑</button>
        <button type="button" className="btn btn--ghost" disabled={n === count - 1} aria-label={`Move card ${n + 1} down`} onClick={() => shift(1)}>↓</button>
        <button type="button" className="btn btn--ghost" onClick={duplicate}>Duplicate</button>
        <button type="button" className="btn btn--ghost" onClick={remove}>Remove card</button>
      </div>
    </details>
  );
}

export function CardSheetEditor({ value, onChange }: { value: CardSheetContent | undefined; onChange: (c: CardSheetContent) => void }) {
  const c: CardSheetContent = value ?? { cards: [] };
  const [opened, setOpened] = useState<number | null>(null);
  const setCards = (cards: CardContent[]) => onChange({ ...c, cards });
  const pages = cardSheetPages(c);
  return (
    <div className="card-sheet-editor" data-testid="card-sheet-editor">
      <p className="hint">
        {c.cards.length} card{c.cards.length === 1 ? "" : "s"} · {pages} page{pages === 1 ? "" : "s"}
        {c.doubleSided === false ? " (fronts only)" : " (each page of fronts, then its page of backs)"}. Dashed lines and trim marks show where to cut.
      </p>
      <div className="row">
        <Select<"4" | "6" | "8">
          label="Cards per page"
          value={String(cardsPerSheet(c)) as "4" | "6" | "8"}
          options={[{ value: "4", label: "4 (2 × 2)" }, { value: "6", label: "6 (2 × 3)" }, { value: "8", label: "8 (2 × 4)" }]}
          onChange={(v) => onChange({ ...c, perSheet: Number(v) as 4 | 6 | 8 })}
        />
        <Select<"box" | "none">
          label="Picture space on the front"
          value={c.frontArt ?? "box"}
          options={[{ value: "box", label: "A framed box" }, { value: "none", label: "None" }]}
          onChange={(v) => onChange({ ...c, frontArt: v === "box" ? undefined : v })}
        />
      </div>
      {(c.frontArt ?? "box") === "box" && (
        <Field label="Label in the picture box (optional)">
          <input type="text" value={c.artLabel ?? ""} placeholder="e.g. Draw it!" onChange={(e) => onChange({ ...c, artLabel: e.target.value || undefined })} />
        </Field>
      )}
      <Check label="Print a back for each card (double-sided)" checked={c.doubleSided !== false} onChange={(on) => onChange({ ...c, doubleSided: on ? undefined : false })} />
      {c.doubleSided !== false && (
        <Select<"long-edge" | "short-edge">
          label="When printing both sides, the printer flips on the"
          value={c.flip ?? "long-edge"}
          options={[{ value: "long-edge", label: "Long edge (usual)" }, { value: "short-edge", label: "Short edge" }]}
          onChange={(v) => onChange({ ...c, flip: v === "long-edge" ? undefined : v })}
        />
      )}
      {c.cards.map((card, i) => (
        <CardFields
          key={i}
          card={card}
          n={i}
          count={c.cards.length}
          open={opened === i}
          set={(next) => setCards(c.cards.map((x, j) => (j === i ? next : x)))}
          remove={() => setCards(c.cards.filter((_, j) => j !== i))}
          shift={(d) => setCards(move(c.cards, i, d))}
          duplicate={() => { setCards([...c.cards.slice(0, i + 1), structuredClone(card), ...c.cards.slice(i + 1)]); setOpened(i + 1); }}
        />
      ))}
      <button type="button" className="btn" onClick={() => { setCards([...c.cards, newCard(c.cards)]); setOpened(c.cards.length); }}>+ Add a card</button>
    </div>
  );
}
