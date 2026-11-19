// Génère le code SDK n8n des workflows. Usage : node n8n/workflows.mjs <nom>
import { ANALYSE_QUOTIDIEN, VALIDER_AJOUT, ANALYSE_AJOUT, CHOISIR_CATEGORIE, RESOUDRE_CATEGORIE, MESSAGE_LISTE, RESUME_ACTUALISATION, UA } from './lib.mjs';

// Identifiants propres à ton instance : jamais en dur, lus dans l'environnement.
// Usage : node --env-file=.env n8n/workflows.mjs <nom>  (voir .env.example)
const requis = (nom) => {
  const v = process.env[nom];
  if (!v) { console.error(`Variable d'environnement manquante : ${nom} (voir .env.example)`); process.exit(1); }
  return v;
};
export const TABLE_PRODUITS = requis('N8N_TABLE_PRODUITS');
export const TABLE_HISTORIQUE = requis('N8N_TABLE_HISTORIQUE');
const DISCORD_CRED = requis('N8N_DISCORD_CRED_ID');
const GUILD = requis('DISCORD_GUILD_ID');

const IMPORT = "import { workflow, node, trigger, ifElse, splitInBatches, nextBatch, newCredential, expr, nodeJson } from '@n8n/workflow-sdk';";
const s = (v) => JSON.stringify(v);
const tbl = (id) => `{ __rl: true, mode: 'id', value: '${id}' }`;
const discordCred = `{ discordBotApi: { id: '${DISCORD_CRED}', name: 'Discord Bot account' } }`;
const cols = (obj, ids) => `{ mappingMode: 'defineBelow', value: { ${obj} }, schema: [${ids.map((i) => `{ id: '${i[0]}', displayName: '${i[0]}', required: false, defaultMatch: false, display: true, type: '${i[1]}', canBeUsedToMatch: true }`).join(', ')}] }`;

const PRODUCT_COLS = [['url', 'string'], ['name', 'string'], ['product_id', 'string'], ['channel_id', 'string'], ['guild_id', 'string'], ['added_by', 'string'], ['last_a0', 'number'], ['last_a1', 'number'], ['last_a2', 'number'], ['fail_count', 'number'], ['active', 'boolean']];
const PRICE_COLS = [['last_a0', 'number'], ['last_a1', 'number'], ['last_a2', 'number'], ['fail_count', 'number']];
const HIST_COLS = [['product_id', 'string'], ['a0', 'number'], ['a1', 'number'], ['a2', 'number']];

const httpPage = (name, urlExpr, pos) => `node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: ${s(name)}, position: ${pos}, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    parameters: {
      method: 'GET', url: ${urlExpr}, sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: ${s(UA)} }, { name: 'Accept-Language', value: 'fr-FR,fr;q=0.9' }] },
      options: { timeout: 30000, response: { response: { responseFormat: 'text', outputPropertyName: 'data' } } }
    }
  },
  output: [{ data: '<html></html>' }]
})`;

// Appel direct à l'API Discord avec le credential du bot (le nœud Discord n'expose pas la catégorie parente).
const discordApi = (name, method, urlExpr, bodyExpr, pos, extra = '') => `node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: ${s(name)}, position: ${pos}, ${extra} credentials: ${discordCred}, parameters: { method: '${method}', url: ${urlExpr}, authentication: 'predefinedCredentialType', nodeCredentialType: 'discordBotApi'${bodyExpr ? `, sendBody: true, specifyBody: 'json', jsonBody: ${bodyExpr}` : ''}, options: { timeout: 20000 } } }, output: [{ id: '123' }] })`;

const respond = (name, bodyExpr, pos) => `node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: ${s(name)}, position: ${pos}, parameters: { respondWith: 'json', responseBody: ${bodyExpr} } },
  output: [{ message: 'ok' }]
})`;

// Optionnel : si absent, n8n propose de créer le credential « Rebuy Webhook Secret » (newCredential).
const SECRET_CRED = process.env.N8N_SECRET_CRED_ID ? { id: process.env.N8N_SECRET_CRED_ID, name: 'Rebuy Webhook Secret' } : null;
const webhook = (name, path, existingCred = SECRET_CRED) => `trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {
    name: ${s(name)}, position: [240, 300],
    parameters: { httpMethod: 'POST', path: '${path}', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: ${existingCred ? JSON.stringify(existingCred) : "newCredential('Rebuy Webhook Secret')"} }
  },
  output: [{ headers: {}, body: { guildId: '1', channelId: '2', userId: '3', url: 'https://www.rebuy.fr/vendre/x' } }]
})`;

