# Reusable cover and divider pages

CoverPage (`cover-page`) and DividerPage / TabPage (`divider-page`) are additive layouts and book modules. Existing recipes and saved schema version 1 projects do not gain pages or settings. Journal Color Studio files and its asset snapshots were not edited.

Data flow: optional BookStep.cover settings → expanded PageModuleContent.cover → physical layout solver → solved vector/text nodes → shared PrintablePage → preview and print/PDF. Content, expansion, physical geometry and rendering keep separate responsibilities. The existing book controls allow insertion, duplication, ordering and nested sections anywhere.

Choose + Cover, + Divider / tab page, or + Coordinating cover & 9 dividers. Use matching palette & script title explicitly to apply Neutral Cheetah Luxe. This is a project-wide theme choice; it changes the project's palette and cover typography, so apply it only when you want the book to coordinate. All wording remains editable. No scripture is silently inserted.

The palette, background and typography remain editable through existing theme controls. Per-page Decorative elements controls toggle the filled circles, the thin gold rings and the two cheetah circles. None uses the reference as a flattened image. The cheetah print is a seeded vector rosette pattern in the palette's pattern colors, a stylized interpretation rather than photographic fur.

### Neutral Cheetah Luxe composition (matched to the reference cover)

The reference cover ("Plan / WITH PURPOSE") was measured, and every shape is stored as a fraction of the trim (`LUXE_CIRCLES`, `LUXE_CHEETAH` and `LUXE_RINGS` in `layouts/book/coverDivider.ts`): x of the width, y of the height, radius of the page's Letter-proportioned width. So every trim gets the same composition. Shapes run off the trim edge, as in the reference. They are drawn in this order: burgundy, blush, terracotta, tan and slate circles, then the two cheetah circles, then four gold rings over them.

- **Palette** (`neutral-cheetah-luxe`), sampled from the reference: burgundy `#5b0610`, blush `#f2d8cd`, terracotta `#c5674a`, tan `#e9d3c0`, slate blue `#718496`, gold line art `#c8974d`, cheetah ground `#d39a6e`, ink `#22140f`, black text on white paper. It sits after the Dove brand palettes, so Dove Signature stays the default.
- **Title:** one line of brush script (Birthstone Bounce, the closest open font to the reference lettering), fitted by the responsive composition below. The role size is only a ceiling. Its box ends at the baseline, and loops and descenders draw past it.
- **Subtitle:** small capitals with wide spacing, stacked on two lines, centred under the title. If a title letter with a tail (g j p q y) sits above it, the subtitle drops below the tail.
- **Gold rule:** under the subtitle.

"Use matching palette & script title" applies the palette, the script title and the subtitle style (`presets/coverLuxe.ts`).

## Responsive composition (Fit design to page size)

A cover or divider design is resolved for the page it lands on, not scaled down from Letter (`layouts/book/composition.ts`, the design in `layouts/book/luxeComposition.ts`):

page geometry → usable area → size class → protected text zones → fitted type → decoration placed around the text → nodes (one solved page drives preview, thumbnails and print).

**Size classes** come from the live area (after binding keepout, margins and any tab), short side × long side: **large** ≥ 6.4 × 8.6 in (Letter, A4, 8 × 10), **medium** ≥ 4.7 × 7.6 (7 × 9, 7 × 9.25, 6 × 9), **small** ≥ 4.0 × 6.6 (5.5 × 8.5, A5, Franklin Classic), otherwise **compact** (5 × 7, 5 × 8, A6, Filofax, Franklin Compact). Custom sizes and landscape pages are classified the same way. Aspect ratio also counts: a narrow portrait page (usable width under 62 % of its height) gets a narrower title zone.

**Title fitting:** start at the class's preferred size (cover 250 / 190 / 120 / 92 pt; divider 170 / 140 / 104 / 76 pt), measure the real lettering, shrink only as far as the zone's width and height require, and stop at a readable floor (cover 40 / 40 / 40 / 30 pt; divider 34 / 34 / 30 / 24 pt). One rule serves every section title; nothing is positioned by hand per word.

**Subtitle fitting**, in order: preferred letter spacing → tighter spacing (to 0.2 em) → slightly smaller type (to 82 %) → a wider zone (up to 90 % of the live width) → smaller type to the 7.5 pt floor → (divider) two lines. Only then is it reported. Normal preset wording (WITH PURPOSE, DRAW NEAR, BE A GOOD STEWARD…) never needs shortening at Half Letter or A5.

