import type { GameContent, UpgradeDefinition } from '@village-survivor/content';
import type {
  EnemyKind,
  EnemyState,
  GameEvent,
  GameEventType,
  GamePhase,
  GameStatus,
  PlayerInput,
  PublicGameState,
  UpgradeChoice,
  Vector2,
} from '@village-survivor/protocol';

import {
  clampPosition,
  distance,
  distanceSquared,
  distanceToSegment,
  moveTowards,
  normalized,
} from './geometry.js';
import { SeededRandom } from './random.js';

interface MutableEnemy {
  id: string;
  kind: EnemyKind;
  position: Vector2;
  home: Vector2;
  hp: number;
  maxHp: number;
  awake: boolean;
  attackCooldownRemainingMs: number;
}

interface MutableResource {
  id: string;
  position: Vector2;
  amountRemaining: number;
  guardianId: string;
}

interface MutablePlayer {
  position: Vector2;
  hp: number;
  maxHp: number;
  ward: number;
  maxWard: number;
  wardRefreshRemainingMs: number;
  moveSpeed: number;
  carriedWood: number;
  storedWood: number;
  carryCapacity: number;
  experience: number;
  experienceToNext: number;
  level: number;
  swordAutoDamage: number;
  swordAutoRange: number;
  swordAutoCooldownMs: number;
  swordAutoCooldownRemainingMs: number;
  swordCooldownMs: number;
  swordCooldownRemainingMs: number;
  barrierCooldownMs: number;
  barrierCooldownRemainingMs: number;
  barrierDurationMs: number;
  barrierActiveRemainingMs: number;
  selectedUpgrades: string[];
  lastAim: Vector2;
}

interface MutableVillage {
  position: Vector2;
  hp: number;
  maxHp: number;
  heartLevel: 1 | 2 | 3;
  underAttack: boolean;
}

interface MutableDefense {
  position: Vector2;
  built: boolean;
  hp: number;
  maxHp: number;
  cooldownRemainingMs: number;
}

const VILLAGE_POSITION: Vector2 = { x: 0, y: 0 };
const DEFENSE_POSITION: Vector2 = { x: 165, y: 0 };
const ENEMY_RADIUS = 18;
const PLAYER_AGGRO_RANGE = 165;

export class GameSimulation {
  private readonly random: SeededRandom;
  private readonly seed: string;
  private readonly content: GameContent;
  private readonly resources: MutableResource[] = [];
  private readonly enemies: MutableEnemy[] = [];
  private readonly player: MutablePlayer;
  private readonly village: MutableVillage;
  private readonly defense: MutableDefense;
  private status: GameStatus = 'ready';
  private resultReason: string | undefined;
  private phase: GamePhase = 'day';
  private cycle = 1;
  private phaseRemainingMs: number;
  private tick = 0;
  private elapsedMs = 0;
  private enemyCounter = 0;
  private eventCounter = 0;
  private events: GameEvent[] = [];
  private upgradeChoices: UpgradeDefinition[] = [];