const boolIf = (name, left, pos) => `ifElse({
  version: 2.3,
  config: { name: ${s(name)}, position: ${pos}, parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ leftValue: expr(${s(left)}), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
})`;

// Nœuds partagés par le relevé quotidien et /actualiser (pause, lecture, analyse, notification, mémorisation).
const RELEVE_NOEUDS = `const pause = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Pause 3 s', position: [960, 300], parameters: { resume: 'timeInterval', amount: 3, unit: 'seconds' } }, output: [{}] });
const page = ${httpPage('Lire la page Rebuy', "expr(\"{{ $('Boucle produits').item.json.url }}\")", '[1200, 300]')};
const analyse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Analyser la page', position: [1440, 300], parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: ${s(ANALYSE_QUOTIDIEN)} } }, output: [{ ok: true, changed: true, row_id: 1, product_id: '1', name: 'Produit', channel_id: '1', fail_count: 0, fail_next: 1, error: 'x', a0: 1, a1: 1, a2: 1, embed: { title: 't', description: 'd', color: 1 } }] });
const pageLue = ${boolIf('Page lue ?', '{{ $json.ok }}', '[1680, 300]')};
const aChange = ${boolIf('Prix modifié ?', '{{ $json.changed }}', '[1920, 200]')};
const notifier = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Poster le récap', position: [2160, 100], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: '${GUILD}' }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr('{{ $json.channel_id }}') }, content: '', embeds: { values: [{ inputMethod: 'json', json: expr('{{ JSON.stringify($json.embed) }}') }] } } }, output: [{ id: '1' }] });
const memoriser = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Mémoriser les prix', position: [2400, 100], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Analyser la page').item.json.row_id }}") }] }, columns: ${cols("last_a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), last_a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), last_a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\"), fail_count: 0", PRICE_COLS)} } }, output: [{ id: 1 }] });
const historique = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ajouter à l’historique', position: [2640, 100], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_HISTORIQUE)}, columns: ${cols("product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\")", HIST_COLS)} } }, output: [{ id: 1 }] });
const resetEchecs = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Remettre les échecs à zéro', position: [2160, 300], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.row_id }}') }] }, columns: ${cols('fail_count: 0', [['fail_count', 'number']])} } }, output: [{ id: 1 }] });
const compterEchec = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Compter un échec', position: [1920, 500], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Analyser la page').item.json.row_id }}") }] }, columns: ${cols("fail_count: expr(\"{{ $('Analyser la page').item.json.fail_next }}\")", [['fail_count', 'number']])} } }, output: [{ id: 1 }] });
const troisEchecs = ifElse({ version: 2.3, config: { name: '3 échecs d’affilée ?', position: [2160, 500], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $('Analyser la page').item.json.fail_next }}"), rightValue: 3, operator: { type: 'number', operation: 'equals' } }], combinator: 'and' } } } });
const alerte = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Alerter dans le channel', position: [2400, 450], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: '${GUILD}' }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr("{{ $('Analyser la page').item.json.channel_id }}") }, content: expr("⚠️ Impossible de lire le prix Rebuy depuis 3 relevés ({{ $('Analyser la page').item.json.error }}). Le suivi continue, vérifie le lien si ça persiste.") } }, output: [{ id: '1' }] });`;

