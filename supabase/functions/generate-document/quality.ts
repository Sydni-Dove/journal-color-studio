/** Deterministic checks for developed children's lessons. The model still needs human review. */
export function lessonQualityGap(raw: string, request: string): string | null {
  if (!/\b(story|stories|story-style)\b/i.test(request)) return null;
  const explicit = request.match(/(\d{2,3})\s*(?:–|-|to)\s*(\d{2,3})\s*[- ]?\s*(?:word|words)/i);
  const single = request.match(/(?:about|approximately|around)?\s*(\d{2,3})\s*[- ]?\s*(?:word|words)\b/i);
  if (!explicit && !single && !/\b(child|children|ages?\s*\d)/i.test(request)) return null;
  let spec: { entries?: { fields?: { key?: string; label?: string }[]; records?: { values?: { key?: string; value?: string }[] }[] } };
  try { spec = JSON.parse(raw); } catch { return null; }
  const fields = spec.entries?.fields ?? [];
  const records = spec.entries?.records ?? [];
  const story = fields.find((f) => /story|teaching/i.test(`${f.key} ${f.label}`))?.key;
  const activity = fields.find((f) => /activit/i.test(`${f.key} ${f.label}`))?.key;
  const verse = fields.find((f) => /verse|scripture/i.test(`${f.key} ${f.label}`))?.key;
  const prayer = fields.find((f) => /prayer/i.test(`${f.key} ${f.label}`))?.key;
  const questions = fields.filter((f) => /question|reflect/i.test(`${f.key} ${f.label}`) || /^q\d+$/i.test(f.key ?? "")).map((f) => f.key);
  const min = explicit ? Number(explicit[1]) : single ? Math.floor(Number(single[1]) * 0.9) : 100;
  const max = explicit ? Number(explicit[2]) : single ? Math.ceil(Number(single[1]) * 1.1) : 180;
  if (!story) return "The requested story field is missing.";
  for (const [i, record] of records.entries()) {
    const values = new Map((record.values ?? []).map((v) => [v.key, (v.value ?? "").trim()]));
    const prose = values.get(story) ?? "";
    const words = prose.match(/\b[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*\b/gu)?.length ?? 0;
    if (words < min || words > max) return `Lesson ${i + 1} has a ${words}-word story; the requested range is ${min}–${max} words. Develop that lesson's narrative with a situation, conflict, choice and consequence.`;
    if (/\b(?:[1-3]\s)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Micah|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Hebrews|James|Peter|Jude|Revelation)\s\d{1,3}:\d{1,3}/.test(prose)) return `Lesson ${i + 1} has a Scripture reference written inside the story; remove it (the verse has its own field).`;
    if (/\bactivit/i.test(request) && (!activity || !(values.get(activity) ?? ""))) return `Lesson ${i + 1} is missing its activity.`;
    if (/\b(scripture|bible verse|verse)\b/i.test(request) && (!verse || !(values.get(verse) ?? ""))) return `Lesson ${i + 1} is missing its Scripture reference.`;
    if (/\bprayer\b/i.test(request) && (!prayer || !(values.get(prayer) ?? ""))) return `Lesson ${i + 1} is missing its prayer.`;
    if (/two\s+(?:story-specific\s+)?(?:reflection\s+)?questions/i.test(request)) {
      const count = questions.reduce((n, key) => n + ((values.get(key) ?? "").match(/\?/g)?.length ?? 0), 0);
      if (count < 2) return `Lesson ${i + 1} needs two reflection questions.`;
    }
  }
  return null;
}
