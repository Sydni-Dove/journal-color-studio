/**
 * PrintablePage — the ONE page renderer used by the editor preview and the
 * print/PDF output. Physical size is in CSS inches (media = trim + bleed).
 *
 * Layers (bottom → top):
 *   1 Background  2 Decorative theme  3 Functional pattern
 *   4 Layout structure  5 Text / labels  6 User content (reserved)
 *   + debug overlay (editor only; never printed)
 */
import { memo, type CSSProperties, type ReactNode } from "react";
import type { PageGeometry } from "../types/geometry";
import type { SolvedPage } from "../types/layout";
import type { DecorativeTheme } from "../types/theme";
import type { ColorTokens, TypographySettings } from "../types/tokens";
import { fontStack } from "../presets/typography/typography";
import { DecorativeLayer } from "../themes/DecorativeLayer";
import { PatternLayer, StructureLayer, TextLayer } from "./nodes";

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

export const PrintablePage = memo(function PrintablePage({ geometry: g, solved, colors, typography, decorative, mode, overlay }: Props) {
  const style: CSSProperties = {
    ...themeVars(colors, typography),
    width: `${g.mediaWidthIn}in`,
    height: `${g.mediaHeightIn}in`,
  };
  return (
    <div className={`ps-page ps-page--${mode}`} style={style}>
      {/* 1 background */}
      <div className="ps-layer ps-bg" />
      {/* 2 decorative */}
      <DecorativeLayer geometry={g} theme={decorative} colors={colors} />
      {/* 3 functional pattern */}
      <SafeArea geometry={g}>
        <PatternLayer nodes={solved.nodes} />
      </SafeArea>
      {/* 4 structure */}
      <SafeArea geometry={g}>
        <StructureLayer nodes={solved.nodes} />
      </SafeArea>
      {/* 5 text */}
      <div className="ps-layer" style={{ left: `${g.trimOffset.x}in`, top: `${g.trimOffset.y}in`, width: `${g.trimWidthIn}in`, height: `${g.trimHeightIn}in` }}>
        <TextLayer nodes={solved.nodes} typography={typography} />
      </div>
      {/* 6 user content — reserved */}
      {mode === "editor" ? overlay : null}
    </div>
  );
});