export function quotidien() {
  return `${IMPORT}
const declencheur = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Chaque jour à 8h', position: [240, 300], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * *' }] } } }, output: [{}] });
const produits = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Produits actifs', position: [480, 300], parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: true } }, output: [{ id: 1, url: 'https://www.rebuy.fr/vendre/x', name: 'Produit', channel_id: '1', last_a0: 100, last_a1: 90, last_a2: 80, fail_count: 0 }] });
const boucle = splitInBatches({ version: 3, config: { name: 'Boucle produits', position: [720, 300], parameters: { batchSize: 1 } } });
${RELEVE_NOEUDS}

export default workflow('rebuy-quotidien', 'Rebuy – Relevé quotidien')
  .add(declencheur)
  .to(produits)
  .to(boucle
    .onEachBatch(pause.to(page.to(analyse.to(pageLue
      .onTrue(aChange
        .onTrue(notifier.to(memoriser.to(historique.to(nextBatch(boucle)))))
        .onFalse(resetEchecs.to(nextBatch(boucle))))
      .onFalse(compterEchec.to(troisEchecs
        .onTrue(alerte.to(nextBatch(boucle)))
        .onFalse(nextBatch(boucle)))))))));
`;
}


const msgJson = (expression) => `expr(${s(`{{ JSON.stringify({ message: ${expression} }) }}`)})`;

export function ajout() {
  return `${IMPORT}
const recu = ${webhook('Reçoit /suivre', 'rebuy-add')};
const valider = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Valider la demande', position: [480, 300], parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: ${s(VALIDER_AJOUT)} } }, output: [{ valid: true, url: 'https://www.rebuy.fr/vendre/x', guildId: '1', channelId: '2', userId: '3' }] });
const lienValide = ${boolIf('Lien valide ?', '{{ $json.valid }}', '[720, 300]')};
const repLienInvalide = ${respond('Répondre : lien invalide', msgJson('"❌ Lien Rebuy invalide (attendu : https://www.rebuy.fr/vendre/…)."'), '[960, 500]')};
const dejaSuivi = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Chercher le produit', position: [960, 200], alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'url', condition: 'eq', keyValue: expr("{{ $('Valider la demande').item.json.url }}") }] }, returnAll: false, limit: 1 } }, output: [{ id: 1, channel_id: '1' }] });
const existe = ifElse({ version: 2.3, config: { name: 'Déjà suivi ?', position: [1200, 200], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $json.id }}'), operator: { type: 'number', operation: 'exists', singleValue: true } }], combinator: 'and' } } } });
const repDejaSuivi = ${respond('Répondre : déjà suivi', msgJson('"ℹ️ Ce produit est déjà suivi dans <#" + $json.channel_id + ">."'), '[1440, 400]')};
const page = ${httpPage('Lire la page Rebuy', "expr(\"{{ $('Valider la demande').item.json.url }}\")", '[1440, 100]')};
const analyse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Analyser la page', position: [1680, 100], parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: ${s(ANALYSE_AJOUT)} } }, output: [{ ok: true, name: 'Produit', product_id: '1', image: 'https://img', a0: 1, a1: 1, a2: 1, embed: { title: 't', description: 'd', color: 1 }, channelName: 'produit', url: 'https://www.rebuy.fr/vendre/x', guildId: '1', userId: '3', error: 'x' }] });
const pageLue = ${boolIf('Page lue ?', '{{ $json.ok }}', '[1920, 100]')};
const repPageIllisible = ${respond('Répondre : page illisible', msgJson('"❌ Impossible de lire ce lien Rebuy : " + $json.error'), '[2160, 300]')};
const salons = ${discordApi('Lister les salons', 'GET', "expr(\"https://discord.com/api/v10/guilds/{{ $('Analyser la page').item.json.guildId }}/channels\")", null, '[2160, 0]', 'alwaysOutputData: true, onError: \'continueRegularOutput\',')};
const choisirCat = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Choisir la catégorie', position: [2400, 0], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${s(CHOISIR_CATEGORIE)} } }, output: [{ category: 'Tablettes', parentId: '1', needsCreate: false }] });
const catAbsente = ${boolIf('Catégorie à créer ?', '{{ $json.needsCreate }}', '[2640, 0]')};
const creerCat = ${discordApi('Créer la catégorie', 'POST', "expr(\"https://discord.com/api/v10/guilds/{{ $('Analyser la page').item.json.guildId }}/channels\")", "expr(\"{{ JSON.stringify({ name: $json.category, type: 4 }) }}\")", '[2880, -100]', 'onError: \'continueRegularOutput\',')};
const resoudreCat = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Résoudre la catégorie', position: [3120, 0], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${s(RESOUDRE_CATEGORIE)} } }, output: [{ parentId: '1' }] });
const creerChannel = ${discordApi('Créer le channel', 'POST', "expr(\"https://discord.com/api/v10/guilds/{{ $('Analyser la page').item.json.guildId }}/channels\")", "expr(\"{{ JSON.stringify({ name: $('Analyser la page').item.json.channelName, type: 0, topic: 'Prix de reprise Rebuy – ' + $('Analyser la page').item.json.name, parent_id: $json.parentId || undefined }) }}\")", '[3360, 0]')};
const poster = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Poster le récap initial', position: [3600, 0], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: expr("{{ $('Analyser la page').item.json.guildId }}") }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr('{{ $json.id }}') }, content: '', embeds: { values: [{ inputMethod: 'json', json: expr("{{ JSON.stringify($('Analyser la page').item.json.embed) }}") }] } } }, output: [{ id: '1' }] });
const enregistrer = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Enregistrer le produit', position: [3840, 0], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_PRODUITS)}, columns: ${cols("url: expr(\"{{ $('Analyser la page').item.json.url }}\"), name: expr(\"{{ $('Analyser la page').item.json.name }}\"), product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), channel_id: expr(\"{{ $('Créer le channel').item.json.id }}\"), guild_id: expr(\"{{ $('Analyser la page').item.json.guildId }}\"), added_by: expr(\"{{ $('Analyser la page').item.json.userId }}\"), last_a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), last_a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), last_a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\"), fail_count: 0, active: true", PRODUCT_COLS)} } }, output: [{ id: 1 }] });
const historique = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Premier point d’historique', position: [4080, 0], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_HISTORIQUE)}, columns: ${cols("product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\")", HIST_COLS)} } }, output: [{ id: 1 }] });
const repOk = ${respond('Répondre : suivi créé', msgJson('"✅ Suivi créé : <#" + $("Créer le channel").item.json.id + ">"'), '[4320, 0]')};

export default workflow('rebuy-ajout', 'Rebuy – Ajouter un produit')
  .add(recu)
  .to(valider)
  .to(lienValide
    .onTrue(dejaSuivi.to(existe
      .onTrue(repDejaSuivi)
      .onFalse(page.to(analyse.to(pageLue
        .onTrue(salons.to(choisirCat.to(catAbsente
          .onTrue(creerCat.to(resoudreCat.to(creerChannel.to(poster.to(enregistrer.to(historique.to(repOk)))))))
          .onFalse(resoudreCat))))
        .onFalse(repPageIllisible))))))
    .onFalse(repLienInvalide));
`;
}

