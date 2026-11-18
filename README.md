# rebuy-auto

Bot Discord + n8n qui suit les **prix de reprise Rebuy** et poste un embed récapitulatif dans un channel dédié dès qu'un prix change.

- `/suivre <lien rebuy>` crée un channel pour le produit et démarre le suivi
- `/liste` liste les produits suivis, `/arreter` arrête le suivi (dans le channel du produit)
- États suivis : **A0** neuf emballé · **A1** comme neuf · **A2** très bon état
- Un embed unique par changement : 📈 hausse · 📉 baisse · ➖ inchangé

## Architecture

| Pièce | Rôle |
|---|---|
| `src/rebuy.js` | Lit les prix dans le JSON embarqué de la page Rebuy (`#ry-inject`) |
| `src/embed.js` | Compare deux relevés et construit l'embed Discord |
| `src/index.js` | Mini-bot discord.js : reçoit les slash commands et appelle les webhooks n8n |
| n8n | Workflows : ajout/suppression de produit, relevé quotidien, envoi Discord |
| `start.js` | Point d'entrée : lance n8n puis le bot (si `DISCORD_TOKEN` est défini) |

## Installation sur Pterodactyl (egg NodeJS)

1. Variables du serveur : **Git Repo Address** = ce dépôt, **Install Branch** = `main`, **Auto Update** = `1`, **Main file** = `start.js` (réinstaller le serveur pour le clone initial).
2. Créer un fichier `.env` à la racine du serveur (voir `.env.example`). Il n'est jamais écrasé par `git pull`.
3. Démarrer : le premier lancement installe n8n (plusieurs minutes).
4. Ouvrir `http://IP:PORT`, créer le compte propriétaire n8n tout de suite.
5. Les slash commands sont enregistrées automatiquement à chaque démarrage (`deploy-commands.js`) si `DISCORD_CLIENT_ID` et `DISCORD_GUILD_ID` sont définis.

`data/` (base n8n + clé de chiffrement) et `.env` sont ignorés par git : ne jamais les perdre.

## Workflows n8n

Quatre workflows, générés depuis `n8n/workflows.mjs` (code SDK n8n, créés via le MCP) :

| Workflow | Déclencheur | Rôle |
|---|---|---|
| Rebuy – Relevé quotidien | cron 8h (Europe/Paris) | relève les produits actifs, poste l'embed si un prix change, alerte après 3 échecs |
| Rebuy – Ajouter un produit | webhook `POST /webhook/rebuy-add` | lit la page, crée le channel, poste le récap initial, enregistre |
| Rebuy – Lister les produits | webhook `POST /webhook/rebuy-list` | répond avec la liste |
| Rebuy – Arrêter le suivi | webhook `POST /webhook/rebuy-remove` | désactive le suivi du channel |

Données : Data Tables n8n `rebuy_products` et `rebuy_price_history`.

Mise en service :
1. Credential **Discord Bot API** dans n8n (token du bot, Application ID, Public Key).
2. Credential **Header Auth** nommé `Rebuy Webhook Secret` : *Name* `X-Secret`, *Value* = la même valeur que `N8N_WEBHOOK_SECRET` du `.env`. À sélectionner dans le nœud webhook des trois workflows d'API.
3. Publier les quatre workflows.

## Développement

```bash
npm install
npm test          # diff de prix + embed
npm run spike     # affiche les prix d'un lien Rebuy (en argument)
```
