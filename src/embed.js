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

const LIST_GRADES = [['🆕', 'Neuf', 'last_a0'], ['✨', 'Comme neuf', 'last_a1'], ['👍', 'Très bon', 'last_a2']];
const MAX_FIELDS = 25; // limite Discord par embed
const MAX_EMBEDS = 10; // limite Discord par message

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Embeds de la commande /liste : un champ par produit (3 colonnes), découpé par blocs de 25.
 * rows = lignes de la table rebuy_products (name, channel_id, last_a0..2, updatedAt).
 */
export function buildListEmbeds(rows) {
  if (!rows.length) return [];
  const fields = rows.slice(0, MAX_FIELDS * MAX_EMBEDS).map((r) => {
    const ts = Math.floor(Date.parse(r.updatedAt) / 1000);
    const head = `<#${r.channel_id}>${Number.isFinite(ts) ? ` · relevé <t:${ts}:R>` : ''}`;
    const lines = LIST_GRADES.map(([icon, label, key]) => `${icon} **${label}** : ${r[key] == null ? '—' : fmt(Number(r[key]))}`);
    return { name: cut(`📱 ${r.name}`, 256), value: [head, ...lines].join('\n'), inline: true };
  });
  const embeds = [];
  for (let i = 0; i < fields.length; i += MAX_FIELDS) {
    const first = i === 0;
    embeds.push({
      title: first ? '📋 Produits suivis' : '📋 Produits suivis (suite)',
      ...(first ? { description: `**${rows.length}** produit${rows.length > 1 ? 's' : ''} · relevé chaque jour à 8h` } : {}),
      color: 0x5865f2,
      fields: fields.slice(i, i + MAX_FIELDS),
    });
  }
  embeds[embeds.length - 1].footer = { text: 'Prix de reprise Rebuy · /arreter dans un channel pour stopper le suivi' };
  return embeds;
}
