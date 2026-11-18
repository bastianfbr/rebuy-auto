import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('suivre').setDescription('Suivre le prix de reprise d\'un produit Rebuy')
    .addStringOption((o) => o.setName('lien').setDescription('Lien rebuy.fr/vendre/...').setRequired(true)),
  new SlashCommandBuilder().setName('liste').setDescription('Lister les produits suivis'),
  new SlashCommandBuilder().setName('actualiser').setDescription('Relever tout de suite les prix de tous les produits suivis'),
  new SlashCommandBuilder().setName('arreter').setDescription('Arrêter le suivi (à utiliser dans le channel du produit)'),
].map((c) => c.toJSON());
