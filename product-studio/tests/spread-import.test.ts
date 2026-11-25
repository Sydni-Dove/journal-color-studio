/**
 * A whole Devotional Spread book from one idea (engines/coloringBook/spreadImport.ts): the ChatGPT prompt, reading
 * the pasted lessons, filling Scripture word for word from the public-domain text (never from ChatGPT), every Art
 * Prompt at once, and pictures matched to their pages.
 */
import { describe, expect, it } from "vitest";
import { fillScripture, lessonsPrompt, parseLessons, spreadsFromLessons } from "../src/engines/coloringBook/spreadImport";
import { allArtPrompts, answerProblems, assignPictures, mommyOf } from "../src/engines/coloringBook/spread";
import { briefFor } from "../src/engines/coloringBook/assembleBook";
import { whatsMissing } from "../src/engines/coloringBook/missing";
import { GIRL_1 } from "../src/engines/coloringBook/book";
import { GENESIS_1_27, JOHN_1_4_19, PSALM_139_14, mommyAndMe } from "./fixtures/mommyAndMe";

const ANSWER = `Here are your lessons!

**LESSON 1: I Am Wonderfully Made**
Theme: God made me on purpose
Daughter scene: The girl twirls in a field of daisies while Jesus smiles beside her.
Verse: Psalm 139:14
Verse words: I am fearfully and wonderfully made
Mommy declaration: She is fearfully and wonderfully made
Mommy art: A garden arch of roses and climbing vines
Read the Word:
- Psalm 139:14 | exact | I will praise thee; for I am fearfully and wonderfully made
- Gen 1:27 | exact | So God created man in his own image
- Psalm 139:13 | paraphrase | God knit you together before you were born.
Fill in the Blank:
- I am fearfully and ___ made. | wonderfully | Psalm 139:14
- God created us in his own ___. | image | Genesis 1:27
- God's works are ___. | marvellous | Psalm 139:14
Listen & Reflect: Where did you see God's beautiful work in your daughter this week?
Heart to Heart: What is one thing God made special about you?

LESSON 2 — God Loved Us First
theme: Love starts with God
Scene: The girl hugs Jesus under a big tree.
Scripture: 1 John 4:19
Verse words: We love him because he loves cookies
Declaration: Love is patient
Mom art: Lilies and a teacup
Read the Word:
• 1 John 4:19 — exact — We love him because God is great
Fill in the Blank:
1. We love him, because he first ___ us. — loved — 1 John 4:19
Listen and Reflect: How did God show you His love first today?
Heart to Heart: How can we show God's love tomorrow?
`;

const KJV: Record<string, string> = { "Psalm 139:14": PSALM_139_14, "Genesis 1:27": GENESIS_1_27, "1 John 4:19": JOHN_1_4_19 };
const fetcher = async (ref: string) => (KJV[ref] ? { ok: true as const, text: KJV[ref], reference: ref } : { ok: false as const, reason: "not found" });
let n = 0;
const id = () => `q${++n}`;

describe("The ChatGPT prompt", () => {
  it("asks for every lesson in the exact format the importer reads, in the book's translation", () => {
    const p = lessonsPrompt("Who God says I am", 12, { title: "Mommy & Me", translation: "KJV" });
    expect(p).toContain("Write 12 mother-and-daughter devotional lessons");
    expect(p).toContain("The idea: Who God says I am");
    for (const label of ["LESSON 1:", "Theme:", "Daughter scene:", "Verse:", "Verse words:", "Mommy declaration:", "Mommy art:", "Read the Word:", "Fill in the Blank:", "Listen & Reflect:", "Heart to Heart:"]) expect(p).toContain(label);
    expect(p).toContain("each missing word must appear in one of that lesson's Read the Word lines");
  });
});

describe("Reading the pasted lessons", () => {
  it("reads every part of every lesson, whatever the bullets, separators, bold or label case", () => {
    const ls = parseLessons(ANSWER);
    expect(ls).toHaveLength(2);
    expect(ls[0]).toMatchObject({ number: 1, title: "I Am Wonderfully Made", theme: "God made me on purpose", verseRef: "Psalm 139:14", declaration: "She is fearfully and wonderfully made", mommyArt: "A garden arch of roses and climbing vines" });
    expect(ls[0].readWord).toEqual([
      { ref: "Psalm 139:14", kind: "exact", text: "I will praise thee; for I am fearfully and wonderfully made" },
      { ref: "Genesis 1:27", kind: "exact", text: "So God created man in his own image" },
      { ref: "Psalm 139:13", kind: "paraphrase", text: "God knit you together before you were born." },
    ]);
    expect(ls[0].blanks[2]).toEqual({ text: "God's works are ___.", answer: "marvellous", ref: "Psalm 139:14" });
    expect(ls[1]).toMatchObject({ title: "God Loved Us First", theme: "Love starts with God", scene: "The girl hugs Jesus under a big tree.", verseRef: "1 John 4:19", declaration: "Love is patient", mommyArt: "Lilies and a teacup", reflect: "How did God show you His love first today?" });
    expect(ls[1].blanks).toEqual([{ text: "We love him, because he first ___ us.", answer: "loved", ref: "1 John 4:19" }]);
  });

  it("makes one Devotional Spread per lesson: bubble daughter page, script Mommy page drawn into the art, Girl 1", () => {
    const s = spreadsFromLessons(parseLessons(ANSWER), id, GIRL_1.id);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ pageType: "devotional-spread", letterStyle: "bubble", pageTitle: "I Am Wonderfully Made", scriptureRef: "Psalm 139:14", artCharacterId: "girl-1", verseUse: "excerpt" });
    expect(mommyOf(s[0])).toMatchObject({ title: "She is fearfully and wonderfully made", letterStyle: "elegant", textOff: true, reflect: { lines: 4 } });
  });
});

