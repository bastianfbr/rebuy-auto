# Architecture

Tous les schémas sont en [Mermaid](https://mermaid.js.org/) (rendus nativement par GitHub).

## Vue d'ensemble

```mermaid
flowchart LR
    subgraph DISCORD["💬 Discord"]
        U(["👤 Utilisateur"])
        CH["#channels produits"]
    end

    subgraph HOST["🖥️ Pterodactyl · conteneur Node 22"]
        S["start.js<br/>point d'entrée"]
        B["🤖 Bot discord.js<br/>slash commands"]
        subgraph N8N["⚙️ n8n 2.35"]
            WH["Webhooks<br/>rebuy-add · rebuy-list · rebuy-remove"]
            CRON["⏰ Relevé quotidien<br/>8h Europe/Paris"]
            DT[("🗄️ Data Tables<br/>produits + historique")]
        end
    end

    R["🛒 rebuy.fr<br/>page produit"]

    U -- "/suivre · /liste · /arreter" --> B
    B -- "POST + en-tête X-Secret" --> WH
    WH <--> DT
    CRON <--> DT
    WH -- "GET page" --> R
    CRON -- "GET page" --> R
    WH -- "crée le channel + récap" --> CH
    CRON -- "embed si prix modifié" --> CH
    S -. lance .-> B
    S -. lance .-> N8N
```

## `/suivre` : ajout d'un produit

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant B as Bot discord.js
    participant W as n8n · rebuy-add
    participant T as Data Table rebuy_products
    participant R as rebuy.fr
    participant D as API Discord

    U->>B: /suivre lien:https://www.rebuy.fr/vendre/…
    B->>B: valide le format du lien
    B->>W: POST {url, guildId, userId} + X-Secret
    W->>T: produit déjà suivi ?
    alt déjà suivi
        W-->>B: « ℹ️ déjà suivi dans #channel »
    else nouveau produit
        W->>R: GET la page
        R-->>W: HTML (JSON embarqué #ry-inject)
        alt prix introuvables
            W-->>B: « ❌ impossible de lire ce lien »
        else prix A0 · A1 · A2 lus
            W->>D: crée le channel du produit
            W->>D: poste l'embed récap initial
            W->>T: enregistre le produit + 1er point d'historique
            W-->>B: « ✅ Suivi créé : #channel »
        end
    end
    B-->>U: réponse éphémère
```

## Relevé quotidien

```mermaid
flowchart TD
    A(["⏰ 8h · cron"]) --> B["Lire les produits actifs"]
    B --> C{"Reste-t-il<br/>un produit ?"}
    C -- non --> Z(["🏁 Fin"])
    C -- oui --> D["⏳ Pause 3 s"]
    D --> E["GET la page Rebuy<br/>2 essais"]
    E --> F["Analyser la page<br/>parse + comparaison"]
    F --> G{"Page lue ?"}

    G -- oui --> H{"Prix modifié ?"}
    H -- oui --> I["📣 Poster l'embed récap"]
    I --> J["Mémoriser les nouveaux prix"]
    J --> K["Ajouter à l'historique"]
    K --> C
    H -- non --> L["Remettre fail_count à 0"]
    L --> C

    G -- non --> M["fail_count + 1"]
    M --> N{"3 échecs<br/>d'affilée ?"}
    N -- oui --> O["⚠️ Alerter dans le channel"]
    O --> C
    N -- non --> C
```

## Cycle de vie d'un suivi

```mermaid
stateDiagram-v2
    state "Actif · fail_count = 0" as Actif
    state "En échec · fail_count >= 1" as EnEchec
    state "Arrêté · active = false" as Arrete

    [*] --> Actif: /suivre
    Actif --> Actif: relevé OK
    Actif --> EnEchec: page illisible
    EnEchec --> Actif: relevé OK
    EnEchec --> EnEchec: nouvel échec, alerte au 3e
    Actif --> Arrete: /arreter
    EnEchec --> Arrete: /arreter
    Arrete --> [*]
```

## Modèle de données

```mermaid
erDiagram
    REBUY_PRODUCTS ||--o{ REBUY_PRICE_HISTORY : "product_id"

    REBUY_PRODUCTS {
        number id PK "auto n8n"
        string url "lien Rebuy"
        string name "nom du produit"
        string product_id "ID Rebuy"
        string channel_id "channel Discord"
        string guild_id "serveur Discord"
        string added_by "ID Discord de l'auteur"
        number last_a0 "neuf emballé (EUR)"
        number last_a1 "comme neuf (EUR)"
        number last_a2 "très bon état (EUR)"
        number fail_count "échecs consécutifs"
        boolean active "suivi actif"
    }

    REBUY_PRICE_HISTORY {
        number id PK "auto n8n"
        string product_id FK
        number a0
        number a1
        number a2
        date createdAt "auto n8n"
    }
```

## Démarrage du conteneur

```mermaid
flowchart TD
    P(["▶️ Démarrage Pterodactyl"]) --> G{"AUTO_UPDATE = 1 ?"}
    G -- oui --> GP["git pull"]
    G -- non --> NI
    GP --> NI["npm install<br/>allowScripts : sqlite3, isolated-vm, msgpackr-extract"]
    NI --> SJ["tsx start.js"]
    SJ --> K["Crée data/ + clé de chiffrement n8n<br/>au premier lancement"]
    K --> Q{"sqlite3<br/>chargeable ?"}
    Q -- non --> RB["npm rebuild des modules natifs"]
    Q -- oui --> N8["Lance n8n sur SERVER_PORT"]
    RB --> N8
    N8 --> T{"DISCORD_TOKEN<br/>défini ?"}
    T -- non --> ONLY(["n8n seul"])
    T -- oui --> SC["deploy-commands.js<br/>enregistre les slash commands"]
    SC --> BOT(["Lance le bot discord.js"])
```

## Format de l'embed

```mermaid
flowchart LR
    X["Nouveau relevé<br/>A0 · A1 · A2"] --> CMP["Comparaison avec<br/>le dernier relevé"]
    CMP --> V{"Mouvement<br/>global"}
    V -- "que des hausses" --> GR["🟢 vert"]
    V -- "que des baisses" --> RD["🔴 rouge"]
    V -- "mixte" --> OR["🟠 orange"]
    V -- "premier relevé" --> BL["🔵 bleu"]
    GR --> L["Par état :<br/>📈 hausse · 📉 baisse · ➖ inchangé<br/>+ ancien prix, écart € et %"]
    RD --> L
    OR --> L
    BL --> L
```
