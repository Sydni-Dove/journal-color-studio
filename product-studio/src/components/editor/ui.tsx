import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { acceptDraft, commitDraft, formatNumber, type NumericRules } from "./numericDraft";

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

/**
 * The ONE numeric input. While focused it edits a text draft (Backspace /
 * Delete behave normally; "", "-", ".", "1." are allowed); the number is
 * committed on blur, Enter or Arrow Up/Down, then validated and clamped.
 * Escape reverts. Invalid input is reported under the field.
 */
export function NumericInput({
  value,
  onCommit,
  rules = {},
  step = 0.01,
  ariaLabel,
  className,
  describedBy,
  placeholder,
  id,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  rules?: NumericRules;
  step?: number;
  ariaLabel?: string;
  className?: string;
  describedBy?: string;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "note"; text: string } | null>(null);
  const msgId = useId();
  const commit = (text: string) => {
    const r = commitDraft(text, rules);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.error });
      setDraft(null);
      return;
    }
    setMsg(r.note ? { kind: "note", text: r.note } : null);
    setDraft(null);
    if (r.value !== value) onCommit(r.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(draft ?? formatNumber(value));
    } else if (e.key === "Escape") {
      setDraft(null);
      setMsg(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = commitDraft(draft ?? formatNumber(value), { ...rules, allowEmpty: false });
      const from = base.ok && base.value !== null ? base.value : (value ?? 0);
      commit(formatNumber(from + (e.key === "ArrowUp" ? step : -step)));
    }
  };
  return (
    <>
      <input
        type="text"
        inputMode={rules.integer ? "numeric" : "decimal"}
        role="spinbutton"
        id={id}
        aria-label={ariaLabel}
        aria-valuemin={rules.min}
        aria-valuemax={rules.max}
        aria-valuenow={value ?? undefined}
        aria-invalid={msg?.kind === "error" || undefined}
        aria-describedby={[describedBy, msg ? msgId : null].filter(Boolean).join(" ") || undefined}
        className={className}
        placeholder={placeholder}
        value={draft ?? formatNumber(value)}
        onFocus={(e) => {
          setDraft(formatNumber(value));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          if (acceptDraft(e.target.value, rules)) setDraft(e.target.value);
        }}
        onBlur={() => {
          if (draft !== null) commit(draft);
        }}
        onKeyDown={onKeyDown}
      />
      {msg && (
        // The message DESCRIBES the input (aria-describedby); it is never part of the label.
        <span id={msgId} className={`field-msg field-msg--${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>
          {msg.text}
        </span>
      )}
    </>
  );
}

/** A labelled numeric field. The label is a <label for>, so feedback under the input never renames it. */
export function LabeledNumeric({ label, ...input }: { label: string } & Parameters<typeof NumericInput>[0]) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <NumericInput {...input} id={id} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  integer,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  suffix?: string;
}) {
  return (
    <LabeledNumeric
      label={suffix ? `${label} (${suffix})` : label}
      value={value}
      step={step}
      rules={{ min, max, integer: integer ?? (step >= 1 && Number.isInteger(step)) }}
      onCommit={(v) => v !== null && onChange(v)}
    />
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
