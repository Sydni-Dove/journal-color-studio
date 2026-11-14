/**
 * COVER STUDIO — plan the covers of a collection: a brief, an exact production specification from Product Studio's
 * own geometry, five distinct design directions, one finished-cover prompt, and a coordinated set (journal, planner,
 * bookmark, scripture cards…) with a saved library. Product Studio makes no images: the prompt goes to an image
 * generator (ChatGPT) by hand, and the screen says so.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newBrief, withProduct, type CoverBrief, type CoverCollection, type CoverItem } from "../../engines/cover/brief";
import { briefFromProject } from "../../engines/cover/fromProject";
import {
  COVER_BINDINGS, COVER_PRODUCTS, COVER_SIZES, COVER_STATUSES, DIRECTIONS, DPI_CHOICES, GENERIC_STYLE_GUIDE, STARTER_SET, STYLE_GROUPS, STYLE_GUIDES, STYLE_HINT_FALLBACK, isWrapProduct,
} from "../../engines/cover/guides";
import { createBlocker, handoffPrompt, paletteColors, promptBlocker, promptFor, setPrompts, summarizePalette } from "../../engines/cover/prompt";
import { CHATGPT_HOME, launchChatGpt } from "../../engines/cover/launch";
import { fmt, resolveCoverSpec, specLine } from "../../engines/cover/spec";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { COVER_PALETTES } from "../../presets/themes/palettes";
import { newId } from "../../presets/products/projectFactory";
import {
  clearDraft, duplicateAndRecolor, exportCollectionJson, localCoverStore, loadDraft, newCollection, parseCollectionFile, saveDraft, type CoverStore,
} from "../../persistence/coverStore";
import type { ProductProject } from "../../types/project";
import type { ProjectSummary } from "../../persistence/projectStore";
import { PalettePicker } from "../editor/PalettePicker";
import { Field, LabeledNumeric, Section } from "../editor/ui";

type Props = {
  onBack: () => void;
  /** The maker's products: a cover brief can start from one (its trim, binding, printer, pages and palette). */
  projects: ProjectSummary[];
  loadProject: (id: string) => ProductProject | null;
  store?: CoverStore;
};

