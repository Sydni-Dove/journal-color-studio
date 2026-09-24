import { describe, expect, it } from "vitest";
import { fromInches, inToMm, mmToIn, toInches } from "../src/engines/units/units";
import { orient, resolveTrim, validateDimensions } from "../src/engines/geometry/dimensions";
import { SIZE_PRESETS } from "../src/presets/sizes/sizePresets";

describe("unit conversion", () => {
  it("converts inches, millimetres and points exactly", () => {
    expect(toInches(25.4, "mm")).toBeCloseTo(1, 12);
    expect(toInches(72, "pt")).toBe(1);
    expect(fromInches(1, "mm")).toBeCloseTo(25.4, 12);
    expect(mmToIn(5)).toBeCloseTo(0.19685, 5); // research: 5 mm = 0.1969"
    expect(inToMm(11 / 32)).toBeCloseTo(8.73, 2); // research: wide rule 8.7 mm
    expect(inToMm(9 / 32)).toBeCloseTo(7.14, 2); // research: college rule 7.1 mm
  });
  it("round-trips", () => {
    for (const v of [0.125, 3.2, 17, 210]) expect(fromInches(toInches(v, "mm"), "mm")).toBeCloseTo(v, 10);
  });
});

describe("dimension engine", () => {
  it("resolves every preset to positive canonical inches", () => {
    for (const p of SIZE_PRESETS) {
      const t = resolveTrim({ sizePresetId: p.id, orientation: p.defaultOrientation });
      expect(t.widthIn).toBeGreaterThan(0);
      expect(t.heightIn).toBeGreaterThan(0);
    }
  });
  it("includes every size the brief requires", () => {
    const ids = SIZE_PRESETS.map((s) => s.id);
    for (const id of ["3x5", "4x6", "4x9", "5x7", "5x8", "5.5x8.5", "6x9", "7x9", "7x9.25", "8x10", "8.5x11", "11x17", "a4", "a5", "a6", "filofax-personal", "filofax-pocket", "franklin-compact", "franklin-classic"]) {
      expect(ids).toContain(id);
    }
  });
  it("applies orientation by swapping, not scaling", () => {
    expect(orient(5, 7, "portrait")).toEqual({ widthIn: 5, heightIn: 7 });
    expect(orient(5, 7, "landscape")).toEqual({ widthIn: 7, heightIn: 5 });
    const tab = resolveTrim({ sizePresetId: "11x17", orientation: "landscape" });
    expect([tab.widthIn, tab.heightIn]).toEqual([17, 11]);
  });
  it("converts millimetre presets (A5, Filofax Personal)", () => {
    const a5 = resolveTrim({ sizePresetId: "a5", orientation: "portrait" });
    expect(a5.widthIn).toBeCloseTo(5.83, 2);
    expect(a5.heightIn).toBeCloseTo(8.27, 2);
    const fp = resolveTrim({ sizePresetId: "filofax-personal", orientation: "portrait" });
    expect(fp.widthIn).toBeCloseTo(3.74, 2); // A-B4: 3.74" × 6.73"
    expect(fp.heightIn).toBeCloseTo(6.73, 2);
  });
  it("keeps research confidence on presets without upgrading it", () => {
    expect(SIZE_PRESETS.find((s) => s.id === "7x9.25")!.confidence).toBe("observed-estimated");
    expect(SIZE_PRESETS.find((s) => s.id === "7x9")!.confidence).toBe("manufacturer-published");
    expect(SIZE_PRESETS.find((s) => s.id === "filofax-pocket")!.confidence).toBe("observed-estimated");
  });
  it("supports custom sizes in inches and millimetres", () => {
    const inch = resolveTrim({ sizePresetId: "custom", custom: { width: 4.25, height: 11, unit: "in" }, orientation: "portrait" });
    expect(inch).toMatchObject({ widthIn: 4.25, heightIn: 11 });
    const mm = resolveTrim({ sizePresetId: "custom", custom: { width: 100, height: 150, unit: "mm" }, orientation: "landscape" });
    expect(mm.widthIn).toBeCloseTo(150 / 25.4, 10);
    expect(mm.heightIn).toBeCloseTo(100 / 25.4, 10);
  });
  it("rejects invalid dimensions", () => {
    expect(validateDimensions({ sizePresetId: "custom", custom: { width: -2, height: 5, unit: "in" }, orientation: "portrait" })).toHaveLength(1);
    expect(validateDimensions({ sizePresetId: "custom", custom: { width: 0.5, height: 5, unit: "in" }, orientation: "portrait" })[0].field).toBe("width");
    expect(validateDimensions({ sizePresetId: "custom", custom: { width: 5, height: 100, unit: "in" }, orientation: "portrait" })[0].field).toBe("height");
    expect(validateDimensions({ sizePresetId: "nope", orientation: "portrait" })).toHaveLength(1);
    expect(() => resolveTrim({ sizePresetId: "custom", orientation: "portrait" })).toThrow();
  });
});