export function liste() {
  return `${IMPORT}
const recu = ${webhook('Reçoit /liste', 'rebuy-list')};
const produits = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Produits actifs', position: [480, 300], alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: true } }, output: [{ id: 1, url: 'https://www.rebuy.fr/vendre/x', name: 'Produit', channel_id: '1', last_a0: 1, last_a1: 1, last_a2: 1 }] });
const message = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Construire la liste', position: [720, 300], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${s(MESSAGE_LISTE)} } }, output: [{ message: 'liste' }] });
const repondre = ${respond('Répondre : liste', "expr('{{ JSON.stringify({ message: $json.message, embeds: $json.embeds }) }}')", '[960, 300]')};

export default workflow('rebuy-liste', 'Rebuy – Lister les produits')
  .add(recu)
  .to(produits)
  .to(message)
  .to(repondre);
`;
}

export function retirer() {
  return `${IMPORT}
const recu = ${webhook('Reçoit /arreter', 'rebuy-remove')};
const chercher = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Chercher le produit du channel', position: [480, 300], alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'channel_id', condition: 'eq', keyValue: expr("{{ $('Reçoit /arreter').item.json.body.channelId }}") }, { keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: false, limit: 1 } }, output: [{ id: 1, name: 'Produit' }] });
const trouve = ifElse({ version: 2.3, config: { name: 'Produit trouvé ?', position: [720, 300], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $json.id }}'), operator: { type: 'number', operation: 'exists', singleValue: true } }], combinator: 'and' } } } });
const desactiver = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Désactiver le suivi', position: [960, 200], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.id }}') }] }, columns: ${cols('active: false', [['active', 'boolean']])} } }, output: [{ id: 1 }] });
const annoncer = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Annoncer l’arrêt', position: [1200, 200], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: '${GUILD}' }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr("{{ $('Reçoit /arreter').item.json.body.channelId }}") }, content: '🛑 Suivi arrêté pour ce produit. Utilise /suivre pour le reprendre.' } }, output: [{ id: '1' }] });
const repOk = ${respond('Répondre : arrêté', msgJson('"🛑 Suivi arrêté."'), '[1440, 200]')};
const repAucun = ${respond('Répondre : aucun suivi', msgJson('"ℹ️ Aucun suivi actif dans ce channel."'), '[960, 400]')};

export default workflow('rebuy-arret', 'Rebuy – Arrêter le suivi')
  .add(recu)
  .to(chercher)
  .to(trouve
    .onTrue(desactiver.to(annoncer.to(repOk)))
    .onFalse(repAucun));
`;
}

