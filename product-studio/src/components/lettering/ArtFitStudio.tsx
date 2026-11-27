/**
 * FIT ART TO PAGE — any uploaded art (lettering, page borders, frames, coloring art) scaled and centred inside the
 * page margins, never stretched, with the bleed, trim and margin guides shown. Warns when the art was already cut off
 * at the edge of its file (shrinking can't bring that back). A border made of plain lines can be redrawn whole inside
 * the margins; any other border gets an Art Prompt to have it redrawn. Export a 300 DPI page PNG, or put it on a page
 * of a COPY of a project (finished projects are never changed).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { borderPrompt, contentBox, cutEdges, detectFrame, fitArt, frameSvg, pageBoxes, redrawFrame, type Box, type Edge, type Frame, type Margins, type PageSpec } from "../../engines/artfit/fit";
import { rememberPrompt } from "../../engines/prompts/library";
import { download, readPixels } from "../../engines/lettering/browser";
import { pagesOf, placeOnCopy } from "../../engines/lettering/place";
import { getArtworkFile, importArtwork } from "../../engines/artwork/store";
import { newId } from "../../presets/products/projectFactory";
import type { ProductProject } from "../../types/project";
import type { ProjectSummary } from "../../persistence/projectStore";
import { RefThumb } from "../cover/ColoringPanels";
import { Check } from "../editor/ui";
import type { StudioPicture } from "./LetteringStudio";

const SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: "8.5x11", label: "8.5 × 11 in (Letter)", w: 8.5, h: 11 },
  { id: "8x10", label: "8 × 10 in", w: 8, h: 10 },
  { id: "8.5x8.5", label: "8.5 × 8.5 in", w: 8.5, h: 8.5 },
  { id: "6x9", label: "6 × 9 in", w: 6, h: 9 },
  { id: "5.5x8.5", label: "5.5 × 8.5 in", w: 5.5, h: 8.5 },
  { id: "a4", label: "A4 (8.27 × 11.69 in)", w: 8.27, h: 11.69 },
];
const EDGE_WORDS: Record<Edge, string> = { top: "top", bottom: "bottom", left: "left", right: "right" };

type Loaded = { blob: Blob; url: string; name: string; widthPx: number; heightPx: number; scale: number; content: Box | null; cut: Edge[]; frame: Frame | null };

type Props = { onBack: () => void; projects: ProjectSummary[]; loadProject: (id: string) => ProductProject | null; pictures: StudioPicture[]; onPlaced: (p: ProductProject) => void };

function InchInput({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={0} max={3} step={0.0625} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(v); }} aria-label={label} data-testid={testId} />
    </label>
  );
}

export function ArtFitStudio({ onBack, projects, loadProject, pictures, onPlaced }: Props) {
  const [art, setArt] = useState<Loaded | null>(null);
  const [sizeId, setSizeId] = useState("8.5x11");
  const [landscape, setLandscape] = useState(false);
  const [bleed, setBleed] = useState(0);
  const [same, setSame] = useState(true);
  const [margins, setMargins] = useState<Margins>({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
  const [trimSpace, setTrimSpace] = useState(true);
  const [guides, setGuides] = useState({ bleed: true, trim: true, safe: true });
  const [redraw, setRedraw] = useState(false);
  const [showPictures, setShowPictures] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [pageKey, setPageKey] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const say = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage((x) => (x === m ? null : x)), 6000);
  };
  useEffect(() => () => { if (art) URL.revokeObjectURL(art.url); }, [art]);

  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0];
  const page: PageSpec = { trimW: landscape ? size.h : size.w, trimH: landscape ? size.w : size.h, bleed };
  const boxes = pageBoxes(page, margins);
  // The part of the file that is fitted (pixels, full size): the art's own box, or the whole file.
  const src = art ? (trimSpace && art.content ? { x: art.content.x / art.scale, y: art.content.y / art.scale, w: Math.min(art.widthPx, art.content.w / art.scale), h: Math.min(art.heightPx, art.content.h / art.scale) } : { x: 0, y: 0, w: art.widthPx, h: art.heightPx }) : null;
  const fit = src ? fitArt({ w: src.w, h: src.h }, page, margins) : null;
  const frameRects = useMemo(() => (art?.frame && fit && redraw ? redrawFrame(art.frame, page, margins, art.scale / fit.scale) : null), [art, fit?.scale, redraw, page.trimW, page.trimH, page.bleed, margins.top, margins.bottom, margins.left, margins.right]);

  const load = async (blob: Blob, name: string) => {
    try {
      const r = await readPixels(blob);
      setArt({ blob, url: URL.createObjectURL(blob), name, widthPx: r.widthPx, heightPx: r.heightPx, scale: r.scale, content: contentBox(r.pixels), cut: cutEdges(r.pixels), frame: detectFrame(r.pixels) });
      setRedraw(false);
    } catch {
      say("That file couldn't be read as an image.");
    }
  };
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void load(f, f.name);
  };
  const setAll = (v: number) => setMargins({ top: v, bottom: v, left: v, right: v });

  /** The finished page at 300 DPI: white, the art fitted (or the border redrawn). */
  const render = async (): Promise<Blob> => {
    const dpi = 300;
    const c = document.createElement("canvas");
    c.width = Math.round(boxes.media.w * dpi);
    c.height = Math.round(boxes.media.h * dpi);
    const x = c.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, c.width, c.height);
    if (frameRects) {
      const img = new Image();
      img.src = `data:image/svg+xml;base64,${btoa(frameSvg(frameRects, page))}`;
      await img.decode();
      x.drawImage(img, 0, 0, c.width, c.height);
    } else if (art && src && fit) {
      const bmp = await createImageBitmap(art.blob);
      x.imageSmoothingQuality = "high";
      x.drawImage(bmp, src.x, src.y, src.w, src.h, fit.draw.x * dpi, fit.draw.y * dpi, fit.draw.w * dpi, fit.draw.h * dpi);
      bmp.close();
    }
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The PNG couldn't be made."))), "image/png"));
  };
  const fileName = `${(art?.name ?? "art").replace(/\.\w+$/, "")}-fitted.png`;

  const project = useMemo(() => (projectId ? loadProject(projectId) : null), [projectId, loadProject]);
  const pages = useMemo(() => (project ? pagesOf(project) : []), [project]);
  const place = async () => {
    if (!project) return;
    const pg = pages.find((p) => `${p.item}#${p.nth}` === pageKey) ?? pages[0];
    if (!pg) return;
    const r = await importArtwork(Object.assign(await render(), { name: fileName }));
    if (!r.ok) return say(r.error);
    onPlaced(placeOnCopy(project, r.asset, { item: pg.item, nth: pg.nth }, "full", { widthIn: boxes.media.w, heightIn: boxes.media.h }, { w: pg.safeWidthIn, h: pg.safeHeightIn }, newId("fit"), "with fitted art"));
  };

  // Preview: the printed sheet at a screen scale, with the guides.
  const P = 46;
  const ppiLow = fit && !frameRects && fit.ppi < 300;
  return (
    <div className="cover-studio lettering-studio" data-testid="art-fit-studio">
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Home</button>
        <div className="brand"><span className="brand-mark">D</span><span>Fit Art to Page</span></div>
        <span className="spacer" />
      </header>
      {message && <div className="update-banner" role="status"><span>{message}</span></div>}
      <div className="page-shell lettering-grid">
        <div className="lettering-col">
          <section className="cover-panel">
            <h2 className="book-h">1 · The art</h2>
            <p className="hint">Lettering, a page border, a frame or a coloring picture, often brought back from ChatGPT.</p>
            <div className="row">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} data-testid="fit-file" />
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Upload art</button>
              <button type="button" className="btn" disabled={!pictures.length} onClick={() => setShowPictures((v) => !v)} aria-expanded={showPictures}>Pick a picture in Product Studio ({pictures.length})</button>
            </div>
            {showPictures && (
              <div className="lettering-pictures">
                {pictures.map((p) => (
                  <button key={p.id} type="button" className="lettering-picture" title={`${p.name} · ${p.from}`} onClick={async () => { const b = await getArtworkFile(p.id); if (!b) return say("That picture isn't on this device."); setShowPictures(false); void load(b, p.name); }}>
                    <RefThumb id={p.id} name={p.name} size={84} />
                    <span className="hint">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            {art && <p className="hint" data-testid="fit-art-info">{art.name} · {art.widthPx} × {art.heightPx} px{art.content && trimSpace ? ` · the art itself: ${Math.min(art.widthPx, Math.round(art.content.w / art.scale))} × ${Math.min(art.heightPx, Math.round(art.content.h / art.scale))} px` : ""}</p>}
            <Check label="Leave out the empty space around the art (fit the art, not the file)" checked={trimSpace} onChange={setTrimSpace} />
            {art && art.cut.length > 0 && (
              <div className="notice notice--warn" role="alert" data-testid="fit-cut-warning">
                <p>This art was already cut off at the {art.cut.map((e) => EDGE_WORDS[e]).join(", ")} edge{art.cut.length === 1 ? "" : "s"} of the file. Shrinking it to fit the margins can't bring back the part that was cut away: it will show a straight cut edge.</p>
                {art.frame ? (
                  <Check label={`Redraw the border inside the margins (${art.frame.lines.length} line${art.frame.lines.length === 1 ? "" : "s"}, ${art.frame.radiusPx ? "rounded" : "square"} corners, same thickness and spacing)`} checked={redraw} onChange={setRedraw} />
                ) : (
                  <details>
                    <summary>Redraw a border inside the margins (Art Prompt for ChatGPT)</summary>
                    <p className="hint">This border isn't made of plain lines, so it can't be rebuilt from the part that's left. Paste this into ChatGPT with the image, then bring the new border back here.</p>
                    <pre className="cover-prompt" data-testid="fit-border-prompt">{borderPrompt(page, margins)}</pre>
                    <button type="button" className="btn" onClick={() => { rememberPrompt(borderPrompt(page, margins), "Redraw a border inside the margins", "Fit Art to Page"); void navigator.clipboard.writeText(borderPrompt(page, margins)).then(() => say("Copied."), () => say("Copy isn't available in this browser.")); }}>Copy the Art Prompt</button>
                  </details>
                )}
              </div>
            )}
            {art && art.frame && !art.cut.length && <Check label="Redraw the border inside the margins (clean lines at the same thickness and spacing)" checked={redraw} onChange={setRedraw} />}
          </section>

          <section className="cover-panel" data-testid="fit-page">
            <h2 className="book-h">2 · The page</h2>
            <div className="cover-two">
              <label className="field">
                <span>Page size</span>
                <select value={sizeId} aria-label="Page size" onChange={(e) => setSizeId(e.target.value)}>{SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              </label>
              <label className="field">
                <span>Orientation</span>
                <select value={landscape ? "landscape" : "portrait"} aria-label="Orientation" onChange={(e) => setLandscape(e.target.value === "landscape")}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
              </label>
              <label className="field">
                <span>Bleed</span>
                <select value={String(bleed)} aria-label="Bleed" onChange={(e) => setBleed(Number(e.target.value))}><option value="0">None</option><option value="0.125">⅛ in (0.125)</option></select>
              </label>
            </div>
            <Check label="Same margin on every side" checked={same} onChange={(v) => { setSame(v); if (v) setAll(margins.top); }} />
            {same ? (
              <InchInput label="Margin (in)" value={margins.top} onChange={setAll} testId="fit-margin-all" />
            ) : (
              <div className="cover-two">
                <InchInput label="Top (in)" value={margins.top} onChange={(top) => setMargins({ ...margins, top })} testId="fit-margin-top" />
                <InchInput label="Bottom (in)" value={margins.bottom} onChange={(bottom) => setMargins({ ...margins, bottom })} />
                <InchInput label="Left (in)" value={margins.left} onChange={(left) => setMargins({ ...margins, left })} />
                <InchInput label="Right (in)" value={margins.right} onChange={(right) => setMargins({ ...margins, right })} />
              </div>
            )}
            <div className="content-switches">
              <Check label="Show the bleed" checked={guides.bleed} onChange={(bleed) => setGuides({ ...guides, bleed })} />
              <Check label="Show the trim (page edge)" checked={guides.trim} onChange={(trim) => setGuides({ ...guides, trim })} />
              <Check label="Show the margins (safe area)" checked={guides.safe} onChange={(safe) => setGuides({ ...guides, safe })} />
            </div>
            <p className="hint">Guides show on screen only; they never print.</p>
          </section>
        </div>

        <div className="lettering-col">
          <section className="cover-panel" data-testid="fit-preview">
            <h2 className="book-h">3 · The page, fitted</h2>
            <div className="fit-preview">
              <svg viewBox={`0 0 ${boxes.media.w} ${boxes.media.h}`} width={boxes.media.w * P} height={boxes.media.h * P} role="img" aria-label="The page with the art fitted inside the margins" data-testid="fit-sheet">
                <rect x={0} y={0} width={boxes.media.w} height={boxes.media.h} fill="#ffffff" />
                {frameRects ? (
                  frameRects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill="none" stroke="#000" strokeWidth={r.stroke} data-testid="fit-frame-line" />)
                ) : art && src && fit ? (
                  <svg x={fit.draw.x} y={fit.draw.y} width={fit.draw.w} height={fit.draw.h} viewBox={`${src.x} ${src.y} ${src.w} ${src.h}`} preserveAspectRatio="none" data-testid="fit-art" data-draw={`${fit.draw.x.toFixed(3)},${fit.draw.y.toFixed(3)},${fit.draw.w.toFixed(3)},${fit.draw.h.toFixed(3)}`}>
                    <image href={art.url} width={art.widthPx} height={art.heightPx} />
                  </svg>
                ) : null}
                {guides.bleed && bleed > 0 && <rect x={0.01} y={0.01} width={boxes.media.w - 0.02} height={boxes.media.h - 0.02} fill="none" stroke="#d14b4b" strokeWidth={0.02} strokeDasharray="0.08 0.06" />}
                {guides.trim && <rect x={boxes.trim.x} y={boxes.trim.y} width={boxes.trim.w} height={boxes.trim.h} fill="none" stroke="#555" strokeWidth={0.015} />}
                {guides.safe && <rect x={boxes.safe.x} y={boxes.safe.y} width={boxes.safe.w} height={boxes.safe.h} fill="none" stroke="#2f7fd1" strokeWidth={0.02} strokeDasharray="0.1 0.07" data-testid="fit-safe" />}
              </svg>
            </div>
            <p className="hint" data-testid="fit-summary">
              Page {page.trimW} × {page.trimH} in{bleed ? ` + ${bleed} in bleed` : ""} · margins {margins.top} / {margins.bottom} / {margins.left} / {margins.right} in (top / bottom / left / right)
              {fit && !frameRects ? ` · art ${fit.draw.w.toFixed(2)} × ${fit.draw.h.toFixed(2)} in at ${fit.ppi} pixels per inch` : ""}
              {frameRects ? " · border redrawn inside the margins" : ""}
            </p>
            {ppiLow && <p className="hint art-ppi--soft" role="alert">Below 300 pixels per inch at this size: it may print a little soft. A larger image prints sharper.</p>}
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={!art} onClick={() => void render().then((b) => download(b, fileName))} data-testid="fit-download">Download page PNG (300 DPI)</button>
            </div>
          </section>

          <section className="cover-panel">
            <h2 className="book-h">4 · Put it on a page</h2>
            <p className="hint">Product Studio makes a copy of the project (“… (with fitted art)”) and puts this page there. The project you pick is never changed.</p>
            <label className="field">
              <span>Project</span>
              <select value={projectId} aria-label="Project" onChange={(e) => { setProjectId(e.target.value); setPageKey(""); }} data-testid="fit-project">
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {project && (
              <>
                <label className="field">
                  <span>Page</span>
                  <select value={pageKey} aria-label="Page" onChange={(e) => setPageKey(e.target.value)}>{pages.map((p) => <option key={`${p.item}#${p.nth}`} value={`${p.item}#${p.nth}`}>{p.label}</option>)}</select>
                </label>
                <button type="button" className="btn btn--primary" disabled={!art} onClick={() => void place()} data-testid="fit-place">Make a copy with this page and open it</button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
