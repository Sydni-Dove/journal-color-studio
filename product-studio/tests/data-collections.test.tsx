/**
 * Content data: typed lists of entries stored inside the product. Values are
 * read by their field's type; anything a type can't read is KEPT as typed and
 * flagged, never dropped. Records keep stable ids through every edit. Pasted
 * and CSV rows are planned (matched, previewed) before anything is added.
 * Nothing here changes printed pages (the golden snapshots guard that).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  addCollection, addField, addRecord, applyImport, COLLECTION_STARTERS, displayValue, duplicateRecord, moveField, moveRecord, normalizeData,
  notImportableText, parseDelimited, planImport, readValue, recordIssues, removeField, removeRecord, setValue, updateField,
} from "../src/engines/data/data";
import { migrate } from "../src/persistence/projectStore";
import { createProject } from "../src/presets/products/projectFactory";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { DataPanel, dataSummary } from "../src/components/editor/DataPanel";
import type { FieldDef, ProjectData, ValueType } from "../src/types/document";

const f = (valueType: ValueType, extra: Partial<FieldDef> = {}): FieldDef => ({ key: "v", label: "Value", valueType, ...extra });

describe("readValue: each type reads what people type, and keeps what it can't read", () => {
  it.each([
    ["number", "42", 42], ["number", "1,250.5", 1250.5], ["number", " -3 ", -3],
    ["currency", "$1,299.99", 1299.99], ["currency", "4.555", 4.56], ["currency", "-$5", -5],
    ["date", "2026-10-08", "2026-10-08"], ["date", "10/8/2026", "2026-10-08"], ["date", "1/2/26", "2026-01-02"],
    ["time", "14:30", "14:30"], ["time", "2:30 pm", "14:30"], ["time", "12 am", "00:00"], ["time", "9 a.m.", "09:00"],
    ["boolean", "yes", true], ["boolean", "X", true], ["boolean", "no", false],
    ["text", "  Hello  ", "Hello"], ["longText", "a\r\nb", "a\nb"], ["reference", "John 3:16", "John 3:16"],
  ] as [ValueType, string, unknown][])("%s %j → %j", (type, input, out) => {
    expect(readValue(f(type), input)).toEqual({ value: out });
  });
  it("quantity strips its unit; choice matches its options ignoring case", () => {
    expect(readValue(f("quantity", { unit: "lb" }), "12 lb").value).toBe(12);
    expect(readValue(f("choice", { options: ["Open", "Closed"] }), "closed").value).toBe("Closed");
  });
  it.each([
    ["number", "twelve"], ["currency", "about $5"], ["date", "2026-02-30"], ["date", "next Tuesday"], ["time", "25:00"], ["time", "7"], ["boolean", "maybe"],
  ] as [ValueType, string][])("unreadable %s %j is kept as typed, with an issue", (type, input) => {
    const r = readValue(f(type), input);
    expect(r.value).toBe(input);
    expect(r.issue).toBeTruthy();
  });
  it("empty input is no value; a missing required value is reported, never blocked", () => {
    expect(readValue(f("number"), "   ").value).toBeNull();
    const fields = [f("text", { key: "t", required: true }), f("number", { key: "n" })];
    expect(recordIssues(fields, { id: "r", values: { n: "lots" } }).map((i) => i.key)).toEqual(["t", "n"]);
    expect(displayValue(f("currency"), 5)).toBe("5.00");
    expect(displayValue(f("boolean"), false)).toBe("No");
  });
});

describe("collections and records", () => {
  const start = () => addCollection(undefined, "Days", COLLECTION_STARTERS.find((s) => s.id === "devotional")!.fields);
  it("records keep stable ids through edit, move, duplicate and delete", () => {
    const { data, id } = start();
    const a = addRecord(data, id, { title: "Day one" });
    const b = addRecord(a.data, id, { title: "Day two" });
    let d = setValue(b.data, id, a.recordId, "day", "1");
    d = moveRecord(d, id, 0, 1);
    const dup = duplicateRecord(d, id, a.recordId);
    d = removeRecord(dup.data, id, b.recordId);
    const recs = d.collections[0].records;
    expect(recs.map((r) => r.id)).toEqual([a.recordId, dup.recordId]);
    expect(recs[0].values).toEqual({ title: "Day one", day: 1 });
    expect(recs[1].values).toEqual(recs[0].values);
    expect(dup.recordId).not.toBe(a.recordId);
  });
  it("changing a field's type keeps every value (flagging what the new type can't read); removing a field keeps its values", () => {
    const { data, id } = addCollection(undefined, "Items", [f("text", { key: "qty", label: "Qty" })]);
    const r1 = addRecord(data, id, { qty: "12" }), r2 = addRecord(r1.data, id, { qty: "a dozen" });
    let d = updateField(r2.data, id, "qty", { valueType: "number" });
    const c = d.collections[0];
    expect(c.records.map((r) => r.values.qty)).toEqual(["12", "a dozen"]);
    expect(c.records.map((r) => recordIssues(c.fields, r).length)).toEqual([0, 1]);
    d = addField(d, id, "Qty"); // a new field never takes an existing key
    expect(d.collections[0].fields.map((x) => x.key)).toEqual(["qty", "qty_2"]);
    d = moveField(d, id, 1, 0);
    d = removeField(d, id, "qty");
    expect(d.collections[0].fields.map((x) => x.key)).toEqual(["qty_2"]);
    expect(d.collections[0].records[1].values.qty).toBe("a dozen");
  });
});

describe("paste / CSV import", () => {
  it("parses spreadsheet pastes (tabs) and CSV with quoted commas, quotes and line breaks; skips blank lines", () => {
    expect(parseDelimited("Item\tQty\nPens\t12\n\n")).toEqual([["Item", "Qty"], ["Pens", "12"]]);
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\n"two\nlines",3')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "3"]]);
    expect(parseDelimited("﻿only")).toEqual([["only"]]);
  });
  const fields: FieldDef[] = [
    { key: "item", label: "Item", valueType: "text", required: true },
    { key: "quantity", label: "Quantity", valueType: "quantity", unit: "units" },
    { key: "cost", label: "Unit cost", valueType: "currency" },
  ];
  it("matches columns by header name in any order, reports unmatched columns, keeps unreadable values as typed", () => {
    const plan = planImport(fields, parseDelimited("Unit Cost,Notes,ITEM,quantity\n$2.50,blue,Pens,12 units\nTBD,,Tape,three"));
    expect(plan.header).toEqual(["Unit Cost", "Notes", "ITEM", "quantity"]);
    expect(plan.mapping).toEqual(["cost", null, "item", "quantity"]);
    expect(plan.unmatched).toEqual([1]);
    expect(plan.rows[0]).toEqual({ values: { cost: 2.5, item: "Pens", quantity: 12 }, issues: [] });
    expect(plan.rows[1].values).toEqual({ cost: "TBD", item: "Tape", quantity: "three" });
    expect(plan.rows[1].issues.map((i) => i.key)).toEqual(["cost", "quantity"]);
  });
  it("without a header, columns map by position; a chosen mapping wins; applying adds records with new ids", () => {
    const rows = parseDelimited("Pens\t12\nTape\t3");
    expect(planImport(fields, rows).mapping).toEqual(["item", "quantity"]);
    const plan = planImport(fields, rows, { mapping: ["item", null] });
    expect(plan.rows.map((r) => r.values)).toEqual([{ item: "Pens" }, { item: "Tape" }]);
    const { data, id } = addCollection(undefined, "Stock", fields);
    const d = applyImport(data, id, plan);
    expect(d.collections[0].records.map((r) => r.values.item)).toEqual(["Pens", "Tape"]);
    expect(new Set(d.collections[0].records.map((r) => r.id)).size).toBe(2);
  });
});

describe("only text files are imported as rows", () => {
  const pdf = "%PDF-1.3\n%\uFFFD\uFFFD\uFFFD\uFFFD\n3 0 obj\n<< /Filter /FlateDecode /Length 2000 >>\nstream\nx\uFFFDZ\uFFFDn\u0001\u0002";
  it.each([
    ["devotional.pdf", "application/pdf", pdf, /is a PDF/],
    ["download", "", pdf, /is a PDF/],
    ["days.docx", "", "PK\u0003\u0004[Content_Types].xml", /Word or Pages document/],
    ["stock.xlsx", "", "PK\u0003\u0004", /spreadsheet workbook.*Export.*CSV/],
    ["photo.jpg", "image/jpeg", "\uFFFD\uFFFD\uFFFD\uFFFDJFIF", /an image/],
    ["mystery.bin", "", "\u0000\u0001\u0002\u0003".repeat(50), /not a text file/],
  ])("%s is refused with what to do instead", (name, type, head, why) => {
    const msg = notImportableText(name, type, head)!;
    expect(msg).toMatch(why);
    expect(msg).toMatch(/paste|Export/);
  });
  it.each([
    ["days.csv", "text/csv", "Day,Title,Scripture\n1,Morning Light,\"Lamentations 3:22–23\"\n"],
    ["days.txt", "text/plain", "Día\tTítulo\n1\t“Café” con fe — ¡sí!\n"],
    ["export", "", "Item,Qty\nPens,12\n"],
  ])("%s is text and imports", (name, type, head) => expect(notImportableText(name, type, head)).toBeNull());
});

describe("stored with the product", () => {
  it("migrate repairs malformed data without dropping values; a product without data stays without it", () => {
    const p = createProject("journal", { name: "J" });
    expect(migrate(p)!.data).toBeUndefined();
    const raw = { ...p, data: { collections: [{ id: "c1", fields: [{ key: "a", label: "A", valueType: "text" }, null], records: [{ id: "r1", values: { a: "kept", gone: 3 } }, { nope: 1 }] }, "junk"] } };
    const d = migrate(raw)!.data!;
    expect(d.version).toBe(1);
    expect(d.collections).toHaveLength(1);
    expect(d.collections[0].name).toBe("Untitled");
    expect(d.collections[0].fields.map((x) => x.key)).toEqual(["a"]);
    expect(d.collections[0].records).toEqual([{ id: "r1", values: { a: "kept", gone: 3 } }]);
    expect(normalizeData(null)).toBeUndefined();
  });
  it("adding data does not change any printed page", () => {
    const p = createProject("journal", { name: "J" });
    const { data, id } = addCollection(undefined, "Days", COLLECTION_STARTERS[1].fields);
    const withData = { ...p, data: addRecord(data, id, { title: "Day one" }).data };
    const pages = (x: typeof p) => { const doc = resolveDocument(x); return doc.recipe.pages.map((_, i) => JSON.stringify(solvePage(doc, i))); };
    expect(pages(withData)).toEqual(pages(p));
  });
});

describe("Content data panel", () => {
  it("with no lists, offers to create one from a starter", () => {
    const html = renderToStaticMarkup(<DataPanel data={undefined} onChange={() => {}} />);
    expect(html).toContain("Create list");
    expect(html).toContain("Devotional days");
    expect(dataSummary(undefined)).toBeUndefined();
  });
  it("shows the list, its entries (flagging ones to check) and the import box", () => {
    const { data, id } = addCollection(undefined, "Stock", [{ key: "item", label: "Item", valueType: "text", required: true }, { key: "n", label: "Count", valueType: "number" }]);
    let d: ProjectData = addRecord(data, id, { item: "Pens", n: 3 }).data;
    d = addRecord(d, id, { n: "many" }).data;
    const html = renderToStaticMarkup(<DataPanel data={d} onChange={() => {}} />);
    expect(html).toContain('value="Stock"'); // one list: no list picker, its name under "Rename or delete this list"
    expect(html).not.toContain("Stock (2)");
    expect(html).toContain("1. Pens");
    expect(html).toContain("Entries · 2 · 1 to check");
    expect(html).toContain("Paste or import entries");
    expect(dataSummary(d)).toBe("1 list · 2 entries");
  });
});
