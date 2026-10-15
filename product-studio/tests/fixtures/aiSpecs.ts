/**
 * AI answers as the generate-document function returns them (the strict
 * document specification), for testing the one generation pipeline without
 * calling the provider. Shapes follow docSpecSchema.json exactly: every
 * component sets every property.
 */
import type { DocSpec, SpecComponent, SpecSection } from "../../src/engines/generate/spec";

let n = 0;
export function part(kind: SpecComponent["kind"], x: Partial<SpecComponent> = {}): SpecComponent {
  return { id: `c${++n}`, kind, label: null, text: null, source: "suggested", fromEntryField: null, fields: [], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null, ...x };
}
const f = (label: string, valueType: SpecComponent["fields"][number]["valueType"] = "text") => ({ label, valueType });
export function section(id: string, title: string, components: SpecComponent[], x: Partial<SpecSection> = {}): SpecSection {
  return { id, title, purpose: "", repeat: { mode: "once", count: 1 }, startOnRightPage: false, components, ...x };
}
const page = (size: DocSpec["page"]["size"], orientation: DocSpec["page"]["orientation"], binding: DocSpec["page"]["binding"]) => ({ size, orientation, binding, why: "Chosen for how it will be used." });

/** The maker's own devotional days, pasted as their content. */
export const DEVOTIONAL_CONTENT = [
  "Day 1: Morning Light",
  "Lamentations 3:22-23",
  "Morning light finds the kitchen before we do. The day begins whether we feel ready or not.",
  "What did you notice first this morning?",
  "Day 2: Small Faithfulness",
  "Luke 16:10",
  "Small things are where trust is built. A promise kept in private becomes strength in public.",
  "What small promise can you keep today?",
  "Day 3: Rest as Obedience",
  "Matthew 11:28",
  "Rest is not the reward for finished work; it is part of the work itself.",
  "What would rest look like this week?",
].join("\n");

