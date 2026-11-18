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
