/**
 * Cover Studio panels for children's pages and coloring books: the saved cast with reference images (also the
 * coloring book cover's "Interior characters" gallery), coloring style with a small visual sample, scene batches
 * (paste or import, split, edit, per-scene overrides), page layout with a live space estimate, per-scene review,
 * suggested-direction cards, and comparing the finished cover with the interior references.
 */
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { CastMember, Complexity, CoverBrief, LineThickness, PageOutput, Scene } from "../../engines/cover/brief";
import {
  COLORING_COVER_CARDS, COMPLEXITY, COVER_CARDS, LINE_THICKNESS, PAGE_OUTPUTS, TEXT_PLACEMENTS, applyColoringCard as applyColoringCardTo, applyCoverCard, castFor, coloringCardOf, referenceImages, scenePrompt, spaceEstimate, splitScenes,
} from "../../engines/cover/coloring";
import { importArtwork, useArtworkUrl } from "../../engines/artwork/store";
import { extractDocumentText } from "../../engines/import/documentText";
import { newId } from "../../presets/products/projectFactory";
import type { ArtworkAsset } from "../../types/artwork";
import { Check, Field } from "../editor/ui";

type Set_ = (patch: Partial<CoverBrief>) => void;
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export function RefThumb({ id, name, size = 72 }: { id?: string; name?: string; size?: number }) {
  const { url, missing } = useArtworkUrl(id ?? "none");
  return (
    <span className="art-thumb cast-thumb" style={{ width: size, height: size }} title={name}>
      {id && url ? <img src={url} alt={name ?? ""} /> : <span className="hint">{id ? (missing ? "Not on this device" : "…") : "No image"}</span>}
    </span>
  );
}

/** Upload an image (kept on this device, like product artwork) and report its id and file name. */
function ImageButton({ label, onImage, testId }: { label: string; onImage: (a: ArtworkAsset) => void; testId?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = await importArtwork(f);
    if (r.ok) {
      setErr(null);
      onImage(r.asset);
    } else setErr(r.error);
  };
  return (
    <>
      <input ref={ref} type="file" accept={IMAGE_ACCEPT} hidden onChange={pick} data-testid={testId} />
      <button type="button" className="btn" onClick={() => ref.current?.click()}>{label}</button>
      {err && <span className="hint" role="alert">{err}</span>}
    </>
  );
}

/**
 * The saved cast. As the coloring book cover's "Interior characters" gallery (`selecting`), each character is chosen
 * for the cover beside its image; the whole cast is chosen by default.
 */
