/**
 * SCRIPTURE ON FINISHED PAGES — found, suggested, verified, approved and licensed. Never invented.
 *
 *   Detection   references are found in imported text ("Proverbs 31:26", "Prov. 31:26", "1 John 4:19").
 *   Wording     Product Studio never writes verse wording itself. Public-domain translations (KJV, WEB) are fetched
 *               word for word from a public Bible text service; copyrighted translations (NIV, ESV, NLT…) are pasted
 *               by the customer from their Bible or the publisher's site (a link opens the passage). Either way the
 *               customer approves the wording before it is printed.
 *   Suggestion  a scene without a reference gets suggested references (never wording), used only once approved.
 *   Licensing   each copyrighted translation's free-use limits and required notice. The notice goes on the copyright
 *               page; the limits (verse count, share of the book's text) are checked before export.
 */
export type Translation = {
  id: string;
  label: string;
  publicDomain: boolean;
  /** bible-api.com translation id, for public-domain texts. */
  apiId?: string;
  /** Free use without written permission: at most this many verses… */
  maxVerses?: number;
  /** …making up less than this share of the work's text (0–1). */
  maxShare?: number;
  /** The copyright notice the publisher requires on the title or copyright page. */
  notice?: string;
  /** Where the publisher's permission terms are (shown to the customer). */
  permissions?: string;
};

export const TRANSLATIONS: Translation[] = [
  {
    id: "NIV", label: "NIV (New International Version)", publicDomain: false, maxVerses: 500, maxShare: 0.25, permissions: "biblica.com/permissions",
    notice: "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.",
  },
  {
    id: "NIrV", label: "NIrV (New International Reader's Version)", publicDomain: false, maxVerses: 500, maxShare: 0.25, permissions: "biblica.com/permissions",
    notice: "Scripture quotations taken from The Holy Bible, New International Reader's Version®, NIrV® Copyright © 1995, 1996, 1998, 2014 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.",
  },
  {
    id: "ESV", label: "ESV (English Standard Version)", publicDomain: false, maxVerses: 1000, maxShare: 0.5, permissions: "crossway.org/permissions",
    notice: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.",
  },
  {
    id: "NLT", label: "NLT (New Living Translation)", publicDomain: false, maxVerses: 500, maxShare: 0.25, permissions: "tyndale.com/permissions",
    notice: "Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.",
  },
  {
    id: "NKJV", label: "NKJV (New King James Version)", publicDomain: false, maxVerses: 1000, maxShare: 0.5, permissions: "harpercollinschristian.com/permissions",
    notice: "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.",
  },
  {
    id: "CSB", label: "CSB (Christian Standard Bible)", publicDomain: false, maxVerses: 1000, maxShare: 0.5, permissions: "csbible.com/permissions",
    notice: "Scripture quotations marked CSB have been taken from the Christian Standard Bible®, Copyright © 2017 by Holman Bible Publishers. Used by permission. Christian Standard Bible® and CSB® are federally registered trademarks of Holman Bible Publishers.",
  },
  { id: "KJV", label: "KJV (King James Version) — public domain", publicDomain: true, apiId: "kjv" },
  { id: "WEB", label: "WEB (World English Bible) — public domain", publicDomain: true, apiId: "web" },
];
export const translationOf = (id: string): Translation => TRANSLATIONS.find((t) => t.id.toLowerCase() === id.trim().toLowerCase()) ?? { id, label: id, publicDomain: false };

// ---- Detection ------------------------------------------------------------------------------------

