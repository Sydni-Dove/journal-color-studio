/**
 * PrintablePage — the ONE page renderer used by the editor preview and the
 * print/PDF output. Physical size is in CSS inches (media = trim + bleed).
 *
 * Layers (bottom → top):
 *   1 Background  2 Decorative theme  3 Functional pattern
 *   4 Layout structure  5 Text / labels  6 User content (reserved)
 * Uploaded artwork (engines/artwork/place.ts) joins them: page backgrounds
 * above the background layer, illustrations above the page's structure and
 * under its text, and cover artwork in place of the cover's own design.
 *   + debug overlay (editor only; never printed)
 */
import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import { resolveComposition } from "../engines/composition/composition";
import { resolveSpacing } from "../presets/spacing/spacingPresets";
import type { PageGeometry } from "../types/geometry";
import type { SolvedPage } from "../types/layout";
import type { DecorativeTheme } from "../types/theme";
import type { ColorTokens, SpacingTokens, TypographySettings } from "../types/tokens";
import { fontStack } from "../presets/typography/typography";
import { DecorativeLayer } from "../themes/DecorativeLayer";
import { coverSurfaceColors, coverSurfaceTheme } from "../design-library/coverSurfaces";
import { PatternLayer, StructureLayer, TextLayer } from "./nodes";
import { contentToPageTransform, sidewaysGeometry } from "../engines/geometry/turn";
import type { PageArt } from "../engines/artwork/place";
import { ArtLayer } from "./ArtLayer";

export function themeVars(colors: ColorTokens, typography: TypographySettings): CSSProperties {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (k === "lineOpacity") vars["--c-line-opacity"] = v as number;
    else vars[`--c-${k}`] = v as string;
  }
  for (const [group, family] of Object.entries(typography.fonts)) vars[`--f-${group}`] = fontStack(family);
  return vars as CSSProperties;
}

type Props = {
  geometry: PageGeometry;
  solved: SolvedPage;
  colors: ColorTokens;
  typography: TypographySettings;
  decorative: DecorativeTheme;
  /** Background / surface layer, drawn under the decorative elements. */
  background?: DecorativeTheme;
  /** Spacing tokens (decoration clearance). Defaults to the balanced preset. */
  spacing?: SpacingTokens;
  mode: "editor" | "print";
  overlay?: ReactNode;
  /** Uploaded artwork on this page, already placed (artworkFor in engines/document/resolve.ts). */
  art?: PageArt[];
};

export const SafeArea = ({ geometry: g, children }: { geometry: PageGeometry; children: ReactNode }) => (
  <svg
    className="ps-layer"
    viewBox={`0 0 ${g.mediaWidthIn} ${g.mediaHeightIn}`}
    style={{ width: `${g.mediaWidthIn}in`, height: `${g.mediaHeightIn}in` }}
    aria-hidden
  >
    <g transform={`translate(${g.trimOffset.x} ${g.trimOffset.y})`}>{children}</g>
  </svg>
);

const DEFAULT_SPACING = resolveSpacing("balanced");

const NO_ART: PageArt[] = [];
/** A cover title over artwork, in light or dark ink for legibility: every color the text draws with becomes that ink. */
function inkVars(colors: ColorTokens, ink: "light" | "dark"): CSSProperties {
  const c = ink === "light" ? "#ffffff" : "#1f1a17";
  return Object.fromEntries(Object.keys(colors).filter((k) => k !== "lineOpacity").map((k) => [`--c-${k}`, c])) as CSSProperties;
}

