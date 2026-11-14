/**
 * Cover Studio panels for children's pages and coloring books: the saved cast with reference images (also the
 * coloring book cover's "Interior characters" gallery), coloring style with a small visual sample, scene batches
 * (paste or import, split, edit, per-scene overrides), page layout with a live space estimate, per-scene review,
 * suggested-direction cards, and comparing the finished cover with the interior references.
 */
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { CastMember, Complexity, CoverBrief, LineThickness, PageOutput, Scene } from "../../engines/cover/brief";
import {
  BACKGROUND_DENSITY, COLORING_AREAS, COLORING_COVER_CARDS, COMPLEXITY, COVER_CARDS, DETAIL_LEVELS, ILLUSTRATION_STYLES, LINE_THICKNESS, PAGE_OUTPUTS, PROPORTIONS, TEXT_PLACEMENTS,
  applyColoringCard as applyColoringCardTo, applyCoverCard, castDesignPrompt, castFor, coloringCardOf, letteredVerse, referenceFiles, sceneBlocker, scenePrompt, spaceEstimate, splitScenes, verseArtBlocker,
} from "../../engines/cover/coloring";
import { getArtworkFile, importArtwork, useArtworkUrl } from "../../engines/artwork/store";
import { effectivePpi, ppiAdvice } from "../../engines/artwork/place";
import { artRegion, assembleColoringBook, isPageCanvas, pageCanvas } from "../../engines/cover/assemble";
import { geometryFor, resolveDocument, solvePage } from "../../engines/document/resolve";
import { useFontLoader } from "../../utils/useFontLoader";
import { PageThumb } from "../preview/PageThumb";
import { FONT_CHOICES } from "./fonts";
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
 * The collection's character registry: every recurring character with what makes them recognisable (age, face,
 * hair, hair accessories, proportions, signature clothing, accessories) and a reference image. As the coloring book
 * cover's "Interior characters" gallery (`selecting`), each character is chosen for the cover beside its image; the
 * whole cast is chosen by default. "Lock established characters" makes the registry read-only.
 */
const REGISTRY: { key: keyof CastMember; label: string; placeholder: string }[] = [
  { key: "age", label: "Approximate age", placeholder: "about 10" },
  { key: "face", label: "Facial features", placeholder: "heart-shaped face, freckles, almond eyes" },
  { key: "hair", label: "Hair texture and hairstyle", placeholder: "long box braids, top half in a bun" },
  { key: "hairAccessories", label: "Hair accessories", placeholder: "gold cuffs on several braids" },
  { key: "proportions", label: "Body proportions", placeholder: "tallest of the three, long arms" },
  { key: "clothing", label: "Signature clothing", placeholder: "short-sleeved leotard, tulle tutu" },
  { key: "accessories", label: "Distinctive accessories", placeholder: "small hoop earrings" },
  { key: "traits", label: "Always keep", placeholder: "the details that must never change" },
];

