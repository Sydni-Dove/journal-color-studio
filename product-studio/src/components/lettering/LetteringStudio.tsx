/**
 * BUBBLE LETTERING — make coloring-page lettering (black outline, white inside), or copy the look of a piece already
 * made: upload it (or pick a picture already in Product Studio), say what it reads, and Product Studio measures it
 * (size, letter height and width, outline, spacing or overlap, line spacing, roundness). The measurements become
 * adjustable settings and can be saved as a lettering style; new words are drawn the same way, at the same size.
 * Export as SVG or a 300 DPI PNG, or put it on a page of a COPY of a project (finished projects are never changed).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Font } from "opentype.js";
import { DEFAULT_STYLE, describe, layoutLettering, letteringSvg, measureLettering, pngSize, PRINT_DPI, styleFrom, type LetteringStyle, type Measurement } from "../../engines/lettering/bubble";
import { download, letteringPng, loadLetteringFont, pixelsToPng, readPixels } from "../../engines/lettering/browser";
import { respaceLettering, type RespaceReport } from "../../engines/lettering/respace";
import { deleteStyle, listStyles, saveStyle } from "../../engines/lettering/styles";
import { pagesOf, placeOnCopy, type LetteringPosition } from "../../engines/lettering/place";
import { getArtworkFile, importArtwork } from "../../engines/artwork/store";
import { newId } from "../../presets/products/projectFactory";
import type { ProductProject } from "../../types/project";
import type { ProjectSummary } from "../../persistence/projectStore";
import { RefThumb } from "../cover/ColoringPanels";

/** A picture already in Product Studio (a project's artwork or a coloring book's), offered as a sample. */
export type StudioPicture = { id: string; name: string; from: string };

type Props = {
  onBack: () => void;
  projects: ProjectSummary[];
  loadProject: (id: string) => ProductProject | null;
  pictures: StudioPicture[];
  /** A new copy of a project with the lettering on it: saved and opened. */
  onPlaced: (p: ProductProject) => void;
};

