/**
 * PrintablePage — the ONE page renderer used by the editor preview and the
 * print/PDF output. Physical size is in CSS inches (media = trim + bleed).
 *
 * Layers (bottom → top):
 *   1 Background  2 Decorative theme  3 Functional pattern
 *   4 Layout structure  5 Text / labels  6 User content (reserved)
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

export const PrintablePage = memo(function PrintablePage({ geometry: g, solved, colors, typography, decorative, background, spacing = DEFAULT_SPACING, mode, overlay }: Props) {
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
  const content = (
    <>
      {/* 1 background */}
      <div className="ps-layer ps-bg" />
      {/* 2 decorative */}
      {surface && <DecorativeLayer geometry={cg} theme={surface.theme} colors={surface.colors} composition={surface.composition} layer="surface" />}
      {background && <DecorativeLayer geometry={cg} theme={background} colors={colors} composition={composition} layer="background" />}
      <DecorativeLayer geometry={cg} theme={decorative} colors={colors} composition={composition} layer="elements" />
      {/* 3 functional pattern */}
      <SafeArea geometry={cg}>
        <PatternLayer nodes={solved.nodes} />
      </SafeArea>
      {/* 4 structure */}
      <SafeArea geometry={cg}>
        <StructureLayer nodes={solved.nodes} />
      </SafeArea>
      {/* 5 text */}
      <div className="ps-layer" style={{ left: `${cg.trimOffset.x}in`, top: `${cg.trimOffset.y}in`, width: `${cg.trimWidthIn}in`, height: `${cg.trimHeightIn}in` }}>
        <TextLayer nodes={solved.nodes} typography={typography} />
      </div>
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
    </div>
  );
});