describe("Scripture is filled in word for word, never taken from ChatGPT", () => {
  it("fills every verse from the KJV; keeps a true excerpt; replaces wording that isn't the verse's own", async () => {
    const { scenes, report } = await fillScripture(spreadsFromLessons(parseLessons(ANSWER), id), "KJV", fetcher);
    // Daughter verse 1: a true KJV excerpt — kept as the excerpt, the full verse stored.
    expect(scenes[0]).toMatchObject({ verseText: PSALM_139_14, verseUse: "excerpt", verseExcerpt: "I am fearfully and wonderfully made", verseSource: "public-domain" });
    expect(scenes[0].verseApproved).toBeUndefined();
    // Daughter verse 2: ChatGPT's “excerpt” isn't the verse → the full KJV verse prints.
    expect(scenes[1]).toMatchObject({ verseText: JOHN_1_4_19 });
    expect(scenes[1].verseUse).toBeUndefined();
    // Mommy page: true excerpts kept; a misquote replaced by the real verse; paraphrases untouched.
    expect(mommyOf(scenes[0]).readWord.map((r) => r.text).slice(1)).toEqual(["So God created man in his own image", "God knit you together before you were born."]);
    expect(mommyOf(scenes[1]).readWord[0].text).toBe(JOHN_1_4_19);
    // Lesson 1, blank 3 (“marvellous”): the kept excerpt stops short, so the full verse prints.
    expect(mommyOf(scenes[0]).readWord[0].text).toBe(PSALM_139_14);
    expect(report.replaced).toEqual(["God Loved Us First: 1 John 4:19", "God Loved Us First: 1 John 4:19"]);
    expect(report.failed).toEqual([]);
    // The answer check now passes on lesson 2 (“loved” is in the real verse).
    expect(answerProblems(scenes[1])).toEqual([]);
  });

  it("a copyrighted translation is never fetched: quotes stay as pasted, for the maker to check", async () => {
    let called = false;
    const r = await fillScripture(spreadsFromLessons(parseLessons(ANSWER), id), "NIV", async () => { called = true; return { ok: false, reason: "" }; });
    expect(called).toBe(false);
    expect(r.report.filled).toBe(0);
  });

  it("a reference that isn't found is listed", async () => {
    const { report } = await fillScripture(spreadsFromLessons(parseLessons(ANSWER.replace("Gen 1:27", "Gen 1:99")), id), "KJV", fetcher);
    expect(report.failed).toContain("I Am Wonderfully Made: Genesis 1:99");
  });
});

describe("Finishing in one go", () => {
  it("every Art Prompt, in print order, left then right", () => {
    const book = mommyAndMe();
    const all = allArtPrompts(book, briefFor(book));
    const heads = [...all.matchAll(/===== (Spread \d · (?:LEFT|RIGHT))/g)].map((m) => m[1]);
    expect(heads).toEqual(["Spread 1 · LEFT", "Spread 1 · RIGHT", "Spread 2 · LEFT", "Spread 2 · RIGHT"]);
    expect(all.match(/Spell every word exactly as written\./g)).toHaveLength(4);
  });

  it("pictures go to their pages: named ones where they say, the rest in print order, skipping pages with art", () => {
    const book = mommyAndMe();
    const b = briefFor(book);
    expect(assignPictures(["a.png", "b.png", "c.png", "d.png", "e.png"], b).map((x) => `${x.file}:${x.sceneId}:${x.side}`)).toEqual(["0:wonderful:daughter", "1:wonderful:mommy", "2:first:daughter", "3:first:mommy"]);
    expect(assignPictures(["IMG_1.png", "spread 2 mommy.png", "2-left.png"], b).map((x) => `${x.file}:${x.sceneId}:${x.side}`)).toEqual(["0:wonderful:daughter", "1:first:mommy", "2:first:daughter"]);
    const withArt = { ...b, scenes: b.scenes.map((s, i) => (i === 0 ? { ...s, illustrationId: "x" } : s)) };
    expect(assignPictures(["a.png"], withArt)[0]).toMatchObject({ sceneId: "wonderful", side: "mommy" });
  });

  it("a book made this way checks out once its art and verses are approved", async () => {
    const { scenes } = await fillScripture(spreadsFromLessons(parseLessons(ANSWER), id, GIRL_1.id), "KJV", fetcher);
    const book = mommyAndMe({}, scenes.map((s) => ({ ...s, verseApproved: "x" })));
    // Every answer is in its page's printed excerpts (a short excerpt missing an answer became the full verse).
    expect(whatsMissing(book).filter((i) => /^(words|verse|badref|answer-)/.test(i.id))).toEqual([]);
  });
});
