import type { GameContent, UpgradeDefinition } from '@village-survivor/content';
import type {
  EnemyKind,
  GameEvent,
  GameEventType,
  GamePhase,
  GameStatus,
  PlayerInput,
  PublicGameState,
  Vector2,
} from '@village-survivor/protocol';

import { type CombatContext, updateDefenseCombat, updateEnemyCombat } from './combat-system.js';
import { canPlaceDefenseAt, createDefense, repairDefense } from './construction-system.js';
import { clampPosition, distance, distanceToSegment } from './geometry.js';
import { updatePlayerMovement } from './movement-system.js';
import {
  awakenAssailants,
  dayReinforcementInstructions,
  finalSpawnInstructions,
  nightSpawnInstructions,
  restSurvivingAssailants,
  type SpawnInstruction,
} from './phase-system.js';
import { SeededRandom } from './random.js';
import { createPublicGameState } from './snapshot.js';
import type {
  MutableDefense,
  MutableEnemy,
  MutablePlayer,
  MutableResource,
  MutableVillage,
} from './state.js';
import {
  findNearestDefense,
  findNearestEnemy,
  isEnemyTargetable,
  wakeNearbyEnemies,
} from './targeting.js';
import { selectWeightedUpgrades } from './upgrade-selection.js';

const VILLAGE_POSITION: Vector2 = { x: 0, y: 0 };

export class GameSimulation {
  private readonly random: SeededRandom;
  private readonly upgradeRandom: SeededRandom;
  private readonly seed: string;
  private readonly content: GameContent;
  private readonly resources: MutableResource[] = [];
  private readonly enemies: MutableEnemy[] = [];
  private readonly defenses: MutableDefense[] = [];
  private readonly player: MutablePlayer;
  private readonly village: MutableVillage;
  private readonly combatContext: CombatContext;
  private status: GameStatus = 'ready';
  private resultReason: string | undefined;
  private phase: GamePhase = 'day';
  private cycle = 1;
  private phaseRemainingMs: number;
  private tick = 0;
  private elapsedMs = 0;
  private enemyCounter = 0;
  private defenseCounter = 0;
  private activeConstructionId: string | undefined;
  private eventCounter = 0;
  private events: GameEvent[] = [];
  private upgradeChoices: UpgradeDefinition[] = [];

  public constructor(content: GameContent, seed: string) {
    this.content = content;
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.upgradeRandom = new SeededRandom(`${seed}:upgrades`);
    this.phaseRemainingMs = content.simulation.dayDurationMs;
    this.player = {
      position: { x: 0, y: content.world.playerStartOffsetY },
      hp: content.player.maxHp,
      maxHp: content.player.maxHp,
      ward: content.barrier.maxWard,
      maxWard: content.barrier.maxWard,
      wardRefreshRemainingMs: content.barrier.wardRefreshMs,
      moveSpeed: content.player.moveSpeed,
      carriedWood: 0,
      storedWood: 0,
      carryCapacity: content.player.carryCapacity,
      experience: 0,
      experienceToNext:
        content.progression.experiencePerLevel[0] ?? content.progression.fallbackExperienceToNext,
      level: 1,
      swordAutoDamage: content.sword.autoDamage,
      swordAutoRange: content.sword.autoRange,
      swordAutoCooldownMs: content.sword.autoCooldownMs,
      swordAutoCooldownRemainingMs: content.sword.autoCooldownMs,
      swordCooldownMs: content.sword.lungeCooldownMs,
      swordCooldownRemainingMs: 0,
      barrierCooldownMs: content.barrier.activeCooldownMs,
      barrierCooldownRemainingMs: 0,
      barrierDurationMs: content.barrier.activeDurationMs,
      barrierActiveRemainingMs: 0,
      selectedUpgrades: [],
      lastAim: { x: 1, y: 0 },
    };
    this.village = {
      position: VILLAGE_POSITION,
      hp: content.village.maxHp,
      maxHp: content.village.maxHp,
      heartLevel: 1,
      underAttack: false,
    };
    this.combatContext = {
      content: this.content,
      enemies: this.enemies,
      defenses: this.defenses,
      player: this.player,
      village: this.village,
      damageEnemy: (enemy, amount) => this.damageEnemy(enemy, amount),
      damagePlayer: (amount, attackerPosition) =>
        this.applyDamageToPlayer(amount, attackerPosition),
      destroyDefense: (defense) => this.destroyDefense(defense),
      addEvent: (type, message, details) => this.addEvent(type, message, details),
    };
    this.generateWorld();
  }

