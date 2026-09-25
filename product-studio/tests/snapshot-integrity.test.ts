/// <reference types="node" />
/**
 * Design-library snapshot integrity: every snapshotted file matches the SHA-1
 * recorded in library.ts and SNAPSHOT.md, and no Product Studio source file
 * reaches outside /product-studio (no runtime dependency on Journal Color Studio).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN_ASSETS, JCS_SNAPSHOT } from "../src/design-library/library";

const ROOT = resolve(__dirname, "..");
const ASSETS = join(ROOT, "src/design-library/assets");
const sha1 = (file: string) => createHash("sha1").update(readFileSync(file)).digest("hex");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

describe("design-library snapshot", () => {
  const snapshotMd = readFileSync(join(ROOT, "src/design-library/SNAPSHOT.md"), "utf8");

  it("records the current Journal Color Studio source", () => {
    expect(JCS_SNAPSHOT.commit).toBe("14e4e75");
    expect(JCS_SNAPSHOT.branch).toBe("integration/multi-journal-plus-patterns");
    expect(snapshotMd).toContain("14e4e75");
  });

  for (const a of DESIGN_ASSETS) {
    it(`${a.id}: ${a.sourceFile} matches its recorded SHA-1 (library.ts and SNAPSHOT.md)`, () => {
      const file = join(ASSETS, a.sourceFile);
      expect(sha1(file)).toBe(a.sha1);
      expect(snapshotMd).toContain(a.sha1);
      if (a.type === "marble" && a.veins) {
        expect(sha1(join(ASSETS, a.veins.sourceFile))).toBe(a.veins.sha1);
        expect(snapshotMd).toContain(a.veins.sha1);
      }
    });
  }

  it("the retired lettered cover (floral-cover.jpg) is no longer shipped", () => {
    expect(walk(ASSETS).map((f) => relative(ASSETS, f))).not.toContain("floral-cover.jpg");
  });

  it("every file in assets/ is recorded in SNAPSHOT.md", () => {
    for (const f of walk(ASSETS)) expect(snapshotMd).toContain(sha1(f));
  });
});

describe("no runtime dependency on Journal Color Studio", () => {
  const sources = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx|css)$/.test(f));
  it("no source import resolves outside /product-studio", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;
        const target = resolve(f, "..", spec);
        if (!target.startsWith(ROOT + "/")) offenders.push(`${relative(ROOT, f)} → ${spec}`);
      }
      if (/journal-color-studio\//.test(text.replace(/Sydni-Dove\/journal-color-studio/g, ""))) offenders.push(`${relative(ROOT, f)} mentions a journal-color-studio path`);
    }
    expect(offenders).toEqual([]);
  });
});
