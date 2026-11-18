import { GRADES } from './rebuy.js';

const fmt = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');

/** Compare deux relevés {A0,A1,A2}. old = null au premier relevé. */
export function diffPrices(oldP, newP) {
  return Object.keys(GRADES).map((g) => {
    const cur = newP[g];
    const prev = oldP ? oldP[g] : undefined;
    const delta = prev === undefined || cur === undefined ? 0 : Math.round((cur - prev) * 100) / 100;
    return { grade: g, label: GRADES[g], cur, prev, delta, pct: prev ? (delta / prev) * 100 : 0 };
  });
}

export const hasChange = (rows) => rows.some((r) => r.delta !== 0);

/** Construit un embed Discord (objet JSON prêt pour l'API / n8n). */
export function buildEmbed({ name, url, prices, oldPrices = null, image = null, date = new Date() }) {
  const rows = diffPrices(oldPrices, prices);
  const up = rows.some((r) => r.delta > 0);
  const down = rows.some((r) => r.delta < 0);
  const color = !oldPrices ? 0x5865f2 : up && down ? 0xf0a232 : up ? 0x2ecc71 : down ? 0xe74c3c : 0x95a5a6;

  const lines = rows.map((r) => {
    if (!oldPrices) return `**${r.label}** : ${fmt(r.cur)}`;
    if (r.delta === 0) return `➖ ${r.label} : ${fmt(r.cur)} (inchangé)`;
    const icon = r.delta > 0 ? '📈' : '📉';
    const pct = `${sign(r.delta)}${Math.abs(r.pct).toFixed(1).replace('.', ',')} %`;
    return `${icon} **${r.label} : ${fmt(r.cur)}** (${sign(r.delta)}${fmt(Math.abs(r.delta))}, ${pct}) — avant : ${fmt(r.prev)}`;
  });

  const embed = {
    title: `📱 ${name}`,
    url,
    description: `${oldPrices ? 'Prix de reprise mis à jour' : 'Suivi démarré — prix de reprise actuels'}\n\n${lines.join('\n')}`,
    color,
    footer: { text: `Relevé du ${date.toLocaleDateString('fr-FR')}` },
    timestamp: date.toISOString(),
  };
  if (image) embed.thumbnail = { url: image };
  return embed;
}

const LIST_GRADES = [['🆕', 'last_a0'], ['✨', 'last_a1'], ['👍', 'last_a2']];
const MAX_FIELDS = 25; // limite Discord par embed
const MAX_CHARS = 5600; // Discord : 6000 caractères au total par message (marge de sécurité)

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Embed de la commande /liste : un champ par produit, trois prix sur une ligne.
 * rows = lignes de la table rebuy_products (name, channel_id, last_a0..2, updatedAt).
 * Retourne un tableau (vide si aucun produit) pour rester compatible avec l'API.
 */
export function buildListEmbeds(rows) {
  if (!rows.length) return [];
  const fields = [];
  let chars = 400; // titre, description, footer
  for (const r of rows) {
    const ts = Math.floor(Date.parse(r.updatedAt) / 1000);
    const head = `<#${r.channel_id}>${Number.isFinite(ts) ? ` · relevé <t:${ts}:R>` : ''}`;
    const prices = LIST_GRADES.map(([icon, key]) => `${icon} ${r[key] == null ? '—' : fmt(Number(r[key]))}`).join(' · ');
    const field = { name: cut(`📱 ${r.name}`, 100), value: `${head}\n${prices}`, inline: false };
    const size = field.name.length + field.value.length;
    if (fields.length >= MAX_FIELDS || chars + size > MAX_CHARS) break;
    fields.push(field);
    chars += size;
  }
  const hidden = rows.length - fields.length;
  const n = rows.length;
  return [{
    title: '📋 Produits suivis',
    description: `**${n}** produit${n > 1 ? 's' : ''} · relevé chaque jour à 8h\n🆕 Neuf · ✨ Comme neuf · 👍 Très bon état`,
    color: 0x5865f2,
    fields,
    footer: { text: hidden > 0 ? `… et ${hidden} autre${hidden > 1 ? 's' : ''} non affiché${hidden > 1 ? 's' : ''} · /arreter dans un channel pour stopper le suivi` : '/arreter dans un channel pour stopper le suivi' },
  }];
}

const FIELD_MAX = 1024; // limite Discord par valeur de champ

/**
 * Embed de la commande /actualiser : résumé d'un relevé manuel.
 * results = [{ name, channel_id, status: 'changed' | 'same' | 'failed', error }]
 */
export function buildRefreshEmbed(results) {
  const by = (status) => results.filter((r) => r.status === status);
  const changed = by('changed');
  const same = by('same');
  const failed = by('failed');
  const list = (rows, line) => {
    let out = '';
    let hidden = rows.length;
    for (const r of rows) {
      const l = `${line(r)}\n`;
      if (out.length + l.length > FIELD_MAX - 30) break;
      out += l;
      hidden -= 1;
    }
    return (hidden > 0 ? `${out}… et ${hidden} autre${hidden > 1 ? 's' : ''}` : out).trim();
  };
  const fields = [];
  if (changed.length) fields.push({ name: `📈 Prix modifiés (${changed.length})`, value: list(changed, (r) => `• <#${r.channel_id}> ${cut(r.name, 60)}`) });
  if (same.length) fields.push({ name: `➖ Inchangés (${same.length})`, value: list(same, (r) => `• ${cut(r.name, 60)}`) });
  if (failed.length) fields.push({ name: `⚠️ Lecture impossible (${failed.length})`, value: list(failed, (r) => `• <#${r.channel_id}> ${cut(r.error || 'erreur inconnue', 80)}`) });
  const n = results.length;
  return {
    title: '🔄 Actualisation terminée',
    description: `**${n}** produit${n > 1 ? 's' : ''} relevé${n > 1 ? 's' : ''}${changed.length ? ' · les changements sont postés dans leurs channels' : ''}`,
    color: failed.length ? 0xf0a232 : changed.length ? 0x2ecc71 : 0x5865f2,
    fields,
  };
}
