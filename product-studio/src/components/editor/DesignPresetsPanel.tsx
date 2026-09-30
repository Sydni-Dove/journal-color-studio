/**
 * DESIGN PRESETS — complete looks shown on the page being viewed (the real
 * renderer, not a picture), with their colors, typography, background and
 * decorations named. Apply design sets those four; each stays editable below.
 */
import { useMemo } from "react";
import { resolveDocument, type ResolvedDocument } from "../../engines/document/resolve";
import { applyDesignPreset, DESIGN_PRESETS, wearsPreset, type DesignPreset } from "../../presets/designPresets";
import { findPalette } from "../../presets/themes/palettes";
import { swatchesOf } from "../../design-library/colorNames";
import type { ProductProject } from "../../types/project";
import { PageThumb } from "../preview/PageThumb";
import { Section } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;

export function DesignPresetsPanel({ project, update, doc, current }: { project: ProductProject; update: Update; doc: ResolvedDocument; current: number }) {
  return (
    <Section title="Design presets">
      <p className="hint">A complete look in one choice. After applying one, change its colors, background, decorations or typography below.</p>
      <div className="preset-grid">
        {DESIGN_PRESETS.map((d) => (
          <PresetCard key={d.id} d={d} project={project} current={Math.min(current, doc.recipe.pages.length - 1)} worn={wearsPreset(project, d)} onApply={() => update((p) => applyDesignPreset(p, d))} />
        ))}
      </div>
    </Section>
  );
}

function PresetCard({ d, project, current, worn, onApply }: { d: DesignPreset; project: ProductProject; current: number; worn: boolean; onApply: () => void }) {
  const preview = useMemo(() => {
    try {
      return resolveDocument(applyDesignPreset(project, d));
    } catch {
      return null;
    }
  }, [project, d]);
  const page = Math.min(current, (preview?.recipe.pages.length ?? 1) - 1);
  const palette = findPalette(d.paletteId);
  return (
    <div className="preset-card" data-preset={d.id} aria-current={worn || undefined}>
      <div className="preset-card__preview">{preview && preview.recipe.pages.length > 0 && <PageThumb doc={preview} index={page} heightPx={150} />}</div>
      <div className="preset-card__body">
        <strong>{d.name}</strong>
        <span className="swatches" aria-hidden="true">{swatchesOf(palette).map((h, i) => <span key={i} className="swatch" style={{ background: h }} />)}</span>
        <dl className="preset-card__facts">
          <dt>Typography</dt><dd>{d.typography}</dd>
          <dt>Background</dt><dd>{d.background}</dd>
          <dt>Decorations</dt><dd>{d.decorations}</dd>
        </dl>
        <button type="button" className={`btn ${worn ? "" : "btn--primary"}`} onClick={onApply} disabled={worn}>{worn ? "Applied" : "Apply design"}</button>
      </div>
    </div>
  );
}
