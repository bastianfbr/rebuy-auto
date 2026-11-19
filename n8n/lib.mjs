// Construit le code JavaScript des nœuds Code n8n à partir des sources testées (src/).
// Le sandbox n8n n'a pas d'import : on inline rebuy.js + embed.js sans leurs import/export.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function strip(src) {
  return src
    .replace(/^import .*$/gm, '')
    .replace(/^\/\/ .*$/gm, '')
    .replace(/export async function fetchRebuy[\s\S]*?\n}\n/, '')
    .replace(/if \(import\.meta\.url[\s\S]*$/m, '')
    .replace(/^export /gm, '');
}

// Le nœud Discord de n8n attend thumbnail/image sous forme d'URL (string) et non d'objet { url }.
const N8N_EMBED = `
function n8nEmbed(e) {
  if (e.thumbnail && e.thumbnail.url) e.thumbnail = e.thumbnail.url;
  return e;
}`;

export const LIB = `${strip(read('src/rebuy.js'))}\n${strip(read('src/categories.js'))}\n${strip(read('src/embed.js'))}${N8N_EMBED}`;

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';

/** Corps du nœud « Analyser la page » du relevé quotidien (compare avec la ligne produit). */
export const ANALYSE_QUOTIDIEN = `${LIB}
const prod = $('Boucle produits').item.json;
const html = typeof $json.data === 'string' ? $json.data : '';
const base = {
  row_id: prod.id, product_id: prod.product_id, name: prod.name, url: prod.url,
  channel_id: prod.channel_id, fail_count: Number(prod.fail_count || 0),
};
try {
  if (!html) throw new Error(($json.error && $json.error.message) || 'page vide');
  const p = parseRebuy(html);
  const prev = prod.last_a0 != null ? { A0: prod.last_a0, A1: prod.last_a1, A2: prod.last_a2 } : null;
  const rows = diffPrices(prev, p.prices);
  const embed = n8nEmbed(buildEmbed({ name: prod.name || p.name, url: prod.url, prices: p.prices, oldPrices: prev, image: p.image }));
  return { json: { ...base, ok: true, changed: hasChange(rows), a0: p.prices.A0, a1: p.prices.A1, a2: p.prices.A2, embed } };
} catch (e) {
  return { json: { ...base, ok: false, error: String(e.message || e), fail_next: base.fail_count + 1 } };
}`;

/** Valide le corps reçu du bot Discord. */
export const VALIDER_AJOUT = `const b = $json.body || {};
const url = String(b.url || '').trim();
const valid = /^https:\\/\\/www\\.rebuy\\.(fr|de|com|nl|it|es|at|be)\\/vendre\\/\\S+$/i.test(url);
return { json: { valid, url, guildId: String(b.guildId || ''), channelId: String(b.channelId || ''), userId: String(b.userId || '') } };`;

/** Analyse la page d'un nouveau produit (premier relevé, sans comparaison). */
export const ANALYSE_AJOUT = `${LIB}
const req = $('Valider la demande').item.json;
const html = typeof $json.data === 'string' ? $json.data : '';
try {
  if (!html) throw new Error(($json.error && $json.error.message) || 'page vide');
  const p = parseRebuy(html);
  const name = p.name || 'Produit Rebuy ' + p.id;
  const embed = n8nEmbed(buildEmbed({ name, url: req.url, prices: p.prices, image: p.image }));
  const channelName = name.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'produit-rebuy';
  return { json: { ok: true, category: categoryFor(req.url), name, product_id: String(p.id || ''), image: p.image, a0: p.prices.A0, a1: p.prices.A1, a2: p.prices.A2, embed, channelName, url: req.url, guildId: req.guildId, userId: req.userId } };
} catch (e) {
  return { json: { ok: false, error: String(e.message || e) } };
}`;

/** Réponse de la commande /liste : embeds + texte de repli (anciens bots). */
export const MESSAGE_LISTE = `${LIB}
const rows = $input.all().map((i) => i.json).filter((r) => r && r.url);
if (!rows.length) return [{ json: { message: 'Aucun produit suivi pour le moment. Utilise /suivre avec un lien Rebuy.', embeds: [] } }];
return [{ json: { message: '**' + rows.length + ' produit(s) suivi(s)**', embeds: buildListEmbeds(rows) } }];`;

/** Résumé de la commande /actualiser : agrège les résultats de chaque produit. */
export const RESUME_ACTUALISATION = `${LIB}
const results = $input.all().map((i) => i.json);
return [{ json: { message: '✅ Actualisation terminée (' + results.length + ' produit(s))', embeds: [buildRefreshEmbed(results)] } }];`;

/** Cherche la catégorie Discord du produit parmi les salons du serveur (comparaison sans accents ni casse). */
export const CHOISIR_CATEGORIE = `const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
const a = $('Analyser la page').first().json;
const cat = a.category ? $input.all().map((i) => i.json).find((c) => c.type === 4 && norm(c.name) === norm(a.category)) : null;
return [{ json: { category: a.category, parentId: cat ? String(cat.id) : null, needsCreate: !!a.category && !cat } }];`;

/** Fusionne la catégorie existante ou tout juste créée en un parentId (null = pas de catégorie). */
export const RESOUDRE_CATEGORIE = `const c = $('Choisir la catégorie').first().json;
const cree = c.needsCreate && $input.first().json.id ? String($input.first().json.id) : null;
return [{ json: { parentId: c.parentId || cree } }];`;

/** Calcule l'ordre alphabétique des salons de la catégorie (nouveau salon inclus) pour le PATCH des positions. */
export const ORDRE_ALPHA = `const parent = $('Résoudre la catégorie').first().json.parentId;
const neuf = $input.first().json;
const freres = $('Lister les salons').all().map((i) => i.json)
  .filter((c) => c && c.id && c.type === 0 && c.parent_id === parent && c.id !== neuf.id);
const tous = [...freres, { id: neuf.id, name: neuf.name }];
tous.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base', numeric: true }));
return [{ json: { payload: parent ? tous.map((c, i) => ({ id: c.id, position: i })) : [] } }];`;