export function CastPanel({ brief, set, selecting = false, productImages = [], copy }: { brief: CoverBrief; set: Set_; selecting?: boolean; productImages?: { asset: ArtworkAsset; product: string }[]; copy?: (t: string) => void }) {
  const setMember = (id: string, patch: Partial<CastMember>) => set({ cast: brief.cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const selected = brief.castSelected.length ? brief.castSelected : brief.cast.map((c) => c.id);
  const toggle = (id: string, on: boolean) => set({ castSelected: on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id) });
  const locked = brief.castLocked && !selecting;
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
            : "No interior characters saved yet. Add them under Children’s Character Illustrations → Cast & references."}
        </p>
      )}
      {!selecting && brief.cast.length === 0 && (
        <div className="cover-panel" data-testid="cast-design">
          <strong>No characters yet</strong>
          <p className="hint">Scenes need an established cast first. Add each character below, or have them designed: describe who you need, copy the cast-design prompt, then add the sheet you get as the group reference image and fill in each character.</p>
          <label className="field"><span>Who do you need?</span><textarea rows={2} value={brief.characters} aria-label="Who do you need?" placeholder="Three ballet friends, ages 9 to 11, with clearly different hair and personalities." onChange={(e) => set({ characters: e.target.value })} /></label>
          {copy && <button type="button" className="btn" onClick={() => copy(castDesignPrompt(brief))}>Copy cast-design prompt</button>}
        </div>
      )}
      {!selecting && (
        <div className="row cast-switches">
          <Check label="Lock established characters" checked={brief.castLocked} onChange={(castLocked) => set({ castLocked })} />
          <Check label="Use saved character references" checked={brief.useRefs} onChange={(useRefs) => set({ useRefs })} />
        </div>
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
                <label className="field"><span>Name</span><input value={c.name} disabled={locked} onChange={(e) => setMember(c.id, { name: e.target.value })} aria-label="Character name" /></label>
              )}
              {!selecting && (
                <fieldset className="cast-registry" disabled={locked}>
                  <div className="cover-two">
                    {REGISTRY.map((f) => (
                      <label key={f.key} className="field"><span>{f.label}</span><input value={(c[f.key] as string | undefined) ?? ""} placeholder={f.placeholder} onChange={(e) => setMember(c.id, { [f.key]: e.target.value || (f.key === "traits" ? "" : undefined) })} aria-label={`${c.name}: ${f.label.toLowerCase()}`} /></label>
                    ))}
                  </div>
                  <label className="field"><span>Other notes</span><textarea rows={2} value={c.description} onChange={(e) => setMember(c.id, { description: e.target.value })} aria-label={`${c.name}: description`} /></label>
                </fieldset>
              )}
              {selecting && <span className="hint">{[c.age, c.hair, c.hairAccessories, c.clothing].filter(Boolean).join(" · ") || c.description}</span>}
              <div className="row">
                {!locked && <ImageButton label={c.refId ? "Replace reference image" : "Add reference image"} onImage={(a) => setMember(c.id, { refId: a.id, refName: a.name })} testId={`ref-${c.name}`} />}
                {!locked && productImages.length > 0 && (
                  <select aria-label={`${c.name}: approved image from a product`} value="" onChange={(e) => { const p = productImages.find((x) => x.asset.id === e.target.value); if (p) setMember(c.id, { refId: p.asset.id, refName: p.asset.name }); }}>
                    <option value="">Use an approved image from a product…</option>
                    {productImages.map((p) => <option key={p.asset.id} value={p.asset.id}>{p.product}: {p.asset.name}</option>)}
                  </select>
                )}
                {c.refName && <span className="hint">{c.refName}</span>}
              </div>
              {selecting && (
                <details className="cast-changes">
                  <summary>Changes on the cover (pose, expression, outfit, hairstyle)</summary>
                  <div className="cover-two">
                    {(["pose", "expression", "outfit", "hairstyle"] as const).map((k) => (
                      <label key={k} className="field"><span>{k[0].toUpperCase() + k.slice(1)}</span><input value={c[k] ?? ""} placeholder="Unchanged" onChange={(e) => setMember(c.id, { [k]: e.target.value || undefined })} aria-label={`${c.name}: ${k}`} /></label>
                    ))}
                  </div>
                  <p className="hint">Facial features, hair texture, proportions and distinctive traits are always kept.</p>
                </details>
              )}
              {!selecting && !locked && <button type="button" className="btn btn--ghost" onClick={() => set({ cast: brief.cast.filter((x) => x.id !== c.id), castSelected: selected.filter((x) => x !== c.id) })}>Remove {c.name}</button>}
            </div>
          </li>
        ))}
      </ul>
      {locked && <p className="hint" role="status">Characters are locked: every scene reuses them exactly. Untick “Lock established characters” to edit them.</p>}
      <div className="row">
        {!locked && <button type="button" className="btn" onClick={add}>Add a character</button>}
        {!locked && <ImageButton label={brief.groupRefId ? "Replace group image" : "Add an approved group image"} onImage={(a) => set({ groupRefId: a.id, groupRefName: a.name })} testId="ref-group" />}
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

