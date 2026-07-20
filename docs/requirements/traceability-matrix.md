# Matrice de traçabilité des exigences

Statut : **initialisée avant implémentation**
Date : 20 juillet 2026

## 1. Usage

Cette matrice empêche qu'une exigence du cadrage disparaisse pendant les incréments.
Elle relie chaque groupe d'exigences à sa décision d'architecture, à son emplacement
cible et à son mode de vérification.

Les colonnes « Implémentation cible » et « Vérification prévue » ne signifient pas que
le composant existe déjà. L'état réel du dépôt est indiqué dans la dernière colonne.

## 2. Traçabilité

| Exigence | Décision ou référence | Implémentation cible | Vérification prévue | État au 20/07/2026 |
|---|---|---|---|---|
| `REQ-GOV-001` | Cadrage initial | Processus d'incrément, documentation | Revue de chaque livraison | Documenté |
| `REQ-GOV-002` | Cadrage initial | Gouvernance produit | Journal des décisions humaines | Documenté |
| `REQ-SCOPE-001` | [ADR-0003](../decisions/0003-game-session-boundary.md), [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | Sessions locale puis réseau | Tests contractuels de session | Non implémenté |
| `REQ-SCOPE-002` | [ROADMAP](../../ROADMAP.md) | Incréments verticaux | Démonstration jouable par jalon | Planifié |
| `REQ-PRINCIPLES-001` | Cadrage initial | Toutes les couches | Revue d'architecture | Documenté |
| `REQ-PRINCIPLES-002` | [Vue d'architecture](../architecture/overview.md) | Frontières de packages | Lint d'imports et revue | Non implémenté |
| `REQ-STACK-001` | Cadrage initial | `apps/client` | Build et test navigateur | Non implémenté |
| `REQ-STACK-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `apps/server` | Tests de rooms futurs | Différé |
| `REQ-STACK-003` | [ADR-0001](../decisions/0001-pnpm-monorepo.md) | Configuration racine | Commandes racine et CI | Non implémenté |
| `REQ-PERSISTENCE-001` | [ADR-0006](../decisions/0006-defer-persistence.md) | Aucun composant en V1 | Vérifier l'absence de DB et de progression | Accepté, différé |
| `REQ-ARCH-001` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | `game-core`, client, serveur | Tests Node et règles d'import | Non implémenté |
| `REQ-ARCH-002` | [ADR-0003](../decisions/0003-game-session-boundary.md) | `GameSession`, `LocalSession`, `NetworkSession` | Tests de contrat | Non implémenté |
| `REQ-ARCH-003` | [ADR-0001](../decisions/0001-pnpm-monorepo.md) | Workspaces pnpm | Installation et build racine | Non implémenté |
| `REQ-SIM-001` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | Boucle et RNG de `game-core` | Tests de graine et pas fixe | Non implémenté |
| `REQ-SIM-002` | [ROADMAP](../../ROADMAP.md) | Systèmes de simulation | Tests par système | Planifié progressivement |
| `REQ-SIM-003` | [Vue d'architecture](../architecture/overview.md) | `PublicGameState` | Tests de sérialisation | Non implémenté |
| `REQ-NET-001` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | Rooms Colyseus | Rejet de commandes invalides | Différé |
| `REQ-NET-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `NetworkSession`, client et serveur | Tests multi-clients et reconnexion | Différé |
| `REQ-CONTENT-001` | [ADR-0005](../decisions/0005-data-driven-content.md) | `packages/content` | Inventaire des valeurs de gameplay | Non implémenté |
| `REQ-CONTENT-002` | [ADR-0005](../decisions/0005-data-driven-content.md) | Schémas et chargeur | Tests de données valides/invalides | Non implémenté |
| `REQ-ASSET-001` | Cadrage initial | `assets`, client | Revue visuelle et inventaire | Non implémenté |
| `REQ-ASSET-002` | Cadrage initial | `scripts/assets` | Contrôles automatisés d'assets | Différé au premier asset |
| `REQ-ASSET-003` | [Analyse historique](../product/legacy-analysis/selection-matrix.md) | Métadonnées de provenance | Contrôle de licence en revue | Documenté |
| `REQ-TEST-001` | Cadrage initial | Tests proches des packages | `pnpm test` | Non implémenté |
| `REQ-TEST-002` | [ADR-0002](../decisions/0002-headless-fixed-step-simulation.md) | `tests/simulation` | Vitest sans navigateur | Non implémenté |
| `REQ-TEST-003` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | `tests/multiplayer` | Clients Colyseus de test | Différé |
| `REQ-TEST-004` | Cadrage initial | `tests/browser` et API debug | Playwright, erreurs console | Non implémenté |
| `REQ-DEBUG-001` | [Vue d'architecture](../architecture/overview.md) | Client développement | Playwright et inspection du build | Non implémenté |
| `REQ-PERF-001` | Cadrage initial | Scénarios de benchmark | Comparaison reproductible | À chiffrer |
| `REQ-PERF-002` | Cadrage initial | Simulation et rendu | FPS, temps de tick, entités | À chiffrer |
| `REQ-CI-001` | [ADR-0001](../decisions/0001-pnpm-monorepo.md), [déploiement](../deployment.md) | Scripts racine, GitHub Actions | Pipeline complet | Non implémenté |
| `REQ-DEPLOY-001` | [Déploiement](../deployment.md) | Cloudflare Workers Static Assets | Déploiement preview puis production | Accès non configuré |
| `REQ-DEPLOY-002` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md), [déploiement](../deployment.md) | Image Docker serveur | Build et smoke test d'image | Différé |
| `REQ-DEPLOY-003` | [Déploiement](../deployment.md) | Secrets GitHub/environnements | Scan et revue des bundles | Politique documentée |
| `REQ-DOC-001` | Cadrage initial | Documentation racine et `docs` | Contrôle des fichiers requis | Implémenté |
| `REQ-DOC-002` | [Index ADR](../decisions/README.md) | `docs/decisions` | Revue des changements structurants | Implémenté |
| `REQ-DOC-003` | Cadrage initial | Tous les incréments | Revue documentation/code | Documenté |
| `REQ-WORK-001` | Cadrage initial | Processus de livraison | Checklist d'incrément | Documenté |
| `REQ-WORK-002` | Cadrage initial | ADR ou note de refactoring | Revue avant refonte | Documenté |
| `REQ-QUALITY-001` | Cadrage initial | TypeScript, ESLint, Prettier | Lint, types et revue | Non implémenté |
| `REQ-SEC-001` | [ADR-0004](../decisions/0004-authoritative-multiplayer-server.md) | Validation côté serveur | Tests d'abus et limites | Différé au réseau |

## 3. Contrôle à chaque incrément

Lorsqu'une exigence commence à être implémentée :

1. remplacer l'emplacement cible par le chemin réel ;
2. référencer les tests concrets ;
3. mettre à jour l'état sans déclarer « implémenté » avant vérification ;
4. créer un ADR si la solution s'écarte du cadrage ;
5. conserver la ligne même si l'exigence est remplacée, avec le lien vers la décision
   qui la remplace.
