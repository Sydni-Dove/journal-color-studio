# Journal Color Studio → Product Studio: the design library

**Journal Color Studio is the design laboratory. Product Studio is the product builder.**

Journal Color Studio creates and approves visual systems: palettes, recolor
mappings, marble / watercolor / pattern backgrounds, decorative artwork and
its recolor rules. Product Studio consumes the *approved* systems and never
calls Journal Color Studio while it runs.

## How designs travel (today)

```
Journal Color Studio (main)                 Product Studio
  approved asset / palette ──── snapshot ───▶ src/design-library/
                               (explicit,      assets/        byte-identical files
                                one-way,       palettes.ts    JCS palettes, adapted to PS color roles
                                versioned)     library.ts     asset ids → files, formats, recolor recipes
                                               catalog.ts     picker groups (Background vs Decorations)
                                               SNAPSHOT.md    source commit + SHA-1 of every file
```

* **No runtime dependency.** Every asset is copied into Product Studio; the
  snapshot records the source commit and each file's SHA-1, checked by
  `tests/snapshot-integrity.test.ts`.
* **Stable ids.** Projects store asset ids (`jcs-marble-rose`) and palette ids
  (`jcs-emerald-gold`), never file paths or copied colors.
* **Old projects stay stable.** A snapshot changes only when someone refreshes
  it on purpose (SNAPSHOT.md "To refresh"), and the refresh records every file
  that changed. Journal Color Studio can change freely in the meantime.
* **Isolated debugging.** A rendering problem in Product Studio is found in
  Product Studio's own code and snapshot, never in a live call to the other app.

## Recolor logic

Product Studio renders the snapshotted formats with its own
`themes/recolorMath.ts` / `themes/recolor.ts`, written against Journal Color
Studio's formats (layer maps, vein overlays, kintsugi seams, watercolor layer
records). It is not a second design system: it reads the same data with the
same meaning.

### Decision still open (needs Journal Color Studio changes)

The strongest form of "do not duplicate recolor logic" is one shared package
used by both apps — for example `packages/design-system/` holding the palette
definitions, recolor math and asset manifest, versioned, with Journal Color
Studio publishing approved versions and Product Studio pinning one. That
means editing Journal Color Studio (the root app), which is read-only for this
work. Until that is approved, the snapshot above is the boundary.

## What the Style area shows

| Style section | Source |
|---|---|
| Colors | palettes (Dove brand + snapshotted JCS palettes), named by their colors |
| Background | snapshotted surfaces (marble, watercolor, patterns, stripes, solid), real recolored thumbnails |
| Decorations | snapshotted artwork (florals, sprigs, line art, corners), placed by semantic roles |
| Typography | font pairings, shown as sample text |
| Design presets | palette + typography + background + decorations in one choice (`presets/designPresets.ts`); each part stays editable |
