/**
 * DECORATIVE LAYER (page layer 2). Draws the decoration plan: solid fills,
 * recolored Journal Color Studio marble / floral snapshots, tinted line-art
 * accents (single motifs or mirror-tiled bands), and the JCS watercolor bloom
 * layout — masked away from content where the plan says so.
 *
 * Inputs are geometry + theme + colors + the page's COMPOSITION (regions and
 * protected content derived from the solved layout). It never changes layout.
 */
import { memo, useEffect, useId, useMemo, useState } from "react";
import type { Composition } from "../types/composition";
import type { PageGeometry } from "../types/geometry";
import type { DecorativeTheme } from "../types/theme";
import type { ColorTokens } from "../types/tokens";
import { colorVar } from "../primitives/nodes";
import type { ArtTransform } from "../engines/composition/fit";
import { planDecoration, type DecorPiece } from "./decorationPlan";
import { ensureRaster, onRasterReady, rasterKey, rasterUrl } from "./recolor";

type Props = { geometry: PageGeometry; theme: DecorativeTheme; colors: ColorTokens; composition: Composition };

/** Re-render when any raster this layer uses finishes recoloring. */
function useRasters(pieces: DecorPiece[]) {
  const [, bump] = useState(0);
  useEffect(() => {
    const off = onRasterReady(() => bump((n) => n + 1));
    for (const p of pieces) if (p.kind === "raster") ensureRaster(p.request).catch(() => undefined);
    return () => {
      off();
    };
  }, [pieces]);
}

/** SVG transform that mirrors a rect in place. */
function flip(t: ArtTransform | undefined, x: number, y: number, w: number, h: number): string | undefined {
  if (!t?.flipX && !t?.flipY) return undefined;
  const cx = x + w / 2, cy = y + h / 2;
  return `translate(${t.flipX ? 2 * cx : 0} ${t.flipY ? 2 * cy : 0}) scale(${t.flipX ? -1 : 1} ${t.flipY ? -1 : 1})`;
}