/**
 * The reference images, as files: "Copy image" puts the image itself on the clipboard (paste it into ChatGPT's
 * message box), "Download references" saves every file to attach. A link can't carry images, so this is how they
 * actually reach the image generator.
 */
export function ReferenceFiles({ brief, cast, say }: { brief: CoverBrief; cast: CastMember[]; say: (m: string) => void }) {
  const files = referenceFiles(brief, cast);
  if (!brief.useRefs) return <p className="hint">Saved references are off: the prompt uses the written descriptions only, which can't guarantee identical characters.</p>;
  if (!files.length) return <p className="hint">No reference images saved: add them under Cast & references. Without them, the characters can drift between scenes.</p>;
  const blobOf = async (id: string) => getArtworkFile(id);
  const copyImage = async (f: { id: string; name: string }) => {
    try {
      const blob = await blobOf(f.id);
      if (!blob) return say(`${f.name} isn't on this device.`);
      const png = blob.type === "image/png" ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      say(`${f.name} copied as an image: paste it into ChatGPT's message box with the prompt.`);
    } catch {
      say("This browser can't copy images. Use Download references and attach the files.");
    }
  };
  const downloadAll = async () => {
    for (const f of files) {
      const blob = await blobOf(f.id);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return (
    <div className="ref-files" data-testid="reference-files">
      <span className="field-label">Reference images to attach</span>
      <div className="row">
        {files.map((f) => (
          <span key={f.id} className="attach-item">
            <RefThumb id={f.id} name={f.name} size={48} />
            <button type="button" className="btn" onClick={() => void copyImage(f)} data-testid={`copy-ref-${f.who}`}>Copy image: {f.who}</button>
          </span>
        ))}
        <button type="button" className="btn" onClick={() => void downloadAll()}>Download references</button>
      </div>
    </div>
  );
}

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("png"))), "image/png"));
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
      <div className="cover-two">
        <Pick label="Illustration style" value={brief.illustrationStyle} options={[...ILLUSTRATION_STYLES]} onChange={(illustrationStyle) => set({ illustrationStyle })} />
        <Pick label="Character proportions" value={brief.proportions} options={[...PROPORTIONS]} onChange={(proportions) => set({ proportions })} />
        <Pick label="Hair and clothing detail" value={brief.hairClothingDetail} options={[...DETAIL_LEVELS]} onChange={(hairClothingDetail) => set({ hairClothingDetail })} />
        <Pick label="Background density" value={brief.backgroundDensity} options={BACKGROUND_DENSITY.map((x) => x.value)} onChange={(backgroundDensity) => set({ backgroundDensity })} />
        <Pick label="Coloring-area size" value={brief.coloringArea} options={COLORING_AREAS.map((x) => x.value)} onChange={(coloringArea) => set({ coloringArea })} />
      </div>
      <p className="hint">These are the collection's defaults; any scene can override line thickness and complexity. Fonts and text placement are set under Page layout and used only when Product Studio assembles the pages, never in the image prompt.</p>
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

