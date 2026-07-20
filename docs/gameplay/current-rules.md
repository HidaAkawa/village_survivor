# Règles de gameplay courantes

Statut : **règles acceptées, non encore implémentées**
Dernière mise à jour : 20 juillet 2026

Ce document est une photographie pratique des règles validées. Le document normatif
détaillé reste [`../product/product-pillars.md`](../product/product-pillars.md), et les
décisions numérotées sont conservées dans
[`../product/decisions/2026-07-20-product-workshop.md`](../product/decisions/2026-07-20-product-workshop.md).

## Partie

- Une partie est autonome et recommence de zéro.
- Il n'existe aucune sauvegarde de personnage, village, ressource ou progression entre
  les parties en V1.
- La partie alterne des journées d'exploration limitées et des nuits de défense.
- La difficulté nocturne augmente jusqu'à la victoire ou la défaite.

## Jour et exploration

- Les joueurs quittent le village pour trouver des ressources et des artefacts.
- Valeur et danger augmentent avec la distance au village.
- Les défenses et services du village ne soutiennent plus les personnages trop
  éloignés.
- Aucun rappel ni téléportation n'a lieu à la tombée de la nuit.
- La carte est générée à partir d'une graine au début de la partie et reste stable.
- L'exploration et les zones découvertes sont partagées par le groupe.
- Les gisements sont finis et ne se renouvellent pas.
- La génération doit garantir les ressources nécessaires à la victoire, avec une
  marge pour les erreurs et les stratégies facultatives.

## Nuit et monstres

- Les gardiens restent liés à un site de ressource ou de trésor.
- Les autres groupes dorment le jour, mais se défendent s'ils détectent un personnage.
- Les joueurs peuvent les éliminer préventivement pour réduire la menace nocturne.
- La détection diurne repose initialement sur perception, bruit et jauge de réveil.
- À la nuit, les groupes non gardiens vivants convergent vers le village.
- La nuit possède une durée fixe.
- À l'aube, les survivants retournent dans le monde et restent présents.
- Des tanières ou portails indestructibles en V1 produisent de nouveaux groupes à
  chaque aube, selon l'avancement et le nombre de joueurs.

## Village

- Le village est à la fois l'objectif à protéger et un personnage collectif
  améliorable.
- Son cœur régénère modérément les personnages proches, surtout le jour ; cet effet
  diminue sous attaque et peut être amélioré.
- Une colonne vertébrale de prérequis mène au niveau ultime du cœur.
- Des branches facultatives améliorent soins, défense, production ou exploration.
- Les défenses permanentes utilisent des emplacements prédéfinis.
- Des constructions tactiques limitées peuvent être placées librement.
- Une défense permanente financée par un joueur devient propriété du village et peut
  être améliorée par les autres ; sa contribution initiale reste attribuée.

## Ressources et propriété

- Les ressources appartiennent au personnage qui les collecte et lui seul décide de
  leur dépense.
- Ressources transportées et artefacts non équipés partagent une capacité en poids.
- Au village, les ressources rejoignent un stock personnel sécurisé et sans poids.
- Le stock personnel n'est accessible qu'à proximité du village.
- Une construction éloignée utilise uniquement les ressources réellement transportées.
- Les transferts entre joueurs sont volontaires et exigent la proximité ou un
  dispositif d'échange au village.
- Un joueur peut verser volontairement des ressources dans la réserve irréversible
  d'un projet collectif.

## Combat et progression

- Chaque personnage choisit deux disciplines distinctes pour toute la partie.
- Les huit disciplines cibles sont Épée, Bouclier, Arc, Marteau, Feu, Foudre, Barrière
  et Soin ; les quatre premières à concevoir sont Épée, Arc, Feu et Barrière.
- Chaque discipline fournit une capacité automatique, une compétence active et des
  améliorations.
- Un personnage possède au maximum deux compétences actives, une par discipline.
- Une amélioration rare peut remplacer une compétence active sans créer un nouvel
  emplacement.
- À chaque niveau, trois améliorations compatibles sont proposées.
- La simulation ne se met jamais en pause, en solo comme en multijoueur, et les choix
  restent disponibles jusqu'à sélection.
- L'expérience doit reconnaître les contributions récentes ; la proximité constitue
  un premier remplacement acceptable.
- Les contributeurs admissibles reçoivent initialement une part égale.

## Artefacts

- Les artefacts se trouvent dans des lieux remarquables gardés.
- Ils appartiennent à leur découvreur et peuvent être donnés volontairement.
- Deux artefacts peuvent être équipés au maximum.
- Leur changement est possible partout par une courte canalisation interrompue par le
  mouvement ou les dégâts ; le jeu ne se met pas en pause.

## Mort

- À zéro point de vie, un personnage tombe à terre pour une durée limitée.
- Un allié peut le relever par une interaction interrompue par mouvement ou dégâts.
- À l'expiration, la mort devient définitive pour la partie.
- En solo, tomber provoque normalement la défaite, sauf auto-réanimation explicite.
- Un joueur définitivement mort devient spectateur sans pouvoir d'action en V1.
- Les possessions transportées tombent dans un sac permanent jusqu'à récupération ou
  fin de partie.
- Son stock sécurisé devient un coffre d'héritage accessible aux survivants.

## Victoire et défaite

- L'objectif de victoire est visible dès le début.
- Le niveau ultime du cœur du village déclenche une phase d'activation et une vague
  finale.
- La victoire est acquise après avoir survécu à cette activation.
- La partie est perdue si le village est détruit ou si aucun personnage vivant ne peut
  encore relever un allié.

## Valeurs et contenus encore ouverts

- nom et fiction du niveau ultime du cœur ;
- durées, coûts, poids, portées et délais ;
- contenu exact des branches, artefacts et améliorations ;
- seuils de contribution à l'expérience ;
- périmètre et paire de disciplines du premier MVP.

Ces ouvertures sont des paramètres ou choix de contenu. Elles ne remettent pas en cause
les invariants d'architecture définis dans
[`../architecture/overview.md`](../architecture/overview.md).
