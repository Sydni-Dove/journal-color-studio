# Reusable cover and divider pages

CoverPage (`cover-page`) and DividerPage / TabPage (`divider-page`) are additive layouts and book modules. Existing recipes and saved schema version 1 projects do not gain pages or settings. Journal Color Studio files and its asset snapshots were not edited.

Data flow: optional BookStep.cover settings → expanded PageModuleContent.cover → physical layout solver → solved vector/text nodes → shared PrintablePage → preview and print/PDF. Content, expansion, physical geometry and rendering keep separate responsibilities. The existing book controls allow insertion, duplication, ordering and nested sections anywhere.

Choose + Cover, + Divider / tab page, or + Coordinating cover & 9 dividers. Use matching palette & script title explicitly to apply Neutral Cheetah Luxe. This is a project-wide theme choice; it changes the project's palette and cover typography, so apply it only when you want the book to coordinate. All wording remains editable. No scripture is silently inserted.

The palette, background and typography remain editable through existing theme controls. Per-page Decorative elements controls toggle filled circles, outlined circles and a procedural vector cheetah circle. None uses the reference as a flattened image. The pattern is a stylized vector interpretation rather than photographic fur. Reference inspected: Planner cheatah neutral tones.png recovered from the linked conversation attachment.

## Physical tabs

Tabs are **interior printed markers**, not protruding die-cut tabs. No cutting outline, material extension or unsupported manufacturing claim is generated. The current print engine cannot represent die-cut tabs safely.

All tab geometry is in inches inside the existing safe rectangle, after trim, printer, binding and punch keepout resolution. Rounded tabs are 0.9 inches wide and at most 0.6 inches high; tall staggered tabs are 0.52 inches wide and fill their assigned vertical slot minus 0.04 inches. Automatic count/order comes from actual expanded tab pages; explicit count/order overrides it. Each slot is safeHeight/N. Tab height below 0.24 inches, invalid counts/order and labels that cannot fit produce export-blocking errors. Title content reserves tab width plus 0.16 inches. Right-edge markers stay inside the safe area even when the right edge carries binding on a verso.

Default coordinating examples: Plan / WITH PURPOSE, Prayer, Vision, Plan, Schedule, Work, Home, Wellness, Finances, Notes. Work has a cheetah treatment. Subtitles are suggestions, editable and optional. Dark tabs use light text.

## Size behavior and QA

Audited all 22 predefined sizes: 3x5, 4x6, 4x9, 5x7, 5x8, 5.5x8.5, 6x9, 7x9, 7x9.25, 8x10, 8.5x11, 11x17, 18x11, 18x12, 22x17, A4, A5, A6, Filofax Personal, Filofax Pocket, Franklin Compact, Franklin Classic. Custom sizes use the same physical fit decisions. Cover/divider layouts require a live area of 1.5 x 2.5 inches; unsupported settings are rejected, not squeezed.

Composition uses trim aspect and usable width: circle sizes are capped by page height, narrow trims move the leopard circle to a lower corner, text fits at word boundaries, and lower-title positions reserve room for subtitle/quote. Tab dimensions do not scale with trim.

Unit tests audit safe node/tab bounds and automatic distribution across all sizes; full print validation passes Letter, 7x9, 6x9, 5.5x8.5 and A5. Browser QA covers those sizes plus Filofax Personal with three tabs, phone editing/persistence/overflow, identical preview/print node geometry and PDF creation. Nine long-label tabs on the small insert are intentionally rejected; reduce tab count or shorten labels. Browser checks are real Chromium checks, not a physical printer/cutter test.

To reproduce browser QA, run the cover-divider browser suite with CHROMIUM_PATH pointing to an installed Chromium browser; QA_ARTIFACT_DIR saves screenshots and PDFs. Tests remain under Product Studio only.