function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {[...new Set([value, ...options])].map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
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
            <details className="cast-changes scene-text">
              <summary>Page text (added by Product Studio)</summary>
              <div className="cover-two">
                <label className="field"><span>Page title</span><input value={s.pageTitle ?? ""} placeholder={s.title} onChange={(e) => setScene(s.id, { pageTitle: e.target.value || undefined })} aria-label={`Scene ${i + 1} page title`} /></label>
                <label className="field"><span>Scripture reference</span><input value={s.scriptureRef ?? ""} placeholder={brief.scripture || "Proverbs 31:25"} onChange={(e) => setScene(s.id, { scriptureRef: e.target.value || undefined })} aria-label={`Scene ${i + 1} Scripture reference`} /></label>
              </div>
              <label className="field"><span>Verse wording ({brief.translation}; used once verified)</span><textarea rows={2} value={s.verseText ?? ""} onChange={(e) => setScene(s.id, { verseText: e.target.value || undefined })} aria-label={`Scene ${i + 1} verse wording`} /></label>
              <label className="field"><span>Who adds the Scripture</span>
                <select value={s.scriptureMode ?? ""} aria-label={`Scene ${i + 1} Scripture`} onChange={(e) => setScene(s.id, { scriptureMode: (e.target.value || undefined) as Scene["scriptureMode"] })}>
                  <option value="">Collection default ({brief.scriptureMode === "art" ? "drawn into the artwork" : "Product Studio"})</option>
                  <option value="page">Product Studio (editable text)</option>
                  <option value="art">Drawn into the artwork (Scripture coloring page)</option>
                </select>
              </label>
              {(s.output ?? brief.output) === "worksheet" && <label className="field"><span>Lesson text</span><textarea rows={2} value={s.lessonText ?? ""} onChange={(e) => setScene(s.id, { lessonText: e.target.value || undefined })} aria-label={`Scene ${i + 1} lesson text`} /></label>}
            </details>
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
      <Seg label="Who adds the Scripture" value={brief.scriptureMode} options={[{ value: "page", label: "Product Studio (editable text)" }, { value: "art", label: "Drawn into the artwork" }]} onChange={(scriptureMode) => set({ scriptureMode })} />
      <p className="hint">
        {brief.scriptureMode === "art"
          ? "Scripture coloring pages: the image generator letters each scene's verse in hollow outline letters to color. It does so only once the verse wording is entered for the scene and marked verified; check the spelling in every image."
          : "Product Studio typesets the reference (and the verse wording once verified) as editable text. The image itself has no words."}
      </p>
      <div className="cover-panel">
        <strong>Page typography (Product Studio only)</strong>
        <p className="hint">Used when Product Studio assembles the pages. It never goes into an image prompt.</p>
        <div className="cover-two">
          <Pick label="Title font" value={brief.pageTypography.titleFont} options={FONT_CHOICES} onChange={(titleFont) => set({ pageTypography: { ...brief.pageTypography, titleFont } })} />
          <Pick label="Scripture font" value={brief.pageTypography.scriptureFont} options={FONT_CHOICES} onChange={(scriptureFont) => set({ pageTypography: { ...brief.pageTypography, scriptureFont } })} />
          <Pick label="Text alignment" value={brief.pageTypography.align} options={["left", "center", "right"]} onChange={(align) => set({ pageTypography: { ...brief.pageTypography, align: align as "left" | "center" | "right" } })} />
          <Pick label="Title size (pt)" value={String(brief.pageTypography.titleSizePt)} options={["18", "20", "24", "28", "32", "36"]} onChange={(v) => set({ pageTypography: { ...brief.pageTypography, titleSizePt: Number(v) } })} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => set({ product: "Workbook", size: "8.5×11", format: "front", bleed: 0, safe: 0.25, gutter: 0.5, dpi: 300 })}>Coloring book page: 8.5 × 11 in, 300 DPI, 0.25 in margins, 0.5 in gutter</button>
      </div>
    </div>
  );
}

const CHECKS: { key: string; label: string }[] = [
  { key: "faces", label: "Same faces and skin tones as the references" },
  { key: "hair", label: "Same hairstyles and hair accessories" },
  { key: "clothing", label: "Same signature clothing and accessories" },
  { key: "proportions", label: "Same ages and body proportions" },
  { key: "activity", label: "Shows this scene's activity" },
  { key: "clean", label: "No text, banners, frames or boxes; black outlines on white" },
  { key: "age", label: "Appropriate for the audience" },
];

/**
 * Step 6 for scenes: for each scene, the prompt (preview, copy, regenerate keeping the characters), the reference
 * images to attach, the generated illustration (with its size checked), previews of the artwork alone and of the
 * page Product Studio assembles, the character consistency check, and approval. Scenes are approved in order.
 */
