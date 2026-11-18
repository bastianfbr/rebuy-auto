// Extrait les prix de reprise Rebuy depuis le JSON embarqué (#ry-inject).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36';

// États suivis (A3/A4 ignorés). Libellés Rebuy.
export const GRADES = {
  A0: 'Neuf (emballage d\'origine)',
  A1: 'Comme neuf',
  A2: 'Très bon état',
};

export async function fetchRebuy(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRebuy(await res.text());
}

export function parseRebuy(html) {
  const m = html.match(/<script id="ry-inject"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('ry-inject introuvable');
  const raw = m[1];
  const grab = (re) => { const x = raw.match(re); return x ? x[1] : null; };
  const prices = {};
  for (const g of Object.keys(GRADES).map((k) => k.toLowerCase())) {
    const v = grab(new RegExp(`"purchase_${g}_price":(\\d+)`));
    if (v !== null) prices[g.toUpperCase()] = Number(v) / 100; // centimes -> €
  }
  if (!Object.keys(prices).length) throw new Error('aucun prix de reprise trouvé');
  return { id: grab(/"id":(27\d+|\d{6,9}),"category_id"/), prices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2] || 'https://www.rebuy.fr/vendre/tablette/samsung-galaxy-tab-s12-plus-14-6-256-go-wi-fi-gris_27203173?activeGradingIndex=9';
  console.log(await fetchRebuy(url));
}
