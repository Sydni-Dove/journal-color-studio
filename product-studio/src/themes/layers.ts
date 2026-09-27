/**
 * DESIGN LAYERS — a page carries two independent decorative layers:
 *
 *   background  a SURFACE treatment: solid, marble, pattern, watercolor
 *               (full background, header / footer band, edge strip, margin frame)
 *   elements    DECORATIVE ELEMENTS placed against page structure: florals and
 *               line art (title-rule ornaments, corners, flourishes, bands of line art)
 *
 * Both use the same DecorativeTheme shape and the same planner; the background
 * is drawn first, the elements over it. Neither ever moves functional geometry.
 *
 * Projects saved before the split kept ONE decorativeTheme. A surface stored
 * there is the project's background: `splitLayers` reads it that way at render
 * time and `migrateLayers` moves it on load — the rendered page is identical
 * (same planner, same layer position), so an existing design never changes.
 */
import type { ProductProject, ProductVariant } from "../types/project";
import type { DecorativeStyle, DecorativeTheme } from "../types/theme";

export const SURFACE_STYLES: DecorativeStyle[] = ["solid", "marble", "pattern", "watercolor"];
export const ELEMENT_STYLES: DecorativeStyle[] = ["floral", "accent"];
export const isSurfaceStyle = (s: DecorativeStyle | undefined) => !!s && SURFACE_STYLES.includes(s);
export const isElementStyle = (s: DecorativeStyle | undefined) => !!s && ELEMENT_STYLES.includes(s);

/** An empty layer (same defaults as a new project's decoration). */
export const NO_LAYER: DecorativeTheme = { style: "none", placement: "full-page", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" };

/**
 * The two layers a project renders. An explicit background wins; otherwise a
 * surface left in the (legacy) decorative theme is the background. The
 * element layer only ever holds florals / line art.
 */
export function splitLayers(background: DecorativeTheme | undefined, decorative: DecorativeTheme): { background: DecorativeTheme; elements: DecorativeTheme } {
  const legacySurface = isSurfaceStyle(decorative.style);
  const bg = background && isSurfaceStyle(background.style) ? background : legacySurface ? decorative : background ?? NO_LAYER;
  return {
    background: isSurfaceStyle(bg.style) ? bg : { ...bg, style: "none" },
    elements: isElementStyle(decorative.style) ? decorative : { ...decorative, style: "none" },
  };
}

/** Persisted migration (base design + every variant) of a project saved before the split. Idempotent. */
export function migrateLayers(p: ProductProject): ProductProject {
  // Already split (saved with a background layer, no surface left in the element slot): variants may
  // legitimately override one layer only.
  if (p.backgroundTheme && !isSurfaceStyle(p.decorativeTheme.style)) return p;
  const base = splitLayers(p.backgroundTheme, p.decorativeTheme);
  // Before the split a variant showed exactly ONE layer: the base theme with its override merged in. Keep exactly that.
  const variants = p.variants.map((v): ProductVariant => {
    const o = v.overrides.decorativeTheme;
    if (!o || v.overrides.backgroundTheme) return v;
    const effective = { ...p.decorativeTheme, ...o } as DecorativeTheme;
    const hide = { style: "none" as const };
    const { decorativeTheme: _old, ...rest } = v.overrides;
    if (isSurfaceStyle(effective.style)) {
      return { ...v, overrides: { ...rest, backgroundTheme: effective, ...(base.elements.style !== "none" ? { decorativeTheme: hide } : {}) } };
    }
    return { ...v, overrides: { ...rest, decorativeTheme: isElementStyle(effective.style) ? effective : hide, ...(base.background.style !== "none" ? { backgroundTheme: hide } : {}) } };
  });
  return {
    ...p,
    backgroundTheme: base.background,
    decorativeTheme: base.elements,
    variants,
  };
}
