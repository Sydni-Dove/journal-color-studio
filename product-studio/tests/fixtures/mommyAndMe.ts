/**
 * A SAMPLE of Sydni's “Mommy & Me: Growing With God Together” (two Devotional Spreads), for tests and preview
 * screenshots only. The Scripture lines are KJV (public domain), word for word; the devotional wording is placeholder
 * text for the layout, not hers. Her own book is never read or changed by the tests.
 */
import { coloringBrief, GIRL_1, newBook, type ColoringBook } from "../../src/engines/coloringBook/book";
import type { Scene } from "../../src/engines/cover/brief";

export const PSALM_139_14 = "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.";
export const GENESIS_1_27 = "So God created man in his own image, in the image of God created he him; male and female created he them.";
export const JOHN_1_4_19 = "We love him, because he first loved us.";
export const COR_1_13_4 = "Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,";

export const SPREAD_1: Scene = {
  id: "wonderful", title: "I Am Wonderfully Made", pageTitle: "I Am Wonderfully Made", pageType: "devotional-spread", letterStyle: "bubble",
  theme: "God made me wonderfully", text: "The girl twirls in a meadow of wildflowers while Jesus kneels beside her, smiling arms open.", artCharacterId: GIRL_1.id,
  scriptureRef: "Psalm 139:14", verseText: PSALM_139_14, verseApproved: "2026-11-25", verseSource: "public-domain", verseUse: "excerpt", verseExcerpt: "I am fearfully and wonderfully made",
  mommy: {
    title: "She is fearfully and wonderfully made", scene: "A tall garden arch of roses and climbing vines with butterflies.", letterStyle: "elegant", qr: true,
    readWord: [
      { text: "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works", ref: "Psalm 139:14", kind: "exact" },
      { text: "So God created man in his own image, in the image of God created he him", ref: "Genesis 1:27", kind: "exact" },
      { text: "God knit you together, carefully, before you were ever born.", ref: "Psalm 139:13", kind: "paraphrase" },
    ],
    blanks: [
      { text: "I am fearfully and ___ made.", answer: "wonderfully", ref: "Psalm 139:14" },
      { text: "God created us in his own ___.", answer: "image", ref: "Genesis 1:27" },
      { text: "God's works are ___.", answer: "marvellous", ref: "Psalm 139:14" },
    ],
    reflect: { question: "Where did you see God's beautiful work in your daughter this week?", lines: 4 },
    heart: "Ask her: What is one thing God made special about you?",
  },
};

export const SPREAD_2: Scene = {
  id: "first", title: "God Loved Us First", pageTitle: "God Loved Us First", pageType: "devotional-spread", letterStyle: "elegant",
  theme: "God's love comes first", text: "The girl hugs Jesus under a big tree while birds sing on the branches.", artCharacterId: GIRL_1.id,
  scriptureRef: "1 John 4:19", verseText: JOHN_1_4_19, verseApproved: "2026-11-25", verseSource: "public-domain",
  mommy: {
    title: "Love is patient, love is kind", scene: "A sprig of lilies and a teacup on a little table.", layout: "band", textOff: true,
    readWord: [
      { text: JOHN_1_4_19, ref: "1 John 4:19", kind: "exact" },
      { text: "Charity suffereth long, and is kind", ref: "1 Corinthians 13:4", kind: "exact" },
    ],
    blanks: [
      { text: "We love him, because he first ___ us.", answer: "loved", ref: "1 John 4:19" },
      // Not in the KJV excerpts printed on this page: the answer check flags it.
      { text: "Love is ___.", answer: "patient", ref: "1 Corinthians 13:4" },
      { text: "Charity ___ long, and is kind.", answer: "suffereth", ref: "1 Corinthians 13:4" },
    ],
    reflect: { question: "How did God show you His love first today?", lines: 3 },
    heart: "Ask her: How can we show God's love to someone tomorrow?",
  },
};

/** The sample book: KJV, faith-based, two spreads, a title page and copyright page. */
export function mommyAndMe(over: Partial<ColoringBook> = {}, scenes: Scene[] = [SPREAD_1, SPREAD_2]): ColoringBook {
  return newBook("mommy-me-sample", {
    name: "Mommy & Me: Growing With God Together", author: "Sydni Howard", faithBased: true,
    content: { title: true, scripture: "full", lesson: false, customText: false },
    printFormat: "home-print", sides: "double",
    brief: coloringBrief({ title: "Mommy & Me: Growing With God Together", translation: "KJV", scenes }),
    artCharacters: [GIRL_1],
    ...over,
  });
}
