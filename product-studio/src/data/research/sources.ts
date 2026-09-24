/**
 * Source registry — normalized from "Print Product Geometry Library" v1.0
 * (research snapshot dated 2026-09-24).
 *
 * The research note states: all sources were read through a web index on
 * 2026-09-24; no live-browser verification was performed.
 *
 * Runtime code never parses the research HTML. This file (and its siblings in
 * data/research/) is the normalized, typed copy of that research.
 */

export type SourceEntry = {
  label: string;
  url: string;
};

export const RESEARCH_LIBRARY = {
  name: "Print Product Geometry Library",
  version: "1.0",
  researchDate: "2026-09-24",
  units: "inches",
  verification: "index reads only — no live-browser verification performed",
} as const;

export const SOURCES = {
  erinCondren: {
    label: "erincondren.com",
    url: "https://www.erincondren.com/lifeplanner",
  },
  refinery29: {
    label: "refinery29.com",
    url: "https://www.refinery29.com/en-us/shop/product/layers-lifeplanner-10079938",
  },
  lovelyPlanner: {
    label: "lovelyplanner.com",
    url: "http://lovelyplanner.com/free-printable-floral-notes-planner-insert-4-sizes-happy-planner-a5/",
  },
  etsyHappyPlannerCovers: {
    label: "etsy.com (Happy Planner cover listings)",
    url: "https://www.etsy.com/listing/1841276815/happy-planner-cover-all-size-big",
  },
  etsyHappyPlannerDisc: {
    label: "etsy.com (disc-bound insert listing)",
    url: "https://www.etsy.com/listing/1880038769/happy-planner-disc-bound-insert-page",
  },
  hobonichi: {
    label: "1101.com",
    url: "https://www.1101.com/store/techo/en/all_about/",
  },
  amazonHobonichiMonthly: { label: "amazon.com", url: "https://www.amazon.com/dp/B0FJ2P8CDY" },
  haruyama: {
    label: "haruyama365.com",
    url: "https://haruyama365.com/products/hello-kitty-hobonichi-techo-pencil-board-original-cousin-weeks-sizes",
  },
  a1Size: { label: "a1-size.com", url: "https://www.a1-size.com/other-paper-sizes/" },
  wendaful: { label: "wendaful.com", url: "https://www.wendaful.com/planner-size-guide/" },
  mayPaperCo: { label: "maypaperco.com", url: "https://www.maypaperco.com/pages/size-guide" },
  amazonA5RingRefill: { label: "amazon.com", url: "https://www.amazon.com/dp/B0CBHDRNCZ" },
  franklinPlanner: {
    label: "store.franklinplanner.com",
    url: "https://store.franklinplanner.com/planners/by-collection/",
  },
  etsyFranklinPunch: {
    label: "etsy.com (Franklin insert maker)",
    url: "https://www.etsy.com/listing/1270758908/2026-weekly-planner-refill-classic-size",
  },
  amazonPassionPlanner: { label: "amazon.com", url: "https://www.amazon.com/dp/B0F322F7J5" },
  galleonPassion: {
    label: "galleon.ph",
    url: "https://www.galleon.ph/product/academic-passion-planner-medium-aug-2019-jul-2020-p41179021",
  },
  amazonCleverFox: { label: "amazon.com", url: "https://www.amazon.com/dp/B08PZCLLWT" },
  allAboutPlanners: {
    label: "allaboutplanners.com.au",
    url: "https://allaboutplanners.com.au/wp-content/uploads/2017/10/Planner-page-sizes-guide-AllAboutTheHouse.pdf",
  },
  etsyPersonalInsert: {
    label: "etsy.com (printable weekly insert)",
    url: "https://www.etsy.com/ie/listing/573607118/printed-planner-inserts-weekly-directive",
  },
  etsyHourlyWeekly: {
    label: "etsy.com (printable hourly weekly)",
    url: "https://www.etsy.com/listing/839830293/editable-modern-black-white-hourly-lined",
  },
  kirkRuledDeskPad: {
    label: "store.kirkoffice.ky (ruled 22×17)",
    url: "https://store.kirkoffice.ky/ruled-desk-pad-22-x-17-2018--3",
  },
  kirkUnruledDeskPad: {
    label: "store.kirkoffice.ky (unruled 22×17)",
    url: "https://store.kirkoffice.ky/desk-pad-22-x-17-white-2018--3",
  },
  kirkCompactDeskPad: {
    label: "store.kirkoffice.ky (compact)",
    url: "https://store.kirkoffice.ky/compact-desk-pad-17-3-4-x-10-7-8-white-2018--3",
  },
  amazonPerforlife: { label: "amazon.com", url: "https://www.amazon.com/dp/B0F634SRZ9" },
  calendarCo: { label: "calendarco.com", url: "https://calendarco.com/catalog/pdf/page%2015%202013.pdf" },
  discountMugs: {
    label: "discountmugs.com",
    url: "https://www.discountmugs.com/product/x11391-promotional-black-white-desk-pad-calendars/",
  },
  michaelsWeeklyDeskPad: {
    label: "michaels.com (weekly desk pad)",
    url: "https://www.michaels.com/product/weekly-to-do-desk-planner-notepad-tear-off-calendar-pad-13-designs-11-x-17-in-217921619582418958",
  },
  amazonPostIt: { label: "amazon.com", url: "https://www.amazon.com/dp/B00CXI0D5E" },
  etsyA4PlannerPad: {
    label: "etsy.com (A4 planner pad)",
    url: "https://www.etsy.com/no-en/listing/1866780857/planner-pad-weekly-or-monthly-wfh-desk",
  },
  amazonDiscPunch: { label: "amazon.com (disc punch)", url: "https://www.amazon.com/dp/B0DPJ2XKJ6" },
  kdp: { label: "kdp.amazon.com", url: "https://kdp.amazon.com/en_US/help/topic/G3TQWMMGK8528NDZ" },
  kdpSpecsMirror: {
    label: "github.com (KDP spec notes)",
    url: "https://github.com/shoemoney/shoemoney-skills/blob/HEAD/build-ebook-kdp/references/kdp-specs.md",
  },
  ingramSpark: {
    label: "ingramspark.com",
    url: "https://www.ingramspark.com/blog/file-requirements-for-print-books",
  },
  ingramSparkGuide: {
    label: "ingramspark.com (file creation guide)",
    url: "https://www.ingramspark.com/hubfs/downloads/file-creation-guide.pdf",
  },
  lulu: { label: "scribd.com (Lulu guide)", url: "https://www.scribd.com/document/522183852/lulu-book-creation-guide" },
  printivity: {
    label: "printivity.com",
    url: "https://www.printivity.com/booklets/spiral-bound-booklets",
  },
  printNinja: {
    label: "printninja.com",
    url: "https://printninja.com/wire-and-spiral-bound-project-setup-guide/",
  },
  amazonCoilPaper: { label: "amazon.com (coil paper maker)", url: "https://www.amazon.com/dp/B0DYFWNZ8L" },
  tiendamiaCoilMachine: {
    label: "tiendamia.cr (coil machine)",
    url: "https://www.tiendamia.cr/p/amz/b0cdr8d1yp/imeshbean-spiral-coil-binding-machine-electric-coil-inserter-46-holes-4-1-pitch",
  },
  designYourWay: {
    label: "designyourway.net",
    url: "https://www.designyourway.net/blog/saddle-stitch-vs-perfect-bound/",
  },
  printProductionNotes: {
    label: "github.com (print-production notes)",
    url: "https://github.com/austintheriot/dotfiles/blob/HEAD/.claude/rules/print-production.md",
  },
  printPlanet: { label: "printplanet.com", url: "https://printplanet.com/posts/27328/" },
  b4print: { label: "b4print.com", url: "https://www.b4print.com/index.php?topic=4730.15" },
  uPrinting: { label: "uprinting.com", url: "https://www.uprinting.com/notepad-printing.html" },
  velocityBp: {
    label: "velocitybp.com",
    url: "https://www.velocitybp.com/business-source-plain-memo-pads-100-sheets-plain-glued-unruled-15-lb-basis-weight-4-x-6-white-paper-chipboard-backing-144-carton--1",
  },
  quill: {
    label: "quill.com",
    url: "https://www.quill.com/Quill-Brand-Glue-Top-Ruled-Pad-8-1-2x11-Wide-Ruling-White-50-Sheets-Pad/cbs/001281.html",
  },
  sureDirect: {
    label: "thesuredirect.com",
    url: "https://thesuredirect.com/how-to-create-a-digital-planner-using-canva-from-scratch/",
  },
  paperMoon: {
    label: "papermoonartdesign.com",
    url: "https://papermoonartdesign.com/blogs/articles/how-to-create-a-printable-monthly-calendar-planner-in-canva-step-by-step-tutorial",
  },
  findAnyAnswer: {
    label: "findanyanswer.com",
    url: "https://findanyanswer.com/whats-the-difference-between-college-ruled-and-wide-ruled-paper",
  },
  answersCom: { label: "answers.com", url: "https://www.answers.com/music-and-radio/What_is_Jr_ruled_paper" },
  collegeRuledGuide: {
    label: "smt.volunteeringmatters.org.uk",
    url: "https://smt.volunteeringmatters.org.uk/receipt?guidebookKey=notebook-college-ruled-line-paper-college-ruled-c.pdf",
  },
  michaelsDotGrid: {
    label: "michaels.com (dot grid notebook)",
    url: "https://www.michaels.com/makerplace/product/a5-galaxy-dot-grid-notebook-with-160-gsm-paper-370706758216695822",
  },
  gridTool: { label: "thegridtool.com", url: "https://www.thegridtool.com/thegridtoolworkswith/" },
  tuitionCentre: {
    label: "tuitioncentre.sg",
    url: "https://tuitioncentre.sg/what-is-the-cornell-note-taking-technique/",
  },
  notesForShs: {
    label: "notesforshs.com",
    url: "https://www.notesforshs.com/2024/07/how-to-use-the-cornell-note-taking-method.html",
  },
  wcu: { label: "wcu.edu", url: "https://WWW.WCU.EDU/_files/academic-success/CornellNoteTaking.pdf" },
  /** Values derived inside the research document itself (worked formulas). */
  researchDerivation: {
    label: "Print Product Geometry Library — worked derivation",
    url: "",
  },
} satisfies Record<string, SourceEntry>;

export type SourceKey = keyof typeof SOURCES;

/** Open questions recorded by the research pass. Surfaced in Geometry Info. */
export const RESEARCH_OPEN_QUESTIONS: readonly string[] = [
  "No planner brand publishes internal grid geometry (row heights, column widths, cell padding, header heights); all internal values are derived or estimated.",
  "Happy Planner trim sizes are consistent across third parties but were not confirmed on the official happyplanner.com product pages.",
  "Papier / MochiThings / Plum Paper (official) trim confirmations not pulled; Plum Paper 7×9 / 8.5×11 from a third-party size guide only.",
  "Filofax hole-center-to-edge distance not published; derived assumption 11–12 mm.",
  "Disc-hole depth (mushroom cut) not published; the 0.5\" writing-safe margin is a derived recommendation.",
  "Canva templates are layout references, not print-manufacturing standards.",
];
