/**
 * Numeric editing model: the draft (what is typed) is separate from the
 * committed number. Partial states are allowed while typing; parsing,
 * validation and clamping happen only on commit.
 */
import { describe, expect, it } from "vitest";
import { acceptDraft, commitDraft, formatNumber } from "../src/components/editor/numericDraft";

/** Simulate keystrokes on a draft: characters append, "⌫" deletes the last one. */
function type(start: string, keys: string[], rules: Parameters<typeof acceptDraft>[1]) {
  let draft = start;
  const states: string[] = [];
  for (const k of keys) {
    const next = k === "⌫" ? draft.slice(0, -1) : draft + k;
    if (acceptDraft(next, rules)) draft = next;
    states.push(draft);
  }
  return { draft, states };
}

describe("numeric draft editing", () => {
  const integer = { min: 1, max: 500, integer: true };
  it("33 → Backspace → Backspace → 120 commits 120", () => {
    const { draft, states } = type("33", ["⌫", "⌫", "1", "2", "0"], integer);
    expect(states).toEqual(["3", "", "1", "12", "120"]);
    expect(commitDraft(draft, integer)).toEqual({ ok: true, value: 120 });
  });
  it("the field can be emptied while typing (the last digit deletes)", () => {
    expect(type("3", ["⌫"], integer).draft).toBe("");
  });
  it("allows temporary partial states: '', '-', '.', '1.'", () => {
    const signed = { min: -3, max: 3 };
    for (const s of ["", "-", ".", "1.", "-0.", "-.5"]) expect(acceptDraft(s, signed), s).toBe(true);
    expect(type("", ["-", ".", "2", "5"], signed).draft).toBe("-.25");
    expect(commitDraft("-.25", signed)).toEqual({ ok: true, value: -0.25 });
  });
  it("rejects characters that can never form a number (and '-' when negatives are not allowed)", () => {
    expect(acceptDraft("12a", { min: 0 })).toBe(false);
    expect(acceptDraft("-1", { min: 0 })).toBe(false);
    expect(acceptDraft("1.5", { integer: true })).toBe(false);
  });
  it("commit validates, clamps and explains", () => {
    expect(commitDraft("", { min: 0 })).toMatchObject({ ok: false });
    expect(commitDraft("-", { min: -1 })).toMatchObject({ ok: false });
    expect(commitDraft("", { allowEmpty: true })).toEqual({ ok: true, value: null });
    expect(commitDraft("900", { min: 1, max: 120 })).toMatchObject({ ok: true, value: 120, note: expect.stringContaining("maximum") });
    expect(commitDraft("0", { min: 1 })).toMatchObject({ ok: true, value: 1, note: expect.stringContaining("minimum") });
    expect(commitDraft("2.6", { integer: true })).toMatchObject({ ok: true, value: 3 });
    expect(commitDraft("1.", {})).toEqual({ ok: true, value: 1 });
  });
  it("formats committed values without float noise", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(null)).toBe("");
  });
});