export function CastPanel({ brief, set, selecting = false, productImages = [] }: { brief: CoverBrief; set: Set_; selecting?: boolean; productImages?: { asset: ArtworkAsset; product: string }[] }) {
  const setMember = (id: string, patch: Partial<CastMember>) => set({ cast: brief.cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const selected = brief.castSelected.length ? brief.castSelected : brief.cast.map((c) => c.id);
  const toggle = (id: string, on: boolean) => set({ castSelected: on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id) });
  const add = () => {
    const c: CastMember = { id: newId("c"), name: `Character ${brief.cast.length + 1}`, description: "", traits: "" };
    set({ cast: [...brief.cast, c], castSelected: [...selected, c.id] });
  };
  return (
    <div className="cast-panel" data-testid={selecting ? "interior-characters" : "cast-panel"}>
      {selecting && (
        <p className="hint">
          {brief.cast.length
            ? "The characters saved with this collection for its interior pages. The cover uses only the ones ticked, and names their reference images to attach."
            : "No interior characters saved yet. Add them under Children’s Character Illustrations → Cast, or here."}
        </p>
      )}
      <ul className="cast-list">
        {brief.cast.map((c) => (
          <li key={c.id} className="cast-card" data-cast={c.name}>
            <RefThumb id={brief.useGroupRef ? brief.groupRefId : c.refId} name={brief.useGroupRef ? brief.groupRefName : c.refName} />
            <div className="cast-card__body">
              {selecting ? (
                <label className="check cast-card__pick">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} aria-label={`Use ${c.name} on the cover`} />
                  <strong>{c.name}</strong>
                </label>
              ) : (
                <label className="field"><span>Name</span><input value={c.name} onChange={(e) => setMember(c.id, { name: e.target.value })} aria-label="Character name" /></label>
              )}
              {!selecting && (
                <>
                  <label className="field"><span>Who they are and how they look</span><textarea rows={2} value={c.description} onChange={(e) => setMember(c.id, { description: e.target.value })} aria-label={`${c.name}: description`} /></label>
                  <label className="field"><span>Always keep (face, hair texture, proportions, distinctive traits)</span><input value={c.traits} onChange={(e) => setMember(c.id, { traits: e.target.value })} aria-label={`${c.name}: traits`} /></label>
                </>
              )}
              {selecting && c.description && <span className="hint">{c.description}</span>}
              <div className="row">
                <ImageButton label={c.refId ? "Replace reference image" : "Add reference image"} onImage={(a) => setMember(c.id, { refId: a.id, refName: a.name })} testId={`ref-${c.name}`} />
                {productImages.length > 0 && (
                  <select aria-label={`${c.name}: approved image from a product`} value="" onChange={(e) => { const p = productImages.find((x) => x.asset.id === e.target.value); if (p) setMember(c.id, { refId: p.asset.id, refName: p.asset.name }); }}>
                    <option value="">Use an approved image from a product…</option>
                    {productImages.map((p) => <option key={p.asset.id} value={p.asset.id}>{p.product}: {p.asset.name}</option>)}
                  </select>
                )}
                {c.refName && <span className="hint">{c.refName}</span>}
              </div>
              <details className="cast-changes">
                <summary>Changes for this image (pose, expression, outfit, hairstyle)</summary>
                <div className="cover-two">
                  {(["pose", "expression", "outfit", "hairstyle"] as const).map((k) => (
                    <label key={k} className="field"><span>{k[0].toUpperCase() + k.slice(1)}</span><input value={c[k] ?? ""} placeholder="Unchanged" onChange={(e) => setMember(c.id, { [k]: e.target.value || undefined })} aria-label={`${c.name}: ${k}`} /></label>
                  ))}
                </div>
                <p className="hint">Facial features, hair texture, proportions and distinctive traits are always kept.</p>
              </details>
              {!selecting && <button type="button" className="btn btn--ghost" onClick={() => set({ cast: brief.cast.filter((x) => x.id !== c.id), castSelected: selected.filter((x) => x !== c.id) })}>Remove {c.name}</button>}
            </div>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="btn" onClick={add}>Add a character</button>
        <ImageButton label={brief.groupRefId ? "Replace group image" : "Add an approved group image"} onImage={(a) => set({ groupRefId: a.id, groupRefName: a.name })} testId="ref-group" />
      </div>
      {brief.groupRefId && (
        <div className="row">
          <RefThumb id={brief.groupRefId} name={brief.groupRefName} size={56} />
          <Check label="Use the group image instead of each character's own" checked={brief.useGroupRef} onChange={(useGroupRef) => set({ useGroupRef })} />
        </div>
      )}
      <Check label="Keep interior characters consistent" checked={brief.keepConsistent} onChange={(keepConsistent) => set({ keepConsistent })} />
    </div>
  );
}

/** A small sample of the line thickness and the illustration complexity (not the artwork itself). */
export function LineSample({ thickness, complexity }: { thickness: LineThickness; complexity: Complexity }) {
  const w = LINE_THICKNESS.find((x) => x.value === thickness)!.pt * 1.4;
  const petals = complexity === "Simple" ? 5 : complexity === "Moderate" ? 8 : 12;
  const extra = complexity === "Detailed";
  return (
    <svg className="line-sample" viewBox="0 0 120 120" width="96" height="96" role="img" aria-label={`Sample: ${thickness} lines, ${complexity}`} data-sample={`${thickness}-${complexity}`}>
      <rect x="1" y="1" width="118" height="118" fill="#fff" stroke="#ddd" />
      {Array.from({ length: petals }, (_, i) => {
        const a = (i / petals) * Math.PI * 2;
        return <ellipse key={i} cx={60 + Math.cos(a) * 24} cy={56 + Math.sin(a) * 24} rx={complexity === "Simple" ? 16 : 11} ry={complexity === "Simple" ? 10 : 7} transform={`rotate(${(a * 180) / Math.PI} ${60 + Math.cos(a) * 24} ${56 + Math.sin(a) * 24})`} fill="none" stroke="#111" strokeWidth={w} />;
      })}
      <circle cx="60" cy="56" r={complexity === "Simple" ? 12 : 9} fill="none" stroke="#111" strokeWidth={w} />
      {extra && Array.from({ length: 6 }, (_, i) => <circle key={i} cx={56 + (i % 3) * 4} cy={53 + Math.floor(i / 3) * 5} r="1.2" fill="none" stroke="#111" strokeWidth={w * 0.6} />)}
      <path d="M60 80 Q58 98 62 116" fill="none" stroke="#111" strokeWidth={w} />
      {complexity !== "Simple" && <path d="M61 96 Q72 88 80 92 Q70 100 61 98" fill="none" stroke="#111" strokeWidth={w} />}
      {extra && <path d="M60 104 Q48 96 40 100 Q50 108 60 106" fill="none" stroke="#111" strokeWidth={w} />}
    </svg>
  );
}

const STYLE_DEFAULTS_KEY = "dove-product-studio:v1:coloring-style-defaults";
type StyleDefaults = Record<string, Pick<CoverBrief, "coloringStyle" | "lineThickness" | "complexity">>;
export function styleDefaults(): StyleDefaults {
  try {
    return JSON.parse(localStorage.getItem(STYLE_DEFAULTS_KEY) ?? "{}") as StyleDefaults;
  } catch {
    return {};
  }
}

/** Coloring style (outline or hybrid), line thickness and complexity: the collection's defaults, saveable per style. */
export function ColoringStyleControls({ brief, set }: { brief: CoverBrief; set: Set_ }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="coloring-style" data-testid="coloring-style">
      <Seg label="Coloring pages" value={brief.coloringStyle} options={[{ value: "outline", label: "Black outlines on white" }, { value: "hybrid", label: "Hybrid · colored accents only" }]} onChange={(coloringStyle) => set({ coloringStyle })} />
      <p className="hint">
        {brief.coloringStyle === "hybrid"
          ? "The palette is used only for the page border and small accents; every shape children color stays white."
          : "Interior pages are black line art on white. The cover can still be full color."}
      </p>
      <div className="coloring-style__row">
        <div>
          <Seg label="Line thickness" value={brief.lineThickness} options={LINE_THICKNESS.map((x) => ({ value: x.value, label: x.label }))} onChange={(lineThickness) => set({ lineThickness })} />
          <Seg label="Illustration complexity" value={brief.complexity} options={COMPLEXITY.map((x) => ({ value: x.value, label: x.label }))} onChange={(complexity) => set({ complexity })} />
        </div>
        <LineSample thickness={brief.lineThickness} complexity={brief.complexity} />
      </div>
      <p className="hint">These are the collection's defaults; any scene can override them.</p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          try {
            localStorage.setItem(STYLE_DEFAULTS_KEY, JSON.stringify({ ...styleDefaults(), [brief.style]: { coloringStyle: brief.coloringStyle, lineThickness: brief.lineThickness, complexity: brief.complexity } }));
            setSaved(true);
          } catch {
            /* storage unavailable */
          }
        }}
      >
        Save as defaults for “{brief.style}”
      </button>
      {saved && <span className="hint" role="status"> Saved: choosing this style again starts from these.</span>}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} style={{ minHeight: 44 }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Scene batches: paste or import (.docx, .txt, .md), edit, split into scenes, then edit each scene and its overrides. */
export function ScenesPanel({ brief, set, say }: { brief: CoverBrief; set: Set_; say: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const setScene = (id: string, patch: Partial<Scene>) => set({ scenes: brief.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.(docx|txt|md|markdown)$/i.test(f.name)) return say("Scenes can be imported from a Word (.docx), text (.txt) or Markdown (.md) file.");
    setReading(true);
    try {
      const doc = await extractDocumentText(f);
      set({ sceneSource: (brief.sceneSource.trim() ? brief.sceneSource.trimEnd() + "\n\n" : "") + doc.text });
      say(`Imported “${f.name}”. Check the text, then choose Split into scenes.`);
    } catch (err) {
      say(err instanceof Error ? err.message : "The file couldn't be read.");
    } finally {
      setReading(false);
    }
  };
  const split = () => {
    const scenes = splitScenes(brief.sceneSource, () => newId("s"));
    if (!scenes.length) return say("No scenes found: paste the scenes, one per numbered heading or separated by a blank line.");
    if (brief.scenes.length && !window.confirm(`Replace the ${brief.scenes.length} scene${brief.scenes.length === 1 ? "" : "s"} below with ${scenes.length} from the text?`)) return;
    set({ scenes });
    say(`${scenes.length} scene${scenes.length === 1 ? "" : "s"} ready.`);
  };
  return (
    <div className="scenes-panel" data-testid="scenes-panel">
      <Field label="Scenes (paste, or import a file)">
        <textarea rows={8} value={brief.sceneSource} aria-label="Scenes text" placeholder={"1. The first rehearsal\nThe three dancers stretch at the barre…\n\n2. Opening night\n…"} onChange={(e) => set({ sceneSource: e.target.value })} />
      </Field>
      <div className="row">
        <input ref={fileRef} type="file" accept=".docx,.txt,.md,.markdown,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={importFile} data-testid="scenes-import" />
        <button type="button" className="btn" disabled={reading} onClick={() => fileRef.current?.click()}>{reading ? "Reading…" : "Import .docx, .txt or .md"}</button>
        <button type="button" className="btn btn--primary" onClick={split}>Split into scenes</button>
      </div>
      <p className="hint">Scenes are split at numbered headings (“1.”, “Scene 2:”, “## 3”) or, without them, at blank lines. Every scene uses the saved cast, reference images and collection settings unless it says otherwise below.</p>
      <ol className="scene-list">
        {brief.scenes.map((s, i) => (
          <li key={s.id} className="scene-card" data-scene={i + 1}>
            <label className="field"><span>Scene {i + 1} title</span><input value={s.title} onChange={(e) => setScene(s.id, { title: e.target.value })} aria-label={`Scene ${i + 1} title`} /></label>
            <label className="field"><span>What happens</span><textarea rows={3} value={s.text} onChange={(e) => setScene(s.id, { text: e.target.value })} aria-label={`Scene ${i + 1} text`} /></label>
            {brief.cast.length > 0 && (
              <div className="field">
                <span className="field-label">Characters in this scene</span>
                <div className="row">
                  {brief.cast.map((c) => {
                    const on = !s.castIds || s.castIds.includes(c.id);
                    return (
                      <label key={c.id} className="check">
                        <input type="checkbox" checked={on} onChange={(e) => { const cur = s.castIds ?? brief.cast.map((x) => x.id); setScene(s.id, { castIds: e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id) }); }} />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="cover-two scene-overrides">
              <label className="field"><span>Line thickness</span>
                <select value={s.lineThickness ?? ""} aria-label={`Scene ${i + 1} line thickness`} onChange={(e) => setScene(s.id, { lineThickness: (e.target.value || undefined) as LineThickness | undefined })}>
                  <option value="">Collection default ({brief.lineThickness})</option>
                  {LINE_THICKNESS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Complexity</span>
                <select value={s.complexity ?? ""} aria-label={`Scene ${i + 1} complexity`} onChange={(e) => setScene(s.id, { complexity: (e.target.value || undefined) as Complexity | undefined })}>
                  <option value="">Collection default ({brief.complexity})</option>
                  {COMPLEXITY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
              <label className="field"><span>Page type</span>
                <select value={s.output ?? ""} aria-label={`Scene ${i + 1} page type`} onChange={(e) => setScene(s.id, { output: (e.target.value || undefined) as PageOutput | undefined })}>
                  <option value="">Collection default</option>
                  {PAGE_OUTPUTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
              <LineSample thickness={s.lineThickness ?? brief.lineThickness} complexity={s.complexity ?? brief.complexity} />
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => set({ scenes: brief.scenes.filter((x) => x.id !== s.id) })}>Remove scene {i + 1}</button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => set({ scenes: [...brief.scenes, { id: newId("s"), title: `Scene ${brief.scenes.length + 1}`, text: "" }] })}>Add a scene</button>
    </div>
  );
}

/** Page output type, text placement and illustration coverage, with the live estimate of space left. */
export function LayoutPanel({ brief, set }: { brief: CoverBrief; set: Set_ }) {
  const est = spaceEstimate(brief);
  return (
    <div className="layout-panel" data-testid="layout-panel">
      <div className="field">
        <span className="field-label">Page type (the collection default; scenes can choose their own)</span>
        <div className="output-cards" role="radiogroup" aria-label="Page type">
          {PAGE_OUTPUTS.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={brief.output === o.value} className={`cover-category${brief.output === o.value ? " cover-category--on" : ""}`} data-output={o.value} onClick={() => set({ output: o.value })}>
              <strong>{o.label}</strong>
              <span className="hint">{o.blurb}</span>
            </button>
          ))}
        </div>
      </div>
      <Field label="Text placement">
        <select value={brief.textPlacement} aria-label="Text placement" onChange={(e) => set({ textPlacement: e.target.value as CoverBrief["textPlacement"] })}>
          {TEXT_PLACEMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <label className="field art-slider">
        <span className="field-label">Illustration coverage <span className="hint">{brief.coverage}% of the safe area</span></span>
        <input type="range" min={20} max={100} step={5} value={brief.coverage} aria-label="Illustration coverage" onChange={(e) => set({ coverage: Number(e.target.value) })} />
      </label>
      <p className={`notice${est.ok ? "" : " notice--warn"}`} data-testid="space-estimate" aria-live="polite">{est.summary}</p>
      {brief.output === "coloring-page" && (
        <div className="cover-two">
          <Field label="Bible translation">
            <select value={brief.translation} aria-label="Bible translation" onChange={(e) => set({ translation: e.target.value })}>
              {["NIV", "KJV", "WEB", "ESV", "NLT", "NKJV", "CSB"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <Check label="Verse wording and permission verified" checked={brief.verseVerified} onChange={(verseVerified) => set({ verseVerified })} />
          </div>
        </div>
      )}
      {brief.output === "coloring-page" && !brief.verseVerified && <p className="hint">Until the verse is verified, the prompt leaves room for it and asks for no verse words. The verse itself is typeset in Product Studio.</p>}
    </div>
  );
}

/** Step 6 for scenes: preview or copy one scene's prompt, or copy them all. */
export function SceneReview({ brief, copy, onEdit }: { brief: CoverBrief; copy: (t: string) => void; onEdit: () => void }) {
  const [open, setOpen] = useState<string | null>(brief.scenes[0]?.id ?? null);
  const prompts = useMemo(() => brief.scenes.map((s, i) => scenePrompt(brief, s, i)), [brief]);
  if (!brief.scenes.length) return <p className="hint">No scenes yet. <button type="button" className="btn btn--ghost" onClick={onEdit}>Add scenes</button></p>;
  return (
    <div className="scene-review" data-testid="scene-review">
      <ol className="scene-list">
        {brief.scenes.map((s, i) => {
          const cast = castFor(brief, s.castIds);
          return (
            <li key={s.id} className="scene-card" data-scene-review={i + 1}>
              <div className="scene-card__head">
                <strong>{i + 1}. {s.title}</strong>
                <span className="hint">
                  {(s.output ? PAGE_OUTPUTS.find((x) => x.value === s.output)!.label : PAGE_OUTPUTS.find((x) => x.value === brief.output)!.label)} · {s.lineThickness ?? brief.lineThickness} lines · {s.complexity ?? brief.complexity}
                  {cast.length ? ` · ${cast.map((c) => c.name).join(", ")}` : ""}
                </span>
              </div>
              <div className="row">
                <button type="button" className="btn" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide prompt" : "Preview prompt"}</button>
                <button type="button" className="btn" onClick={() => copy(prompts[i])} data-testid={`copy-scene-${i + 1}`}>Copy scene {i + 1}</button>
              </div>
              {open === s.id && <pre className="cover-prompt" data-testid={`scene-prompt-${i + 1}`}>{prompts[i]}</pre>}
              {referenceImages(brief, cast).length > 0 && <p className="hint">Attach: {referenceImages(brief, cast).join(", ")}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Clickable "Suggested cover directions" before the cover form. */
export function ColoringCoverCards({ brief, set }: { brief: CoverBrief; set: (b: CoverBrief) => void }) {
  const on = coloringCardOf(brief);
  return (
    <div className="field">
      <span className="field-label">Suggested cover directions</span>
      <div className="direction-cards" role="group" aria-label="Suggested cover directions">
        {COLORING_COVER_CARDS.map((c) => (
          <button key={c.id} type="button" className={`cover-category${on === c.id ? " cover-category--on" : ""}`} aria-pressed={on === c.id} data-card={c.id} onClick={() => set(applyColoringCardTo(brief, c.id))}>
            <strong>{c.title}</strong>
            <span className="hint">{c.blurb}</span>
          </button>
        ))}
      </div>
      <p className="hint">A direction fills the fields below; anything you have typed yourself is kept.</p>
    </div>
  );
}

export function CoverCards({ brief, onApply }: { brief: CoverBrief; onApply: (b: CoverBrief, direction: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">Suggested cover directions</span>
      <div className="direction-cards" role="group" aria-label="Suggested cover directions">
        {COVER_CARDS.map((c) => (
          <button key={c.id} type="button" className={`cover-category${brief.style === c.style ? " cover-category--on" : ""}`} aria-pressed={brief.style === c.style} data-card={c.id} onClick={() => { const r = applyCoverCard(brief, c.id); if (r) onApply(r.brief, r.direction); }}>
            <strong>{c.title}</strong>
            <span className="hint">{c.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compare the finished cover with the interior references, and approve it by hand. */
export function ApprovePanel({ brief, set }: { brief: CoverBrief; set: Set_ }) {
  const cast = castFor(brief);
  return (
    <div className="cover-panel" data-testid="approve-panel">
      <div className="cover-panel__top"><div><div className="eyebrow">Before you use it</div><h2>Compare and approve</h2></div></div>
      <p className="hint">Add the finished cover from the image generator and check it against the interior references: same faces, hair, proportions and distinctive traits.</p>
      <div className="compare">
        <figure>
          <RefThumb id={brief.finishedCoverId} name={brief.finishedCoverName} size={160} />
          <figcaption>Finished cover</figcaption>
        </figure>
        {(brief.useGroupRef && brief.groupRefId ? [{ id: "group", name: "Group", refId: brief.groupRefId, refName: brief.groupRefName }] : cast).map((c) => (
          <figure key={c.id}>
            <RefThumb id={c.refId} name={c.refName} size={96} />
            <figcaption>{c.name}</figcaption>
          </figure>
        ))}
      </div>
      <div className="row">
        <ImageButton label={brief.finishedCoverId ? "Replace finished cover" : "Add the finished cover"} onImage={(a) => set({ finishedCoverId: a.id, finishedCoverName: a.name, coverApproved: undefined })} testId="finished-cover" />
        <Check label="Approved: the cover matches the interior characters" checked={!!brief.coverApproved} onChange={(v) => set({ coverApproved: v ? new Date().toISOString() : undefined })} />
      </div>
      {brief.coverApproved && <p className="hint" role="status">Approved {new Date(brief.coverApproved).toLocaleDateString()}.</p>}
    </div>
  );
}