  public constructor(content: GameContent, seed: string) {
    this.content = content;
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.phaseRemainingMs = content.simulation.dayDurationMs;
    this.player = {
      position: { x: 0, y: 120 },
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
      experienceToNext: content.progression.experiencePerLevel[0] ?? 999,
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
    this.defense = {
      position: DEFENSE_POSITION,
      built: false,
      hp: content.defense.maxHp,
      maxHp: content.defense.maxHp,
      cooldownRemainingMs: 0,
    };
    this.generateWorld();
  }

  public start(): void {
    if (this.status === 'ready') {
      this.status = 'running';
    }
  }

  public step(input: PlayerInput): PublicGameState {
    this.events = [];
    if (this.status !== 'running') {
      return this.getState();
    }

    const deltaMs = this.content.simulation.tickMs;
    const deltaSeconds = deltaMs / 1_000;
    this.tick += 1;
    this.elapsedMs += deltaMs;
    this.village.underAttack = false;

    this.updateCooldowns(deltaMs);
    this.updatePlayerMovement(input, deltaSeconds);
    this.useAbilities(input);
    this.updateAutomaticSword();
    this.updateDefense();
    this.updateEnemies(deltaMs, deltaSeconds);
    this.removeDefeatedEnemies();
    this.updateVillageSupport(deltaSeconds);
    this.handleInteraction(input);
    this.handleUpgradeSelection(input);
    this.updatePhase(deltaMs);
    this.checkDefeat();
    return this.getState();
  }

  public getState(): PublicGameState {
    const result = this.resultReason === undefined ? {} : { resultReason: this.resultReason };
    const interactionHint = this.getInteractionHint();
    const hint = interactionHint === undefined ? {} : { interactionHint };
    return {
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      status: this.status,
      ...result,
      seed: this.seed,
      world: {
        width: this.content.world.width,
        height: this.content.world.height,
      },
      phase: this.phase,
      cycle: this.cycle,
      phaseRemainingMs: Math.max(0, this.phaseRemainingMs),
      player: {
        id: 'player-1',
        position: { ...this.player.position },
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        ward: this.player.ward,
        maxWard: this.player.maxWard,
        moveSpeed: this.player.moveSpeed,
        carriedWood: this.player.carriedWood,
        storedWood: this.player.storedWood,
        carryCapacity: this.player.carryCapacity,
        experience: this.player.experience,
        experienceToNext: this.player.experienceToNext,
        level: this.player.level,
        swordAutoDamage: this.player.swordAutoDamage,
        swordAutoRange: this.player.swordAutoRange,
        swordAutoCooldownMs: this.player.swordAutoCooldownMs,
        swordAutoCooldownRemainingMs: this.player.swordAutoCooldownRemainingMs,
        sword: {
          cooldownMs: this.player.swordCooldownMs,
          cooldownRemainingMs: this.player.swordCooldownRemainingMs,
        },
        barrier: {
          cooldownMs: this.player.barrierCooldownMs,
          cooldownRemainingMs: this.player.barrierCooldownRemainingMs,
          activeRemainingMs: this.player.barrierActiveRemainingMs,
        },
        selectedUpgrades: [...this.player.selectedUpgrades],
      },
      village: {
        position: { ...this.village.position },
        areaRadius: this.content.village.areaRadius,
        hp: this.village.hp,
        maxHp: this.village.maxHp,
        heartLevel: this.village.heartLevel,
        underAttack: this.village.underAttack,
      },
      defense: {
        position: { ...this.defense.position },
        built: this.defense.built,
        hp: this.defense.hp,
        maxHp: this.defense.maxHp,
        range: this.content.defense.range,
        cooldownRemainingMs: this.defense.cooldownRemainingMs,
      },
      resources: this.resources.map((resource) => ({
        id: resource.id,
        position: { ...resource.position },
        amountRemaining: resource.amountRemaining,
        guardianId: resource.guardianId,
      })),
      enemies: this.enemies.map((enemy): EnemyState => ({
        id: enemy.id,
        kind: enemy.kind,
        position: { ...enemy.position },
        home: { ...enemy.home },
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        awake: enemy.awake,
        attackCooldownRemainingMs: enemy.attackCooldownRemainingMs,
      })),
      upgradeChoices: this.upgradeChoices.map((upgrade): UpgradeChoice => ({
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        discipline: upgrade.discipline,
      })),
      ...hint,
      objective: this.getObjective(),
      events: this.events.map((event) => ({ ...event })),
    };
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
    const spawnPosition = position ?? this.randomRingPosition(650, 900);
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
      const angle = baseAngle + this.random.between(-0.3, 0.3);
      const radius = 440 + index * 140;
      const position = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
      const guardianPosition = {
        x: position.x + Math.cos(angle + Math.PI / 2) * 58,
        y: position.y + Math.sin(angle + Math.PI / 2) * 58,
      };
      const guardianId = this.createEnemy('guardian', guardianPosition, guardianPosition, true);
      this.resources.push({
        id: `resource-${index + 1}`,
        position,
        amountRemaining: this.content.world.woodPerNode,
        guardianId,
      });
    }

    for (let index = 0; index < this.content.world.initialSleeperCount; index += 1) {
      const position = this.randomRingPosition(420, 960);
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
    this.defense.cooldownRemainingMs = Math.max(0, this.defense.cooldownRemainingMs - deltaMs);
    this.player.wardRefreshRemainingMs -= deltaMs;
    if (this.player.wardRefreshRemainingMs <= 0) {
      this.player.ward = this.player.maxWard;
      this.player.wardRefreshRemainingMs = this.content.barrier.wardRefreshMs;
    }
  }

  private updatePlayerMovement(input: PlayerInput, deltaSeconds: number): void {
    const movement = normalized({ x: input.moveX, y: input.moveY });
    const nextPosition = {
      x: this.player.position.x + movement.x * this.player.moveSpeed * deltaSeconds,
      y: this.player.position.y + movement.y * this.player.moveSpeed * deltaSeconds,
    };
    this.player.position = clampPosition(
      nextPosition,
      this.content.world.width,
      this.content.world.height,
    );
    if (input.aimX !== undefined && input.aimY !== undefined) {
      const aim = normalized({ x: input.aimX, y: input.aimY });
      if (aim.x !== 0 || aim.y !== 0) {
        this.player.lastAim = aim;
      }
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
          this.isEnemyTargetable(enemy) &&
          distanceToSegment(enemy.position, start, end) <= this.content.sword.lungeRadius
        ) {
          this.damageEnemy(enemy, this.content.sword.lungeDamage);
          this.wakeNearbyEnemies(enemy.position, 150);
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
    const target = this.findNearestEnemy(
      this.player.position,
      this.player.swordAutoRange,
      (enemy) => this.isEnemyTargetable(enemy),
    );
    if (target === undefined) {
      return;
    }
    this.addEvent('sword-auto-attack', 'Coup d’épée automatique.', {
      origin: this.player.position,
      position: target.position,
    });
    this.damageEnemy(target, this.player.swordAutoDamage);
    this.wakeNearbyEnemies(target.position, 140);
    this.player.swordAutoCooldownRemainingMs = this.player.swordAutoCooldownMs;
  }

  private updateDefense(): void {
    if (!this.defense.built || this.defense.cooldownRemainingMs > 0) {
      return;
    }
    const target = this.findNearestEnemy(
      this.defense.position,
      this.content.defense.range,
      (enemy) => enemy.awake && enemy.kind !== 'guardian',
    );
    if (target === undefined) {
      return;
    }
    this.addEvent('defense-fired', 'La baliste tire.', {
      origin: this.defense.position,
      position: target.position,
    });
    this.damageEnemy(target, this.content.defense.damage);
    this.defense.cooldownRemainingMs = this.content.defense.cooldownMs;
  }

  private updateEnemies(deltaMs: number, deltaSeconds: number): void {
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) {
        continue;
      }
      enemy.attackCooldownRemainingMs = Math.max(0, enemy.attackCooldownRemainingMs - deltaMs);
      if (enemy.kind === 'guardian') {
        this.updateGuardian(enemy, deltaSeconds);
      } else if (this.phase === 'day') {
        this.updateDayEnemy(enemy, deltaSeconds);
      } else {
        this.updateAssaultEnemy(enemy, deltaSeconds);
      }
    }
  }

