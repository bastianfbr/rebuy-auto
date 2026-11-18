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

// --- buildListEmbeds ---
import { buildListEmbeds } from './src/embed.js';
const rowsL = [
  { name: 'Samsung Galaxy Tab S12 Plus', channel_id: '111', last_a0: 521.9, last_a1: 493.43, last_a2: 469.7, updatedAt: '2026-11-18T14:12:00.000Z' },
  { name: 'Google Pixel 11 Pro', channel_id: '222', last_a0: 606.22, last_a1: null, last_a2: 560.84, updatedAt: 'n/a' },
];
const le = buildListEmbeds(rowsL);
assert.equal(le.length, 1);
assert.equal(le[0].fields.length, 2);
assert.match(le[0].description, /\*\*2\*\* produits/);
const norm = (x) => x.replace(/[\u00a0\u202f]/g, ' '); // Intl utilise des espaces insécables
assert.equal(norm(le[0].fields[0].value), '<#111> · relevé <t:1795011120:R>\n🆕 521,90 € · ✨ 493,43 € · 👍 469,70 €');
assert.match(le[0].fields[1].value, /✨ — · 👍/);
assert.ok(!le[0].fields[1].value.includes('<t:'));
assert.deepEqual(buildListEmbeds([]), []);
// limites Discord : 25 champs, 6000 caractères au total
const many = buildListEmbeds(Array.from({ length: 40 }, (_, k) => ({ name: 'Produit très long '.repeat(8) + k, channel_id: '123456789012345678', last_a0: 1000.5, last_a1: 900.5, last_a2: 800.5, updatedAt: '2026-11-18T14:12:00.000Z' })))[0];
const total = JSON.stringify(many).length;
assert.ok(many.fields.length <= 25 && total < 6000, `embed trop gros : ${many.fields.length} champs, ${total} car.`);
assert.match(many.footer.text, /non affichés/);
console.log('✔ buildListEmbeds');