  public start(): void {
    if (this.status === 'ready') {
      this.status = 'running';
    }
  }

  public step(input: PlayerInput): void {
    this.events = [];
    if (this.status !== 'running') {
      return;
    }

    const deltaMs = this.content.simulation.tickMs;
    const deltaSeconds = deltaMs / 1_000;
    this.tick += 1;
    this.elapsedMs += deltaMs;
    this.village.underAttack = false;

    this.updateCooldowns(deltaMs);
    updatePlayerMovement(
      this.player,
      input,
      deltaSeconds,
      this.content.world,
      this.activeConstructionId !== undefined,
    );
    this.useAbilities(input);
    this.updateAutomaticSword();
    updateDefenseCombat(this.combatContext);
    updateEnemyCombat(this.combatContext, this.phase, deltaMs, deltaSeconds);
    this.updateDefenseConstruction(deltaMs);
    this.removeDefeatedEnemies();
    this.updateVillageSupport(deltaSeconds);
    this.handleInteraction(input);
    this.handleUpgradeSelection(input);
    this.updatePhase(deltaMs);
    this.checkDefeat();
  }

  /**
   * Événements du tick courant. Le prochain `step()` les remplace : un adaptateur
   * qui avance plusieurs ticks avant de publier doit les collecter à chaque tick,
   * sinon seuls ceux du dernier tick lui parviennent.
   */
  public getEvents(): readonly GameEvent[] {
    return this.events;
  }

  public createSnapshot(): PublicGameState {
    const interactionHint = this.getInteractionHint();
    return createPublicGameState({
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      status: this.status,
      resultReason: this.resultReason,
      seed: this.seed,
      content: this.content,
      phase: this.phase,
      cycle: this.cycle,
      phaseRemainingMs: this.phaseRemainingMs,
      player: this.player,
      village: this.village,
      defenses: this.defenses,
      resources: this.resources,
      enemies: this.enemies,
      upgradeChoices: this.upgradeChoices,
      interactionHint,
      objective: this.getObjective(),
      events: this.events,
    });
  }

  public damagePlayer(amount: number): void {
    if (this.status === 'running') {
      this.applyDamageToPlayer(Math.max(0, amount), this.player.position);
      this.checkDefeat();
    }
  }

  public giveExperience(amount: number): void {
    if (this.status === 'running') {
      this.addExperience(Math.max(0, amount));
    }
  }

  public giveResources(amount: number): void {
    if (this.status === 'running') {
      this.player.storedWood += Math.max(0, Math.floor(amount));
    }
  }

  public teleportPlayer(position: Vector2): void {
    if (this.status === 'running') {
      this.player.position = clampPosition(
        position,
        this.content.world.width,
        this.content.world.height,
      );
    }
  }

  public defeatEnemy(enemyId: string): void {
    const enemy = this.enemies.find((candidate) => candidate.id === enemyId);
    if (this.status === 'running' && enemy !== undefined) {
      this.damageEnemy(enemy, enemy.hp);
      this.removeDefeatedEnemies();
    }
  }

