/**
 * DECORATIVE LAYER (page layer 2). Draws the decoration plan: solid fills,
 * recolored Journal Color Studio marble / floral snapshots, tinted line-art
 * accents, and the JCS watercolor bloom layout.
 *
 * Inputs are page geometry + theme + colors only — never layout nodes.
 */
import { memo, useEffect, useId, useMemo, useState } from "react";
import type { PageGeometry } from "../types/geometry";
import type { DecorativeTheme } from "../types/theme";
import type { ColorTokens } from "../types/tokens";
import { colorVar } from "../primitives/nodes";
import { planDecoration, type DecorPiece } from "./decorationPlan";
import { ensureRaster, onRasterReady, rasterKey, rasterUrl } from "./recolor";

type Props = { geometry: PageGeometry; theme: DecorativeTheme; colors: ColorTokens };

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

function Piece({ p, uid, i }: { p: DecorPiece; uid: string; i: number }) {
  const { x, y, w, h } = p.rect;
  const cx = x + w / 2, cy = y + h / 2;
  switch (p.kind) {
    case "solid":
      return <rect x={x} y={y} width={w} height={h} style={{ fill: colorVar(p.color) }} data-decor="solid" />;
    case "watercolor":
      return (
        <g data-decor="watercolor">
          <defs>
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
    case "raster": {
      const url = rasterUrl(p.request);
      const transform = p.rotate180 ? `rotate(180 ${cx} ${cy})` : p.flipX ? `translate(${2 * cx} 0) scale(-1 1)` : undefined;
      const key = rasterKey(p.request);
      if (!url) {
        return p.fallback ? <rect x={x} y={y} width={w} height={h} style={{ fill: colorVar(p.fallback) }} data-decor="raster-pending" data-asset={p.assetId} data-raster={key} /> : <g data-decor="raster-pending" data-asset={p.assetId} data-raster={key} />;
      }
      return <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" transform={transform} data-decor="raster" data-asset={p.assetId} data-raster={key} />;
    }
    case "mask": {
      const id = `${uid}-m${i}`;
      const transform = p.rotate180 ? `rotate(180 ${cx} ${cy})` : undefined;
      return (
        <g transform={transform} data-decor="accent" data-asset={p.assetId}>
          <mask id={id} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
            <image href={p.url} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />
          </mask>
          <rect x={x} y={y} width={w} height={h} mask={`url(#${id})`} style={{ fill: colorVar(p.color) }} />
        </g>
      );
    }
  }
}

export const DecorativeLayer = memo(function DecorativeLayer({ geometry: g, theme, colors }: Props) {
  const uid = useId().replace(/[:«»]/g, "");
  const plan = useMemo(() => planDecoration(g, theme, colors), [g, theme, colors]);
  const pieces = useMemo(() => plan?.pieces ?? [], [plan]);
  useRasters(pieces);
  if (!plan) return null;
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const safe = { x: g.trimOffset.x + g.safeRect.x, y: g.trimOffset.y + g.safeRect.y, w: g.safeRect.w, h: g.safeRect.h };
  const c = plan.clip;
  return (
    <svg className="ps-layer ps-decor" viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}in`, height: `${H}in` }} aria-hidden>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} />
        </clipPath>
        {plan.excludeSafe && (
          <mask id={`${uid}-frame`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect x={0} y={0} width={W} height={H} fill="white" />
            <rect x={safe.x} y={safe.y} width={safe.w} height={safe.h} fill="black" />
          </mask>
        )}
      </defs>
      <g clipPath={`url(#${uid}-clip)`} mask={plan.excludeSafe ? `url(#${uid}-frame)` : undefined} opacity={plan.opacity}>
        {plan.pieces.map((p, i) => (
          <Piece key={i} p={p} uid={uid} i={i} />
        ))}
      </g>
    </svg>
  );
});
