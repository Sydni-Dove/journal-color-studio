/**
 * DECORATIVE THEME ENGINE (layer 2). Procedural, recolorable SVG.
 *
 * Inputs are ONLY page geometry (media/trim/safe) and the decorative theme.
 * It never reads layout nodes, so changing line spacing cannot move the
 * decoration, and changing the decoration cannot move calendar geometry.
 */
import { memo, useId } from "react";
import type { PageGeometry } from "../types/geometry";
import type { DecorativeTheme } from "../types/theme";
import { colorVar } from "../primitives/nodes";

/** Header band height as a fraction of trim height (decorative only). */
const HEADER_BAND_FRACTION = 0.12;
/** Corner ornament size as a fraction of the short trim edge. */
const CORNER_FRACTION = 0.22;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Props = { geometry: PageGeometry; theme: DecorativeTheme };

export const DecorativeLayer = memo(function DecorativeLayer({ geometry: g, theme }: Props) {
  const uid = useId().replace(/:/g, "");
  if (theme.style === "none") return null;
  const W = g.mediaWidthIn, H = g.mediaHeightIn;
  const ox = g.trimOffset.x, oy = g.trimOffset.y;
  const safe = { x: ox + g.safeRect.x, y: oy + g.safeRect.y, w: g.safeRect.w, h: g.safeRect.h };
  const s = Math.max(0.1, theme.scale);
  const rand = mulberry32(theme.seed);
  const A = colorVar(theme.colorA), B = colorVar(theme.colorB);

  // Region the decoration may occupy.
  let region: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: W, h: H };
  let excludeSafe = false;
  if (theme.placement === "header-band") region = { x: 0, y: 0, w: W, h: oy + g.trimHeightIn * HEADER_BAND_FRACTION };
  if (theme.placement === "border-frame" || (theme.placement === "full-page" && !theme.applyToInterior)) excludeSafe = true;

  const cornerSize = Math.min(g.trimWidthIn, g.trimHeightIn) * CORNER_FRACTION;
  const corners = [
    { x: 0, y: 0 },
    { x: W - cornerSize - ox, y: 0 },
    { x: 0, y: H - cornerSize - oy },
    { x: W - cornerSize - ox, y: H - cornerSize - oy },
  ];

  const art = (() => {
    const fillRegion = <rect x={region.x} y={region.y} width={region.w} height={region.h} />;
    switch (theme.style) {
      case "solid":
        return <g style={{ fill: A }}>{fillRegion}</g>;
      case "marble":
        return (
          <g>
            <filter id={`${uid}-marble`} filterUnits="userSpaceOnUse" x={region.x} y={region.y} width={region.w} height={region.h}>
              <feTurbulence type="turbulence" baseFrequency={`${0.35 / s} ${1.1 / s}`} numOctaves={4} seed={theme.seed} result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.55" result="veins" />
              <feFlood style={{ floodColor: B }} result="ink" />
              <feComposite in="ink" in2="veins" operator="in" />
            </filter>
            <g style={{ fill: A }}>{fillRegion}</g>
            <rect x={region.x} y={region.y} width={region.w} height={region.h} filter={`url(#${uid}-marble)`} />
          </g>
        );
      case "watercolor":
        return (
          <g>
            <filter id={`${uid}-blur`} filterUnits="userSpaceOnUse" x={-1} y={-1} width={W + 2} height={H + 2}>
              <feGaussianBlur stdDeviation={0.35 * s} />
            </filter>
            <g filter={`url(#${uid}-blur)`}>
              {Array.from({ length: 9 }, (_, i) => (
                <circle key={i} cx={region.x + rand() * region.w} cy={region.y + rand() * region.h} r={(0.6 + rand() * 1.4) * s} style={{ fill: i % 2 ? A : B, fillOpacity: 0.55 }} />
              ))}
            </g>
          </g>
        );
      case "stripes":
        return (
          <g>
            <pattern id={`${uid}-p`} patternUnits="userSpaceOnUse" width={0.3 * s} height={0.3 * s} patternTransform="rotate(45)">
              <rect width={0.12 * s} height={0.3 * s} style={{ fill: A }} />
            </pattern>
            <rect x={region.x} y={region.y} width={region.w} height={region.h} fill={`url(#${uid}-p)`} />
          </g>
        );
      case "dots":
        return (
          <g>
            <pattern id={`${uid}-p`} patternUnits="userSpaceOnUse" width={0.25 * s} height={0.25 * s}>
              <circle cx={0.125 * s} cy={0.125 * s} r={0.035 * s} style={{ fill: A }} />
            </pattern>
            <rect x={region.x} y={region.y} width={region.w} height={region.h} fill={`url(#${uid}-p)`} />
          </g>
        );
      case "geometric":
        return (
          <g>
            <pattern id={`${uid}-p`} patternUnits="userSpaceOnUse" width={0.5 * s} height={0.5 * s}>
              <path d={`M0 ${0.25 * s}L${0.25 * s} 0L${0.5 * s} ${0.25 * s}L${0.25 * s} ${0.5 * s}Z`} style={{ fill: "none", stroke: A }} strokeWidth={0.012} />
              <circle cx={0.25 * s} cy={0.25 * s} r={0.03 * s} style={{ fill: B }} />
            </pattern>
            <rect x={region.x} y={region.y} width={region.w} height={region.h} fill={`url(#${uid}-p)`} />
          </g>
        );
      case "abstract":
        return (
          <g>
            {Array.from({ length: 6 }, (_, i) => {
              const cx = region.x + rand() * region.w, cy = region.y + rand() * region.h, r = (0.5 + rand()) * s;
              const d = `M${cx - r} ${cy}C${cx - r} ${cy - r * 1.2} ${cx + r * 0.8} ${cy - r} ${cx + r} ${cy}S${cx - r * 0.3} ${cy + r * 1.3} ${cx - r} ${cy}Z`;
              return <path key={i} d={d} style={{ fill: i % 2 ? A : B, fillOpacity: 0.6 }} />;
            })}
          </g>
        );
      case "floral":
        return (
          <g>
            {corners.map((c, ci) =>
              Array.from({ length: 3 }, (_, fi) => {
                const cx = c.x + ox + (0.3 + rand() * 0.6) * cornerSize, cy = c.y + oy + (0.3 + rand() * 0.6) * cornerSize, pr = (0.12 + rand() * 0.12) * s;
                return (
                  <g key={`${ci}-${fi}`} transform={`translate(${cx} ${cy})`}>
                    {Array.from({ length: 5 }, (_, k) => (
                      <ellipse key={k} rx={pr * 0.45} ry={pr} transform={`rotate(${k * 72}) translate(0 ${-pr})`} style={{ fill: A, fillOpacity: 0.75 }} />
                    ))}
                    <circle r={pr * 0.35} style={{ fill: B }} />
                  </g>
                );
              }),
            )}
          </g>
        );
      case "minimal":
        return (
          <rect x={ox + 0.18} y={oy + 0.18} width={g.trimWidthIn - 0.36} height={g.trimHeightIn - 0.36} style={{ fill: "none", stroke: A }} strokeWidth={1 / 72} />
        );
      case "image":
        if (!theme.imageUrl) return null;
        if (theme.imageFit === "repeat") {
          return (
            <g>
              <pattern id={`${uid}-p`} patternUnits="userSpaceOnUse" width={2 * s} height={2 * s}>
                <image href={theme.imageUrl} width={2 * s} height={2 * s} preserveAspectRatio="xMidYMid slice" />
              </pattern>
              <rect x={region.x} y={region.y} width={region.w} height={region.h} fill={`url(#${uid}-p)`} />
            </g>
          );
        }
        return <image href={theme.imageUrl} x={region.x} y={region.y} width={region.w} height={region.h} preserveAspectRatio={theme.imageFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} />;
      default:
        return null;
    }
  })();

  return (
    <svg className="ps-layer ps-decor" viewBox={`0 0 ${W} ${H}`} style={{ width: `${W}in`, height: `${H}in` }} aria-hidden>
      <defs>
        <clipPath id={`${uid}-media`}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        {excludeSafe && (
          <mask id={`${uid}-frame`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect x={0} y={0} width={W} height={H} fill="white" />
            <rect x={safe.x} y={safe.y} width={safe.w} height={safe.h} fill="black" />
          </mask>
        )}
      </defs>
      <g clipPath={`url(#${uid}-media)`} mask={excludeSafe ? `url(#${uid}-frame)` : undefined} opacity={theme.opacity}>
        {art}
      </g>
    </svg>
  );
});