  private updateGuardian(enemy: MutableEnemy, deltaSeconds: number): void {
    const playerDistance = distance(enemy.position, this.player.position);
    const homeDistance = distance(enemy.position, enemy.home);
    if (playerDistance <= PLAYER_AGGRO_RANGE || (enemy.awake && playerDistance <= 320)) {
      enemy.awake = true;
      this.moveOrAttackPlayer(enemy, deltaSeconds);
      return;
    }
    if (homeDistance > 4) {
      const definition = this.content.enemies.guardian;
      enemy.position = moveTowards(enemy.position, enemy.home, definition.speed * deltaSeconds);
    } else {
      enemy.awake = false;
    }
  }

  private updateDayEnemy(enemy: MutableEnemy, deltaSeconds: number): void {
    const playerDistance = distance(enemy.position, this.player.position);
    if (playerDistance <= 145 || (enemy.awake && playerDistance <= 340)) {
      enemy.awake = true;
      this.moveOrAttackPlayer(enemy, deltaSeconds);
      return;
    }
    if (distance(enemy.position, enemy.home) > 6) {
      const definition = this.content.enemies[enemy.kind];
      enemy.position = moveTowards(enemy.position, enemy.home, definition.speed * deltaSeconds);
    } else {
      enemy.awake = false;
    }
  }