export function SceneReview({ brief, set, copy, say, onEdit, onAssemble }: { brief: CoverBrief; set: Set_; copy: (t: string) => void; say: (m: string) => void; onEdit: () => void; onAssemble?: () => void }) {
  const [open, setOpen] = useState<string | null>(brief.scenes[0]?.id ?? null);
  const blocked = sceneBlocker(brief);
  const prompts = useMemo(() => (blocked ? [] : brief.scenes.map((s, i) => (verseArtBlocker(brief, s) ? "" : scenePrompt(brief, s, i)))), [brief, blocked]);
  if (!brief.scenes.length) return <p className="hint">No scenes yet. <button type="button" className="btn btn--ghost" onClick={onEdit}>Add scenes</button></p>;
  const setScene = (id: string, patch: Partial<Scene>) => set({ scenes: brief.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const firstOpen = brief.scenes.findIndex((s) => !s.approvedAt);
  const approved = brief.scenes.filter((s) => s.approvedAt).length;
  return (
    <div className="scene-review" data-testid="scene-review">
      {blocked && <p className="notice notice--warn" role="status">{blocked}</p>}
      <ol className="scene-list">
        {brief.scenes.map((s, i) => {
          const cast = castFor(brief, s.castIds);
          const waiting = firstOpen >= 0 && i > firstOpen;
          return (
            <li key={s.id} className={`scene-card${s.approvedAt ? " scene-card--approved" : ""}`} data-scene-review={i + 1}>
              <div className="scene-card__head">
                <strong>{i + 1}. {s.title}{s.approvedAt ? " · Approved" : ""}</strong>
                <span className="hint">
                  {PAGE_OUTPUTS.find((x) => x.value === (s.output ?? brief.output))!.label} · {s.lineThickness ?? brief.lineThickness} lines · {s.complexity ?? brief.complexity}
                  {cast.length ? ` · ${cast.map((c) => c.name).join(", ")}` : ""}{s.attempts ? ` · attempt ${s.attempts + 1}` : ""}
                </span>
              </div>
              {!blocked && (
                <div className="row">
                  <button type="button" className="btn" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Close" : "Open scene"}</button>
                  <button type="button" className="btn" disabled={!prompts[i]} onClick={() => copy(prompts[i])} data-testid={`copy-scene-${i + 1}`}>Copy scene {i + 1}</button>
                </div>
              )}
              {!blocked && verseArtBlocker(brief, s) && <p className="hint" role="status">Scene {i + 1}: {verseArtBlocker(brief, s)}</p>}
              {open === s.id && !blocked && prompts[i] && (
                <div className="scene-work">
                  <pre className="cover-prompt" data-testid={`scene-prompt-${i + 1}`}>{prompts[i]}</pre>
                  <ReferenceFiles brief={brief} cast={cast} say={say} />
                  <Regenerate scene={s} onRegenerate={(notes) => {
                    const next = { ...s, attempts: (s.attempts ?? 0) + 1, rejectNotes: notes || undefined, illustrationId: undefined, illustrationName: undefined, illustrationW: undefined, illustrationH: undefined, checks: undefined, approvedAt: undefined };
                    setScene(s.id, next);
                    copy(scenePrompt(brief, next, i));
                  }} />
                  {waiting ? (
                    <p className="hint" role="status">Approve scene {firstOpen + 1} before this one.</p>
                  ) : (
                    <IllustrationCheck brief={brief} scene={s} index={i} cast={cast} setScene={(patch) => setScene(s.id, patch)} onNext={() => setOpen(brief.scenes[i + 1]?.id ?? null)} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {onAssemble && (
        <div className="cover-panel" data-testid="assemble">
          <strong>Page assembly in Product Studio</strong>
          <p className="hint">{approved} of {brief.scenes.length} scenes approved. Product Studio places each approved illustration and adds the editable titles, Scripture, fonts, margins, gutter and page numbers; export the print-ready PDF from there.</p>
          <button type="button" className="btn btn--primary" disabled={approved < brief.scenes.length} onClick={onAssemble}>Send to Product Studio</button>
        </div>
      )}
    </div>
  );
}

function Regenerate({ scene, onRegenerate }: { scene: Scene; onRegenerate: (notes: string) => void }) {
  const [notes, setNotes] = useState(scene.rejectNotes ?? "");
  return (
    <details className="cast-changes">
      <summary>Regenerate this scene, keeping the characters</summary>
      <label className="field"><span>What was wrong (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="What was wrong" placeholder="e.g. her hair cuffs were missing" /></label>
      <button type="button" className="btn" onClick={() => onRegenerate(notes)}>Copy regeneration prompt</button>
    </details>
  );
}

/** The generated illustration: its size checked, previewed alone and on the assembled page, compared with the references, approved. */
function IllustrationCheck({ brief, scene, index, cast, setScene, onNext }: { brief: CoverBrief; scene: Scene; index: number; cast: CastMember[]; setScene: (p: Partial<Scene>) => void; onNext: () => void }) {
  const [view, setView] = useState<"art" | "page">("page");
  const [showSafe, setShowSafe] = useState(true);
  const canvas = pageCanvas(brief);
  const exact = isPageCanvas(brief, scene.illustrationW, scene.illustrationH);
  const region = useMemo(() => artRegion(brief, scene), [brief, scene]);
  const fit = scene.illustrationW && scene.illustrationH ? (exact ? { w: canvas.trimW, h: canvas.trimH } : (() => { const k = Math.min(region.rect.w / scene.illustrationW!, region.rect.h / scene.illustrationH!); return { w: scene.illustrationW! * k, h: scene.illustrationH! * k }; })()) : null;
  const ppi = fit ? ppiAdvice(effectivePpi({ widthPx: scene.illustrationW!, heightPx: scene.illustrationH! }, { x: 0, y: 0, ...fit })) : null;
  const checks = scene.checks ?? {};
  const items = letteredVerse(brief, scene) ? [...CHECKS, { key: "verse", label: "The verse is spelled exactly, word for word" }] : CHECKS;
  const allChecked = items.every((c) => checks[c.key]);
  return (
    <div className="illustration-check" data-testid={`illustration-${index + 1}`}>
      <div className="row">
        <ImageButton label={scene.illustrationId ? "Replace illustration" : "Add the generated illustration"} onImage={(a) => setScene({ illustrationId: a.id, illustrationName: a.name, illustrationW: a.widthPx, illustrationH: a.heightPx, checks: undefined, approvedAt: undefined })} testId={`illustration-upload-${index + 1}`} />
        {scene.illustrationName && <span className="hint">{scene.illustrationName}</span>}
      </div>
      {scene.illustrationId && (
        <>
          <p className={`hint${exact ? "" : " art-ppi--soft"}`} data-testid={`illustration-size-${index + 1}`}>
            {scene.illustrationW} × {scene.illustrationH} px.{" "}
            {exact
              ? `The page canvas exactly (${canvas.pxW} × ${canvas.pxH}): it fills the page.`
              : `Not the ${canvas.pxW} × ${canvas.pxH} page canvas: it is placed whole and in proportion inside the illustration area (never stretched or cropped), clear of the text and the binding gutter.`}{" "}
            {ppi?.text}
          </p>
          <div className="segmented" role="group" aria-label="Preview">
            <button type="button" aria-pressed={view === "art"} style={{ minHeight: 44 }} onClick={() => setView("art")}>Artwork without text</button>
            <button type="button" aria-pressed={view === "page"} style={{ minHeight: 44 }} onClick={() => setView("page")}>Assembled page with text</button>
          </div>
          <Check label="Show text-safe space" checked={showSafe} onChange={setShowSafe} />
          <AssembledPreview brief={brief} scene={scene} withText={view === "page"} showSafe={showSafe} />
          <div className="compare" data-testid={`compare-${index + 1}`}>
            <figure><RefThumb id={scene.illustrationId} name={scene.illustrationName} size={140} /><figcaption>This illustration</figcaption></figure>
            {(brief.useRefs && brief.useGroupRef && brief.groupRefId ? [{ id: "g", name: "Group", refId: brief.groupRefId, refName: brief.groupRefName }] : cast.filter((c) => c.refId && brief.useRefs)).map((c) => (
              <figure key={c.id}><RefThumb id={c.refId} name={c.refName} size={90} /><figcaption>{c.name}</figcaption></figure>
            ))}
          </div>
          <fieldset className="consistency" aria-label="Character consistency check">
            <legend>Character consistency check</legend>
            <p className="hint">Product Studio can't compare images automatically yet: check each point against the references by eye.</p>
            {items.map((c) => (
              <Check key={c.key} label={c.label} checked={!!checks[c.key]} onChange={(v) => setScene({ checks: { ...checks, [c.key]: v }, approvedAt: undefined })} />
            ))}
          </fieldset>
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={!allChecked || !!scene.approvedAt} onClick={() => { setScene({ approvedAt: new Date().toISOString() }); onNext(); }}>{scene.approvedAt ? "Approved" : "Approve scene and continue"}</button>
            {scene.approvedAt && <button type="button" className="btn btn--ghost" onClick={() => setScene({ approvedAt: undefined })}>Undo approval</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The page as Product Studio assembles it, drawn by the studio's own page renderer (what the PDF prints): with or
 * without its text, and optionally the text-safe space (where the text sits) and the binding gutter outlined.
 */
export function AssembledPreview({ brief, scene, withText, showSafe }: { brief: CoverBrief; scene: Scene; withText: boolean; showSafe: boolean }) {
  const asset: ArtworkAsset | null = scene.illustrationId ? { id: scene.illustrationId, name: scene.illustrationName ?? "", mime: "image/png", widthPx: scene.illustrationW ?? 1, heightPx: scene.illustrationH ?? 1, hasAlpha: false, bytes: 0, addedAt: "" } : null;
  const doc = useMemo(() => resolveDocument(assembleColoringBook(brief, [scene], asset ? [asset] : [])), [brief, scene]);
  useFontLoader(doc.typography.fonts, [brief.pageTypography.titleFont, brief.pageTypography.scriptureFont]);
  const index = doc.recipe.pages.findIndex((p) => !p.filler);
  const g = geometryFor(doc, doc.recipe.pages[index], index);
  const texts = solvePage(doc, index).nodes.filter((n) => n.type === "text") as { rect: { x: number; y: number; w: number; h: number } }[];
  const heightPx = 420;
  const k = heightPx / (g.mediaHeightIn * 96);
  const box = (r: { x: number; y: number; w: number; h: number }, cls: string, key: string) => (
    <div key={key} className={cls} style={{ left: (g.trimOffset.x + r.x) * 96 * k, top: (g.trimOffset.y + r.y) * 96 * k, width: r.w * 96 * k, height: r.h * 96 * k }} />
  );
  const gutterLeft = g.side !== "verso";
  return (
    <div className={`assembled-preview${withText ? "" : " assembled-preview--art"}`} data-testid="assembled-preview" style={{ height: heightPx, width: g.mediaWidthIn * 96 * k }}>
      <PageThumb doc={doc} index={index} heightPx={heightPx} />
      {showSafe && (
        <div className="assembled-preview__overlay" aria-hidden="true">
          {texts.map((t, j) => box(t.rect, "safe-text", `t${j}`))}
          {box({ x: gutterLeft ? 0 : g.trimWidthIn - brief.gutter, y: 0, w: brief.gutter, h: g.trimHeightIn }, "safe-gutter", "gutter")}
        </div>
      )}
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