export const REQUESTS: { id: string; description: string; content?: string; spec: DocSpec }[] = [
  {
    id: "devotional",
    description: "A 3-day devotional journal from my own days below. Each day: title, Scripture, my teaching, my question, then room to journal and pray.",
    content: DEVOTIONAL_CONTENT,
    spec: {
      title: "Three Quiet Mornings",
      summary: "A short devotional journal: one day per entry, with your own teaching and question, then journaling space.",
      page: page("6x9", "portrait", "book"),
      entries: {
        name: "Days",
        fields: [{ key: "day", label: "Day", valueType: "number" }, { key: "title", label: "Title", valueType: "text" }, { key: "scripture", label: "Scripture", valueType: "reference" }, { key: "teaching", label: "Teaching", valueType: "longText" }, { key: "question", label: "Question", valueType: "longText" }],
        records: [
          { values: [{ key: "day", value: "1" }, { key: "title", value: "Morning Light" }, { key: "scripture", value: "Lamentations 3:22-23" }, { key: "teaching", value: "Morning light finds the kitchen before we do. The day begins whether we feel ready or not." }, { key: "question", value: "What did you notice first this morning?" }] },
          { values: [{ key: "day", value: "2" }, { key: "title", value: "Small Faithfulness" }, { key: "scripture", value: "Luke 16:10" }, { key: "teaching", value: "Small things are where trust is built. A promise kept in private becomes strength in public." }, { key: "question", value: "What small promise can you keep today?" }] },
          { values: [{ key: "day", value: "3" }, { key: "title", value: "Rest as Obedience" }, { key: "scripture", value: "Matthew 11:28" }, { key: "teaching", value: "Rest is not the reward for finished work; it is part of the work itself." }, { key: "question", value: "What would rest look like this week?" }] },
        ],
        source: "user",
      },
      sections: [
        section("day", "Day {day}: {title}", [
          part("text", { label: "Scripture", fromEntryField: "scripture", source: "user" }),
          part("text", { fromEntryField: "teaching", source: "user" }),
          part("writing", { label: "Reflect", fromEntryField: "question", source: "user", lines: 8 }),
          part("writing", { label: "Prayer", lines: 6 }),
        ], { repeat: { mode: "per-entry", count: 1 }, purpose: "One page per day." }),
      ],
      notes: ["Your three days are used exactly as written; Day numbers and titles come from your headings."],
    },
  },
  {
    id: "inventory",
    description: "Inventory notebook for a small bakery: numbered stock count sheets (item, supplier, quantity on hand, reorder point, unit cost, notes) and item record cards. Landscape, spiral.",
    spec: {
      title: "Bakery Inventory",
      summary: "Numbered stock counts and item cards.",
      page: page("8.5x11", "landscape", "spiral"),
      entries: null,
      sections: [
        section("count", "Stock Count", [
          part("fields", { fields: [f("Date", "date"), f("Counted by"), f("Location")] }),
          part("table", { fields: [f("Item"), f("Supplier"), f("Quantity on hand", "quantity"), f("Reorder point", "number"), f("Unit cost", "currency"), f("Notes", "longText")], rows: 14, numbered: true, fillPage: true }),
        ], { repeat: { mode: "copies", count: 12 } }),
        section("items", "Item Records", [part("records", { fields: [f("Item"), f("SKU"), f("Supplier"), f("Storage"), f("Shelf life"), f("Notes")], rows: 3, numbered: true, fillPage: true })], { repeat: { mode: "copies", count: 6 } }),
      ],
      notes: [],
    },
  },
  {
    id: "intake",
    description: "A client intake form for my hair salon: contact details, hair history, allergies, a consent statement and signature. One loose letter page.",
    spec: {
      title: "New Client Intake",
      summary: "A one-page salon intake form.",
      page: page("8.5x11", "portrait", "loose"),
      entries: null,
      sections: [
        section("intake", "New Client Intake", [
          part("fields", { label: "Contact", fields: [f("Name"), f("Phone"), f("Email"), f("Birthday", "date"), f("Preferred stylist")] }),
          part("checklist", { label: "Services you're interested in", items: ["Cut", "Color", "Highlights", "Treatment"] }),
          part("writing", { label: "Hair history", text: "Color, chemical treatments or concerns in the last year.", lines: 4 }),
          part("writing", { label: "Allergies or sensitivities", lines: 3 }),
          part("text", { label: "Consent", text: "This form is HIPAA compliant and meets all state cosmetology requirements. I consent to the services discussed." }),
          part("fields", { fields: [f("Client signature", "signature"), f("Date", "date")] }),
        ]),
      ],
      notes: ["Consent wording should be reviewed for your state."],
    },
  },
  {
    id: "maintenance",
    description: "A maintenance log for my car: service records with date, mileage, work done, parts, cost and shop; plus a schedule page.",
    spec: {
      title: "Vehicle Maintenance Log",
      summary: "Service records and a schedule.",
      page: page("5.5x8.5", "portrait", "spiral"),
      entries: null,
      sections: [
        section("vehicle", "My Vehicle", [part("fields", { fields: [f("Make"), f("Model"), f("Year", "number"), f("VIN"), f("Plate"), f("Purchased", "date")] }), part("table", { label: "Schedule", fields: [f("Service"), f("Every (miles)", "number"), f("Last done", "date")], rows: 8 })]),
        section("log", "Service Record", [part("records", { fields: [f("Date", "date"), f("Mileage", "number"), f("Work done"), f("Parts"), f("Cost", "currency"), f("Shop")], rows: 2, numbered: true, fillPage: true })], { repeat: { mode: "copies", count: 20 } }),
      ],
      notes: [],
    },
  },
  {
    id: "workbook",
    description: "A business planning workbook: vision, goals, a SWOT, a 90-day plan table and a monthly review.",
    spec: {
      title: "Business Planning Workbook",
      summary: "Plan the next quarter.",
      page: page("8.5x11", "portrait", "book"),
      entries: null,
      sections: [
        section("vision", "Vision", [part("writing", { label: "Where is the business in three years?", lines: 10 }), part("writing", { label: "Who do you serve?", lines: 6 })]),
        section("goals", "Goals", [part("list", { label: "This year", items: ["", ""].map((_, i) => `Goal ${i + 1}`), marker: "number" }), part("writing", { label: "Why these goals", lines: 6 })]),
        section("swot", "SWOT", [part("writing", { label: "Strengths", lines: 5 }), part("writing", { label: "Weaknesses", lines: 5 }), part("writing", { label: "Opportunities", lines: 5 }), part("writing", { label: "Threats", lines: 5 })]),
        section("plan", "90-Day Plan", [part("table", { fields: [f("Action"), f("Owner"), f("Due", "date"), f("Done", "boolean")], rows: 18 })]),
        section("review", "Monthly Review", [part("fields", { fields: [f("Month"), f("Revenue", "currency")] }), part("writing", { label: "What worked", lines: 6 }), part("writing", { label: "What to change", lines: 6 })], { repeat: { mode: "copies", count: 3 } }),
      ],
      notes: [],
    },
  },
  // Outside the original five.
  {
    id: "reading-log",
    description: "A homeschool reading log for kids: book, pages read, a favourite part, and a parent check-off. 5.5 x 8.5 booklet, 10 pages.",
    spec: {
      title: "My Reading Log",
      summary: "A kids' reading log.",
      page: page("5.5x8.5", "portrait", "stapled"),
      entries: null,
      sections: [section("log", "Reading Log", [part("fields", { fields: [f("Name"), f("Month")] }), part("table", { fields: [f("Date", "date"), f("Book"), f("Pages", "number"), f("Parent ✓", "boolean")], rows: 12 }), part("writing", { label: "My favourite part", lines: 4 })], { repeat: { mode: "copies", count: 10 } })],
      notes: [],
    },
  },
  {
    id: "recipe-book",
    description: "A family recipe book: a recipe card page for each recipe (name, serves, prep time, ingredients, steps, notes), 24 recipes, and an index.",
    spec: {
      title: "Family Recipes",
      summary: "Recipe pages to fill in.",
      page: page("7x9", "portrait", "book"),
      entries: null,
      sections: [
        section("index", "Recipe Index", [part("table", { fields: [f("Recipe"), f("Page", "number")], rows: 24, numbered: true })]),
        section("recipe", "Recipe", [part("fields", { fields: [f("Recipe"), f("Serves", "number"), f("Prep time", "time")] }), part("writing", { label: "Ingredients", lines: 10 }), part("writing", { label: "Steps", lines: 14 }), part("writing", { label: "Notes", lines: 3 })], { repeat: { mode: "copies", count: 24 } }),
      ],
      notes: ["Cooking times aren't calculated — they're blanks to fill in."],
    },
  },
  {
    id: "sign-in",
    description: "A workshop sign-in sheet: name, email, organisation, and a check box to join our mailing list; landscape.",
    spec: {
      title: "Workshop Sign-In",
      summary: "One sign-in sheet.",
      page: page("8.5x11", "landscape", "loose"),
      entries: null,
      sections: [section("sheet", "Sign In", [part("fields", { fields: [f("Event"), f("Date", "date")] }), part("table", { fields: [f("Name"), f("Email"), f("Organisation"), f("Join mailing list", "boolean")], rows: 16, numbered: true, fillPage: true })])],
      notes: [],
    },
  },
  {
    id: "wedding",
    description: "A wedding planning checklist by month (12 months out to the week before), plus a vendor contact sheet.",
    spec: {
      title: "Wedding Planner",
      summary: "Checklist and vendors.",
      page: page("8.5x11", "portrait", "spiral"),
      entries: null,
      sections: [
        section("checklist", "Planning Checklist", [
          part("list", { label: "12 months before", items: ["Set the budget", "Choose the date", "Book the venue"], marker: "checkbox" }),
          part("list", { label: "6 months before", items: ["Order the dress", "Book the photographer", "Send save-the-dates"], marker: "checkbox" }),
          part("list", { label: "1 week before", items: ["Confirm vendors", "Final fitting", "Pack for the honeymoon"], marker: "checkbox" }),
        ]),
        section("vendors", "Vendors", [part("table", { fields: [f("Vendor"), f("Contact"), f("Phone"), f("Deposit", "currency"), f("Balance due", "date")], rows: 14 })]),
      ],
      notes: [],
    },
  },
];