const TIPS = {
  copied: "Copied to clipboard",
  noCopy: "Copy unavailable in this browser",
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function CoverStudio({ onBack, projects, loadProject, store = localCoverStore }: Props) {
  const draft = useRef(loadDraft()).current;
  const [brief, setBrief] = useState<CoverBrief>(draft?.brief ?? newBrief());
  const [items, setItems] = useState<CoverItem[]>(draft?.items ?? []);
  const [direction, setDirection] = useState(draft?.direction ?? 0);
  const [collectionId, setCollectionId] = useState<string | null>(draft?.collectionId ?? null);
  const [library, setLibrary] = useState(() => store.list());
  const [message, setMessage] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(!!draft?.brief.title);
  const timer = useRef<number | undefined>(undefined);
  const set = (patch: Partial<CoverBrief>) => setBrief((b) => ({ ...b, ...patch }));
  const say = (m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3500);
  };

  // The brief being worked on survives a reload.
  useEffect(() => {
    const t = window.setTimeout(() => saveDraft({ brief, items, direction, collectionId }), 400);
    return () => window.clearTimeout(t);
  }, [brief, items, direction, collectionId]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const spec = useMemo(() => resolveCoverSpec(brief), [brief]);
  const blocked = promptBlocker(brief);
  const canCreate = createBlocker(brief) === null;
  const prompt = blocked ? null : promptFor(brief, direction);
  const wrapOk = isWrapProduct(brief.product);
  const palette = brief.palette === "custom" ? null : COVER_PALETTES.find((p) => p.id === brief.palette) ?? null;
  const colors = paletteColors(brief);

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => say(TIPS.copied)).catch(() => say(TIPS.noCopy));
  const needTitle = (): boolean => {
    if (!blocked) return false;
    say(blocked);
    document.getElementById("cover-title")?.focus();
    return true;
  };

  const refresh = () => setLibrary(store.list());
  const loadCollection = (c: CoverCollection) => {
    setBrief(c.brief);
    setItems(c.items.map((i) => ({ ...i })));
    setDirection(c.direction);
    setCollectionId(c.id);
    setShowPrompt(!!c.brief.title);
    window.scrollTo({ top: 0 });
  };
  const save = () => {
    if (!brief.collection.trim()) {
      document.getElementById("cover-collection")?.focus();
      return say("Give this collection a name first");
    }
    const existing = collectionId ? store.load(collectionId) : null;
    const c: CoverCollection = existing ? { ...existing, name: brief.collection, brief, items, direction, updatedAt: new Date().toISOString() } : newCollection(brief.collection, brief, items, direction);
    try {
      store.save(c);
      setCollectionId(c.id);
      refresh();
      say("Collection saved");
    } catch {
      say("Save failed: this browser's storage is full or blocked. Export the collection as a backup.");
    }
  };
  const startNew = () => {
    setBrief(newBrief());
    setItems([]);
    setDirection(0);
    setCollectionId(null);
    setShowPrompt(false);
    clearDraft();
  };
  const fromProject = (id: string) => {
    const p = id ? loadProject(id) : null;
    if (!p) return;
    setBrief(briefFromProject(p));
    setCollectionId(null);
    say(`Started from “${p.name}”: size, binding, printer, pages and palette came across.`);
  };

  /** Generate in ChatGPT: a new tab with the full prompt in the message box (not sent). Same guards as before: a title, and a spine for a wrap. */
  const generateInChatGpt = () => {
    if (needTitle()) return;
    const blocker = createBlocker(brief);
    if (blocker) return say(blocker);
    const message = handoffPrompt(brief, direction);
    navigator.clipboard.writeText(message).catch(() => {});
    const result = launchChatGpt(message, (url, target) => window.open(url, target));
    say(
      result === "launched"
        ? "ChatGPT opened with your prompt in the message box. Read it, then press send. (It is also copied: if the box is empty, paste it in.)"
        : result === "too-long"
          ? "This prompt is too long to put in a link. It is copied and ChatGPT is open: paste it into the message box."
          : "Your browser blocked the new tab. The prompt is copied: allow pop-ups for this site, or open ChatGPT yourself and paste it in.",
    );
  };
  const openChatGpt = () => {
    const w = window.open(CHATGPT_HOME, "_blank");
    if (w) w.opener = null;
    else say("Your browser blocked the new tab. Allow pop-ups for this site, or go to chatgpt.com yourself.");
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      loadCollection(parseCollectionFile(await file.text()));
      say("Collection imported (not saved yet)");
    } catch (e) {
      say(e instanceof Error ? e.message : "This file is not a valid collection backup.");
    }
  };

  return (
    <div className="cover-studio">
      <header className="cover-head">
        <button type="button" className="btn btn--ghost" onClick={onBack}>← Back to Product Studio</button>
        <div>
          <div className="eyebrow">Your weekly creation desk</div>
          <h1>Cover Studio</h1>
          <p className="hint">Plan journal covers and coordinated stationery with exact print dimensions, distinct art directions and Etsy-ready notes. Dimensions come from Product Studio's own printer and binding rules.</p>
        </div>
        <div className="cover-head__actions">
          <button type="button" className="btn" onClick={startNew}>New collection</button>
        </div>
      </header>
      {message && <div className="update-banner" role="status"><span>{message}</span></div>}

      <div className="cover-grid">
        <aside className="cover-side">
          <Section title="1 · Collection brief" open>
            {projects.length > 0 && (
              <Field label="Start from one of your products (optional)">
                <select value="" onChange={(e) => fromProject(e.target.value)} aria-label="Start from one of your products">
                  <option value="">Choose a product…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
            <TextField id="cover-collection" label="Collection name" value={brief.collection} placeholder="e.g. Rooted in Hope" onChange={(v) => set({ collection: v })} />
            <div className="cover-two">
              <TextField label="Theme" value={brief.theme} placeholder="Renewal, rest, courage…" onChange={(v) => set({ theme: v })} />
              <TextField label="Season / collection" value={brief.season} placeholder="Spring 2027" onChange={(v) => set({ season: v })} />
            </div>
            <div className="cover-two">
              <TextField label="Audience" value={brief.audience} placeholder="Women in ministry" onChange={(v) => set({ audience: v })} />
              <TextField label="Scripture / phrase" value={brief.scripture} placeholder="Isaiah 40:31" onChange={(v) => set({ scripture: v })} />
            </div>
            <TextField label="Desired imagery" value={brief.imagery} placeholder="Olive branches, dawn light…" onChange={(v) => set({ imagery: v })} />
            <TextField label="Avoid in this collection" value={brief.avoid} onChange={(v) => set({ avoid: v })} hint="Edit this list for your taste. These are blocked unless you specifically request them in Desired imagery." />
            <Field label="Cover style">
              <select value={brief.style} onChange={(e) => set({ style: e.target.value })}>
                {STYLE_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>{g.styles.map((s) => <option key={s}>{s}</option>)}</optgroup>
                ))}
              </select>
            </Field>
            <p className="hint" data-testid="style-hint">{STYLE_GUIDES[brief.style] ?? STYLE_HINT_FALLBACK}</p>

            <div className="field">
              <span className="field-label">Color palette</span>
              {brief.palette === "custom" ? (
                <div className="cover-custom">
                  <div className="cover-two">
                    <ColorField label="Main color" value={brief.colorPrimary} onChange={(v) => set({ colorPrimary: v })} />
                    <ColorField label="Accent color" value={brief.colorAccent} onChange={(v) => set({ colorAccent: v })} />
                    <ColorField label="Background" value={brief.colorPaper} onChange={(v) => set({ colorPaper: v })} />
                    <ColorField label="Text color" value={brief.colorText} onChange={(v) => set({ colorText: v })} />
                  </div>
                  <button type="button" className="btn" onClick={() => set({ palette: "dove-signature" })}>Choose a studio palette instead</button>
                </div>
              ) : (
                <>
                  <PalettePicker value={brief.palette} palettes={COVER_PALETTES} onPick={(id) => set({ palette: id })} />
                  <button type="button" className="btn" onClick={() => {
                    const s = palette ? summarizePalette(palette) : null;
                    if (!s) return;
                    set({ palette: "custom", colorPrimary: s.main, colorAccent: s.accent, colorPaper: s.background, colorText: s.ink });
                  }}>Use custom colors</button>
                </>
              )}
              <div className="cover-hexes" aria-label="Exact colors in the prompt" data-testid="palette-hexes">
                {colors.map((h) => <span key={h} className="cover-hex"><i style={{ background: h }} />{h.toUpperCase()}</span>)}
              </div>
              <p className="hint">
                {brief.palette === "custom" ? "Your own exact hex colors. They are saved with your collection." : palette ? `From ${summarizePalette(palette).group}${summarizePalette(palette).draft ? " (draft, pending designer approval)" : ""}.` : ""}
                {" "}Palettes follow Product Studio's own definitions, which hold a dated copy of the Journal Color Studio ones, not a live sync.
              </p>
            </div>
          </Section>

          <Section title="2 · Product & print setup" open>
            <div className="cover-two">
              <Field label="Product">
                <select value={brief.product} onChange={(e) => setBrief((b) => withProduct(b, e.target.value))}>{COVER_PRODUCTS.map((p) => <option key={p}>{p}</option>)}</select>
              </Field>
              <Field label="Trim size (inches)">
                <select value={brief.size} onChange={(e) => set({ size: e.target.value })}>{COVER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </Field>
            </div>
            {brief.size === "Custom" && (
              <div className="cover-two">
                <LabeledNumeric label="Width (in)" value={brief.customW} step={0.25} rules={{ min: 1, max: 48 }} onCommit={(v) => v !== null && set({ customW: v })} />
                <LabeledNumeric label="Height (in)" value={brief.customH} step={0.25} rules={{ min: 1, max: 48 }} onCommit={(v) => v !== null && set({ customH: v })} />
              </div>
            )}
            <div className="cover-two">
              <Field label="Cover format">
                <select value={wrapOk ? brief.format : "front"} disabled={!wrapOk} onChange={(e) => set({ format: e.target.value === "wrap" ? "wrap" : "front" })}>
                  <option value="front">Front only</option>
                  <option value="wrap">Full wrap</option>
                </select>
              </Field>
              <Field label="Binding">
                <select value={brief.binding} onChange={(e) => set({ binding: e.target.value })}>{COVER_BINDINGS.map((b) => <option key={b}>{b}</option>)}</select>
              </Field>
            </div>
            {!wrapOk && <p className="hint">A full wrap applies to bound books; {brief.product.toLowerCase()} covers are front only.</p>}
            <Field label="Printer">
              <select value={brief.printProfile} onChange={(e) => set({ printProfile: e.target.value })} aria-label="Printer">
                {PRINT_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <div className="cover-two">
              <LabeledNumeric label="Page count" value={brief.pages} step={2} rules={{ min: 0, integer: true, allowEmpty: true }} onCommit={(v) => set({ pages: v })} />
              <LabeledNumeric label="Spine width (in)" value={brief.spine} step={0.001} placeholder="Printer-provided" rules={{ min: 0, max: 6, allowEmpty: true }} onCommit={(v) => set({ spine: v && v > 0 ? v : null })} />
            </div>
            {spec.spineSuggestion && (
              <div className="notice" data-testid="spine-suggestion">
                <p>{spec.spineSuggestion.note}</p>
                <p>For {brief.pages} pages: white paper {fmt(spec.spineSuggestion.white)} in, cream {fmt(spec.spineSuggestion.cream)} in.</p>
                <button type="button" className="btn" onClick={() => set({ spine: spec.spineSuggestion!.white })}>Use the white-paper value</button>{" "}
                <button type="button" className="btn" onClick={() => set({ spine: spec.spineSuggestion!.cream })}>Use the cream-paper value</button>
              </div>
            )}
            <div className="cover-two">
              <LabeledNumeric label="Bleed, each edge (in)" value={brief.bleed} step={0.0625} rules={{ min: 0, max: 1 }} onCommit={(v) => v !== null && set({ bleed: v })} />
              <LabeledNumeric label="Safe zone (in)" value={brief.safe} step={0.05} rules={{ min: 0, max: 2 }} onCommit={(v) => v !== null && set({ safe: v })} />
            </div>
            <div className="cover-two">
              <Field label="Delivery">
                <select value={brief.medium} onChange={(e) => set({ medium: e.target.value === "Digital" ? "Digital" : "Print" })}><option>Print</option><option>Digital</option></select>
              </Field>
              <Field label="Output DPI">
                <select value={brief.dpi} onChange={(e) => set({ dpi: Number(e.target.value) })}>{DPI_CHOICES.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </Field>
            </div>
          </Section>

          <Section title="3 · Cover text & listing" open>
            <div className="cover-two">
              <TextField id="cover-title" label="Cover title" value={brief.title} placeholder="Rooted in Hope" onChange={(v) => set({ title: v })} />
              <TextField label="Subtitle" value={brief.subtitle} placeholder="A prayer journal" onChange={(v) => set({ subtitle: v })} />
            </div>
            <TextField label="Etsy title idea" value={brief.etsyTitle} placeholder="Rooted in Hope Prayer Journal…" onChange={(v) => set({ etsyTitle: v })} />
            <Field label="Description angle"><textarea rows={3} value={brief.angle} placeholder="Who it serves and how they will use it" onChange={(e) => set({ angle: e.target.value })} /></Field>
            <TextField label="Tags / keywords" value={brief.tags} placeholder="prayer journal, faith gift, …" onChange={(v) => set({ tags: v })} />
            <div className="cover-two">
              <Field label="Mockup checklist"><textarea rows={4} value={brief.mockups} onChange={(e) => set({ mockups: e.target.value })} /></Field>
              <Field label="Product status">
                <select value={brief.status} onChange={(e) => set({ status: e.target.value })}>{COVER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </Field>
            </div>
            <div className="cover-actions">
              <button type="button" className="btn btn--primary" onClick={save}>{collectionId ? "Save changes" : "Save collection"}</button>
              <button type="button" className="btn" onClick={() => { setItems((x) => [...x, { id: newId("i"), product: brief.product, size: brief.size, status: brief.status }]); say("Added to collection"); }}>Add item to set</button>
            </div>
            <p className="hint">Saved on this device. Export a backup for another browser.</p>
          </Section>
        </aside>

        <section className="cover-main">
          <div className="cover-panel" data-testid="cover-spec">
            <div className="cover-panel__top">
              <div><div className="eyebrow">Live print specification</div><h2>{spec.product} {spec.wrap ? "full wrap" : "front cover"}</h2></div>
              <span className="badge badge--neutral">{brief.dpi} DPI · {brief.medium}</span>
            </div>
            {spec.ok ? (
              <>
                <div className="cover-spec">
                  <span className="hint">CANVAS SIZE WITH BLEED</span>
                  <strong data-testid="spec-inches">{fmt(spec.canvasW)} × {fmt(spec.canvasH)} in</strong>
                  <div data-testid="spec-pixels"><b>{spec.pxW.toLocaleString()} × {spec.pxH.toLocaleString()} px</b></div>
                  <dl className="cover-spec__grid">
                    <div><dt>Finished trim</dt><dd data-testid="spec-trim">{fmt(spec.trimW)} × {fmt(spec.trimH)} in{spec.wrap ? " per panel" : ""}</dd></div>
                    <div><dt>Bleed</dt><dd data-testid="spec-bleed">{fmt(spec.bleed)} in / edge</dd></div>
                    <div><dt>Safe inset</dt><dd data-testid="spec-safe">{spec.safeText.replace(" inches inside the trim", " in from trim")}</dd></div>
                    {spec.wrap && <div><dt>Spine</dt><dd data-testid="spec-spine">{spec.spine ? `${fmt(spec.spine)} in` : "needs the printer's width"}</dd></div>}
                  </dl>
                  <div className={`notice${spec.needsSpine ? " notice--warn" : ""}`} data-testid="spec-note">{spec.note}</div>
                  {spec.warnings.length > 0 && <ul className="cover-warnings" data-testid="spec-warnings">{spec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                  {spec.keepOuts.length > 0 && (
                    <ul className="cover-warnings" data-testid="spec-keepouts">
                      {spec.keepOuts.map((k) => <li key={k.id}>{k.label}: keep {fmt(k.depthIn)} in clear on the {k.edge} edge.</li>)}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="notice notice--warn" role="alert" data-testid="spec-error">{spec.errors.join(" ")}</div>
            )}
            <div className="cover-actions">
              <button type="button" className="btn btn--primary" onClick={() => (needTitle() ? undefined : setShowPrompt(true))}>Generate directions</button>
              <button type="button" className="btn" disabled={!spec.ok} onClick={() => copy(specLine(brief, spec))}>Copy specs</button>
            </div>
          </div>

          <div className="cover-panel">
            <div className="cover-panel__top"><div><div className="eyebrow">Creative prompt builder</div><h2>Design directions</h2></div><span className="hint">Select one to see the full prompt</span></div>
            <p className="hint" data-testid="cover-style-hint">{STYLE_GUIDES[brief.style] ?? GENERIC_STYLE_GUIDE}</p>
            <div className="cover-directions">
              {DIRECTIONS.map((d, i) => (
                <div key={d[0]} className="cover-direction" data-direction={i}>
                  <strong>{d[0]}</strong>
                  <p>{d[1]}</p>
                  <button type="button" className="btn btn--ghost" aria-pressed={i === direction} onClick={() => { setDirection(i); setShowPrompt(true); }}>{i === direction ? "Selected direction" : "Use this direction"} →</button>
                </div>
              ))}
            </div>
            <h3>Ready-to-use image prompt</h3>
            <pre className="cover-prompt" data-testid="cover-prompt">
              {blocked ? "Add a cover title, then choose Generate directions. The title will never be replaced with “Untitled”." : showPrompt && prompt ? prompt : "Choose Generate directions to see the prompt."}
            </pre>
            <div className="cover-launch" data-testid="cover-launch">
              <div className="cover-launch__option">
                <h4>Generate in ChatGPT</h4>
                <p className="hint">Opens ChatGPT in a new tab with this whole prompt already in the message box. Nothing is sent until you press send.</p>
                <button type="button" className="btn btn--primary" disabled={!canCreate} onClick={generateInChatGpt} data-testid="generate-chatgpt">Generate in ChatGPT ↗</button>
              </div>
              <div className="cover-launch__option">
                <h4>Copy and paste it yourself</h4>
                <p className="hint">Copy the prompt, open ChatGPT, and paste it in. This always works.</p>
                <div className="cover-actions">
                  <button type="button" className="btn" onClick={() => { if (!needTitle() && prompt) copy(prompt); }} data-testid="copy-prompt">Copy prompt</button>
                  <button type="button" className="btn" onClick={openChatGpt} data-testid="open-chatgpt">Open ChatGPT ↗</button>
                  <button type="button" className="btn" onClick={() => { if (!needTitle() && prompt) download("dove-cover-brief.txt", `COLLECTION: ${brief.collection}\n${specLine(brief, spec)}\n\n${prompt}`, "text/plain"); }}>Download brief</button>
                </div>
              </div>
            </div>
            {!canCreate && !blocked && <p className="hint" role="status" data-testid="create-blocker">{createBlocker(brief)}</p>}
            <p className="hint">Product Studio does not make images. “Generate in ChatGPT” uses a link ChatGPT provides for filling its message box; that link is ChatGPT’s, so it can change, and the prompt is also copied each time so you can paste it if the box comes up empty. Review the prompt before sending. Image generators can miss exact text and size: use the specification above to set up the final print file, and proof the title, scripture, bleed and spine with your printer.</p>
          </div>

          <div className="cover-panel">
            <div className="cover-panel__top">
              <div><div className="eyebrow">Etsy weekly collection</div><h2>Coordinated set</h2></div>
              <button type="button" className="btn" onClick={() => setItems(STARTER_SET.map((s) => ({ id: newId("i"), product: s.product, size: s.size, status: "Idea" })))}>Add starter set</button>
            </div>
            {items.length === 0 ? (
              <div className="cover-empty">Add a journal, planner, bookmark, or scripture card to build a matching collection.</div>
            ) : (
              <ul className="cover-items" data-testid="cover-items">
                {items.map((x) => {
                  const s = resolveCoverSpec(brief, x);
                  return (
                    <li key={x.id} className="cover-item">
                      <div>
                        <b>{x.product}</b> <span className="hint">{x.size} in · {x.status}{s.ok ? ` · ${fmt(s.canvasW)} × ${fmt(s.canvasH)} in canvas · ${s.pxW} × ${s.pxH} px` : ""}</span>
                      </div>
                      <div>
                        <button type="button" className="btn" onClick={() => { if (!needTitle()) copy(promptFor(brief, direction, x)); }}>Copy prompt</button>{" "}
                        <button type="button" className="btn" aria-label={`Remove ${x.product}`} onClick={() => setItems((all) => all.filter((y) => y.id !== x.id))}>×</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="cover-actions">
              <button type="button" className="btn btn--primary" onClick={() => { if (needTitle()) return; copy(items.length ? setPrompts(brief, items, direction) : "Add items to the collection first."); }}>Copy set prompts</button>
              <button type="button" className="btn" onClick={() => download("dove-stationery-collection.json", exportCollectionJson({ brief, items, direction }), "application/json")}>Export collection JSON</button>
            </div>
          </div>

          <div className="cover-panel">
            <div className="cover-panel__top">
              <div><div className="eyebrow">Your history</div><h2>Collection library</h2></div>
              <label className="btn">Import JSON<input type="file" accept="application/json" hidden aria-label="Import JSON" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
            {library.length === 0 ? (
              <div className="cover-empty">Saved collections will appear here.</div>
            ) : (
              <div className="cover-library" data-testid="cover-library">
                {library.map((s) => (
                  <div key={s.id} className="cover-direction" data-collection={s.id}>
                    <strong>{s.name || "Unnamed collection"}</strong>
                    <p>{s.theme || "No theme"} · {s.items} items · {new Date(s.updatedAt).toLocaleDateString()}</p>
                    <button type="button" className="btn btn--ghost" onClick={() => { const c = store.load(s.id); if (c) loadCollection(c); }}>Open</button>{" · "}
                    <button type="button" className="btn btn--ghost" onClick={() => {
                      const c = store.load(s.id);
                      if (!c) return;
                      const copyOf = duplicateAndRecolor(c);
                      loadCollection(copyOf);
                      setCollectionId(null);
                      say("A new variant is open. The original is unchanged; save to keep this one.");
                    }}>Duplicate & recolor</button>{" · "}
                    <button type="button" className="btn btn--ghost" onClick={() => { if (window.confirm(`Delete “${s.name || "Unnamed collection"}”?`)) { store.remove(s.id); if (collectionId === s.id) setCollectionId(null); refresh(); } }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, hint }: { id?: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={label} />
    </label>
  );
}

