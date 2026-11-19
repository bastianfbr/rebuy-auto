# CLAUDE.md

Bot Discord + n8n qui suit les prix de reprise Rebuy (A0 neuf emballé, A1 comme neuf, A2 très bon état) et poste un embed récap quand un prix change. Langue du projet : **français** (code, commits, docs, messages Discord).

## Commandes

```bash
npm install
npm test                          # node test.mjs : diff, embed, parseRebuy (fixture synthétique)
npm run spike -- "<lien rebuy>"   # lit un vrai lien : nom, image, prix A0-A2
node --env-file=.env n8n/workflows.mjs <nom>      # quotidien | ajout | liste | retirer | actualiser : affiche le code SDK n8n
node --check start.js             # vérification de syntaxe rapide
```

Pas de linter ni de build. Toujours lancer `npm test` après avoir touché `src/rebuy.js` ou `src/embed.js`.

## Architecture (voir `docs/architecture.md`, schémas Mermaid)

- `start.js` : point d'entrée Pterodactyl (`MAIN_FILE`). Lance n8n, reconstruit `sqlite3` si besoin, enregistre les slash commands, lance le bot si `DISCORD_TOKEN` existe.
- `src/index.js` : bot discord.js, **uniquement** réception des slash commands → webhooks n8n (`X-Secret`). Pas de logique métier.
- `src/rebuy.js` : lit les prix dans le JSON embarqué `<script id="ry-inject">` (`purchase_a0_price`… en centimes), nom/image via les balises `og:`.
- `src/embed.js` : `diffPrices`, `hasChange`, `buildEmbed` (couleur selon le mouvement, 📈 📉 ➖), `buildListEmbeds` (/liste), `buildRefreshEmbed` (/actualiser). Respecter les limites Discord : 25 champs, 6000 caractères par message.
- `n8n/lib.mjs` : fabrique le code JavaScript des nœuds Code **en inlinant `src/rebuy.js` + `src/embed.js`** (le sandbox n8n n'a pas d'import). Source unique de vérité : ne pas dupliquer cette logique à la main dans n8n.
- `n8n/workflows.mjs` : génère le code SDK des 5 workflows (quotidien, ajout, liste, retirer, actualiser). Le relevé (`RELEVE_NOEUDS`) est partagé entre `quotidien` et `actualiser`.

## Règles et pièges (appris en production)

- **Hébergement** : egg NodeJS **Node 22**, **npm 12**. n8n doit rester en `~2.35.x` (≥ 2.36 exige Node 24). npm 12 bloque les install scripts : `allowScripts` dans `package.json` (sqlite3, isolated-vm, msgpackr-extract) ; ne **jamais** passer `--allow-scripts` en CLI (`EALLOWSCRIPTS`).
- La **console Pterodactyl n'est pas un shell** : elle envoie le texte au processus en cours. Tout doit se faire au démarrage (`start.js`).
- Le prix de reprise vient de la page HTML (aucune API Rebuy) : si la structure change, `parseRebuy` lève une erreur ; le workflow alerte après 3 échecs.
- **Nœud Discord de n8n** : `thumbnail`/`image` doivent être des **URL (string)**, pas `{ url }` → `n8nEmbed()` dans `n8n/lib.mjs`.
- **Ne pas mettre `executeOnce`** sur un nœud Code en mode `runOnceForAllItems` (il ne recevrait que le 1er item : bug `/liste`).
- Un workflow à webhook `responseNode` doit **toujours** répondre, y compris quand la liste est vide (la boucle ne s'exécute pas sur 0 item) : prévoir une branche explicite (voir « Des produits ? » dans `actualiser`).
- Le sandbox du nœud Code n'a pas de réseau : les requêtes passent par le nœud HTTP Request.
- Data Tables n8n : colonnes `number`/`string`/`boolean`/`date` ; pas d'outil MCP pour supprimer des lignes (utiliser un workflow temporaire avec `deleteRows`, puis l'archiver).

## Travailler sur n8n (MCP)

- Instance : URL dans `N8N_PUBLIC_URL` (`.env` local, jamais dans le repo), MCP sur `/mcp-server/http` (jeton Bearer **jamais** dans le repo, ni en clair dans les commits ou la mémoire). Le CLI `claude` n'est pas toujours dans le PATH : appeler le MCP en JSON-RPC avec `curl` (`Accept: application/json, text/event-stream`, réponse en SSE `data: …`).
- Flux : modifier `n8n/workflows.mjs` ou `n8n/lib.mjs` → `validate_workflow` → `create_workflow_from_code` (nouveau) ou `update_workflow` (existant) → `publish_workflow`. Tester avec `test_workflow` (`pinData` obligatoire pour les nœuds externes) ; l'exécution est lisible via `get_workflow_execution` (`includeData: true`).
- IDs propres à l'instance (tables `rebuy_products` / `rebuy_price_history`, credential Discord Bot, guild) : jamais en dur, lus dans `.env` (`N8N_TABLE_PRODUITS`, `N8N_TABLE_HISTORIQUE`, `N8N_DISCORD_CRED_ID`, `DISCORD_GUILD_ID`, option `N8N_SECRET_CRED_ID`). Générer avec `node --env-file=.env n8n/workflows.mjs <nom>`.
- Pour tester un relevé sans polluer : insérer une ligne `added_by = "test"` dans `rebuy_products`, lancer `test_workflow`, puis la supprimer.

## Secrets

Jamais de token ni de secret dans le repo : `.env` (ignoré) et credentials n8n. `.env.example` ne contient que des placeholders. Ne pas créer ni saisir des credentials à la place de l'utilisateur.

## Commits

Format **`<gitmoji> <type>(scope): message`** en français, au présent ; **un commit par changement logique** (pas tout d'un coup). Exemples : `✨ feat(bot): ajoute les slash commands`, `🐛 fix(n8n): /liste n'affichait que le premier produit`, `📝 docs: …`, `🔧 chore(deploy): …`, `📦 build(deps): …`. Terminer par le trailer `Co-Authored-By` demandé par l'environnement.

## Docs

`README.md` (vue d'ensemble), `docs/architecture.md` (diagrammes Mermaid), `docs/exploitation.md` (variables, mises à jour, dépannage). Mettre à jour ces fichiers quand le comportement, les variables ou les workflows changent.
