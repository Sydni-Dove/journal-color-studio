/**
 * COLORS — palettes as swatches, named by what they look like ("Burgundy +
 * Cream + Gold") with the palette's own name second. Filter by color family,
 * Dove Expressions palettes, or the ones used recently. Replaces the long
 * text-only palette list.
 */
import { useMemo, useState } from "react";
import { brandedName, COLOR_FAMILIES, describePalette, familyOf, swatchesOf, type ColorFamily } from "../../design-library/colorNames";
import { PALETTES } from "../../presets/themes/palettes";
import type { ColorPalette } from "../../types/tokens";

type Filter = "recent" | "dove" | "all" | ColorFamily;
const RECENT_KEY = "dove-product-studio:v1:recent-palettes";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 8)));
  } catch {
    /* a convenience only */
  }
}

export function PalettePicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const current = PALETTES.find((p) => p.id === value);
  const [filter, setFilter] = useState<Filter>(() => (current?.brandPalette ? "dove" : current ? familyOf(current) : "dove"));
  const recent = readRecent();
  const list = useMemo(() => {
    const ok = (p: ColorPalette) =>
      filter === "all" ? true : filter === "dove" ? !!p.brandPalette : filter === "recent" ? recent.includes(p.id) : familyOf(p) === filter;
    const l = PALETTES.filter(ok);
    return filter === "recent" ? recent.map((id) => l.find((p) => p.id === id)).filter((p): p is ColorPalette => !!p) : l;
  }, [filter, recent.join()]);
  const chips: { id: Filter; label: string }[] = [
    ...(recent.length ? [{ id: "recent" as Filter, label: "Recent" }] : []),
    { id: "dove", label: "Dove Expressions" },
    ...COLOR_FAMILIES.map((f) => ({ id: f as Filter, label: f })),
    { id: "all", label: `All (${PALETTES.length})` },
  ];
  return (
    <div className="palette-picker">
      {current && (
        <div className="palette-current" data-testid="palette-current">
          <Swatches p={current} />
          <span>
            <strong>{describePalette(current)}</strong>
            <span className="hint"> · {brandedName(current)}</span>
          </span>
        </div>
      )}
      <div className="chip-row" role="group" aria-label="Show palettes">
        {chips.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="palette-grid" role="list">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className="palette-card"
            data-palette={p.id}
            aria-pressed={p.id === value}
            aria-label={`${describePalette(p)} — ${brandedName(p)}`}
            onClick={() => {
              pushRecent(p.id);
              onPick(p.id);
            }}
          >
            <Swatches p={p} />
            <span className="palette-card__name">{describePalette(p)}</span>
            <span className="palette-card__brand">{brandedName(p)}{!p.brandPalette && !p.source ? " · draft" : ""}</span>
          </button>
        ))}
        {!list.length && <p className="hint">No palettes here yet.</p>}
      </div>
    </div>
  );
}

function Swatches({ p }: { p: ColorPalette }) {
  return (
    <span className="swatches" aria-hidden="true">
      {swatchesOf(p).map((h, i) => (
        <span key={i} className="swatch" style={{ background: h }} />
      ))}
    </span>
  );
}