  private updateAssaultEnemy(enemy: MutableEnemy, deltaSeconds: number): void {
    enemy.awake = true;
    if (distance(enemy.position, this.player.position) <= 115) {
      this.moveOrAttackPlayer(enemy, deltaSeconds);
      return;
    }

    if (this.defense.built && distance(enemy.position, this.defense.position) <= 205) {
      this.moveOrAttackDefense(enemy, deltaSeconds);
      return;
    }
    this.moveOrAttackVillage(enemy, deltaSeconds);
  }

  private moveOrAttackPlayer(enemy: MutableEnemy, deltaSeconds: number): void {
    const definition = this.content.enemies[enemy.kind];
    if (distance(enemy.position, this.player.position) <= definition.attackRange + ENEMY_RADIUS) {
      if (enemy.attackCooldownRemainingMs <= 0) {
        this.applyDamageToPlayer(definition.damage, enemy.position);
        enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
      }
      return;
    }
    enemy.position = moveTowards(
      enemy.position,
      this.player.position,
      definition.speed * deltaSeconds,
    );
  }

  private moveOrAttackDefense(enemy: MutableEnemy, deltaSeconds: number): void {
    const definition = this.content.enemies[enemy.kind];
    if (distance(enemy.position, this.defense.position) <= definition.attackRange + 24) {
      if (enemy.attackCooldownRemainingMs <= 0) {
        this.defense.hp = Math.max(0, this.defense.hp - definition.damage);
        enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
        if (this.defense.hp <= 0) {
          this.defense.built = false;
        }
      }
      return;
    }
    enemy.position = moveTowards(
      enemy.position,
      this.defense.position,
      definition.speed * deltaSeconds,
    );
  }