/** Book names and the abbreviations people type. Longest first, so "Song of Songs" wins over "Song". */
const BOOKS: [string, string[]][] = [
  ["Genesis", ["Gen", "Ge", "Gn"]], ["Exodus", ["Exod", "Ex"]], ["Leviticus", ["Lev"]], ["Numbers", ["Num"]], ["Deuteronomy", ["Deut", "Dt"]],
  ["Joshua", ["Josh"]], ["Judges", ["Judg"]], ["Ruth", ["Ru"]], ["1 Samuel", ["1 Sam"]], ["2 Samuel", ["2 Sam"]], ["1 Kings", ["1 Kgs"]], ["2 Kings", ["2 Kgs"]],
  ["1 Chronicles", ["1 Chr", "1 Chron"]], ["2 Chronicles", ["2 Chr", "2 Chron"]], ["Ezra", []], ["Nehemiah", ["Neh"]], ["Esther", ["Esth"]], ["Job", []],
  ["Psalms", ["Psalm", "Ps", "Psa", "Pss"]], ["Proverbs", ["Prov", "Pro", "Prv"]], ["Ecclesiastes", ["Eccl", "Ecc"]], ["Song of Songs", ["Song of Solomon", "Song"]],
  ["Isaiah", ["Isa"]], ["Jeremiah", ["Jer"]], ["Lamentations", ["Lam"]], ["Ezekiel", ["Ezek"]], ["Daniel", ["Dan"]], ["Hosea", ["Hos"]], ["Joel", []], ["Amos", []],
  ["Obadiah", ["Obad"]], ["Jonah", ["Jon"]], ["Micah", ["Mic"]], ["Nahum", ["Nah"]], ["Habakkuk", ["Hab"]], ["Zephaniah", ["Zeph"]], ["Haggai", ["Hag"]],
  ["Zechariah", ["Zech"]], ["Malachi", ["Mal"]], ["Matthew", ["Matt", "Mt"]], ["Mark", ["Mk"]], ["Luke", ["Lk"]], ["John", ["Jn"]], ["Acts", []], ["Romans", ["Rom"]],
  ["1 Corinthians", ["1 Cor"]], ["2 Corinthians", ["2 Cor"]], ["Galatians", ["Gal"]], ["Ephesians", ["Eph"]], ["Philippians", ["Phil"]], ["Colossians", ["Col"]],
  ["1 Thessalonians", ["1 Thess"]], ["2 Thessalonians", ["2 Thess"]], ["1 Timothy", ["1 Tim"]], ["2 Timothy", ["2 Tim"]], ["Titus", ["Tit"]], ["Philemon", ["Phlm"]],
  ["Hebrews", ["Heb"]], ["James", ["Jas"]], ["1 Peter", ["1 Pet"]], ["2 Peter", ["2 Pet"]], ["1 John", ["1 Jn"]], ["2 John", ["2 Jn"]], ["3 John", ["3 Jn"]], ["Jude", []],
  ["Revelation", ["Rev"]],
];
const ALIAS = new Map<string, string>();
for (const [name, abbr] of BOOKS) for (const a of [name, ...abbr]) ALIAS.set(a.toLowerCase().replace(/\s+/g, " "), name);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
/** "1 John", "1John", "First John", "I John" all read as 1 John. */
const NAMES = [...ALIAS.keys()].sort((a, b) => b.length - a.length).map((n) => (/^[123] /.test(n) ? `(?:${n[0]}|${["I", "II", "III"][+n[0] - 1]}|${["First", "Second", "Third"][+n[0] - 1]})\\s*${esc(n.slice(2))}` : esc(n)));
const REF = new RegExp(`\\b(${NAMES.join("|")})\\.?\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?(?:\\s*,\\s*\\d{1,3}(?!\\s*[A-Za-z:])(?:\\s*[-–]\\s*\\d{1,3})?)*)`, "gi");

function canonicalBook(raw: string): string {
  const t = raw.replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/^(first|i)\s*/, "1 ").replace(/^(second|ii)\s*/, "2 ").replace(/^(third|iii)\s*/, "3 ").replace(/^([123])(\S)/, "$1 $2");
  return ALIAS.get(t) ?? ALIAS.get(t.replace(/^([123]) /, "$1 ")) ?? raw;
}

/** Every Bible reference in a piece of text, in canonical form ("Proverbs 31:26", "1 John 4:19", "Psalms 23:1-3"). */
export function findReferences(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(REF)) {
    const book = canonicalBook(m[1]);
    const verses = m[3].replace(/\s+/g, "").replace(/–/g, "-").replace(/,/g, ", ");
    const ref = `${book === "Psalms" && !/[-,]/.test(verses) ? "Psalm" : book} ${m[2]}:${verses}`;
    if (!out.includes(ref)) out.push(ref);
  }
  return out;
}

/** A reference as typed by the customer, tidied ("prov 31:26" → "Proverbs 31:26"); null when it isn't one. */
export function normalizeReference(raw: string): string | null {
  return findReferences(raw)[0] ?? null;
}

/** How many verses a reference covers ("John 3:16-18" = 3, "Psalm 23:1, 4" = 2). */
export function verseCount(ref: string): number {
  const v = /:\s*(.+)$/.exec(ref)?.[1] ?? "";
  return v.split(",").reduce((n, part) => {
    const [a, b] = part.split("-").map((x) => parseInt(x, 10));
    return n + (b && b >= a ? b - a + 1 : 1);
  }, 0) || 1;
}

// ---- Wording --------------------------------------------------------------------------------------

/** The publisher-side page where the customer can read the passage in their translation, to copy the exact wording. */
export function passageLink(ref: string, translation: string): string {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=${encodeURIComponent(translation)}`;
}

export type FetchResult = { ok: true; text: string; reference: string } | { ok: false; reason: string };

/**
 * The exact wording of a public-domain translation, from bible-api.com (word for word, line breaks joined).
 * Copyrighted translations are never fetched: the customer supplies them.
 */
export async function fetchPublicDomain(ref: string, translation: string, fetcher: typeof fetch = fetch): Promise<FetchResult> {
  const t = translationOf(translation);
  if (!t.publicDomain || !t.apiId) return { ok: false, reason: `${t.id} is copyrighted, so Product Studio can't fetch it. Paste the wording from your Bible or the publisher's site, then approve it.` };
  try {
    const res = await fetcher(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${t.apiId}`);
    if (!res.ok) return { ok: false, reason: res.status === 404 ? `“${ref}” wasn't found. Check the reference.` : `The Bible text service answered ${res.status}. Try again, or paste the wording yourself.` };
    const body = (await res.json()) as { text?: string; reference?: string };
    const text = (body.text ?? "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    return text ? { ok: true, text, reference: body.reference ?? ref } : { ok: false, reason: "The Bible text service returned no wording. Paste it yourself." };
  } catch {
    return { ok: false, reason: "Couldn't reach the Bible text service (offline?). Paste the wording yourself, or try again." };
  }
}