function Piece({ p, uid, i }: { p: DecorPiece; uid: string; i: number }) {
  switch (p.kind) {
    case "solid": {
      const { x, y, w, h } = p.rect;
      return <rect x={x} y={y} width={w} height={h} style={{ fill: colorVar(p.color) }} data-decor="solid" />;
    }
    case "watercolor": {
      const { x, y, w, h } = p.rect;
      // Blooms are sized from the region's long side and would spill past a band: clip to the region.
      return (
        <g data-decor="watercolor" clipPath={`url(#${uid}-wcclip${i})`}>
          <defs>
            <clipPath id={`${uid}-wcclip${i}`}>
              <rect x={x} y={y} width={w} height={h} />
            </clipPath>
            {p.blooms.map((b, k) => (
              <radialGradient key={k} id={`${uid}-wc${i}-${k}`} cx={b.cx} cy={b.cy} r={b.r} gradientUnits="userSpaceOnUse">
                <stop offset="0" style={{ stopColor: colorVar(b.color), stopOpacity: b.alpha }} />
                <stop offset="0.45" style={{ stopColor: colorVar(b.color), stopOpacity: b.alpha * 0.6 }} />
                <stop offset="1" style={{ stopColor: colorVar(b.color), stopOpacity: 0 }} />
              </radialGradient>
            ))}
          </defs>
          <rect x={x} y={y} width={w} height={h} style={{ fill: colorVar(p.paper) }} />
          <g style={{ mixBlendMode: "multiply" }}>
            {p.blooms.map((b, k) => (
              <circle key={k} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${uid}-wc${i}-${k})`} />
            ))}
          </g>
        </g>
      );
    }
    case "raster": {
      const { x, y, w, h } = p.rect;
      const url = rasterUrl(p.request);
      const key = rasterKey(p.request);
      if (!url) {
        // Until the recolored bitmap is ready: the material's base colour, or an invisible box at the art's position.
        return <rect x={x} y={y} width={w} height={h} style={{ fill: p.fallback ? colorVar(p.fallback) : "none" }} data-decor="raster-pending" data-asset={p.assetId} data-raster={key} />;
      }
      return <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" transform={flip(p.transform, x, y, w, h)} data-decor="raster" data-asset={p.assetId} data-raster={key} />;
    }
    case "mask": {
      const { x, y, w, h } = p.rect;
      const id = `${uid}-m${i}`;
      const clipId = `${uid}-mc${i}`;
      return (
        <g clipPath={p.clip ? `url(#${clipId})` : undefined} data-decor="accent" data-asset={p.assetId}>
          <defs>
            {p.clip && (
              <clipPath id={clipId}>
                <rect x={p.clip.x} y={p.clip.y} width={p.clip.w} height={p.clip.h} />
              </clipPath>
            )}
            <mask id={id} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
              <image href={p.url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" transform={flip(p.transform, x, y, w, h)} />
            </mask>
          </defs>
          <rect x={x} y={y} width={w} height={h} mask={`url(#${id})`} style={{ fill: colorVar(p.color) }} />
        </g>
      );
    }
    case "tile": {
      // Mirror-tiling (JCS): neighbours are flipped so line art meets itself at every edge.
      const { region: r, tile: t } = p;
      const pat = `${uid}-tp${i}`, mask = `${uid}-tm${i}`;
      const cell = (fx: boolean, fy: boolean, dx: number, dy: number) => (
        <image href={p.url} x={dx} y={dy} width={t.w} height={t.h} preserveAspectRatio="none" transform={flip({ flipX: fx, flipY: fy }, dx, dy, t.w, t.h)} />
      );
      return (
        <g data-decor="accent-tile" data-asset={p.assetId}>
          <defs>
            <pattern id={pat} patternUnits="userSpaceOnUse" x={t.ox - t.w} y={t.oy} width={2 * t.w} height={2 * t.h}>
              {cell(false, false, 0, 0)}
              {cell(true, false, t.w, 0)}
              {cell(false, true, 0, t.h)}
              {cell(true, true, t.w, t.h)}
            </pattern>
            <mask id={mask} maskUnits="userSpaceOnUse" x={r.x} y={r.y} width={r.w} height={r.h}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${pat})`} />
            </mask>
          </defs>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} mask={`url(#${mask})`} style={{ fill: colorVar(p.color) }} />
        </g>
      );
    }
  }
}

export const DecorativeLayer = memo(function DecorativeLayer({ geometry: g, theme, colors, composition }: Props) {
  const uid = useId().replace(/[:«»]/g, "");
  const plan = useMemo(() => planDecoration(g, theme, colors, composition), [g, theme, colors, composition]);
  const pieces = useMemo(() => plan?.pieces ?? [], [plan]);
  useRasters(pieces);
  if (!plan) return null;
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const knock = plan.knockouts.length > 0;
  const f = plan.featherIn;
  return (
    <svg className="ps-layer ps-decor" viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}in`, height: `${H}in` }} aria-hidden>
      {knock && (
        <defs>
          {f > 0 && (
            <filter id={`${uid}-feather`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={f / 2} />
            </filter>
          )}
          <mask id={`${uid}-knock`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect x={0} y={0} width={W} height={H} fill="white" />
            <g filter={f > 0 ? `url(#${uid}-feather)` : undefined}>
              {/* A feathered edge grows outward from the hole, so it never softens onto content. */}
              {plan.knockouts.map((r, k) => (
                <rect key={k} x={r.x - f / 2} y={r.y - f / 2} width={r.w + f} height={r.h + f} fill="black" data-knockout={k} />
              ))}
            </g>
          </mask>
        </defs>
      )}
      <g mask={knock ? `url(#${uid}-knock)` : undefined} opacity={plan.opacity}>
        {plan.pieces.map((p, i) => (
          <Piece key={i} p={p} uid={uid} i={i} />
        ))}
      </g>
    </svg>
  );
});