  private moveOrAttackVillage(enemy: MutableEnemy, deltaSeconds: number): void {
    const definition = this.content.enemies[enemy.kind];
    if (distance(enemy.position, this.village.position) <= definition.attackRange + 48) {
      if (enemy.attackCooldownRemainingMs <= 0) {
        let damage = definition.damage;
        if (
          this.player.barrierActiveRemainingMs > 0 &&
          distance(this.player.position, this.village.position) <= this.content.barrier.activeRadius
        ) {
          damage *= 1 - this.content.barrier.damageReduction;
        }
        this.village.hp = Math.max(0, this.village.hp - damage);
        this.village.underAttack = true;
        enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
        this.addEvent('village-hurt', `Le village subit ${Math.ceil(damage)} dégâts.`, {
          position: this.village.position,
          amount: damage,
        });
      }
      return;
    }
    enemy.position = moveTowards(
      enemy.position,
      this.village.position,
      definition.speed * deltaSeconds,
    );
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
      const multiplier = this.village.underAttack ? 0.25 : 1;
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
    if (
      distance(this.player.position, this.defense.position) <= this.content.player.interactionRange
    ) {
      this.buildOrRepairDefense();
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
    const amount = Math.min(4, resource.amountRemaining, freeCapacity);
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

  private buildOrRepairDefense(): void {
    if (!this.defense.built) {
      if (this.player.storedWood < this.content.defense.buildCost) {
        return;
      }
      this.player.storedWood -= this.content.defense.buildCost;
      this.defense.built = true;
      this.defense.hp = this.defense.maxHp;
      this.addEvent('defense-built', 'La baliste du village est opérationnelle.', {
        position: this.defense.position,
      });
      return;
    }
    if (this.defense.hp < this.defense.maxHp && this.player.storedWood >= 1) {
      this.player.storedWood -= 1;
      this.defense.hp = Math.min(this.defense.maxHp, this.defense.hp + 45);
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
      this.defense.built &&
      this.player.level >= 2 &&
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
      this.content.progression.experiencePerLevel[this.player.level - 1] ?? 999;
    this.upgradeChoices = this.content.upgrades
      .filter((upgrade) => !this.player.selectedUpgrades.includes(upgrade.id))
      .slice(0, 3);
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
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian') {
        enemy.awake = true;
      }
    }
    const raiderCount = 1 + this.cycle;
    for (let index = 0; index < raiderCount; index += 1) {
      const position = this.randomRingPosition(850, 1_020);
      this.createEnemy('raider', position, position, true);
    }
    this.addEvent('phase-changed', `Nuit ${this.cycle} : défendez le village.`);
  }

  private beginDay(): void {
    this.phase = 'day';
    this.cycle += 1;
    this.phaseRemainingMs = this.content.simulation.dayDurationMs;
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian') {
        enemy.kind = 'sleeper';
        enemy.awake = false;
        enemy.home = { ...enemy.position };
      }
    }
    const reinforcementCount = Math.min(4, this.cycle);
    for (let index = 0; index < reinforcementCount; index += 1) {
      const position = this.randomRingPosition(620, 980);
      this.createEnemy('sleeper', position, position, false);
    }
    this.addEvent('phase-changed', `Jour ${this.cycle} : explorez et préparez-vous.`);
  }

  private beginFinalWave(): void {
    this.phase = 'final';
    this.phaseRemainingMs = this.content.simulation.finalDurationMs;
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian') {
        enemy.awake = true;
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const position = this.randomRingPosition(860, 1_020);
      this.createEnemy('raider', position, position, true);
    }
    for (let index = 0; index < 2; index += 1) {
      const position = this.randomRingPosition(900, 1_040);
      this.createEnemy('brute', position, position, true);
    }
    this.addEvent('phase-changed', 'Activation finale : tenez bon !');
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

  private findNearestEnemy(
    origin: Vector2,
    maximumDistance: number,
    predicate: (enemy: MutableEnemy) => boolean,
  ): MutableEnemy | undefined {
    const maximumDistanceSquared = maximumDistance * maximumDistance;
    let nearest: MutableEnemy | undefined;
    let nearestDistance = maximumDistanceSquared;
    for (const enemy of this.enemies) {
      if (!predicate(enemy)) {
        continue;
      }
      const candidateDistance = distanceSquared(origin, enemy.position);
      if (candidateDistance <= nearestDistance) {
        nearest = enemy;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  private isEnemyTargetable(enemy: MutableEnemy): boolean {
    return enemy.hp > 0 && (enemy.awake || enemy.kind === 'guardian');
  }

  private wakeNearbyEnemies(position: Vector2, radius: number): void {
    const radiusSquared = radius * radius;
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian' && distanceSquared(position, enemy.position) <= radiusSquared) {
        enemy.awake = true;
      }
    }
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
    if (
      distance(this.player.position, this.defense.position) <= this.content.player.interactionRange
    ) {
      if (!this.defense.built) {
        return `E — Construire la baliste (${this.content.defense.buildCost} bois)`;
      }
      if (this.defense.hp < this.defense.maxHp) {
        return 'E — Réparer la baliste (1 bois)';
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
        if (!this.defense.built) {
          return "Construisez d'abord la baliste.";
        }
        if (this.player.level < 2) {
          return "Atteignez d'abord le niveau 2.";
        }
        return `E — Lancer l'activation finale (${this.content.village.ultimateCost} bois)`;
      }
      return 'Le Cœur est en cours d’activation.';
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
    if (!this.defense.built) {
      return 'Explorez, rapportez 4 bois et construisez la baliste.';
    }
    if (this.village.heartLevel === 1) {
      return 'Rapportez 5 bois pour éveiller le Foyer.';
    }
    if (this.player.level < 2) {
      return 'Combattez pour atteindre le niveau 2.';
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
