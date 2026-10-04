import { chromium } from 'playwright';
// Exports every Color Studio palette (built-in journal palettes + color families) to palettes/studio-palettes.json,
// which Print Prep offers. Re-run after adding or changing palettes in index.html:
//   python3 -m http.server 8765   (in the repo root, in another terminal)
//   node tools/export_palettes.mjs
// Needs Playwright with Chromium (set CHROMIUM to its executable if it isn't found automatically).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const pg = await b.newPage();
await pg.goto('http://localhost:8765/index.html?debug');
await pg.evaluate(() => localStorage.clear()); await pg.reload();
await pg.waitForFunction(() => window.__studio && document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 90000 });
const out = await pg.evaluate(() => {
  const S = window.__studio, keys = ['stone', 'vein', 'highlight', 'plate', 'frame', 'trim', 'title', 'accent', 'paper', 'line'], seen = new Set(), list = [];
  const J = ['dream', 'prayer', 'warrior', 'warring'], NAMES = { dream: 'Dream Journal', prayer: 'Prayer Journal', warrior: 'Prayer Warrior', warring: 'Warring Woman' };
  const inAll = (n) => J.every((j) => S.palettesFor(j).some((p) => p.name === n));
  for (const j of J) for (const pl of S.palettesFor(j)) {
    if (!pl.name || seen.has(pl.name)) continue; seen.add(pl.name);
    const o = { name: pl.name, group: inAll(pl.name) ? 'Color families' : NAMES[j] }; keys.forEach((k) => { if (pl[k]) o[k] = pl[k]; }); list.push(o);
  }
  return list;
});
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'palettes', 'studio-palettes.json'), JSON.stringify(out, null, 1));
console.log(`Exported ${out.length} palettes.`);
await b.close();
