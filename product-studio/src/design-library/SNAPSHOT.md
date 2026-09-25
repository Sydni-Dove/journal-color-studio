# Design library — Journal Color Studio snapshot

A one-way copy of approved visual assets from Journal Color Studio
(`Sydni-Dove/journal-color-studio`, commit `8282a74`, taken 2026-09-25).
Product Studio does not import any Journal Color Studio code and keeps
working if that app changes. To refresh an asset, copy the new file over,
bump `version` in `library.ts`, and update its `sha1`.

| Asset id | Source file | Type | Recolor roles (Product Studio) |
| -------- | ----------- | ---- | ------------------------------ |
| jcs-marble-veined | marble-layers.png | marble layer map (R stone detail, G veins, B highlights) | base / veins / highlights |
| jcs-marble-boldgold | marble-layers-canva.png | marble layer map | base / veins / highlights |
| jcs-marble-goldleaf | marble-layers-goldleaf.png | marble layer map | base / veins / highlights |
| jcs-marble-white | marble-layers-white.png | marble layer map | base / veins / highlights |
| jcs-floral-bouquet | floral-cover.jpg | full-color floral art (hue-family recolor) | leaves / gold / deep flowers / soft flowers / paper |
| jcs-floral-corner | floral-corner.png | full-color floral art with alpha | same |
| jcs-floral-sprig | floral-header.png | full-color floral art with alpha | same |
| jcs-accent-topo / -waves / -arcs / -ribbon / -dots / -stripes | accent-*.png | single-color line art (white alpha mask) | line color |

Also snapshotted as neutral data:
- **Marble shading constants.** `shadeBase` / `shadeAmt` for each texture.
- **Watercolor bloom layout.** Positions, radii, roles and alpha values
  (`WATERCOLOR_BLOOMS`).
- **The 13 approved Journal Color Studio palettes.** Adapted to Product
  Studio tokens in `palettes.ts`.

**Not imported, because nothing in Product Studio uses them yet:**
- cover lettering
- bevel frame
- ornament divider
- hand-drawn line strip
- the blush watercolor layer map (Journal Color Studio renders watercolor
  procedurally)

They will be snapshotted once a layout uses them.
