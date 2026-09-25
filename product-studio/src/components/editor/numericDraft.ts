/**
 * Numeric field editing model: the text being typed (draft) is separate from
 * the committed number. Drafts may be temporarily incomplete ("", "-", ".",
 * "1.") and are never coerced while typing; they are parsed, validated and
 * clamped only on commit (blur / Enter / step).
 */
export type NumericRules = { min?: number; max?: number; integer?: boolean; allowEmpty?: boolean };

export type CommitResult =
  | { ok: true; value: number | null; note?: string }
  | { ok: false; error: string };

/** Characters a draft may contain at any moment (partial numbers allowed). */
export function acceptDraft(next: string, rules: NumericRules): boolean {
  const negative = rules.min === undefined || rules.min < 0;
  const pattern = rules.integer ? (negative ? /^-?\d*$/ : /^\d*$/) : negative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return pattern.test(next.trim());
}

/** Display text for a committed value (no float noise, no trailing zeros). */
export function formatNumber(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "" : String(+v.toFixed(4));
}

const range = (r: NumericRules) =>
  r.min !== undefined && r.max !== undefined ? `between ${formatNumber(r.min)} and ${formatNumber(r.max)}` : r.min !== undefined ? `of at least ${formatNumber(r.min)}` : r.max !== undefined ? `of at most ${formatNumber(r.max)}` : "";

/** Parse, validate and clamp a draft. */
export function commitDraft(draft: string, rules: NumericRules): CommitResult {
  const t = draft.trim();
  if (t === "") return rules.allowEmpty ? { ok: true, value: null } : { ok: false, error: `Enter a number ${range(rules)}`.trim() + "." };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, error: `"${t}" is not a number.` };
  let v = parseFloat(t);
  let note: string | undefined;
  if (rules.integer && !Number.isInteger(v)) {
    v = Math.round(v);
    note = `Rounded to ${v}.`;
  }
  if (rules.min !== undefined && v < rules.min) {
    v = rules.min;
    note = `Raised to the minimum, ${formatNumber(v)}.`;
  }
  if (rules.max !== undefined && v > rules.max) {
    v = rules.max;
    note = `Lowered to the maximum, ${formatNumber(v)}.`;
  }
  return { ok: true, value: v, note };
}
