# Village Survivor

*Village Survivor* est un jeu 2D pour navigateur qui alterne exploration diurne,
développement d'un village et défense nocturne contre des vagues de monstres.

## État du projet

Le projet est actuellement en **phase de cadrage**. Les décisions produit et
l'architecture cible sont documentées, mais aucun client, serveur ou package de
simulation n'est encore implémenté.

Le prochain jalon est l'initialisation du monorepo puis la construction d'un premier
MVP solo jouable. Voir [`ROADMAP.md`](ROADMAP.md).

## Principes essentiels

- une simulation TypeScript indépendante de Phaser, du navigateur et du réseau ;
- une boucle déterministe autant que raisonnablement possible, à pas de temps fixe ;
- un client Phaser 4 qui communique uniquement par une frontière `GameSession` ;
- une session locale aujourd'hui, un serveur Colyseus autoritaire demain ;
- du contenu et de l'équilibrage dans des fichiers texte validés ;
- de petits incréments jouables, testés et documentés ;
- aucune persistance de compte avant un besoin produit validé.

## Documentation

| Sujet | Document |
|---|---|
| Vision et règles produit | [`docs/product/product-pillars.md`](docs/product/product-pillars.md) |
| Décisions de l'atelier produit | [`docs/product/decisions/2026-07-20-product-workshop.md`](docs/product/decisions/2026-07-20-product-workshop.md) |
| Cadrage technique normatif | [`docs/requirements/initial-technical-baseline.md`](docs/requirements/initial-technical-baseline.md) |
| Traçabilité des exigences | [`docs/requirements/traceability-matrix.md`](docs/requirements/traceability-matrix.md) |
| Architecture cible | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Décisions d'architecture | [`docs/decisions/README.md`](docs/decisions/README.md) |
| Règles de gameplay courantes | [`docs/gameplay/current-rules.md`](docs/gameplay/current-rules.md) |
| Déploiement | [`docs/deployment.md`](docs/deployment.md) |
| Analyse du prototype historique | [`docs/product/legacy-analysis/functional-inventory.md`](docs/product/legacy-analysis/functional-inventory.md) |
| Feuille de route | [`ROADMAP.md`](ROADMAP.md) |
| Historique des changements | [`CHANGELOG.md`](CHANGELOG.md) |

## Architecture cible

```text
Client Phaser
    |
    | GameSession
    +-- LocalSession ----> game-core
    |
    `-- NetworkSession --> serveur Colyseus --> game-core
```

Le cœur de jeu ne dépend ni du rendu ni du transport. Cette séparation doit permettre
de valider rapidement le solo sans préparer le multijoueur par une réécriture.

## Commandes prévues

Après l'incrément d'initialisation, les commandes suivantes devront fonctionner depuis
la racine :

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Elles ne sont **pas encore disponibles**, car le monorepo n'a pas été initialisé.

## Dépôts

- Développement officiel :
  [HidaAkawa/village_survivor](https://github.com/HidaAkawa/village_survivor)
- Référence fonctionnelle historique en lecture seule :
  [Gayar78/village-survivors-v2](https://github.com/Gayar78/village-survivors-v2)

Le prototype historique sert uniquement à comprendre des intentions fonctionnelles.
Son code et ses assets ne sont pas repris par défaut.

## Licence

Aucune licence n'a encore été choisie. Malgré la visibilité publique du dépôt, le code
et les contenus ne doivent pas être considérés comme librement réutilisables tant
qu'un fichier de licence explicite n'est pas ajouté.
