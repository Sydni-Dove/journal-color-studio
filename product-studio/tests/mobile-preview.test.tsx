/**
 * Mobile preview containment. Physical pages keep their real size (inches);
 * the preview scales them VISUALLY. These tests pin the two halves of that
 * contract: the scaled footprint fits every supported width for single pages
 * and spreads. The other half — the CSS clipping the unscaled layout box,
 * which a transform does not shrink (iOS WebKit counts it as scroll
 * overflow) — is checked on computed styles in
 * tests/browser/mobile-overflow.browser.ts (npm run test:mobile).
 */
import { describe, expect, it } from "vitest";
import { previewFrame } from "../src/components/preview/PagePreview";
import { geometryFor, resolveDocument } from "../src/engines/document/resolve";
import { CSS_PX_PER_IN } from "../src/engines/units/units";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";

/** Preview viewport horizontal padding (16px each side, app.css). */
const VIEWPORT_PAD_PX = 32;
const WIDTHS = [375, 393, 430, 768];
const HEIGHT = 844;
const CHROME_PX = 190;


describe("preview footprint fits mobile widths (physical size unchanged)", () => {
  for (const t of [TEST_PRODUCTS[3], TEST_PRODUCTS[2], TEST_PRODUCTS[4]]) {
    const doc = resolveDocument(t.build());
    const g = geometryFor(doc, doc.recipe.pages[0]);
    for (const pages of [1, 2]) {
      const natural = { w: g.mediaWidthIn * CSS_PX_PER_IN * pages, h: g.mediaHeightIn * CSS_PX_PER_IN };
      for (const w of WIDTHS) {
        const avail = { w: w - VIEWPORT_PAD_PX, h: HEIGHT - CHROME_PX };
        it(`${t.label}, ${pages === 1 ? "single" : "spread"} @ ${w}px: fit page and fit width stay inside the column`, () => {
          for (const fit of ["page", "width"] as const) {
            const f = previewFrame(natural, avail, fit, 1);
            expect(f.width).toBeLessThanOrEqual(avail.w + 1e-9);
            expect(f.pan).toBe(false);
          }
          // Physical geometry is untouched: the rendered page is still the real trim in inches.
          expect(g.trimWidthIn).toBe(doc.trim.widthIn);
        });
      }
    }
  }
  it("manual zoom beyond the column pans inside the preview instead of widening the page", () => {
    const f = previewFrame({ w: 672, h: 864 }, { w: 343, h: 650 }, "zoom", 1);
    expect(f.width).toBe(672);
    expect(f.pan).toBe(true);
  });
});