export const PrintablePage = memo(function PrintablePage({ geometry: g, solved, colors, typography, decorative, background, spacing = DEFAULT_SPACING, mode, overlay, art = NO_ART }: Props) {
  // A rotated page (the rotated monthly calendar) is solved in landscape; its
  // content geometry is the turned one, and the painted content is rotated 90°
  // back onto the portrait sheet below.
  const rotated = solved.contentRotation === 90;
  const cg = rotated ? sidewaysGeometry(g) : g;
  // Composition regions + protected content come from the SAME solved nodes drawn below.
  const composition = useMemo(() => resolveComposition(cg, solved, typography, spacing), [cg, solved, typography, spacing]);
  // A cover's own surface (design library): drawn by the same renderer as a background, on this page only.
  const surface = useMemo(() => {
    if (!solved.surface) return null;
    return { theme: coverSurfaceTheme(solved.surface.assetId), colors: coverSurfaceColors(solved.surface.assetId, solved.surface.ownColors, colors), composition: { ...composition, ownArtwork: false } };
  }, [solved.surface, colors, composition]);
  const style: CSSProperties = {
    ...themeVars(colors, typography),
    width: `${g.mediaWidthIn}in`,
    height: `${g.mediaHeightIn}in`,
  };
  // Uploaded artwork, drawn on the physical page (never turned with sideways content).
  const cover = art.find((a) => a.use === "cover");
  const underArt = art.filter((a) => a.use === "background");
  const overArt = art.filter((a) => a.use === "illustration");
  const own = !cover; // the page's own design (a cover with artwork shows the artwork instead)
  const showText = !cover || cover.coverMode === "with-title";
  const under = (cover || underArt.length > 0) && <ArtLayer geometry={g} items={cover ? [cover, ...underArt] : underArt} mode={mode} />;
  const over = overArt.length > 0 && <ArtLayer geometry={g} items={overArt} mode={mode} />;
  const textStyle: CSSProperties = { left: `${cg.trimOffset.x}in`, top: `${cg.trimOffset.y}in`, width: `${cg.trimWidthIn}in`, height: `${cg.trimHeightIn}in`, ...(cover && cover.titleColor && cover.titleColor !== "palette" ? inkVars(colors, cover.titleColor) : {}) };
  const content = (
    <>
      {/* 1 background */}
      {(!rotated || !under) && <div className="ps-layer ps-bg" />}
      {/* 2 decorative */}
      {own && surface && <DecorativeLayer geometry={cg} theme={surface.theme} colors={surface.colors} composition={surface.composition} layer="surface" />}
      {own && background && <DecorativeLayer geometry={cg} theme={background} colors={colors} composition={composition} layer="background" />}
      {!rotated && under}
      {own && <DecorativeLayer geometry={cg} theme={decorative} colors={colors} composition={composition} layer="elements" />}
      {/* 3 functional pattern */}
      {own && (
        <SafeArea geometry={cg}>
          <PatternLayer nodes={solved.nodes} />
        </SafeArea>
      )}
      {/* 4 structure */}
      {own && (
        <SafeArea geometry={cg}>
          <StructureLayer nodes={solved.nodes} />
        </SafeArea>
      )}
      {!rotated && over}
      {/* 5 text */}
      {showText && (
        <div className="ps-layer" style={textStyle}>
          <TextLayer nodes={solved.nodes} typography={typography} />
        </div>
      )}
      {/* 6 user content — reserved */}
      {mode === "editor" ? overlay : null}
    </>
  );
  if (!rotated) {
    return (
      <div className={`ps-page ps-page--${mode}`} style={style}>
        {content}
      </div>
    );
  }
  // Sideways content: laid out in the turned (landscape) geometry, drawn back onto the sheet with the
  // exact inverse of that turn (engines/geometry/turn.ts) — an explicit top-left transform, which
  // Mobile Safari also draws reliably inside the scaled preview.
  return (
    <div className={`ps-page ps-page--${mode}`} style={{ ...style, position: "relative", overflow: "hidden" }}>
      {under && (
        <>
          <div className="ps-layer ps-bg" />
          {under}
        </>
      )}
      <div
        data-rotated-content="90"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${cg.mediaWidthIn}in`,
          height: `${cg.mediaHeightIn}in`,
          transformOrigin: "0 0",
          transform: contentToPageTransform(g),
        }}
      >
        {content}
      </div>
      {over}
    </div>
  );
});
