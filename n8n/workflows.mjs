// Génère le code SDK n8n des workflows. Usage : node n8n/workflows.mjs <nom>
import { ANALYSE_QUOTIDIEN, VALIDER_AJOUT, ANALYSE_AJOUT, MESSAGE_LISTE, UA } from './lib.mjs';

export const TABLE_PRODUITS = '<ID_TABLE_PRODUITS>';
export const TABLE_HISTORIQUE = '<ID_TABLE_HISTORIQUE>';
const DISCORD_CRED = '<ID_CREDENTIAL_DISCORD>';

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

const respond = (name, bodyExpr, pos) => `node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: ${s(name)}, position: ${pos}, parameters: { respondWith: 'json', responseBody: ${bodyExpr} } },
  output: [{ message: 'ok' }]
})`;

const webhook = (name, path) => `trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {
    name: ${s(name)}, position: [240, 300],
    parameters: { httpMethod: 'POST', path: '${path}', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: newCredential('Rebuy Webhook Secret') }
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

export function quotidien() {
  return `${IMPORT}
const declencheur = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Chaque jour à 8h', position: [240, 300], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * *' }] } } }, output: [{}] });
const produits = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Produits actifs', position: [480, 300], parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: true } }, output: [{ id: 1, url: 'https://www.rebuy.fr/vendre/x', name: 'Produit', channel_id: '1', last_a0: 100, last_a1: 90, last_a2: 80, fail_count: 0 }] });
const boucle = splitInBatches({ version: 3, config: { name: 'Boucle produits', position: [720, 300], parameters: { batchSize: 1 } } });
const pause = node({ type: 'n8n-nodes-base.wait', version: 1.1, config: { name: 'Pause 3 s', position: [960, 300], parameters: { resume: 'timeInterval', amount: 3, unit: 'seconds' } }, output: [{}] });
const page = ${httpPage('Lire la page Rebuy', "expr(\"{{ $('Boucle produits').item.json.url }}\")", '[1200, 300]')};
const analyse = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Analyser la page', position: [1440, 300], parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: ${s(ANALYSE_QUOTIDIEN)} } }, output: [{ ok: true, changed: true, row_id: 1, product_id: '1', channel_id: '1', fail_count: 0, fail_next: 1, error: 'x', a0: 1, a1: 1, a2: 1, embed: { title: 't', description: 'd', color: 1 } }] });
const pageLue = ${boolIf('Page lue ?', '{{ $json.ok }}', '[1680, 300]')};
const aChange = ${boolIf('Prix modifié ?', '{{ $json.changed }}', '[1920, 200]')};
const notifier = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Poster le récap', position: [2160, 100], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: '${'<ID_SERVEUR_DISCORD>'}' }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr('{{ $json.channel_id }}') }, content: '', embeds: { values: [{ inputMethod: 'json', json: expr('{{ JSON.stringify($json.embed) }}') }] } } }, output: [{ id: '1' }] });
const memoriser = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Mémoriser les prix', position: [2400, 100], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Analyser la page').item.json.row_id }}") }] }, columns: ${cols("last_a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), last_a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), last_a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\"), fail_count: 0", PRICE_COLS)} } }, output: [{ id: 1 }] });
const historique = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Ajouter à l’historique', position: [2640, 100], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_HISTORIQUE)}, columns: ${cols("product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\")", HIST_COLS)} } }, output: [{ id: 1 }] });
const resetEchecs = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Remettre les échecs à zéro', position: [2160, 300], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.row_id }}') }] }, columns: ${cols('fail_count: 0', [['fail_count', 'number']])} } }, output: [{ id: 1 }] });
const compterEchec = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Compter un échec', position: [1920, 500], parameters: { resource: 'row', operation: 'update', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Analyser la page').item.json.row_id }}") }] }, columns: ${cols("fail_count: expr(\"{{ $('Analyser la page').item.json.fail_next }}\")", [['fail_count', 'number']])} } }, output: [{ id: 1 }] });
const troisEchecs = ifElse({ version: 2.3, config: { name: '3 échecs d’affilée ?', position: [2160, 500], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ leftValue: expr("{{ $('Analyser la page').item.json.fail_next }}"), rightValue: 3, operator: { type: 'number', operation: 'equals' } }], combinator: 'and' } } } });
const alerte = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Alerter dans le channel', position: [2400, 450], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: '<ID_SERVEUR_DISCORD>' }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr("{{ $('Analyser la page').item.json.channel_id }}") }, content: expr("⚠️ Impossible de lire le prix Rebuy depuis 3 relevés ({{ $('Analyser la page').item.json.error }}). Le suivi continue, vérifie le lien si ça persiste.") } }, output: [{ id: '1' }] });

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