**Decoration** uses semantic anchors with a priority: primary (burgundy upper-left anchor, slate lower-left anchor, top cheetah upper-right accent, top ring), supporting (blush title frame, terracotta right-edge accent, bottom cheetah, left ring), optional (tan circle, right and low rings). The text is placed first; any shape touching the title's lettering, the subtitle, the rule, a quote or a tab moves along its own escape direction (towards its corner or edge, bleeding further off the page), then shrinks, and a supporting or optional piece finally steps aside. A primary piece is never removed. Only the soft blush circle may sit behind the title. Density by class: every piece on large and medium; small pages leave out the low ring; compact pages keep the primary and supporting pieces. Dividers are calmer (the low ring is always out, optional pieces go on small and compact pages).

**The end cover** runs through the same engine: the front design turned half a turn, with the same density, its optional line of text protected.

**Fine-tuning** (Cover / Divider controls → Fine-tune): title size (60–130 % of the fitted size) and nudges for the title, the subtitle and the shapes, stored as fractions of the page so they carry across size changes and are always held inside the live area. Turning **Fit design to page size** off keeps the original reference layout (fractions of the trim, text hung from the burgundy circle).

**Page check:** a page style elsewhere in the book that doesn't fit the size (e.g. Weekly Plan Spread on A6) is named and listed under "Other pages in this book"; it no longer counts against the cover in view.

## Physical tabs

Tabs are **interior printed markers**, not protruding die-cut tabs. No cutting outline, material extension or unsupported manufacturing claim is generated. The current print engine cannot represent die-cut tabs safely.

All tab geometry is in inches inside the existing safe rectangle, after trim, printer, binding and punch keepout resolution. Rounded tabs are 0.9 inches wide and at most 0.6 inches high; tall staggered tabs are 0.52 inches wide and fill their assigned vertical slot minus 0.04 inches. Automatic count/order comes from actual expanded tab pages; explicit count/order overrides it. Each slot is safeHeight/N. Tab height below 0.24 inches, invalid counts/order and labels that cannot fit produce export-blocking errors. Title content reserves tab width plus 0.16 inches. Tabs print on the outer (fore) edge, away from the binding: right on a right-hand page, left on a left-hand page. Covers and dividers start on a right-hand page by default (a notes page fills each back in a two-sided book), and a page can still choose its side. A thin paper-colored edge keeps a tab distinct where it crosses the artwork.

Default coordinating examples: Plan / WITH PURPOSE, Prayer, Vision, Plan, Schedule, Work, Home, Wellness, Finances, Notes. Work has a cheetah treatment. Subtitles are suggestions, editable and optional. Dark tabs use light text.

## Size behavior and QA

Audited all 22 predefined sizes: 3x5, 4x6, 4x9, 5x7, 5x8, 5.5x8.5, 6x9, 7x9, 7x9.25, 8x10, 8.5x11, 11x17, 18x11, 18x12, 22x17, A4, A5, A6, Filofax Personal, Filofax Pocket, Franklin Compact, Franklin Classic. Custom sizes use the same physical fit decisions. Cover/divider layouts require a live area of 1.5 x 2.5 inches; unsupported settings are rejected, not squeezed.

Composition adapts to the trim, as described under Responsive composition. With Fit design to page size off it scales with the trim (the reference layout). Text is kept inside the live area (and clear of a tab), and Higher / Lower title positions move the title, subtitle and rule together. Tab dimensions do not scale with trim.

Unit tests audit safe node/tab bounds and automatic distribution across all sizes; full print validation passes Letter, 7x9, 6x9, 5.5x8.5 and A5. Browser QA covers those sizes plus Filofax Personal with three tabs, phone editing/persistence/overflow, identical preview/print node geometry and PDF creation. Nine long-label tabs on the small insert are intentionally rejected; reduce tab count or shorten labels. Browser checks are real Chromium checks, not a physical printer/cutter test.

To reproduce browser QA, run the cover-divider browser suite with CHROMIUM_PATH pointing to an installed Chromium browser; QA_ARTIFACT_DIR saves screenshots and PDFs. Tests remain under Product Studio only.
