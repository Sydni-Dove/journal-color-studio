/**
 * COLOR LOOK — a palette's colors used different ways without new colors:
 * arrangements (tap the palette again) and white paper.
 */
import { describe, expect, it } from "vitest";
import { arrangementsOf, contrast, HEADING_CONTRAST, PALETTES, resolveColors, WHITE_PAPER } from "../src/presets/themes/palettes";
import { resolveDocument } from "../src/engines/document/resolve";
import { createProject } from "../src/presets/products/projectFactory";

const ROLES = ["primary", "accent", "decorativeAccent"] as const;

describe("color arrangements", () => {
  it("the first is the palette as designed; the others only move the palette's own colors, keeping headings readable", () => {
    let multi = 0;
    for (const p of PALETTES) {
      const all = arrangementsOf(p.colors);
      expect(all[0], p.id).toEqual(p.colors);
      const own = new Set([...ROLES.map((r) => p.colors[r]), p.colors.secondary]);
      for (const a of all.slice(1)) {
        for (const r of ROLES) expect(own.has(a[r]), `${p.id} ${r}`).toBe(true);
        expect(contrast(a.primary, a.background), p.id).toBeGreaterThanOrEqual(HEADING_CONTRAST);
        expect(a.text).toBe(p.colors.text);
        expect(a.background).toBe(p.colors.background);
      }
      if (all.length > 1) multi++;
      // No two arrangements are the same.
      expect(new Set(all.map((a) => ROLES.map((r) => a[r]).join())).size, p.id).toBe(all.length);
    }
    expect(multi).toBeGreaterThan(PALETTES.length / 2);
  });

  it("stepping past the last arrangement comes back to the first", () => {
    const p = PALETTES.find((x) => arrangementsOf(x.colors).length > 1)!;
    const n = arrangementsOf(p.colors).length;
    expect(resolveColors(p.id, {}, { arrangement: n })).toEqual(resolveColors(p.id, {}, { arrangement: 0 }));
    expect(resolveColors(p.id, {}, { arrangement: 1 }).primary).not.toBe(resolveColors(p.id, {}, {}).primary);
  });
});

describe("white paper", () => {
  it("keeps the palette's colors, with white paper; fine-tuned colors still win", () => {
    for (const p of PALETTES) {
      const c = resolveColors(p.id, {}, { paper: "white" });
      expect(c.background).toBe(WHITE_PAPER);
      expect(c.primary).toBe(p.colors.primary);
      expect(c.text).toBe(p.colors.text);
    }
    const p = PALETTES[0];
    expect(resolveColors(p.id, { background: "#FAF0E6" }, { paper: "white" }).background).toBe("#FAF0E6");
  });

  it("a product with white paper renders white pages in the chosen palette", () => {
    const pal = PALETTES.find((x) => x.colors.background.toLowerCase() !== "#ffffff")!;
    const doc = resolveDocument(createProject("journal", { name: "w", colors: { paletteId: pal.id, overrides: {}, paper: "white" } } as never));
    expect(doc.colors.background).toBe(WHITE_PAPER);
    expect(doc.colors.primary).toBe(pal.colors.primary);
  });
});
