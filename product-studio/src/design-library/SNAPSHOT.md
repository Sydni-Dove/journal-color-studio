# Design library — Journal Color Studio snapshot

A **one-way copy** of approved visual assets and design data from Journal Color
Studio. Product Studio never imports Journal Color Studio code, has no runtime
dependency on it, and keeps working if that app changes or disappears. The
recolor rendering (`themes/recolorMath.ts`, `themes/recolor.ts`), the
composition engine and the editor are Product Studio's own implementations of
the snapshotted formats and data.

| | |
|---|---|
| Source repository | `Sydni-Dove/journal-color-studio` |
| Source branch | `main` — the stable source. PR #2 (`claude/cool-feynman-g41n84`) was merged on 2026-09-26; it carries the pattern / four-journal integration work Product Studio previously snapshotted from `integration/multi-journal-plus-patterns`. No WIP branch was used. |
| Source commit | `ba916ad` (Merge pull request #2), verified 2026-09-27 |
| Previous snapshot | `14e4e75` (`integration/multi-journal-plus-patterns`, 2026-09-25); before that `8282a74` |

To refresh: fetch `main`, compare each file's SHA-1 below against the new head
(`git show <commit>:<file> | sha1sum`), copy only changed or newly approved
files byte-for-byte, record them here and in `library.ts`, and re-run
`python3 tools/build_occupancy.py` (object artwork) and
`python3 tools/build_thumbs.py` (picker thumbnails).

## Files

Every file is byte-identical to Journal Color Studio `main` at `ba916ad`
(SHA-1 checked by `tests/snapshot-integrity.test.ts`). "Source commit" is the
commit that last changed the file upstream.

| Asset id | Type | JCS source file | File (in `assets/`) | Source commit | SHA-1 | Snapshotted | vs. previous snapshot |
|---|---|---|---|---|---|---|---|
| jcs-marble-veined | marble layer map | `marble-layers.png` | `marble-layers.png` | `8282a74` | 00c64f3d5b184494bf20d97b242670ac94fa65eb | 2026-09-25 | IDENTICAL |
| jcs-marble-boldgold | marble layer map | `marble-layers-canva.png` | `marble-layers-canva.png` | `8282a74` | 3a927ad8c4c8beae5e5310c9d5b9e517677b2228 | 2026-09-25 | IDENTICAL |
| jcs-marble-boldgold (veins) | vein overlay (opaque photo) | `marble-canva-source.png` | `marble-canva-source.png` | `14e4e75` | 6d1340bf5fe4f9d2da4624612346128354dbbff5 | 2026-09-25 | IDENTICAL |
| jcs-marble-goldleaf | marble layer map | `marble-layers-goldleaf.png` | `marble-layers-goldleaf.png` | `8282a74` | 497da5d008f29be0e0e6095c6f947a27df5b2cd5 | 2026-09-25 | IDENTICAL |
| jcs-marble-goldleaf (veins) | vein overlay (transparent) | `marble-goldleaf-gold.png` | `marble-goldleaf-gold.png` | `14e4e75` | 768a91750cfe97935ce9b381543f2cd4434432d5 | 2026-09-25 | IDENTICAL |
| jcs-marble-white | marble layer map | `marble-layers-white.png` | `marble-layers-white.png` | `8282a74` | bd7ce03f23dbc3af604fdc1e9e82e003093a6b92 | 2026-09-25 | IDENTICAL |
| jcs-marble-rose | kintsugi marble layer map | `marble-layers-rose.png` | `marble-layers-rose.png` | `d7068ea` | 6c06cd18ba689d1b7e21f94528eb7cf470a5b5fd | 2026-09-27 | **NEW** |
| jcs-marble-rose (seams) | kintsugi gold seams (transparent) | `marble-rose-gold.png` | `marble-rose-gold.png` | `d7068ea` | 4f7e0a5f50f5b0fb987cb075f9f714f8491800a8 | 2026-09-27 | **NEW** |
| jcs-marble-burgundy | kintsugi marble layer map (texScale 2) | `marble-layers-burgundy.png` | `marble-layers-burgundy.png` | `d7068ea` | 2596f5d648b1e702c5b6613ecd12d28e66f258ce | 2026-09-27 | **NEW** |
| jcs-marble-burgundy (source) | whole original, per-pixel tone-transfer source (opaque) | `marble-burgundy-source.jpg` | `marble-burgundy-source.jpg` | `d7068ea` | 9ca564d88e0d37360d8566d01b14e6742ec900b1 | 2026-09-27 | **NEW** |
| jcs-marble-ember | kintsugi marble layer map | `marble-layers-ember.png` | `marble-layers-ember.png` | `d7068ea` | f5535a0c1c696e71233ce11a5abe106d995a70a1 | 2026-09-27 | **NEW** |
| jcs-marble-ember (seams) | kintsugi ember seams (transparent) | `marble-ember-gold.png` | `marble-ember-gold.png` | `d7068ea` | 73c3fcb672ba24f7256865de49655d97cd2447fd | 2026-09-27 | **NEW** |
| jcs-marble-peach | kintsugi marble layer map | `marble-layers-peach.png` | `marble-layers-peach.png` | `d7068ea` | 41b0a77820e9e4850cc58a4710aee1707e29003c | 2026-09-27 | **NEW** |
| jcs-marble-peach (seams) | kintsugi gold seams (transparent) | `marble-peach-gold.png` | `marble-peach-gold.png` | `d7068ea` | 4dc9eb3e07ed59aca49d8578df15fc1bb81865b5 | 2026-09-27 | **NEW** |
| jcs-pattern-cabana | stripe ink map | `pattern-cabana.png` | `pattern-cabana.png` | `8ed5ace` | 02c8f892db89c6af4c86b6e856c8546a8cf909d8 | 2026-09-27 | **NEW** |
| jcs-pattern-pinstripe | stripe ink map | `pattern-pinstripe.png` | `pattern-pinstripe.png` | `8ed5ace` | 37574a25225c4ff89e8036449194ac21ac268c66 | 2026-09-27 | **NEW** |
| jcs-pattern-bias | stripe ink map | `pattern-bias.png` | `pattern-bias.png` | `8ed5ace` | 52df1d2e476c0e6e9d0ffbfe8cab25fc469375ba | 2026-09-27 | **NEW** |
| jcs-floral-bouquet | floral (full color, alpha) | `floral-bouquet.png` | `floral-bouquet.png` | `14e4e75` | 57b03db65e1c35cd0687beb308995cc10211e9ba | 2026-09-25 | IDENTICAL |
| jcs-floral-corner | floral (full color, alpha) | `floral-corner.png` | `floral-corner.png` | `8282a74` | 26c5d487e764d0a7b68166e2942eb6490f8c7395 | 2026-09-25 | IDENTICAL |
| jcs-floral-sprig | floral (full color, alpha) | `floral-header.png` | `floral-header.png` | `8282a74` | 368b2f4921410c7bcecd7d313d5450e406c9a095 | 2026-09-25 | IDENTICAL |
| jcs-accent-topo | line art (alpha mask) | `accent-topo.png` | `accent-topo.png` | `8282a74` | 3d615764f1a005f719f0fd4edffc05edcaa1db9b | 2026-09-25 | IDENTICAL |
| jcs-accent-waves | line art (alpha mask) | `accent-waves.png` | `accent-waves.png` | `8282a74` | 5d368bc089bbc8bdd696eafa4586099edf53cdb8 | 2026-09-25 | IDENTICAL |
| jcs-accent-arcs | line art (alpha mask) | `accent-arcs.png` | `accent-arcs.png` | `8282a74` | 5ec31ff823f5ceb11350ceb4903f3aa00d2f9145 | 2026-09-25 | IDENTICAL |
| jcs-accent-ribbon | line art (alpha mask) | `accent-ribbon.png` | `accent-ribbon.png` | `8282a74` | fd31dee797dd7da16bc6ad13158255a0db259457 | 2026-09-25 | IDENTICAL |
| jcs-accent-dots | line art (alpha mask) | `accent-dots.png` | `accent-dots.png` | `8282a74` | d11bd55dbb84963ebfc95e0505fa7681a05c9247 | 2026-09-25 | IDENTICAL |
| jcs-accent-stripes | line art (alpha mask) | `accent-stripes.png` | `accent-stripes.png` | `8282a74` | bed6f555cdeb7b89a8b87abbe656d5649ccf2c8c | 2026-09-25 | IDENTICAL |
| jcs-watercolor-abstract (layers) | watercolor layer record (Canva transforms) | `canva/abstract64/layers.json` | `abstract64/layers.json` | `46fd8ab` | c2406b25ef45f5abec83e6eb1a124c3fa276ee0f | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-00.png` | `abstract64/layer-00.png` | `46fd8ab` | b32fb8fbcfa488745b33f8e5d88fe20ce2a0f9cd | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-01.png` | `abstract64/layer-01.png` | `46fd8ab` | 31ce6189a20b7949606d9a8bc879c3799d183ce6 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-02.png` | `abstract64/layer-02.png` | `46fd8ab` | 9d05fc792f028a1c3bfd1d4ba2d3a75e6535a4e8 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-03.png` | `abstract64/layer-03.png` | `46fd8ab` | b9f198a5d3877df8a4863f5984fbd32ed8ac4025 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-04.png` | `abstract64/layer-04.png` | `46fd8ab` | dc21049d46b218ed0dd40d0547fd72941cc03899 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-05.png` | `abstract64/layer-05.png` | `46fd8ab` | 0795c9d9ddf4cd5afc4946ac1b41be263c55ad84 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-06.png` | `abstract64/layer-06.png` | `46fd8ab` | 24e587dc4a1acbb5dfb0715b845190a017203a9e | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-07.png` | `abstract64/layer-07.png` | `46fd8ab` | 1e312379d1137334d234cebc7b30293117fd8fcf | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-08.png` | `abstract64/layer-08.png` | `46fd8ab` | 76a46fe7fc4e917527c73aeba7fa9535be879079 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-09.png` | `abstract64/layer-09.png` | `46fd8ab` | ec3b942509ebaafd46a91bf63cfc1ad3174f52ff | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-10.png` | `abstract64/layer-10.png` | `46fd8ab` | eb31b574ed945889d45c26ad8bde635e5f6e0576 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-11.png` | `abstract64/layer-11.png` | `46fd8ab` | 1b07c80ae8b0d726a5d3ff639cf6af7ce6e40b15 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-12.png` | `abstract64/layer-12.png` | `46fd8ab` | 0ee722cf37508427df8bd2a6559f795f2b6fcab5 | 2026-09-27 | **NEW** |
| jcs-watercolor-abstract | watercolor layer (transparent) | `canva/abstract64/layer-13.png` | `abstract64/layer-13.png` | `46fd8ab` | ba1661934dc64db1f3261ddac71cff440fa60c2f | 2026-09-27 | **NEW** |
| font "Against" | brand display font | `brand/against.otf` | `fonts/against.otf` | `14e4e75` | f033e74f39effdab4662789625e923475a8bd95f | 2026-09-25 | IDENTICAL |

### Derived files (not from Journal Color Studio)

Picker thumbnails, 160 px centre crops (materials) or whole silhouettes
(objects), and `*-stats.png` whole-frame 240 px samples of each marble map
(thumbnail tone statistics), and `thumbs/abstract64/*` (every watercolor layer
at 25 %, one shared factor so the Canva transforms still place them), built by
`tools/build_thumbs.py` from the files above. Used only
in the editor's design picker, recolored live with the page's engine; pages
and print always use the full files.

| File | SHA-1 |
|---|---|
| `thumbs/abstract64/layer-00.png` | 21e09dd9d7a2834bbaa53e713d9435957e3d73df |
| `thumbs/abstract64/layer-01.png` | d415b0fbf2f5d04f08bc9f67e8651c0072a3be3b |
| `thumbs/abstract64/layer-02.png` | e0408c5070b0175a235742bbaccff1065607c19b |
| `thumbs/abstract64/layer-03.png` | 13ca5408440398c7b4c196a455aca5d331b7cd25 |
| `thumbs/abstract64/layer-04.png` | fa6698f0d00a6a765ef2583f4ca4d5f9990b50b6 |
| `thumbs/abstract64/layer-05.png` | d72875533cc9aaa37a5b74c35f05173201cb8bab |
| `thumbs/abstract64/layer-06.png` | 0b23b8e9a5a0dd892f541fa483e802f99f2ebaca |
| `thumbs/abstract64/layer-07.png` | f5703ba6f7a215da44641942f4578ff8ffa197da |
| `thumbs/abstract64/layer-08.png` | a35a237d8d19becb841f7276742b4bfcedc4b10c |
| `thumbs/abstract64/layer-09.png` | 3679785923c6b242261c124ecc9f422b7ad8fbab |
| `thumbs/abstract64/layer-10.png` | 6d58b375794a892c9d10ab0fc08732e881006773 |
| `thumbs/abstract64/layer-11.png` | 59f2303cbdf683f03b1c765a4706ae648141fb24 |
| `thumbs/abstract64/layer-12.png` | 8b6bf62b26c4610f75ac9b8983c6b3aea8aac996 |
| `thumbs/abstract64/layer-13.png` | f7a44c2ad456e037ed784e598d7a47b21ae61cab |
| `thumbs/floral-bouquet.png` | 67ed06dffcca54721a2fdee376fd24e96c6fe794 |
| `thumbs/floral-corner.png` | cbe7e3673400c5d1631ea8f3c1f53407fb88c2b1 |
| `thumbs/floral-header.png` | 3f93f70a53bb2a7f575f9a414873442d257cb68e |
| `thumbs/marble-burgundy-source.jpg` | c7bc06fb64f0e924b805729f58ebe1e09a20dd1f |
| `thumbs/marble-canva-source.png` | 0f33a9bd7e3c729e39299f1a691df32b81a84a37 |
| `thumbs/marble-ember-gold.png` | 9fee2ebd88dc10e5f06e3d8e552a2e3c5c62652a |
| `thumbs/marble-goldleaf-gold.png` | 7c0c466bcc8c559b2d14ff594749b33f62531bf8 |
| `thumbs/marble-layers-burgundy-stats.png` | e545b5bb984e3fa66bd8e3c3077455a4f727cebe |
| `thumbs/marble-layers-burgundy.png` | fd5dd45d1be0b49a5593042494ab04b23b5f6569 |
| `thumbs/marble-layers-canva-stats.png` | 623ffeedbb35f8d203fa9dc0e4002711e6925e41 |
| `thumbs/marble-layers-canva.png` | 8be83abace5a63bc673b5de9632d51421bd58dbc |
| `thumbs/marble-layers-ember-stats.png` | 45dc5d35f5472758df022ecf61dca6da9da59e3d |
| `thumbs/marble-layers-ember.png` | 1f0a9f17e0802de8ad9ea5c7957aa32e73fc51e9 |
| `thumbs/marble-layers-goldleaf-stats.png` | 415fab70566c6dcb866499c3aa4f4109d594a82c |
| `thumbs/marble-layers-goldleaf.png` | 7e3200badcffc2e7da4990e67b0732fd6faa395d |
| `thumbs/marble-layers-peach-stats.png` | 6492814ef3641b34a2a37782c08099e3ccf34e62 |
| `thumbs/marble-layers-peach.png` | 5a07c137c3d5fb4cd7f9801a3998c071df4c8324 |
| `thumbs/marble-layers-rose-stats.png` | f83ade8d87e320bd8a0264f825c3258dfd579b4a |
| `thumbs/marble-layers-rose.png` | 5323fb55c4ab5f1d0fb866b9a826e8cca20599be |
| `thumbs/marble-layers-stats.png` | 3a79efbbe42bca31743100017bd628da1d949f58 |
| `thumbs/marble-layers-white-stats.png` | 2e1d28c5092edaf745f14b86970ec29d76a23121 |
| `thumbs/marble-layers-white.png` | afacdbb5a42165ad69b94fb2be420dd669336833 |
| `thumbs/marble-layers.png` | 08c2e7ce01bad1c72ed5c5232e1811f1816293b4 |
| `thumbs/marble-peach-gold.png` | 6f2d86f394eac870fa544cc358eb98c05cb9349d |
| `thumbs/marble-rose-gold.png` | 4dcad298c7af216c653fce30ddf4cd65e3d70354 |
| `thumbs/pattern-bias.png` | 43f8b304b611b6a14cbe8fe36b64369e38916e78 |
| `thumbs/pattern-cabana.png` | 0cfea466a30d0ea4128e41380804b805e5079a6b |
| `thumbs/pattern-pinstripe.png` | 1149211b27368beb27eb36b1d3801345076f6f9a |

## Design data (re-implemented, not imported)

| Data | Where | vs. 14e4e75 |
|---|---|---|
| Palettes (JCS `PALETTES`) | `palettes.ts` | **updated** — 4 kintsugi "As designed" palettes added (Rose, Burgundy Blush, Black Ember, Peach Marble); the line-art `accent` role and the orange pack's `swatches` are now kept (they were flattened into `trim` before) |
| Color families (JCS `PRESET_FAMILIES` + `paletteFromColors`) | `palettes.ts` | **new** — 11 families, roles filled by JCS's own generic rule |
| Pattern roles (JCS `paletteVariants` variation 0: `stripeBackground`, `stripePrimary`) | `palettes.ts` `patternRoles` → tokens `patternGround`, `patternInk` | **new** |
| Marble recolor | `themes/recolorMath.ts` | **updated** — per-texture stone range (`texScale`); the SECOND stone (map B) is painted under a transparent seam overlay (`veinsAlpha`); burgundy keeps its whole original as a per-pixel tone-transfer source (existing opaque-overlay path) |
| Pattern recolor (JCS `paintPattern`, two-tone branch) | `themes/recolorMath.ts` `paintPatternPixels` | **new** |
| Floral recolor (`toneTransfer` `floral` preset, `floralSoftFill`) | `themes/recolorMath.ts` | identical |
| Floral "original colors" (JCS `colorMode: original` / As designed) | `DecorativeTheme.artColors` | **new** |
| Accent placement metadata (`ACCENT_CAPS`, `ACCENT_SUPPORT`, `drawAccent`) | `placement.ts` | identical (main only adds prayer-journal restrictions, JCS-only) |
| Abstract watercolor (`bg-abstract`, `paintAbstract`: `ABSTRACT_LAYERS` transforms, `ABSTRACT_ROLE`, `toneTransfer` preset `all`, "Abstract Watercolor" palette) | `library.ts` `jcs-watercolor-abstract`, `themes/recolor.ts` `renderWatercolor`, `recolorMath.ts` preset `all` | **new** — replaces the procedural bloom wash (`paintWatercolor`, JCS `blush`), which JCS `main` retired from its picker because it is not Sydni's artwork. Saved projects that used the procedural wash now render the Abstract watercolor with the same color roles. Pages cover-fit the painting (it bleeds off every edge); a band, strip or frame shows its own part of the page-sized painting. |
| Typography (`FONT_STYLESHEETS`, `DESIGN_PRESETS` font pairings) | `presets/typography/typography.ts` | **new** — Radley and Cardo faces; the floral (Cormorant Garamond + Radley) and abstract (Playfair Display) pairings |
| Occupancy grids | `occupancy.ts` (`tools/build_occupancy.py`) | derived, unchanged |

## Semantic color tokens

| JCS role | Product Studio token | Used for |
|---|---|---|
| `paper` | `background` | paper |
| `plate` (or ink when pale) | `primary` | headings, deep flowers |
| `frame` | `secondary`, `border` | rules and boxes |
| `trim` | `accent` | gold detail |
| — (darkest legible role) | `text`, `mutedText` | text |
| `line` | `line` | writing lines |
| `stone` | `decorBase` | marble stone, floral leaves, watercolor wash |
| `vein` | `decorativeAccent` | marble veins / seams, floral gold |
| `highlight` | `decorHighlight` | marble highlights / second stone, soft flowers |
| `accent` (default `trim`) | `lineArt` | line art |
| `stripeBackground` / `stripePrimary` | `patternGround` / `patternInk` | stripe patterns |

## Present upstream but not imported

| Upstream asset | Why |
|---|---|
| `pattern-candy.png`, `pattern-scribble.png`, `pattern-abstract-0/1/2.png` (Bold stripes, Scribble, Abstract arches) | Built from ~1545 px page renders; JCS itself marks them "rebuild when full-size Canva exports are available". Importing them would print soft at letter size. Import when the full-size maps land on `main`. |
| `canva/*` photo backgrounds (leathers, photo marbles, photo stripes, notebook paper, white ribbons / chevron), `canva/wash-*`, `blob-purple`, `boho-abstract`, `scribble-charcoal`, `stripes-yellow`, `divider-gold-ornament` | Cover backgrounds and cover decor slots in JCS. Product Studio makes interiors and has no cover product yet. |
| `canva/elements/*`, `canva/lettering/*`, `title-*.png`, `floral-ring.png`, `floral-bar.png`, `floral-line.png`, `floral-peony.png`, `bevel-frame.png`, `ornament-divider.png`, `lines-hand.png` | Page-specific artwork of the four JCS journals (legend cards, prayer figures, rings, lettering, title plates). Product-specific, not reusable library artwork. |
| `brand/*` logos | Brand marks, not design-library artwork. |
| `marble-layers-blush.png` / procedural `paintWatercolor` | Retired upstream (JCS maps `blush` to the Abstract watercolor); Product Studio no longer renders it either. |
| "Violet + peach cloud wash" (`wip/cloud-and-new-marble`, a51c2d6) | Only on an unmerged WIP branch — not approved on `main`. Import it when it merges. |
| `Design Elements (3).zip` (commit 17fe6ea "Added cloud and marble") | Raw Canva SVG exports (pages 8, 68–71). The marbles among them are the kintsugi marbles above, already built into maps upstream; the app renders no cloud artwork. |
| Prayer / Prayer Warrior / Warring Woman palettes (JCS `JOURNAL_PALETTES`) | Their roles mean different things (stone = the journal's watercolor figure, plate = title lettering…) — tied to those journals' artwork. |
| JCS "Dove Signature" palette | Product Studio's own Dove Signature brand palette is canonical for the same brand colors. |
| JCS editor UI, state, cover templates, title plates, experimental accent layouts | Application code, not the visual library. |
