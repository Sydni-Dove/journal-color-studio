/**
 * Design thumbnails for the curated picker, shown in the CURRENT palette.
 * Raster designs (marble, stripes, florals) are recolored by the same engine
 * as the page, from small derived thumbnails (design-library/assets/thumbs),
 * and cached (the Abstract watercolor from small copies of its layers). Line
 * art is its own mask tinted with the line color; solid is a swatch.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { findAsset } from "../../design-library/library";
import { defaultRoles, type CatalogDesign } from "../../design-library/catalog";
import { ensureRaster, onRasterReady, rasterUrl, type RasterRequest } from "../../themes/recolor";
import type { DecorativeTheme } from "../../types/theme";
import type { ColorTokens } from "../../types/tokens";

const PX = 144;
const HEX = /^#[0-9a-f]{6}$/i;

function request(d: CatalogDesign, colors: ColorTokens, roles: Pick<DecorativeTheme, "colorA" | "colorB" | "colorC">): RasterRequest | null {
  const a = findAsset(d.assetId);
  if (!a || a.type === "accent") return null;
  const hex = (t: keyof ColorTokens, f: string) => (HEX.test(String(colors[t])) ? String(colors[t]) : f);
  const object = a.type === "floral";
  const k = object ? PX / Math.max(a.size.w, a.size.h) : 1;
  return {
    assetId: a.id,
    pxW: object ? Math.round(a.size.w * k) : PX,
    pxH: object ? Math.round(a.size.h * k) : PX,
    fit: object ? "stretch" : "cover",
    zoom: 1,
    thumb: true,
    roles: {
      base: hex(roles.colorA, "#630000"),
      vein: hex(roles.colorB, "#E6A742"),
      highlight: hex(roles.colorC, "#FDFDFD"),
      deep: hex("primary", "#630000"),
      paper: hex("background", "#FDFDFD"),
      ...(a.type === "watercolor" ? { accent: hex("lineArt", "#B8471C") } : {}),
    },
  };
}

export function DesignThumb({ design, colors, roles, original }: { design: CatalogDesign; colors: ColorTokens; roles?: Pick<DecorativeTheme, "colorA" | "colorB" | "colorC">; original?: boolean }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const r = roles ?? defaultRoles(design.style);
  const base = request(design, colors, r);
  const req = base && original && findAsset(design.assetId)?.type === "floral" ? { ...base, original: true } : base;
  const url = req ? rasterUrl(req) : undefined;
  // Recolor only thumbnails that are on screen (a collapsed section costs nothing on a palette switch).
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!req || url || !inView) return;
    const off = onRasterReady(bump);
    ensureRaster(req).catch(() => {});
    return () => void off();
  });
  const color = (t: keyof ColorTokens) => String(colors[t]);
  const a = findAsset(design.assetId);
  let body: React.ReactNode;
  if (design.style === "none") body = <span className="thumb-none" />;
  else if (design.style === "solid") body = <span className="thumb-fill" style={{ background: color(r.colorA) }} />;
  else if (a?.type === "accent")
    body = <span className="thumb-mask" style={{ background: color(r.colorB), WebkitMaskImage: `url(${a.url})`, maskImage: `url(${a.url})` }} />;
  else body = url ? <img src={url} alt="" className={a?.type === "floral" ? "thumb-object" : "thumb-fill"} /> : <span className="thumb-fill thumb-loading" style={{ background: color("background") }} />;
  return (
    <span ref={ref} className="thumb" data-thumb={design.value} data-ready={design.style === "none" || design.style === "solid" || a?.type === "accent" || !!url}>
      {body}
    </span>
  );
}
