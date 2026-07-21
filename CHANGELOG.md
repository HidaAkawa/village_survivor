# Journal des changements

Ce projet suit une adaptation de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Aucune politique de version
sémantique n'est encore appliquée, car aucune version jouable n'a été publiée.

## [Non publié]

### Ajouté

- premier MVP solo jouable avec carte issue d'une graine, cycles jour/nuit et vague
  finale ;
- disciplines Épée et Barrière, attaque automatique, compétences actives, expérience
  et choix d'améliorations sans pause ;
- gisements gardés, transport limité, stock personnel, baliste et progression du Cœur
  du village ;
- monorepo pnpm avec client Phaser 4, protocoles partagés, contenu Zod validé et
  simulation headless à pas fixe ;
- HUD français, minimap, sons synthétiques, métriques de développement et graphismes
  temporaires ;
- tests Vitest, parcours Playwright, smoke test du build de production, benchmark et
  workflow GitHub Actions ;
- piliers produit et décisions détaillées de l'atelier du 20 juillet 2026 ;
- inventaire fonctionnel et matrice de sélection du prototype historique ;
- cadrage technique initial avec exigences identifiées et règles de changement ;
- vue d'ensemble de l'architecture locale puis multijoueur ;
- ADR du monorepo, de la simulation, des sessions, du serveur autoritaire, du contenu
  piloté par les données et de la persistance différée ;
- matrice de traçabilité des exigences ;
- règles de gameplay courantes, feuille de route et cible de déploiement ;
- porte d'entrée documentaire du dépôt.

### Modifié

- les journées et les nuits durent désormais toutes deux 75 secondes ;
- la zone du village possède une limite visible et un indicateur intérieur/extérieur ;
- le dépôt des ressources exige maintenant `E` dans le village au lieu d'être
  automatique ;
- la portée de la baliste est visible et chaque tir prend la forme d'un carreau animé ;
- les balistes peuvent être fabriquées en plusieurs exemplaires à la position choisie
  dans le village ; leur chantier de cinq secondes est interrompu et remboursé si le
  personnage subit des dégâts ;
- l'équilibrage oppose désormais davantage de dormeurs et de renforts, des ennemis plus
  dangereux et une survie moins permissive dès la première nuit ;
- l'attaque automatique de l'Épée produit un arc de lame orienté vers sa cible ;
- le sol diurne utilise une teinte très claire avec des contrastes adaptés ;
- les paramètres de génération, détection, réparation et vagues sont regroupés dans le
  catalogue TypeScript validé de `packages/content` ;
- les trois améliorations sont tirées sans remise selon des poids, avec un flux
  aléatoire déterministe indépendant de la génération du monde ;
- les ennemis survivant à la nuit conservent leur type, leurs caractéristiques et leur
  récompense lorsqu'ils retournent dormir ;
- la simulation avance désormais sans produire automatiquement un instantané ; la
  session locale ne crée l'état public qu'au moment de le publier ;
- le mouvement, le combat, la construction, les phases, le ciblage et la projection
  d'état sont séparés de l'orchestrateur `GameSimulation` ;

### Sécurité

- l'API de débogage est limitée au développement et son absence du build est testée ;
- les données issues de l'URL sont échappées avant affichage et couvertes par le smoke
  test de production ;
- la provenance et les droits des futurs assets deviennent une exigence explicite ;
- la politique interdit les secrets dans Git et diffère toute télémétrie non validée.
