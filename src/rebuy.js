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

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function parseRebuy(html) {
  const m = html.match(/<script id="ry-inject"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('ry-inject introuvable');
  const raw = m[1];
  const grab = (re, s = raw) => { const x = s.match(re); return x ? x[1] : null; };
  const prices = {};
  for (const g of Object.keys(GRADES).map((k) => k.toLowerCase())) {
    const v = grab(new RegExp(`"purchase_${g}_price":(\\d+)`));
    if (v !== null) prices[g.toUpperCase()] = Number(v) / 100; // centimes -> €
  }
  if (!Object.keys(prices).length) throw new Error('aucun prix de reprise trouvé');
  const title = grab(/property="og:title" content="([^"]*)"/, html);
  const name = title
    ? decodeEntities(title).replace(/^Reprise de votre\s+/i, '').replace(/\s+[–-]\s+rebuy$/i, '').trim()
    : null;
  const image = grab(/property="og:image" content="([^"]*)"/, html);
  return { id: grab(/"id":(\d{6,10}),"category_id"/), name, image: image ? decodeEntities(image) : null, prices };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2] || 'https://www.rebuy.fr/vendre/tablette/samsung-galaxy-tab-s12-plus-14-6-256-go-wi-fi-gris_27203173?activeGradingIndex=9';
  console.log(await fetchRebuy(url));
}
