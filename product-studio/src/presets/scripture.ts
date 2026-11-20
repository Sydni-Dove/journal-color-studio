/**
 * BIBLE TRANSLATIONS — the ones Generate with AI quotes from, and the notice each needs in a
 * product for sale.
 *
 *   NIV: Biblica's terms allow up to 500 verses without written permission, provided the verses are
 *   not a complete book and are under 25% of the work's text; the notice below must appear on the
 *   title or copyright page, and "(NIV)" after each quotation (biblica.com/permissions).
 *   KJV: public domain in the United States; no notice needed.
 */
export type TranslationId = "NIV" | "KJV";

export const TRANSLATIONS: Record<TranslationId, { label: string; notice: string | null }> = {
  NIV: {
    label: "NIV (New International Version)",
    notice: "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.",
  },
  KJV: { label: "KJV (King James Version)", notice: null },
};

/** KJV until written NIV permission is granted (Nov 2026); switch back to "NIV" then. */
export const DEFAULT_TRANSLATION: TranslationId = "KJV";
export const NIV_NOTICE = TRANSLATIONS.NIV.notice!;

/** Whether wording quotes the NIV (its quotations end "(NIV)"). */
export const quotesNiv = (text: string) => /\bNIV\b/.test(text);
