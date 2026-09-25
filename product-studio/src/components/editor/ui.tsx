import type { ReactNode } from "react";

export function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <Field label={suffix ? `${label} (${suffix})` : label}>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} style={{ minHeight: 44 }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Navigation the panels use to show where a page-scoped control takes effect. */
export type EditorNav = {
  currentLayoutId: string;
  goToLayout: (layoutId: string) => void;
  goToItem: (recipeItemId: string) => void;
  goToSide: (side: "recto" | "verso") => void;
  goToMonth: (monthKey: string) => void;
  layoutLabel: (layoutId: string) => string;
};

/** "Applies to Weekly Spread pages · Show" when the visible page doesn't use a control. */
export function AppliesTo({ ids, nav }: { ids: string[]; nav: EditorNav }) {
  if (!ids.length || ids.includes(nav.currentLayoutId)) return null;
  return (
    <p className="hint">
      Applies to {ids.map(nav.layoutLabel).join(", ")} pages ·{" "}
      <button type="button" className="btn btn--ghost" style={{ minHeight: 44, padding: "0 10px" }} onClick={() => nav.goToLayout(ids[0])}>
        Show
      </button>
    </p>
  );
}