  public defeatAllAssailants(): void {
    if (this.status !== 'running') {
      return;
    }
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian') {
        this.damageEnemy(enemy, enemy.hp);
      }
    }
    this.removeDefeatedEnemies();
  }

  public spawnEnemy(kind: EnemyKind = 'raider', position?: Vector2): string {
    const ring = this.content.world.debugEnemySpawnRing;
    const spawnPosition =
      position ?? this.randomRingPosition(ring.minimumRadius, ring.maximumRadius);
    return this.createEnemy(kind, spawnPosition, spawnPosition, kind !== 'sleeper');
  }

  public skipToNight(): void {
    if (this.status === 'running' && this.phase === 'day') {
      this.beginNight();
    }
  }

  public forceFinalWave(): void {
    if (this.status === 'running') {
      this.village.heartLevel = 3;
      this.beginFinalWave();
    }
  }

  private generateWorld(): void {
    for (let index = 0; index < this.content.world.resourceNodeCount; index += 1) {
      const baseAngle = (index / this.content.world.resourceNodeCount) * Math.PI * 2;
      const jitter = this.content.world.resourceAngleJitterRadians;
      const angle = baseAngle + this.random.between(-jitter, jitter);
      const radius =
        this.content.world.resourceRingStartRadius +
        index * this.content.world.resourceRingStepRadius;
      const position = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
      const guardianPosition = {
        x: position.x + Math.cos(angle + Math.PI / 2) * this.content.world.guardianOffset,
        y: position.y + Math.sin(angle + Math.PI / 2) * this.content.world.guardianOffset,
      };
      const guardianId = this.createEnemy('guardian', guardianPosition, guardianPosition, true);
      this.resources.push({
        id: `resource-${index + 1}`,
        position,
        amountRemaining: this.content.world.woodPerNode,
        guardianId,
      });
    }

    const sleeperRing = this.content.world.initialSleeperRing;
    for (let index = 0; index < this.content.world.initialSleeperCount; index += 1) {
      const position = this.randomRingPosition(
        sleeperRing.minimumRadius,
        sleeperRing.maximumRadius,
      );
      this.createEnemy('sleeper', position, position, false);
    }
  }

  private createEnemy(kind: EnemyKind, position: Vector2, home: Vector2, awake: boolean): string {
    this.enemyCounter += 1;
    const definition = this.content.enemies[kind];
    const id = `enemy-${this.enemyCounter}`;
    this.enemies.push({
      id,
      kind,
      position: { ...position },
      home: { ...home },
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      awake,
      attackCooldownRemainingMs: this.random.between(0, definition.attackCooldownMs),
    });
    return id;
  }

  private randomRingPosition(minimumRadius: number, maximumRadius: number): Vector2 {
    const angle = this.random.between(0, Math.PI * 2);
    const radius = this.random.between(minimumRadius, maximumRadius);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  private updateCooldowns(deltaMs: number): void {
    this.player.swordAutoCooldownRemainingMs = Math.max(
      0,
      this.player.swordAutoCooldownRemainingMs - deltaMs,
    );
    this.player.swordCooldownRemainingMs = Math.max(
      0,
      this.player.swordCooldownRemainingMs - deltaMs,
    );
    this.player.barrierCooldownRemainingMs = Math.max(
      0,
      this.player.barrierCooldownRemainingMs - deltaMs,
    );
    this.player.barrierActiveRemainingMs = Math.max(
      0,
      this.player.barrierActiveRemainingMs - deltaMs,
    );
    for (const defense of this.defenses) {
      defense.cooldownRemainingMs = Math.max(0, defense.cooldownRemainingMs - deltaMs);
    }
    this.player.wardRefreshRemainingMs -= deltaMs;
    if (this.player.wardRefreshRemainingMs <= 0) {
      this.player.ward = this.player.maxWard;
      this.player.wardRefreshRemainingMs = this.content.barrier.wardRefreshMs;
    }
  }

  private useAbilities(input: PlayerInput): void {
    if (input.activateSword === true && this.player.swordCooldownRemainingMs <= 0) {
      const start = this.player.position;
      const proposedEnd = {
        x: start.x + this.player.lastAim.x * this.content.sword.lungeDistance,
        y: start.y + this.player.lastAim.y * this.content.sword.lungeDistance,
      };
      const end = clampPosition(proposedEnd, this.content.world.width, this.content.world.height);
      this.player.position = end;
      for (const enemy of this.enemies) {
        if (
          isEnemyTargetable(enemy) &&
          distanceToSegment(enemy.position, start, end) <= this.content.sword.lungeRadius
        ) {
          this.damageEnemy(enemy, this.content.sword.lungeDamage);
          wakeNearbyEnemies(this.enemies, enemy.position, this.content.sword.lungeWakeRadius);
        }
      }
      this.player.swordCooldownRemainingMs = this.player.swordCooldownMs;
    }

    if (input.activateBarrier === true && this.player.barrierCooldownRemainingMs <= 0) {
      this.player.barrierActiveRemainingMs = this.player.barrierDurationMs;
      this.player.barrierCooldownRemainingMs = this.player.barrierCooldownMs;
    }
  }

  private updateAutomaticSword(): void {
    if (this.player.swordAutoCooldownRemainingMs > 0) {
      return;
    }
    const target = findNearestEnemy(
      this.enemies,
      this.player.position,
      this.player.swordAutoRange,
      isEnemyTargetable,
    );
    if (target === undefined) {
      return;
    }
    this.addEvent('sword-auto-attack', 'Coup d’épée automatique.', {
      origin: this.player.position,
      position: target.position,
    });
    this.damageEnemy(target, this.player.swordAutoDamage);
    wakeNearbyEnemies(this.enemies, target.position, this.content.sword.automaticAttackWakeRadius);
    this.player.swordAutoCooldownRemainingMs = this.player.swordAutoCooldownMs;
  }

  private applyDamageToPlayer(amount: number, attackerPosition: Vector2): void {
    let remainingDamage = amount;
    if (
      this.player.barrierActiveRemainingMs > 0 &&
      distance(attackerPosition, this.player.position) <= this.content.barrier.activeRadius
    ) {
      remainingDamage *= 1 - this.content.barrier.damageReduction;
    }
    const absorbed = Math.min(this.player.ward, remainingDamage);
    this.player.ward -= absorbed;
    remainingDamage -= absorbed;
    this.player.hp = Math.max(0, this.player.hp - remainingDamage);
    this.player.wardRefreshRemainingMs = this.content.barrier.wardRefreshMs;
    this.addEvent('player-hurt', `Vous subissez ${Math.ceil(amount)} dégâts.`, {
      position: this.player.position,
      amount,
    });
    if (amount > 0) {
      this.interruptDefenseConstruction();
    }
  }

  private damageEnemy(enemy: MutableEnemy, amount: number): void {
    if (enemy.hp <= 0) {
      return;
    }
    enemy.hp = Math.max(0, enemy.hp - amount);
    this.addEvent('enemy-hit', `${Math.ceil(amount)} dégâts`, {
      position: enemy.position,
      amount,
    });
    if (enemy.hp <= 0) {
      this.addEvent('enemy-killed', 'Ennemi éliminé.', { position: enemy.position });
      this.addExperience(this.content.enemies[enemy.kind].experience);
    }
  }

  private removeDefeatedEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (enemy !== undefined && enemy.hp <= 0) {
        this.enemies.splice(index, 1);
      }
    }
  }

  private updateVillageSupport(deltaSeconds: number): void {
    if (this.phase === 'day' && this.village.heartLevel >= 2 && this.isPlayerInsideVillage()) {
      const multiplier = this.village.underAttack
        ? this.content.village.underAttackRegenMultiplier
        : 1;
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + this.content.village.dayRegenPerSecond * multiplier * deltaSeconds,
      );
    }
  }

  private depositCarriedResources(): void {
    const amount = this.player.carriedWood;
    if (amount <= 0 || !this.isPlayerInsideVillage()) {
      return;
    }
    this.player.carriedWood = 0;
    this.player.storedWood += amount;
    this.addEvent('resource-deposited', `${amount} bois déposé dans votre stock.`, {
      position: this.player.position,
      amount,
    });
  }

  private handleInteraction(input: PlayerInput): void {
    if (input.buildDefense === true) {
      this.startDefenseConstruction();
      return;
    }
    if (input.interact !== true) {
      return;
    }
    const nearbyResource = this.findNearbyResource();
    if (nearbyResource !== undefined) {
      this.collectResource(nearbyResource);
      return;
    }
    if (this.player.carriedWood > 0 && this.isPlayerInsideVillage()) {
      this.depositCarriedResources();
      return;
    }
    const nearbyDefense = findNearestDefense(
      this.defenses,
      this.player.position,
      this.content.player.interactionRange,
      true,
    );
    if (nearbyDefense !== undefined) {
      repairDefense(nearbyDefense, this.player, this.content.defense);
      return;
    }
    if (
      distance(this.player.position, this.village.position) <= this.content.player.interactionRange
    ) {
      this.upgradeVillageHeart();
    }
  }

  private collectResource(resource: MutableResource): void {
    if (resource.amountRemaining <= 0 || this.isGuardianAlive(resource.guardianId)) {
      return;
    }
    const freeCapacity = this.player.carryCapacity - this.player.carriedWood;
    const amount = Math.min(
      this.content.world.woodCollectedPerInteraction,
      resource.amountRemaining,
      freeCapacity,
    );
    if (amount <= 0) {
      return;
    }
    resource.amountRemaining -= amount;
    this.player.carriedWood += amount;
    this.addEvent('resource-collected', `${amount} bois collecté.`, {
      position: resource.position,
      amount,
    });
  }

  private startDefenseConstruction(): void {
    if (
      this.activeConstructionId !== undefined ||
      !canPlaceDefenseAt(this.player.position, this.village, this.defenses, this.content) ||
      this.player.storedWood < this.content.defense.buildCost
    ) {
      return;
    }
    this.defenseCounter += 1;
    const defense = createDefense(
      `defense-${this.defenseCounter}`,
      this.player.position,
      this.content.defense,
    );
    this.player.storedWood -= this.content.defense.buildCost;
    this.defenses.push(defense);
    this.activeConstructionId = defense.id;
    this.addEvent('defense-construction-started', 'Fabrication de la baliste : restez à couvert.', {
      position: defense.position,
    });
  }

  private updateDefenseConstruction(deltaMs: number): void {
    if (this.activeConstructionId === undefined) {
      return;
    }
    const defense = this.defenses.find((candidate) => candidate.id === this.activeConstructionId);
    if (defense === undefined) {
      this.activeConstructionId = undefined;
      return;
    }
    defense.buildRemainingMs = Math.max(0, defense.buildRemainingMs - deltaMs);
    if (defense.buildRemainingMs > 0) {
      return;
    }
    defense.built = true;
    this.activeConstructionId = undefined;
    this.addEvent('defense-built', 'La baliste est opérationnelle.', {
      position: defense.position,
    });
  }

  private interruptDefenseConstruction(): void {
    if (this.activeConstructionId === undefined) {
      return;
    }
    const index = this.defenses.findIndex((defense) => defense.id === this.activeConstructionId);
    const defense = this.defenses[index];
    this.activeConstructionId = undefined;
    if (defense === undefined) {
      return;
    }
    this.defenses.splice(index, 1);
    this.player.storedWood += this.content.defense.buildCost;
    this.addEvent(
      'defense-construction-interrupted',
      'Fabrication interrompue par les dégâts : ressources remboursées.',
      { position: defense.position },
    );
  }

  private destroyDefense(defense: MutableDefense): void {
    if (defense.id === this.activeConstructionId) {
      this.interruptDefenseConstruction();
      return;
    }
    const index = this.defenses.findIndex((candidate) => candidate.id === defense.id);
    if (index >= 0) {
      this.defenses.splice(index, 1);
      this.addEvent('defense-destroyed', 'Une baliste a été détruite.', {
        position: defense.position,
      });
    }
  }

  private upgradeVillageHeart(): void {
    if (this.village.heartLevel === 1) {
      if (this.player.storedWood < this.content.village.levelTwoCost) {
        return;
      }
      this.player.storedWood -= this.content.village.levelTwoCost;
      this.village.heartLevel = 2;
      this.addEvent('heart-upgraded', 'Le Cœur devient un Foyer régénérant.', {
        position: this.village.position,
      });
      return;
    }
    if (
      this.village.heartLevel === 2 &&
      this.hasOperationalDefense() &&
      this.player.level >= this.content.village.ultimateMinimumPlayerLevel &&
      this.player.storedWood >= this.content.village.ultimateCost
    ) {
      this.player.storedWood -= this.content.village.ultimateCost;
      this.village.heartLevel = 3;
      this.addEvent('heart-upgraded', "L'ultime activation du Cœur commence.", {
        position: this.village.position,
      });
      this.beginFinalWave();
    }
  }

  private addExperience(amount: number): void {
    if (this.upgradeChoices.length > 0) {
      this.player.experience += amount;
      return;
    }
    this.player.experience += amount;
    if (this.player.experience < this.player.experienceToNext) {
      return;
    }
    this.player.experience -= this.player.experienceToNext;
    this.player.level += 1;
    this.player.experienceToNext =
      this.content.progression.experiencePerLevel[this.player.level - 1] ??
      this.content.progression.fallbackExperienceToNext;
    this.upgradeChoices = selectWeightedUpgrades(
      this.content.upgrades,
      this.player.selectedUpgrades,
      this.content.progression.upgradeChoiceCount,
      this.upgradeRandom,
    );
    this.addEvent('level-up', `Niveau ${this.player.level} atteint.`, {
      position: this.player.position,
    });
  }

  private handleUpgradeSelection(input: PlayerInput): void {
    if (input.selectUpgradeId === undefined || this.upgradeChoices.length === 0) {
      return;
    }
    const upgrade = this.upgradeChoices.find((choice) => choice.id === input.selectUpgradeId);
    if (upgrade === undefined) {
      return;
    }
    this.applyUpgrade(upgrade);
    this.player.selectedUpgrades.push(upgrade.id);
    this.upgradeChoices = [];
    this.addEvent('upgrade-selected', upgrade.name, { position: this.player.position });
  }

  private applyUpgrade(upgrade: UpgradeDefinition): void {
    switch (upgrade.effect) {
      case 'sword-damage':
        this.player.swordAutoDamage *= upgrade.value;
        break;
      case 'sword-speed':
        this.player.swordAutoCooldownMs *= upgrade.value;
        break;
      case 'sword-range':
        this.player.swordAutoRange += upgrade.value;
        break;
      case 'lunge-cooldown':
        this.player.swordCooldownMs *= upgrade.value;
        break;
      case 'ward-capacity':
        this.player.maxWard += upgrade.value;
        this.player.ward += upgrade.value;
        break;
      case 'barrier-duration':
        this.player.barrierDurationMs += upgrade.value;
        break;
    }
  }

  private updatePhase(deltaMs: number): void {
    if (this.status !== 'running') {
      return;
    }
    this.phaseRemainingMs -= deltaMs;
    if (this.phaseRemainingMs > 0) {
      return;
    }
    if (this.phase === 'day') {
      this.beginNight();
    } else if (this.phase === 'night') {
      this.beginDay();
    } else {
      this.winGame();
    }
  }

  private beginNight(): void {
    this.phase = 'night';
    this.phaseRemainingMs = this.content.simulation.nightDurationMs;
    awakenAssailants(this.enemies);
    this.spawnInstructions(nightSpawnInstructions(this.content, this.cycle), true);
    this.addEvent('phase-changed', `Nuit ${this.cycle} : défendez le village.`);
  }

  private beginDay(): void {
    this.phase = 'day';
    this.cycle += 1;
    this.phaseRemainingMs = this.content.simulation.dayDurationMs;
    restSurvivingAssailants(this.enemies);
    this.spawnInstructions(dayReinforcementInstructions(this.content, this.cycle), false);
    this.addEvent('phase-changed', `Jour ${this.cycle} : explorez et préparez-vous.`);
  }

  private beginFinalWave(): void {
    this.phase = 'final';
    this.phaseRemainingMs = this.content.simulation.finalDurationMs;
    awakenAssailants(this.enemies);
    this.spawnInstructions(finalSpawnInstructions(this.content), true);
    this.addEvent('phase-changed', 'Activation finale : tenez bon !');
  }

  private spawnInstructions(instructions: readonly SpawnInstruction[], awake: boolean): void {
    for (const instruction of instructions) {
      for (let index = 0; index < instruction.count; index += 1) {
        const position = this.randomRingPosition(
          instruction.ring.minimumRadius,
          instruction.ring.maximumRadius,
        );
        this.createEnemy(instruction.kind, position, position, awake);
      }
    }
  }

  private checkDefeat(): void {
    if (this.status !== 'running') {
      return;
    }
    if (this.player.hp <= 0) {
      this.status = 'defeat';
      this.resultReason = 'Le personnage est tombé.';
      this.addEvent('defeat', this.resultReason);
    } else if (this.village.hp <= 0) {
      this.status = 'defeat';
      this.resultReason = 'Le Cœur du village a été détruit.';
      this.addEvent('defeat', this.resultReason);
    }
  }

  private winGame(): void {
    if (this.status === 'running' && this.village.hp > 0) {
      this.status = 'victory';
      this.resultReason = 'Le Cœur est éveillé et le village a survécu.';
      this.addEvent('victory', this.resultReason);
    }
  }

  private hasOperationalDefense(): boolean {
    return this.defenses.some((defense) => defense.built);
  }

  private isGuardianAlive(guardianId: string): boolean {
    return this.enemies.some((enemy) => enemy.id === guardianId && enemy.hp > 0);
  }

  private isPlayerInsideVillage(): boolean {
    return distance(this.player.position, this.village.position) <= this.content.village.areaRadius;
  }

  private findNearbyResource(): MutableResource | undefined {
    return this.resources.find(
      (resource) =>
        resource.amountRemaining > 0 &&
        distance(resource.position, this.player.position) <= this.content.player.interactionRange,
    );
  }

  private getInteractionHint(): string | undefined {
    if (this.status !== 'running') {
      return undefined;
    }
    const resource = this.findNearbyResource();
    if (resource !== undefined) {
      if (this.isGuardianAlive(resource.guardianId)) {
        return 'Éliminez le gardien pour accéder au gisement.';
      }
      if (this.player.carriedWood >= this.player.carryCapacity) {
        return 'Votre sac est plein. Rapportez le bois au village.';
      }
      return `E — Collecter du bois (${resource.amountRemaining} restant)`;
    }
    if (this.player.carriedWood > 0 && this.isPlayerInsideVillage()) {
      return `E — Déposer ${this.player.carriedWood} bois dans votre stock`;
    }
    const activeConstruction = this.defenses.find(
      (defense) => defense.id === this.activeConstructionId,
    );
    if (activeConstruction !== undefined) {
      return `Fabrication en cours — ${(activeConstruction.buildRemainingMs / 1_000).toFixed(1)} s · tout dégât interrompt`;
    }
    const nearbyDefense = findNearestDefense(
      this.defenses,
      this.player.position,
      this.content.player.interactionRange,
      true,
    );
    if (nearbyDefense !== undefined) {
      if (nearbyDefense.hp < nearbyDefense.maxHp) {
        return `E — Réparer la baliste (${this.content.defense.repairCost} bois)`;
      }
      return 'La baliste est opérationnelle.';
    }
    if (
      distance(this.player.position, this.village.position) <= this.content.player.interactionRange
    ) {
      if (this.village.heartLevel === 1) {
        return `E — Éveiller le Foyer (${this.content.village.levelTwoCost} bois)`;
      }
      if (this.village.heartLevel === 2) {
        if (!this.hasOperationalDefense()) {
          return "Fabriquez d'abord une baliste avec B.";
        }
        if (this.player.level < this.content.village.ultimateMinimumPlayerLevel) {
          return `Atteignez d'abord le niveau ${this.content.village.ultimateMinimumPlayerLevel}.`;
        }
        return `E — Lancer l'activation finale (${this.content.village.ultimateCost} bois)`;
      }
      return 'Le Cœur est en cours d’activation.';
    }
    if (this.isPlayerInsideVillage()) {
      if (!canPlaceDefenseAt(this.player.position, this.village, this.defenses, this.content)) {
        return 'B — Éloignez-vous du Cœur et des autres balistes.';
      }
      return this.player.storedWood >= this.content.defense.buildCost
        ? `B — Fabriquer une baliste ici (${this.content.defense.buildCost} bois · ${this.content.defense.buildDurationMs / 1_000} s)`
        : `B — Baliste : ${this.content.defense.buildCost} bois nécessaires`;
    }
    return undefined;
  }

  private getObjective(): string {
    if (this.status === 'victory') {
      return 'Victoire — le village a survécu.';
    }
    if (this.status === 'defeat') {
      return 'Défaite — recommencez avec une nouvelle stratégie.';
    }
    if (this.phase === 'final') {
      return "Protégez le Cœur jusqu'à la fin de l'activation.";
    }
    if (this.player.carriedWood > 0) {
      return 'Rapportez votre bois au Cœur du village.';
    }
    if (!this.hasOperationalDefense()) {
      return `Explorez, stockez ${this.content.defense.buildCost} bois et fabriquez une baliste avec B.`;
    }
    if (this.village.heartLevel === 1) {
      return `Rapportez ${this.content.village.levelTwoCost} bois pour éveiller le Foyer.`;
    }
    if (this.player.level < this.content.village.ultimateMinimumPlayerLevel) {
      return `Combattez pour atteindre le niveau ${this.content.village.ultimateMinimumPlayerLevel}.`;
    }
    if (this.player.storedWood < this.content.village.ultimateCost) {
      return `Réunissez ${this.content.village.ultimateCost} bois dans votre stock.`;
    }
    return "Retournez au Cœur et lancez l'activation finale.";
  }

  private addEvent(
    type: GameEventType,
    message: string,
    details: Readonly<{ position?: Vector2; origin?: Vector2; amount?: number }> = {},
  ): void {
    this.eventCounter += 1;
    this.events.push({
      id: this.eventCounter,
      tick: this.tick,
      type,
      message,
      ...(details.position === undefined ? {} : { position: { ...details.position } }),
      ...(details.origin === undefined ? {} : { origin: { ...details.origin } }),
      ...(details.amount === undefined ? {} : { amount: details.amount }),
    });
  }
}
