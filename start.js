// Point d'entrée Pterodactyl (MAIN_FILE=start.js) : lance n8n, puis le bot si configuré.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const root = process.cwd();
const dataDir = `${root}/data`;
mkdirSync(dataDir, { recursive: true });

// Clé de chiffrement n8n générée une fois et conservée (ne pas la perdre !)
const keyFile = `${dataDir}/n8n-encryption-key`;
if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });

const port = process.env.SERVER_PORT || process.env.N8N_PORT || '5678';
const env = {
  ...process.env,
  N8N_PORT: port,
  N8N_USER_FOLDER: `${dataDir}/n8n`,
  N8N_ENCRYPTION_KEY: process.env.N8N_ENCRYPTION_KEY || readFileSync(keyFile, 'utf8').trim(),
  N8N_SECURE_COOKIE: process.env.N8N_SECURE_COOKIE ?? 'false', // http sans certificat
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
  N8N_RUNNERS_ENABLED: 'true',
  GENERIC_TIMEZONE: process.env.GENERIC_TIMEZONE || 'Europe/Paris',
  N8N_WEBHOOK_BASE: process.env.N8N_WEBHOOK_BASE || `http://localhost:${port}/webhook`,
};
if (process.env.N8N_PUBLIC_URL) {
  env.WEBHOOK_URL = process.env.N8N_PUBLIC_URL;
  env.N8N_EDITOR_BASE_URL = process.env.N8N_PUBLIC_URL;
}

const children = [];
function run(name, cmd, args) {
  const p = spawn(cmd, args, { env, stdio: 'inherit' });
  children.push(p);
  p.on('exit', (code) => {
    console.log(`[start] ${name} arrêté (code ${code})`);
    shutdown(code ?? 1);
  });
}
function shutdown(code) {
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 3000);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

console.log(`[start] n8n sur le port ${port}`);
run('n8n', process.execPath, [`${root}/node_modules/n8n/bin/n8n`, 'start']);

if (process.env.DISCORD_TOKEN) {
  console.log('[start] lancement du bot Discord');
  run('bot', process.execPath, [`${root}/src/index.js`]);
} else {
  console.log('[start] DISCORD_TOKEN absent : bot non lancé (n8n seul)');
}
