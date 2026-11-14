/**
 * ARTWORK — "Upload your own image", beside the studio's own artwork choices.
 * The maker adds a PNG, JPG or WebP made elsewhere (from an artwork prompt)
 * and chooses how it is used:
 *   Cover            the selected cover: a finished cover as it is, or with the cover's own title over it
 *   Page background  behind the page's content, on one page or on chosen pages
 *   Page illustration in a corner, or in a dedicated area the page's content makes room for
 * Every placement can be adjusted (fit, crop, position, size, opacity),
 * replaced or removed. Placement itself is decided in engines/artwork/place.ts,
 * so what is shown here is what prints.
 */
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { artworkFor, isCoverPage, pageOrdinal, type ResolvedDocument } from "../../engines/document/resolve";
import { allPageInfo } from "../../engines/document/pageInfo";
import { DEFAULT_CROP, edgeAnchor, effectivePpi, MAX_ZOOM, ppiAdvice } from "../../engines/artwork/place";
import { importArtwork, useArtworkUrl } from "../../engines/artwork/store";
import { newId } from "../../presets/products/projectFactory";
import type { ArtworkAsset, ArtworkPlacement, ArtworkTarget, IllustrationAnchor, ProjectArtwork } from "../../types/artwork";
import type { ProductProject } from "../../types/project";
import { Check, LabeledNumeric, Section, Segmented } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type Props = { project: ProductProject; update: Update; doc: ResolvedDocument; current: number; onGoTo: (index: number) => void; onEditCoverWording?: () => void };

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const USE_LABEL: Record<ArtworkPlacement["use"], string> = { cover: "Cover", background: "Page background", illustration: "Page illustration" };
const ANCHORS: { value: IllustrationAnchor; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
];

const withArt = (p: ProductProject, fn: (a: ProjectArtwork) => ProjectArtwork): ProductProject => ({ ...p, artwork: fn(p.artwork ?? { assets: [], placements: [] }) });

/** The product's Pages-list items in book order: what a background or illustration can go on. */
function pageItems(doc: ResolvedDocument) {
  const info = allPageInfo(doc);
  const items = new Map<string, { item: string; label: string; count: number; first: number; cover: boolean }>();
  doc.recipe.pages.forEach((p, i) => {
    if (p.filler) return;
    const it = items.get(p.recipeItemId);
    if (it) it.count++;
    else items.set(p.recipeItemId, { item: p.recipeItemId, label: p.module?.type === "back-cover" ? "Back cover" : [info[i].typeLabel, info[i].title].filter(Boolean).join(" — "), count: 1, first: i, cover: isCoverPage(p) });
  });
  return [...items.values()];
}