const GUILD = '<ID_SERVEUR_DISCORD>';
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
const creerChannel = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Créer le channel', position: [2160, 0], credentials: ${discordCred}, parameters: { resource: 'channel', operation: 'create', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: expr("{{ $('Analyser la page').item.json.guildId }}") }, name: expr("{{ $('Analyser la page').item.json.channelName }}"), type: '0', options: { topic: expr("Prix de reprise Rebuy – {{ $('Analyser la page').item.json.name }}") } } }, output: [{ id: '123' }] });
const poster = node({ type: 'n8n-nodes-base.discord', version: 2, config: { name: 'Poster le récap initial', position: [2400, 0], credentials: ${discordCred}, parameters: { resource: 'message', operation: 'send', authentication: 'botToken', guildId: { __rl: true, mode: 'id', value: expr("{{ $('Analyser la page').item.json.guildId }}") }, sendTo: 'channel', channelId: { __rl: true, mode: 'id', value: expr('{{ $json.id }}') }, content: '', embeds: { values: [{ inputMethod: 'json', json: expr("{{ JSON.stringify($('Analyser la page').item.json.embed) }}") }] } } }, output: [{ id: '1' }] });
const enregistrer = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Enregistrer le produit', position: [2640, 0], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_PRODUITS)}, columns: ${cols("url: expr(\"{{ $('Analyser la page').item.json.url }}\"), name: expr(\"{{ $('Analyser la page').item.json.name }}\"), product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), channel_id: expr(\"{{ $('Créer le channel').item.json.id }}\"), guild_id: expr(\"{{ $('Analyser la page').item.json.guildId }}\"), added_by: expr(\"{{ $('Analyser la page').item.json.userId }}\"), last_a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), last_a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), last_a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\"), fail_count: 0, active: true", PRODUCT_COLS)} } }, output: [{ id: 1 }] });
const historique = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Premier point d’historique', position: [2880, 0], parameters: { resource: 'row', operation: 'insert', dataTableId: ${tbl(TABLE_HISTORIQUE)}, columns: ${cols("product_id: expr(\"{{ $('Analyser la page').item.json.product_id }}\"), a0: expr(\"{{ $('Analyser la page').item.json.a0 }}\"), a1: expr(\"{{ $('Analyser la page').item.json.a1 }}\"), a2: expr(\"{{ $('Analyser la page').item.json.a2 }}\")", HIST_COLS)} } }, output: [{ id: 1 }] });
const repOk = ${respond('Répondre : suivi créé', msgJson('"✅ Suivi créé : <#" + $("Créer le channel").item.json.id + ">"'), '[3120, 0]')};

export default workflow('rebuy-ajout', 'Rebuy – Ajouter un produit')
  .add(recu)
  .to(valider)
  .to(lienValide
    .onTrue(dejaSuivi.to(existe
      .onTrue(repDejaSuivi)
      .onFalse(page.to(analyse.to(pageLue
        .onTrue(creerChannel.to(poster.to(enregistrer.to(historique.to(repOk)))))
        .onFalse(repPageIllisible))))))
    .onFalse(repLienInvalide));
`;
}

export function liste() {
  return `${IMPORT}
const recu = ${webhook('Reçoit /liste', 'rebuy-list')};
const produits = node({ type: 'n8n-nodes-base.dataTable', version: 1.1, config: { name: 'Produits actifs', position: [480, 300], alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: ${tbl(TABLE_PRODUITS)}, matchType: 'allConditions', filters: { conditions: [{ keyName: 'active', condition: 'eq', keyValue: 'true' }] }, returnAll: true } }, output: [{ id: 1, url: 'https://www.rebuy.fr/vendre/x', name: 'Produit', channel_id: '1', last_a0: 1, last_a1: 1, last_a2: 1 }] });
const message = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Construire la liste', position: [720, 300], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: ${s(MESSAGE_LISTE)} } }, output: [{ message: 'liste' }] });
const repondre = ${respond('Répondre : liste', "expr('{{ JSON.stringify({ message: $json.message }) }}')", '[960, 300]')};

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

const GENERATORS = { quotidien, ajout, liste, retirer };
if (import.meta.url === `file://${process.argv[1]}`) {
  const g = GENERATORS[process.argv[2]];
  if (!g) { console.error('workflows disponibles :', Object.keys(GENERATORS).join(', ')); process.exit(1); }
  process.stdout.write(g());
}