/** Obvious problems with pasted wording: empty, the reference pasted instead of the verse, a web page's extras. */
export function wordingProblem(text: string, ref: string): string | null {
  const t = text.trim();
  if (!t) return "Add the verse wording.";
  if (normalizeReference(t) === ref && t.replace(REF, "").trim().length < 12) return "That's the reference, not the verse. Paste the verse's words.";
  if (/https?:\/\/|Read full chapter|Cross references|Footnotes/i.test(t)) return "This looks like it includes extra text from a web page (links, footnotes or headings). Keep only the verse's words.";
  if (t.length > 900) return "This is very long for one page. Shorten the passage (fewer verses), or move it to its own page.";
  return null;
}

// ---- Suggestions (references only, never wording) -------------------------------------------------

const SUGGESTIONS: [RegExp, string[]][] = [
  [/\b(brave|courage|courageous|afraid|fear|first step|new|nervous|scared)\b/i, ["Joshua 1:9", "Isaiah 41:10", "Psalm 56:3"]],
  [/\b(kind|kindness|gentle|help(?:ing|s|ed)?|friend|share|sharing)\b/i, ["Ephesians 4:32", "Proverbs 17:17", "Galatians 6:2"]],
  [/\b(gracious|grace|wisdom|wise|speak|words)\b/i, ["Proverbs 31:26", "Colossians 4:6", "James 1:5"]],
  [/\b(pray|prayer|praying)\b/i, ["Philippians 4:6", "1 Thessalonians 5:17", "Matthew 6:9"]],
  [/\b(dance|danc(?:e|ing|er)|joy|joyful|celebrat|praise|sing)\b/i, ["Psalm 149:3", "Psalm 30:11", "Nehemiah 8:10"]],
  [/\b(strong|strength|practice|practicing|try again|keep going|work hard)\b/i, ["Philippians 4:13", "Isaiah 40:31", "Colossians 3:23"]],
  [/\b(beautiful|beauty|made|wonderful|creat(?:ed|ion)|special)\b/i, ["Psalm 139:14", "Ecclesiastes 3:11", "Genesis 1:31"]],
  [/\b(love|loved|loving|family)\b/i, ["1 John 4:19", "1 Corinthians 13:4", "John 13:34"]],
  [/\b(thank|thankful|grateful|gift|flowers)\b/i, ["1 Thessalonians 5:18", "James 1:17", "Psalm 107:1"]],
  [/\b(shine|light|stage|bright)\b/i, ["Matthew 5:16", "Psalm 119:105", "John 8:12"]],
  [/\b(rest|tired|sleep|peace|quiet|calm)\b/i, ["Matthew 11:28", "Psalm 4:8", "John 14:27"]],
  [/\b(humble|bow|serve|serving|others)\b/i, ["Philippians 2:3", "1 Peter 5:5", "Mark 10:45"]],
];

/** Up to three references that fit a scene (by its words), for the customer to approve. Never their wording. */
export function suggestReferences(sceneText: string, exclude: string[] = []): string[] {
  const out: string[] = [];
  for (const [re, refs] of SUGGESTIONS) if (re.test(sceneText)) for (const r of refs) if (!out.includes(r) && !exclude.includes(r)) out.push(r);
  return out.slice(0, 3);
}

// ---- Licensing ------------------------------------------------------------------------------------

export type LicenseCheck = { translation: Translation; verses: number; share: number; overVerses: boolean; overShare: boolean; notice: string | null };

/**
 * The quoted translation's free-use limits against this book: the verses quoted and their share of the book's text
 * (word count of the verses against every word printed in the book).
 */
export function licenseCheck(translation: string, refs: string[], verseWords: number, totalWords: number): LicenseCheck {
  const t = translationOf(translation);
  const verses = refs.reduce((n, r) => n + verseCount(r), 0);
  const share = totalWords ? verseWords / totalWords : 0;
  return {
    translation: t, verses, share,
    overVerses: !t.publicDomain && t.maxVerses !== undefined && verses > t.maxVerses,
    overShare: !t.publicDomain && t.maxShare !== undefined && verses > 0 && share >= t.maxShare,
    notice: t.publicDomain ? null : t.notice ?? `Add the copyright notice ${t.id}'s publisher requires.`,
  };
}

export const wordCount = (t: string) => (t.match(/[\p{L}\p{N}’']+/gu) ?? []).length;