function Num({ label, value, min, max, step, unit, onChange, testId, hint }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; testId?: string; hint?: string }) {
  return (
    <label className="field lettering-num">
      <span>{label}</span>
      <div className="row">
        <input type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, value))} onChange={(e) => onChange(Number(e.target.value))} aria-label={`${label} slider`} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} aria-label={label} data-testid={testId} />
        <span className="hint">{unit}</span>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function LetteringStudio({ onBack, projects, loadProject, pictures, onPlaced }: Props) {
  const [font, setFont] = useState<Font | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [style, setStyle] = useState<LetteringStyle>(DEFAULT_STYLE);
  const [styles, setStyles] = useState<LetteringStyle[]>(() => listStyles());
  const [words, setWords] = useState("Jesus Loves Me");
  const [message, setMessage] = useState<string | null>(null);
  // The sample being copied
  const [sample, setSample] = useState<{ blob: Blob; name: string; url: string; widthPx: number; heightPx: number } | null>(null);
  const [sampleText, setSampleText] = useState("");
  const [dpi, setDpi] = useState(PRINT_DPI);
  const [measured, setMeasured] = useState<Measurement | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPictures, setShowPictures] = useState(false);
  const [white, setWhite] = useState(false);
  const [sameSize, setSameSize] = useState(true);
  // Placing on a page
  const [projectId, setProjectId] = useState("");
  const [pageKey, setPageKey] = useState("");
  const [position, setPosition] = useState<LetteringPosition>("top");
  const fileRef = useRef<HTMLInputElement>(null);
  // Fixing the sample's own spacing
  const [respaced, setRespaced] = useState<{ url: string; blob: Blob; report: RespaceReport; gapIn: number; dpi: number; widthPx: number; heightPx: number } | null>(null);
  const [respacing, setRespacing] = useState(false);
  const [placeWhat, setPlaceWhat] = useState<"drawn" | "respaced">("drawn");

  useEffect(() => {
    loadLetteringFont().then(setFont, () => setFontError("The lettering font couldn't load. Check the connection and reopen Bubble Lettering."));
  }, []);
  const say = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage((x) => (x === m ? null : x)), 6000);
  };
  const set = (patch: Partial<LetteringStyle>) => setStyle((s) => ({ ...s, ...patch }));
  const drawStyle = useMemo(() => (sameSize ? style : { ...style, canvas: undefined }), [style, sameSize]);
  const layout = useMemo(() => (font && words.trim() ? layoutLettering(font, words, drawStyle) : null), [font, words, drawStyle]);
  const svg = useMemo(() => (layout ? letteringSvg(layout, { background: white ? "white" : "none" }) : ""), [layout, white]);
  const fileBase = (words.split(/\s+/).slice(0, 4).join("-").replace(/[^A-Za-z0-9-]+/g, "") || "lettering").toLowerCase();

  const useSample = (blob: Blob, name: string) => {
    void readPixels(blob).then(({ widthPx, heightPx }) => {
      if (sample) URL.revokeObjectURL(sample.url);
      setSample({ blob, name, url: URL.createObjectURL(blob), widthPx, heightPx });
      setMeasured(null);
      setRespaced(null);
    }, () => say("That file couldn't be read as an image."));
  };
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) useSample(f, f.name);
  };
  const pickStudio = async (p: StudioPicture) => {
    const blob = await getArtworkFile(p.id);
    if (!blob) return say("That picture isn't on this device.");
    useSample(blob, p.name);
    setShowPictures(false);
  };
  const measure = async () => {
    if (!sample || !font) return;
    setBusy(true);
    try {
      const { pixels, scale } = await readPixels(sample.blob);
      const m = measureLettering(pixels);
      // Measured on a scaled-down copy: the resolution scales with it, so inches stay true.
      const s = styleFrom(font, m, { id: newId("style"), name: `Copied from ${sample.name}`, dpi: dpi * scale, text: sampleText.trim() || undefined, sourceName: sample.name });
      setMeasured(m);
      setStyle({ ...s, measured: m, source: { ...s.source!, widthPx: sample.widthPx, heightPx: sample.heightPx, dpi } });
      if (sampleText.trim()) setWords(sampleText.trim());
      say("Measured. The settings below now match the sample. Adjust anything, then type your own words.");
    } catch (err) {
      say(err instanceof Error ? err.message : "The image couldn't be measured.");
    } finally {
      setBusy(false);
    }
  };
  /** Separate the sample's letters and set them `gapIn` apart (null: keep the sample's own typical gap). */
  const respace = async (gapIn: number | null) => {
    if (!sample) return;
    setRespacing(true);
    try {
      // Full size up to 4000 px on the long side, so the outline stays crisp.
      const { pixels, scale } = await readPixels(sample.blob, 4000);
      const pxPerIn = dpi * scale;
      const first = gapIn === null ? respaceLettering(pixels, 0, { text: sampleText }) : null;
      const gap = gapIn ?? +((first!.report.originalGapPx || pxPerIn * 0.08) / pxPerIn).toFixed(3);
      const r = respaceLettering(pixels, Math.max(0, Math.round(gap * pxPerIn)), { text: sampleText.trim() || undefined, background: white ? "white" : "none" });
      const blob = await pixelsToPng(r.pixels);
      setRespaced((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { url: URL.createObjectURL(blob), blob, report: r.report, gapIn: gap, dpi: pxPerIn, widthPx: r.pixels.width, heightPx: r.pixels.height };
      });
    } catch (err) {
      say(err instanceof Error ? err.message : "The letters couldn't be separated.");
    } finally {
      setRespacing(false);
    }
  };
  const d = measured ? describe(measured, dpi * (measured.widthPx / (sample?.widthPx || measured.widthPx))) : null;

  const save = () => {
    const name = window.prompt("Name this lettering style", style.name === DEFAULT_STYLE.name ? "My bubble style" : style.name)?.trim();
    if (!name) return;
    const s = { ...style, id: style.id === DEFAULT_STYLE.id ? newId("style") : style.id, name, createdAt: style.createdAt ?? new Date().toISOString() };
    try {
      setStyles(saveStyle(s));
      setStyle(s);
      say(`Saved “${name}”. Choose it any time under Lettering style.`);
    } catch {
      say("This browser's storage is full, so the style couldn't be saved.");
    }
  };

  const project = useMemo(() => (projectId ? loadProject(projectId) : null), [projectId, loadProject]);
  const pages = useMemo(() => (project ? pagesOf(project) : []), [project]);
  const place = async () => {
    if (!layout || !project) return;
    const pg = pages.find((p) => `${p.item}#${p.nth}` === pageKey) ?? pages[0];
    if (!pg) return;
    const useRespaced = placeWhat === "respaced" && respaced;
    const png = useRespaced ? respaced.blob : await letteringPng(layout, { background: "none" });
    const r = await importArtwork(Object.assign(png, { name: useRespaced ? `${sample?.name.replace(/\.\w+$/, "") ?? "lettering"}-respaced.png` : `${fileBase}.png` }));
    if (!r.ok) return say(r.error);
    const size = useRespaced ? { widthIn: respaced.widthPx / respaced.dpi, heightIn: respaced.heightPx / respaced.dpi } : { widthIn: layout.widthIn, heightIn: layout.heightIn };
    const copy = placeOnCopy(project, r.asset, { item: pg.item, nth: pg.nth }, position, size, { w: pg.safeWidthIn, h: pg.safeHeightIn }, newId("lettering"));
    onPlaced(copy);
  };

  const px = layout ? pngSize(layout) : null;
  return (
    <div className="cover-studio lettering-studio" data-testid="lettering-studio">
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Home</button>
        <div className="brand"><span className="brand-mark">D</span><span>Bubble Lettering</span></div>
        <span className="spacer" />
      </header>
      {message && <div className="update-banner" role="status"><span>{message}</span></div>}
      {fontError && <div className="notice notice--warn" role="alert">{fontError}</div>}
      <div className="page-shell lettering-grid">
        <div className="lettering-col">
          <section className="cover-panel" data-testid="lettering-copy">
            <h2 className="book-h">1 · Copy a lettering style (optional)</h2>
            <p className="hint">Upload bubble lettering that's already made, or pick a picture already in Product Studio. Product Studio measures it so your new words come out the same way, at the same size.</p>
            <div className="row">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} data-testid="lettering-sample-file" />
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Upload a lettering image</button>
              <button type="button" className="btn" disabled={!pictures.length} onClick={() => setShowPictures((v) => !v)} aria-expanded={showPictures}>Pick a picture in Product Studio ({pictures.length})</button>
            </div>
            {showPictures && (
              <div className="lettering-pictures" data-testid="studio-pictures">
                {pictures.map((p) => (
                  <button key={p.id} type="button" className="lettering-picture" onClick={() => void pickStudio(p)} title={`${p.name} · ${p.from}`}>
                    <RefThumb id={p.id} name={p.name} size={84} />
                    <span className="hint">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {sample && (
              <div className="lettering-sample">
                <img src={sample.url} alt={`Sample: ${sample.name}`} />
                <div className="lettering-sample__fields">
                  <p className="hint">{sample.name} · {sample.widthPx} × {sample.heightPx} px</p>
                  <label className="field">
                    <span>What does it say? (one line per line)</span>
                    <textarea rows={2} value={sampleText} onChange={(e) => setSampleText(e.target.value)} placeholder={"Jesus\nLoves Me"} data-testid="lettering-sample-text" />
                    <span className="hint">Needed to measure overlapping letters; recommended always.</span>
                  </label>
                  <label className="field">
                    <span>Its resolution</span>
                    <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} aria-label="Sample resolution">
                      {[72, 150, 200, 300, 600].map((v) => <option key={v} value={v}>{v} DPI{v === 300 ? " (print, usual)" : ""}</option>)}
                    </select>
                    <span className="hint">At {dpi} DPI it is {(sample.widthPx / dpi).toFixed(2)} × {(sample.heightPx / dpi).toFixed(2)} in.</span>
                  </label>
                  <button type="button" className="btn btn--primary" disabled={!font || busy} onClick={() => void measure()} data-testid="lettering-measure">{busy ? "Measuring…" : "Measure this lettering"}</button>
                </div>
              </div>
            )}
            {d && (
              <table className="lettering-measured" data-testid="lettering-measured">
                <tbody>
                  <tr><th>Overall size</th><td>{d.sizeIn.w} × {d.sizeIn.h} in ({measured!.widthPx} × {measured!.heightPx} px measured)</td></tr>
                  <tr><th>Lines</th><td>{d.lines} (separate shapes per line: {d.pieces.join(", ")})</td></tr>
                  <tr><th>Letter height</th><td>{d.letterHeightIn} in (outline to outline)</td></tr>
                  <tr><th>Letter width</th><td>{d.letterWidthIn !== null ? `${d.letterWidthIn} in (a typical separate letter)` : "Not measurable: every letter touches its neighbour"}</td></tr>
                  <tr><th>Outline thickness</th><td>{d.outlinePt} pt</td></tr>
                  <tr><th>Spacing between letters</th><td>{d.gapIn !== null ? `${d.gapIn} in between separate letters` : "The letters overlap"}{style.spacingIn < 0 ? ` · overlap ${Math.abs(style.spacingIn).toFixed(2)} in` : ""}</td></tr>
                  <tr><th>Line spacing</th><td>{d.lineGapIn !== null ? `${d.lineGapIn} in between lines` : "One line"}</td></tr>
                  <tr><th>Roundness</th><td>{(style.puffIn * 72).toFixed(1)} pt puff past the letter shapes</td></tr>
                </tbody>
              </table>
            )}
            {sample && (
              <div className="lettering-respace" data-testid="lettering-respace">
                <h3>Fix the spacing of this image</h3>
                <p className="hint">Lifts each letter out exactly as drawn and sets them again with even gaps. Good for art brought back from ChatGPT.</p>
                {!respaced ? (
                  <button type="button" className="btn" disabled={respacing} onClick={() => void respace(null)} data-testid="lettering-respace-start">{respacing ? "Separating…" : "Separate the letters and even the gaps"}</button>
                ) : (
                  <>
                    <Num label="Gap between letters" value={respaced.gapIn} min={0} max={1} step={0.01} unit="in" onChange={(g) => void respace(g)} testId="respace-gap" />
                    <div className="lettering-preview lettering-preview--image"><img src={respaced.url} alt="The lettering with even spacing" data-testid="respaced-image" /></div>
                    <p className="hint" data-testid="respace-report">
                      {respaced.report.pieces.map((n, k) => `Line ${k + 1}: ${n} piece${n === 1 ? "" : "s"}`).join(" · ")}. {respaced.widthPx} × {respaced.heightPx} px.
                    </p>
                    {respaced.report.joined.length > 0 && (
                      <div className="notice notice--warn" role="status" data-testid="respace-joined">
                        <p>{respaced.report.joined.map((j) => `Line ${j.line} has ${j.letters} letters but only ${j.pieces} separate piece${j.pieces === 1 ? "" : "s"}`).join("; ")}: some letters touch, so they can't be pulled apart cleanly and move together.</p>
                        <button type="button" className="btn btn--primary" disabled={!font || busy} onClick={() => void measure()} data-testid="respace-redraw">Redraw the words in the measured style instead</button>
                      </div>
                    )}
                    <div className="row">
                      <button type="button" className="btn btn--primary" onClick={() => download(respaced.blob, `${sample.name.replace(/\.\w+$/, "")}-respaced.png`)} data-testid="respace-download">Download respaced PNG</button>
                      {!respaced.report.joined.length && <button type="button" className="btn" disabled={!font || busy} onClick={() => void measure()}>Redraw in the measured style instead</button>}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="cover-panel" data-testid="lettering-settings">
            <h2 className="book-h">2 · Settings</h2>
            <div className="row">
              <label className="field">
                <span>Lettering style</span>
                <select value={style.id} aria-label="Lettering style" onChange={(e) => { const s = [DEFAULT_STYLE, ...styles].find((x) => x.id === e.target.value); if (s) setStyle(s); }} data-testid="lettering-style">
                  {[DEFAULT_STYLE, ...styles, ...(style.id !== DEFAULT_STYLE.id && !styles.some((s) => s.id === style.id) ? [style] : [])].map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === style.id && !styles.some((x) => x.id === s.id) && s.id !== DEFAULT_STYLE.id ? " (not saved)" : ""}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn--primary" onClick={save} data-testid="lettering-save-style">Save as a lettering style</button>
              {styles.some((s) => s.id === style.id) && <button type="button" className="btn btn--ghost" onClick={() => { if (window.confirm(`Delete the lettering style “${style.name}”?`)) { setStyles(deleteStyle(style.id)); setStyle(DEFAULT_STYLE); } }}>Delete style</button>}
            </div>
            <Num label="Letter height" value={style.capHeightIn} min={0.2} max={4} step={0.01} unit="in" onChange={(capHeightIn) => set({ capHeightIn })} testId="set-height" hint="A capital letter's height before the puff and outline." />
            <Num label="Letter width" value={style.widthScale} min={0.6} max={1.6} step={0.01} unit="× the font's" onChange={(widthScale) => set({ widthScale })} testId="set-width" />
            <Num label="Outline thickness" value={style.outlinePt} min={0.5} max={12} step={0.1} unit="pt" onChange={(outlinePt) => set({ outlinePt })} testId="set-outline" />
            <Num label="Roundness (puff)" value={+(style.puffIn * 72).toFixed(1)} min={0} max={24} step={0.1} unit="pt" onChange={(v) => set({ puffIn: v / 72 })} testId="set-round" hint="How far the letters swell past their shape; corners round as they swell." />
            <Num label="Spacing between letters" value={style.spacingIn} min={-0.5} max={0.5} step={0.005} unit="in" onChange={(spacingIn) => set({ spacingIn })} testId="set-spacing" hint="Below 0 the letters overlap and share one outline." />
            <Num label="Line spacing" value={style.lineGapIn} min={-0.3} max={1.5} step={0.01} unit="in" onChange={(lineGapIn) => set({ lineGapIn })} testId="set-linegap" hint="The gap between one line's outline and the next." />
            <div className="row">
              <label className="field">
                <span>Line alignment</span>
                <select value={style.align} aria-label="Line alignment" onChange={(e) => set({ align: e.target.value as LetteringStyle["align"] })}>
                  <option value="center">Centred</option><option value="left">Left</option><option value="right">Right</option>
                </select>
              </label>
              {style.canvas && (
                <label className="check"><input type="checkbox" checked={sameSize} onChange={(e) => setSameSize(e.target.checked)} /> <span>Same overall size as the sample ({style.canvas.widthIn} × {style.canvas.heightIn} in)</span></label>
              )}
            </div>
          </section>
        </div>

        <div className="lettering-col">
          <section className="cover-panel" data-testid="lettering-make">
            <h2 className="book-h">3 · Your words</h2>
            <label className="field">
              <span>Words (one line per line)</span>
              <textarea rows={3} value={words} onChange={(e) => setWords(e.target.value)} data-testid="lettering-words" />
            </label>
            <div className="lettering-preview" data-testid="lettering-preview" data-size={layout ? `${layout.widthIn.toFixed(2)}x${layout.heightIn.toFixed(2)}` : ""}>
              {svg ? <div dangerouslySetInnerHTML={{ __html: svg.replace(/width="[^"]+in" height="[^"]+in"/, 'width="100%" height="auto"') }} /> : <p className="hint">{font ? "Type some words." : "Loading the lettering font…"}</p>}
            </div>
            {layout && px && <p className="hint" data-testid="lettering-size">{layout.widthIn.toFixed(2)} × {layout.heightIn.toFixed(2)} in · PNG {px.w} × {px.h} px at 300 DPI · black outline, white inside</p>}
            <label className="check"><input type="checkbox" checked={white} onChange={(e) => setWhite(e.target.checked)} /> <span>White background (otherwise transparent around the letters)</span></label>
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={!layout} onClick={() => layout && download(new Blob([svg], { type: "image/svg+xml" }), `${fileBase}.svg`)} data-testid="lettering-svg">Download SVG</button>
              <button type="button" className="btn btn--primary" disabled={!layout} onClick={() => layout && void letteringPng(layout, { background: white ? "white" : "none" }).then((b) => download(b, `${fileBase}.png`))} data-testid="lettering-png">Download PNG (300 DPI)</button>
            </div>
          </section>

          <section className="cover-panel" data-testid="lettering-place">
            <h2 className="book-h">4 · Put it on a page</h2>
            <p className="hint">Product Studio makes a copy of the project (“… (with lettering)”) and adds the lettering there. The project you pick is never changed.</p>
            <label className="field">
              <span>Project</span>
              <select value={projectId} aria-label="Project" onChange={(e) => { setProjectId(e.target.value); setPageKey(""); }} data-testid="lettering-project">
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {project && (
              <>
                <label className="field">
                  <span>Page</span>
                  <select value={pageKey} aria-label="Page" onChange={(e) => setPageKey(e.target.value)} data-testid="lettering-page">
                    {pages.map((p) => <option key={`${p.item}#${p.nth}`} value={`${p.item}#${p.nth}`}>{p.label}</option>)}
                  </select>
                </label>
                {respaced && (
                  <label className="field">
                    <span>What to put on the page</span>
                    <select value={placeWhat} aria-label="What to put on the page" onChange={(e) => setPlaceWhat(e.target.value as "drawn" | "respaced")} data-testid="lettering-place-what">
                      <option value="drawn">The lettering drawn in step 3</option>
                      <option value="respaced">The uploaded image, respaced</option>
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Where on the page</span>
                  <select value={position} aria-label="Where on the page" onChange={(e) => setPosition(e.target.value as LetteringPosition)}>
                    <option value="top">A band across the top (the page's content moves below it)</option>
                    <option value="bottom">A band across the bottom</option>
                    <option value="page">Centred on the page (over the page, like a cover title)</option>
                  </select>
                </label>
                <button type="button" className="btn btn--primary" disabled={!layout} onClick={() => void place()} data-testid="lettering-place-button">Make a copy with the lettering and open it</button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
