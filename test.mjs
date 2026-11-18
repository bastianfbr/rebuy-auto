import assert from 'node:assert/strict';
import { buildEmbed, diffPrices, hasChange } from './src/embed.js';
const o = { A0: 513.9, A1: 500, A2: 469.7 }, n = { A0: 521.9, A1: 493.43, A2: 469.7 };
const rows = diffPrices(o, n);
assert.equal(hasChange(rows), true);
assert.equal(hasChange(diffPrices(n, n)), false);
const e = buildEmbed({ name: 'Test', url: 'https://x', prices: n, oldPrices: o });
assert.equal(e.color, 0xf0a232);
console.log(e.description);
console.log(buildEmbed({ name: 'Test', url: 'https://x', prices: n }).description);

// --- parseRebuy (fixture synthétique) ---
import { parseRebuy } from './src/rebuy.js';
const html = '<meta property="og:title" content="Reprise de votre Samsung Galaxy Tab S12 Plus 14,6&#8221; [Wi-Fi] gris – rebuy">'
  + '<meta property="og:image" content="https://img/x.jpg?a=1&amp;b=2">'
  + '<script id="ry-inject" type="application/json">{"id":27203173,"category_id":{"0":1},"purchase_a0_price":52190,"purchase_a1_price":49343,"purchase_a2_price":46970,"purchase_a3_price":42225}</script>';
const p = parseRebuy(html);
assert.deepEqual(p.prices, { A0: 521.9, A1: 493.43, A2: 469.7 });
assert.equal(p.id, '27203173');
assert.equal(p.name, 'Samsung Galaxy Tab S12 Plus 14,6” [Wi-Fi] gris');
assert.equal(p.image, 'https://img/x.jpg?a=1&b=2');
assert.throws(() => parseRebuy('<html></html>'), /ry-inject/);
assert.equal(buildEmbed({ name: 'T', url: 'u', prices: n, image: 'https://img/x.jpg' }).thumbnail.url, 'https://img/x.jpg');
console.log('✔ parseRebuy + thumbnail');
