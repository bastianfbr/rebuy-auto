import 'dotenv/config';
import { Client, GatewayIntentBits, MessageFlags } from 'discord.js';

const { DISCORD_TOKEN, N8N_WEBHOOK_SECRET } = process.env;
const N8N_WEBHOOK_BASE = process.env.N8N_WEBHOOK_BASE || `http://localhost:${process.env.SERVER_PORT || 5678}/webhook`;
const REBUY_RE = /^https:\/\/www\.rebuy\.(fr|de|com|nl|it|es|at|be)\/vendre\/[^\s]+$/i;

// /actualiser relève tous les produits : une seule exécution à la fois, avec un délai entre deux lancements.
const REFRESH_COOLDOWN_MS = 60_000;
let refreshing = false;
let lastRefresh = 0;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function callN8n(path, body) {
  const res = await fetch(`${N8N_WEBHOOK_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': N8N_WEBHOOK_SECRET },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(14 * 60_000), // la réponse différée Discord expire au bout de 15 min
  });
  if (!res.ok) throw new Error(`n8n ${res.status}`);
  return res.json();
}

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const base = { guildId: i.guildId, channelId: i.channelId, userId: i.user.id };
    if (i.commandName === 'suivre') {
      const lien = i.options.getString('lien').trim();
      if (!REBUY_RE.test(lien)) return void i.editReply('❌ Lien Rebuy invalide (attendu : https://www.rebuy.fr/vendre/...).');
      const r = await callN8n('rebuy-add', { ...base, url: lien });
      return void i.editReply(r.message ?? '✅ Suivi créé.');
    }
    if (i.commandName === 'liste') {
      const r = await callN8n('rebuy-list', base);
      // Embeds si n8n en fournit ; sinon repli sur le texte (rétrocompatible).
      if (Array.isArray(r.embeds) && r.embeds.length) return void i.editReply({ content: '', embeds: r.embeds });
      return void i.editReply(r.message ?? 'Aucun produit suivi.');
    }
    if (i.commandName === 'actualiser') {
      if (refreshing) return void i.editReply('⏳ Une actualisation est déjà en cours.');
      const wait = lastRefresh + REFRESH_COOLDOWN_MS - Date.now();
      if (wait > 0) return void i.editReply(`⏳ Réessaie dans ${Math.ceil(wait / 1000)} s.`);
      refreshing = true;
      try {
        const r = await callN8n('rebuy-refresh', base);
        if (Array.isArray(r.embeds) && r.embeds.length) return void i.editReply({ content: '', embeds: r.embeds });
        return void i.editReply(r.message ?? '✅ Actualisation terminée.');
      } finally {
        refreshing = false;
        lastRefresh = Date.now();
      }
    }
    if (i.commandName === 'arreter') {
      const r = await callN8n('rebuy-remove', base);
      return void i.editReply(r.message ?? '🛑 Suivi arrêté.');
    }
  } catch (e) {
    console.error(e);
    await i.editReply('⚠️ Erreur côté serveur, réessaie plus tard.');
  }
});

client.once('clientReady', () => console.log(`Connecté en tant que ${client.user.tag}`));
client.login(DISCORD_TOKEN);
