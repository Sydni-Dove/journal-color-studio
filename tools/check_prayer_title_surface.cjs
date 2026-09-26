// Focused regression for the Pink Prayer reading surface. Run: node tools/check_prayer_title_surface.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('  const FILL_PAD ='), html.indexOf('  // Readability check (preview only)'));
const events = [];
const ctx = { save() {}, restore() {}, beginPath() {}, rect(...r) { this.region = r; },
  fill() { events.push('surface'); }, clip() { events.push('clip'); } };
const sandbox = { rgba: (hex, alpha) => `${hex}:${alpha}`,
  prFit: (W, H) => ({ k: Math.min(W / 816, H / 1056), ox: 0, oy: 0 }),
  PINK: { cover: [['coverWash', 81.6, 188.44, 652.8, 679.12]] },
  drawPr: (ctx, W, H, s, rows) => { assert.equal(rows[0][0], 'coverGold'); events.push('gold'); } };
vm.createContext(sandbox);
vm.runInContext(source + '\nthis.path = titleFillPath; this.draw = drawTitleFill;', sandbox);
let checks = 0;
for (const [pad, padding] of [['tight', 12], ['normal', 24], ['generous', 36]]) {
  for (const W of [375, 393, 430, 816, 2550]) {
    for (const kind of ['none', 'rect', 'ellipse', 'bevel', 'ring']) {
      const s = { journal: 'prayer', palette: { paper: '#FFFFFF' }, titleFill: { on: true, opacity: 100, color: 'paper', pad } };
      sandbox.path(ctx, W, W * 1056 / 816, s, { kind });
      const r = ctx.region.map(v => v * 816 / W);
      assert.ok(Math.abs(r[0] - (145.67 - padding)) < 1e-8);
      assert.ok(r[0] <= 145.67 && r[1] <= 422.67 && r[0] + r[2] >= 719.67 - 1e-8 && r[1] + r[3] >= 650.3 - 1e-8);
      if (pad === 'generous') { assert.ok(Math.abs(r[1] - 311.4) < 1e-8); assert.ok(Math.abs(r[1] + r[3] - 751.1) < 1e-8); }
      events.length = 0;
      sandbox.draw(ctx, W, W * 1056 / 816, s, { kind });
      assert.deepEqual(events, ['surface', 'clip', 'gold']);
      checks++;
    }
  }
}
for (const journal of ['dream', 'prayer', 'warrior', 'warring']) {
  for (const fill of [{ on: false, opacity: 100 }, { on: true, opacity: 0 }]) {
    events.length = 0;
    sandbox.draw(ctx, 816, 1056, { journal, palette: {}, titleFill: fill }, {});
    assert.deepEqual(events, []);
    checks++;
  }
}
console.log(`PASS ${checks} geometry, overlay-order and disabled-fill cases`);
