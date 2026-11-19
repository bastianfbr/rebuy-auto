// Déduit la catégorie Discord d'un lien Rebuy : /vendre/<categorie>/<produit>.
// Les slugs connus ont un nom soigné ; les autres sont mis en forme (« jeux-video » → « Jeux Video »).
const NOMS = {
  tablette: 'Tablettes',
  mobile: 'Smartphones',
  smartphone: 'Smartphones',
  console: 'Consoles',
  consoles: 'Consoles',
  'consoles-et-accessoires': 'Consoles',
  'photos-et-cameras': 'Photo & Caméras',
  'audio-et-hifi': 'Audio & Hi-Fi',
  'objets-connectes': 'Objets connectés',
  apple: 'Apple',
};

export function categoryFor(url) {
  const m = String(url).match(/\/vendre\/([a-z0-9-]+)\/[^/?#]+/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (NOMS[slug]) return NOMS[slug];
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