function Thumb({ asset, size = 56 }: { asset: ArtworkAsset; size?: number }) {
  const { url, missing } = useArtworkUrl(asset.id);
  return (
    <span className="art-thumb" style={{ width: size, height: size }} data-checker={asset.hasAlpha || undefined}>
      {url ? <img src={url} alt="" /> : <span className="hint">{missing ? "Not on this device" : "…"}</span>}
    </span>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="field art-slider">
      <span className="field-label">
        {label} <span className="hint">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

/** Which pages a placement is on: whole Pages-list items, or just this printed page. */
function PagesPicker({ doc, current, targets, onChange, coversOnly, wholeOnly }: { doc: ResolvedDocument; current: number; targets: ArtworkTarget[]; onChange: (t: ArtworkTarget[]) => void; coversOnly?: boolean; wholeOnly?: boolean }) {
  const items = pageItems(doc).filter((x) => (coversOnly ? x.cover : true));
  const cur = doc.recipe.pages[current];
  const curNth = pageOrdinal(doc, current);
  const curItem = items.find((x) => x.item === cur?.recipeItemId);
  const onlyThis = targets.length === 1 && targets[0].item === cur?.recipeItemId && targets[0].nth === curNth;
  const printed = doc.recipe.pages.filter((p, i) => !p.filler && targets.some((t) => t.item === p.recipeItemId && (wholeOnly || t.nth === undefined || t.nth === pageOrdinal(doc, i)))).length;
  if (!items.length) return <p className="hint">This product has no {coversOnly ? "cover" : ""} pages yet.</p>;
  return (
    <div className="field">
      <span className="field-label">
        On which pages <span className="hint">· {printed} printed page{printed === 1 ? "" : "s"}</span>
      </span>
      {curItem && (
        <div className="row">
          {!wholeOnly && curItem.count > 1 && (
            <button type="button" className="btn" aria-pressed={onlyThis} onClick={() => onChange([{ item: curItem.item, nth: curNth }])}>
              This page only
            </button>
          )}
          <button type="button" className="btn" onClick={() => onChange([...targets.filter((t) => t.item !== curItem.item), { item: curItem.item }])}>
            {curItem.count > 1 ? `Every “${curItem.label}” page` : "This page"}
          </button>
        </div>
      )}
      <div className="art-pages">
        {items.map((x) => {
          const whole = targets.some((t) => t.item === x.item && t.nth === undefined);
          const some = targets.some((t) => t.item === x.item);
          return (
            <label key={x.item} className="check">
              <input
                type="checkbox"
                checked={whole || (some && !wholeOnly)}
                ref={(el) => {
                  if (el) el.indeterminate = some && !whole && !wholeOnly;
                }}
                onChange={(e) => onChange(e.target.checked ? [...targets.filter((t) => t.item !== x.item), { item: x.item }] : targets.filter((t) => t.item !== x.item))}
              />
              <span>
                {x.label}
                {x.count > 1 ? ` · ${x.count} pages` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PlacementCard({ p, asset, project, update, doc, current, onGoTo, onEditCoverWording }: { p: ArtworkPlacement; asset: ArtworkAsset } & Props) {
  const set = (fn: (x: ArtworkPlacement) => ArtworkPlacement) => update((pr) => withArt(pr, (a) => ({ ...a, placements: a.placements.map((x) => (x.id === p.id ? fn(x) : x)) })));
  const remove = () => update((pr) => withArt(pr, (a) => ({ ...a, placements: a.placements.filter((x) => x.id !== p.id) })));
  // Where it lands: the first printed page using it (for "Show" and the print-resolution check).
  const first = useMemo(() => {
    for (let i = 0; i < doc.recipe.pages.length; i++) {
      const hit = artworkFor(doc, i).find((x) => x.key === p.id);
      if (hit) return { index: i, art: hit };
    }
    return null;
  }, [doc, p.id]);
  const ppi = first ? ppiAdvice(effectivePpi(asset, first.art.draw)) : null;
  const assets = project.artwork?.assets ?? [];
  return (
    <div className="card art-placement" data-art-placement={p.use}>
      <div className="art-placement__head">
        <Thumb asset={asset} size={44} />
        <div className="art-placement__title">
          <strong>{USE_LABEL[p.use]}</strong>
          <span className="hint">{asset.name}</span>
        </div>
        {first && (
          <button type="button" className="btn btn--ghost" onClick={() => onGoTo(first.index)}>
            Show
          </button>
        )}
      </div>
      {!first && <p className="hint">Not on any page yet: choose its pages below.</p>}
      {ppi && <p className={`hint art-ppi art-ppi--${ppi.level}`}>{ppi.text}</p>}

      {p.use === "cover" ? (
        <>
          <PagesPicker doc={doc} current={current} targets={p.targets} onChange={(targets) => set((x) => ({ ...x, targets }))} coversOnly wholeOnly />
          <Segmented label="Use the artwork" value={p.mode} options={[{ value: "as-is", label: "Finished cover, as is" }, { value: "with-title", label: "Add title over artwork" }]} onChange={(mode) => set((x) => ({ ...(x as typeof p), mode }))} />
          {p.mode === "with-title" && (
            <>
              <Segmented label="Title color" value={p.titleColor ?? "palette"} options={[{ value: "palette", label: "Palette" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(titleColor) => set((x) => ({ ...(x as typeof p), titleColor }))} />
              {onEditCoverWording && (
                <button type="button" className="btn" onClick={onEditCoverWording}>
                  Edit the cover's title and wording
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <PagesPicker doc={doc} current={current} targets={p.targets} onChange={(targets) => set((x) => ({ ...x, targets }))} wholeOnly={p.use === "illustration" && p.placement === "area"} />
      )}

      {(p.use === "cover" || p.use === "background") && (
        <>
          {p.use === "background" && (
            <Segmented label="Covers" value={p.extent} options={[{ value: "bleed", label: "Whole page, to the edge" }, { value: "safe", label: "Inside the margins" }]} onChange={(extent) => set((x) => ({ ...(x as typeof p), extent }))} />
          )}
          <Segmented label="Fit" value={p.fit} options={[{ value: "fill", label: "Fill and crop" }, { value: "fit", label: "Show the whole image" }]} onChange={(fit) => set((x) => ({ ...(x as typeof p), fit }))} />
          {p.fit === "fill" && (
            <>
              <Slider label="Zoom" value={p.crop.zoom} min={1} max={MAX_ZOOM} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => set((x) => ({ ...(x as typeof p), crop: { ...p.crop, zoom } }))} />
              <Slider label="Show more of the left ↔ right" value={p.crop.x} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(cx) => set((x) => ({ ...(x as typeof p), crop: { ...p.crop, x: cx } }))} />
              <Slider label="Show more of the top ↕ bottom" value={p.crop.y} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(cy) => set((x) => ({ ...(x as typeof p), crop: { ...p.crop, y: cy } }))} />
            </>
          )}
          {p.fit === "fit" && (
            <>
              <Slider label="Position left ↔ right" value={p.crop.x} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(cx) => set((x) => ({ ...(x as typeof p), crop: { ...p.crop, x: cx } }))} />
              <Slider label="Position top ↕ bottom" value={p.crop.y} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(cy) => set((x) => ({ ...(x as typeof p), crop: { ...p.crop, y: cy } }))} />
            </>
          )}
          {p.use === "background" && doc.recipe.pages.some((x) => x.side === "verso") && (
            <Check label="On left-hand pages, mirror it (art made for the outer edge stays away from the binding)" checked={!!p.mirror} onChange={(mirror) => set((x) => ({ ...(x as typeof p), mirror }))} />
          )}
          {p.use === "background" && <Slider label="Opacity" value={p.opacity} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => set((x) => ({ ...(x as typeof p), opacity }))} />}
        </>
      )}

      {p.use === "illustration" && (
        <>
          <Segmented
            label="Placement"
            value={p.placement}
            options={[{ value: "corner", label: "Corner, over the page" }, { value: "area", label: "Own area (content moves aside)" }]}
            onChange={(placement) => set((x) => ({ ...(x as typeof p), placement, targets: placement === "area" ? x.targets.map((t) => ({ item: t.item })) : x.targets }))}
          />
          {p.placement === "corner" && (
            <Check label="Run off the page edge (into the bleed)" checked={!!p.toEdge} onChange={(toEdge) => set((x) => ({ ...(x as typeof p), toEdge }))} />
          )}
          {p.placement === "corner" && asset.cutEdges?.length ? (
            <p className="hint">
              This artwork is cut off along its {asset.cutEdges.join(" and ")} edge{asset.cutEdges.length > 1 ? "s" : ""}
              {p.toEdge ? ", so it runs off the page there." : ": turn on “Run off the page edge” so it doesn't stop short inside the margin."}
            </p>
          ) : null}
          <p className="hint">
            {p.placement === "corner"
              ? p.toEdge
                ? "Sits over the page, flush with the page's edge where it is anchored and out into the bleed, so it prints right to the trimmed edge."
                : "Sits over the page, inside the print-safe area. A transparent PNG lets the page show around it; keep it clear of writing lines."
              : "A band at the top or bottom of the page: lesson text, calendars and writing space are laid out in the room left, and continue on more pages if they need to."}
          </p>
          <label className="field">
            <span className="field-label">Where</span>
            <select value={p.anchor} onChange={(e) => set((x) => ({ ...(x as typeof p), anchor: e.target.value as IllustrationAnchor }))}>
              {ANCHORS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <LabeledNumeric label={p.placement === "corner" ? "Width (inches)" : "Area height (inches)"} value={p.sizeIn} step={0.05} rules={{ min: 0.25, max: 20 }} onCommit={(v) => v !== null && set((x) => ({ ...(x as typeof p), sizeIn: v }))} />
          {p.placement === "corner" && (
            <div className="row">
              <LabeledNumeric label={p.toEdge ? "In from the page edge (in)" : "In from the side (in)"} value={p.offsetXIn} step={0.05} rules={{ min: 0, max: 20 }} onCommit={(v) => v !== null && set((x) => ({ ...(x as typeof p), offsetXIn: v }))} />
              <LabeledNumeric label={p.toEdge ? "In from top / bottom edge (in)" : "In from top / bottom (in)"} value={p.offsetYIn} step={0.05} rules={{ min: 0, max: 20 }} onCommit={(v) => v !== null && set((x) => ({ ...(x as typeof p), offsetYIn: v }))} />
            </div>
          )}
          {doc.binding && doc.recipe.pages.some((x) => x.side === "verso") && (
            <Check label="On left-hand pages, mirror to the outer edge (away from the binding)" checked={p.mirror} onChange={(mirror) => set((x) => ({ ...(x as typeof p), mirror }))} />
          )}
          <Slider label="Opacity" value={p.opacity} min={0.05} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => set((x) => ({ ...(x as typeof p), opacity }))} />
        </>
      )}

      <div className="row art-placement__actions">
        {assets.length > 1 && (
          <label className="field">
            <span className="field-label">Image</span>
            <select value={p.assetId} onChange={(e) => set((x) => ({ ...x, assetId: e.target.value }))}>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn btn--danger" onClick={remove}>
          Remove from pages
        </button>
      </div>
    </div>
  );
}

export function ArtworkPanel(props: Props) {
  const { project, update, doc, current } = props;
  const art = project.artwork;
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "note"; text: string } | null>(null);
  const [choose, setChoose] = useState<string | null>(null);
  const items = useMemo(() => pageItems(doc), [doc]);
  const covers = items.filter((x) => x.cover);
  const cur = doc.recipe.pages[current];

  const read = async (file: File | undefined) => {
    if (!file) return null;
    setBusy(true);
    setMessage(null);
    try {
      const r = await importArtwork(file);
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return null;
      }
      if (!r.savedOnDevice) setMessage({ kind: "note", text: "This browser couldn't keep the image after it closes (private browsing?). It's in use now; add it again next time." });
      return r.asset;
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const asset = await read(e.target.files?.[0]);
    e.target.value = "";
    if (!asset) return;
    update((p) => withArt(p, (a) => ({ ...a, assets: a.assets.some((x) => x.id === asset.id) ? a.assets : [...a.assets, asset] })));
    setChoose(asset.id);
  };

  const onReplace = async (e: ChangeEvent<HTMLInputElement>) => {
    const asset = await read(e.target.files?.[0]);
    e.target.value = "";
    const old = replacing;
    setReplacing(null);
    if (!asset || !old) return;
    update((p) =>
      withArt(p, (a) => ({
        assets: [...a.assets.filter((x) => x.id !== old && x.id !== asset.id), asset],
        placements: a.placements.map((x) => (x.assetId === old ? { ...x, assetId: asset.id } : x)),
      })),
    );
  };

  const removeAsset = (id: string) => {
    const uses = art?.placements.filter((x) => x.assetId === id).length ?? 0;
    if (uses && !window.confirm(`Remove this image? It is used ${uses} time${uses === 1 ? "" : "s"} in this product; those uses are removed too.`)) return;
    update((p) => withArt(p, (a) => ({ assets: a.assets.filter((x) => x.id !== id), placements: a.placements.filter((x) => x.assetId !== id) })));
  };

  const use = (assetId: string, kind: ArtworkPlacement["use"]) => {
    const id = newId();
    const here = cur && !cur.filler ? cur.recipeItemId : items[0]?.item;
    const placement: ArtworkPlacement =
      kind === "cover"
        ? { id, use: "cover", assetId, targets: [{ item: (cur && isCoverPage(cur) ? cur.recipeItemId : covers[0]?.item) ?? "" }], fit: "fill", crop: { ...DEFAULT_CROP }, mode: "as-is", titleColor: "palette" }
        : kind === "background"
          ? { id, use: "background", assetId, targets: here ? [{ item: here }] : [], fit: "fill", crop: { ...DEFAULT_CROP }, opacity: 1, extent: "bleed" }
          : illustrationFor(id, assetId, here);
    update((p) => withArt(p, (a) => ({ ...a, placements: [...a.placements, placement] })));
    setChoose(null);
    const target = placement.targets[0]?.item;
    const at = doc.recipe.pages.findIndex((x) => x.recipeItemId === target && !x.filler);
    if (at >= 0 && at !== current && !(cur && cur.recipeItemId === target)) props.onGoTo(at);
  };

  /** A new illustration: art cut along the bottom (or top) runs off the page there; other art sits in a corner inside the margins. */
  function illustrationFor(id: string, assetId: string, here: string | undefined): ArtworkPlacement {
    const a = project.artwork?.assets.find((x) => x.id === assetId);
    const edge = edgeAnchor(a?.cutEdges);
    const sizeIn = edge ? Math.round(Math.min(2.75, doc.trim.widthIn * 0.4) * 4) / 4 : 1.5;
    return { id, use: "illustration", assetId, targets: here ? [{ item: here }] : [], placement: "corner", anchor: edge ?? "bottom-right", sizeIn, offsetXIn: 0, offsetYIn: 0, mirror: true, opacity: 1, toEdge: !!edge };
  }

  const UseButtons = ({ assetId }: { assetId: string }) => (
    <div className="art-use" role="group" aria-label="Use this image as">
      {covers.length > 0 && (
        <button type="button" className="btn" onClick={() => use(assetId, "cover")}>
          Cover
        </button>
      )}
      <button type="button" className="btn" onClick={() => use(assetId, "background")}>
        Page background
      </button>
      <button type="button" className="btn" onClick={() => use(assetId, "illustration")}>
        Page illustration
      </button>
    </div>
  );

  return (
    <Section title="Artwork: upload your own image" open>
      <p className="hint">Bring in artwork you made elsewhere (PNG, JPG or WebP), then use it as a cover, a page background or an illustration. It's saved with this project on this device and prints exactly as the preview shows it.</p>
      <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={onUpload} data-testid="artwork-upload" />
      <input ref={replaceRef} type="file" accept={ACCEPT} hidden onChange={onReplace} data-testid="artwork-replace" />
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Reading the image…" : "Upload your own image"}
      </button>
      {message && <div className={`issue issue--${message.kind === "error" ? "error" : "warning"}`} role="status">{message.text}</div>}

      {art && art.assets.length > 0 && (
        <ul className="art-assets">
          {art.assets.map((a) => (
            <li key={a.id} className="art-asset" data-art-asset={a.name}>
              <Thumb asset={a} />
              <div className="art-asset__body">
                <strong>{a.name}</strong>
                <span className="hint">
                  {a.widthPx} × {a.heightPx} px · {a.mime.replace("image/", "").toUpperCase()}
                  {a.hasAlpha ? " · transparent background" : ""}
                </span>
                {choose === a.id ? (
                  <>
                    <span className="field-label">How will you use it?</span>
                    <UseButtons assetId={a.id} />
                  </>
                ) : (
                  <div className="row">
                    <button type="button" className="btn" onClick={() => setChoose(a.id)}>
                      Use…
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setReplacing(a.id);
                        replaceRef.current?.click();
                      }}
                    >
                      Replace
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => removeAsset(a.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {art?.placements.map((p) => {
        const asset = art.assets.find((a) => a.id === p.assetId);
        return asset ? <PlacementCard key={p.id} p={p} asset={asset} {...props} /> : null;
      })}
    </Section>
  );
}