export function actualiser() {
  return `${IMPORT}
const recu = ${webhook('Reçoit /actualiser', 'rebuy-refresh', SECRET_CRED)};
const produits = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Produits actifs', position: [480, 300], alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: true } }, output: [{ id: 1, url: 'https://www.rebuy.fr/vendre/x', name: 'Produit', channel_id: '1', last_a0: 100, last_a1: 90, last_a2: 80, fail_count: 0 }] });
const desProduits = node({ type: 'n8n-nodes-base.if', version: 2.3, config: { name: 'Des produits ?', position: [720, 300], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr('{{ $json.id }}'), operator: { type: 'number', operation: 'exists', singleValue: true } }], combinator: 'and' } } }, output: [{ id: 1 }] });
const repAucun = ${respond('Répondre : aucun produit', msgJson('"ℹ️ Aucun produit suivi pour le moment."'), '[960, 500]')};
const boucle = splitInBatches({ version: 3, config: { name: 'Boucle produits', position: [960, 200], parameters: { batchSize: 1 } } });
${RELEVE_NOEUDS}
const resultat = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Résultat du produit', position: [2880, 300], parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
  { id: 'r-name', name: 'name', value: expr("{{ $('Analyser la page').item.json.name }}"), type: 'string' },
  { id: 'r-channel', name: 'channel_id', value: expr("{{ $('Analyser la page').item.json.channel_id }}"), type: 'string' },
  { id: 'r-status', name: 'status', value: expr("{{ $('Analyser la page').item.json.ok ? ($('Analyser la page').item.json.changed ? 'changed' : 'same') : 'failed' }}"), type: 'string' },
  { id: 'r-error', name: 'error', value: expr("{{ $('Analyser la page').item.json.error || '' }}"), type: 'string' }
] } } }, output: [{ name: 'Produit', channel_id: '1', status: 'same', error: '' }] });
const resume = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Construire le résumé', position: [1200, 100], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${s(RESUME_ACTUALISATION)} } }, output: [{ message: 'ok', embeds: [{ title: 'Actualisation', description: 'd', color: 1, fields: [] }] }] });
const repondre = ${respond('Répondre : résumé', "expr('{{ JSON.stringify({ message: $json.message, embeds: $json.embeds }) }}')", '[1440, 100]')};

export default workflow('rebuy-actualiser', 'Rebuy – Actualiser les suivis')
  .add(recu)
  .to(produits)
  .to(desProduits
    .onTrue(boucle
      .onEachBatch(pause.to(page.to(analyse.to(pageLue
        .onTrue(aChange
          .onTrue(notifier.to(memoriser.to(historique.to(resultat.to(nextBatch(boucle))))))
          .onFalse(resetEchecs.to(resultat)))
        .onFalse(compterEchec.to(troisEchecs
          .onTrue(alerte.to(resultat))
          .onFalse(resultat)))))))
      .onDone(resume.to(repondre)))
    .onFalse(repAucun));
`;
}

const GENERATORS = { quotidien, ajout, liste, retirer, actualiser };
if (import.meta.url === `file://${process.argv[1]}`) {
  const g = GENERATORS[process.argv[2]];
  if (!g) { console.error('workflows disponibles :', Object.keys(GENERATORS).join(', ')); process.exit(1); }
  process.stdout.write(g());
}
