/**
 * Uploaded artwork on a page: each image drawn at its placed rectangle and
 * clipped to its box, in the page's media coordinates (inches). Used by
 * PrintablePage only, so the editor preview and the printed pages draw the
 * same thing.
 *
 * While an image is still loading, a placeholder marked "raster-pending"
 * stands in (printing waits for it: ExportDialog's artReady). An image this
 * device doesn't have is shown in the editor as an outlined box saying so,
 * and never printed (export asks for it first).
 */
import { useId } from "react";
import type { PageArt } from "../engines/artwork/place";
import { useArtworkUrl } from "../engines/artwork/store";
import type { PageGeometry } from "../types/geometry";

function ArtImage({ item, clipId, mode }: { item: PageArt; clipId: string; mode: "editor" | "print" }) {
  const { url, missing } = useArtworkUrl(item.assetId);
  const { box, draw } = item;
  if (!url) {
    if (missing && mode === "editor") {
      return (
        <g data-art-missing={item.assetId}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#9a3b3b" strokeWidth={0.02} strokeDasharray="0.08 0.06" />
          <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" fontSize={Math.min(0.18, box.w / 12)} fill="#9a3b3b">
            Artwork not on this device — add it again in Artwork
          </text>
        </g>
      );
    }
    return missing ? null : <rect data-decor="raster-pending" x={box.x} y={box.y} width={box.w} height={box.h} fill="none" />;
  }
  return (
    <g data-art={item.use} data-art-id={item.key} opacity={item.opacity < 1 ? item.opacity : undefined}>
      <clipPath id={clipId}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <image href={url} x={draw.x} y={draw.y} width={draw.w} height={draw.h} preserveAspectRatio="none" transform={item.flipX ? `translate(${2 * draw.x + draw.w} 0) scale(-1 1)` : undefined} />
      </g>
    </g>
  );
}

export function ArtLayer({ geometry: g, items, mode }: { geometry: PageGeometry; items: PageArt[]; mode: "editor" | "print" }) {
  const base = useId().replace(/:/g, "");
  return (
    <svg
      className="ps-layer"
      data-layer="artwork"
      viewBox={`0 0 ${g.mediaWidthIn} ${g.mediaHeightIn}`}
      style={{ width: `${g.mediaWidthIn}in`, height: `${g.mediaHeightIn}in` }}
      aria-hidden
    >
      {items.map((it, k) => (
        <ArtImage key={it.key} item={it} clipId={`art-${base}-${k}`} mode={mode} />
      ))}
    </svg>
  );
}
