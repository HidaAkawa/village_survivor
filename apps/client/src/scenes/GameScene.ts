import Phaser from 'phaser';

import type { PlayerInput, PublicGameState, Vector2 } from '@village-survivor/protocol';

import type { LocalSession } from '../session/LocalSession.js';

interface ControlKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  build: Phaser.Input.Keyboard.Key;
  sword: Phaser.Input.Keyboard.Key;
  barrier: Phaser.Input.Keyboard.Key;
}

const COLORS = {
  groundDay: 0xe9ede5,
  groundNight: 0x111725,
  groundFinal: 0x2a1722,
  gridDay: 0xc5cec5,
  gridDark: 0x29413e,
  village: 0xf4c76f,
  villageCore: 0xffe9a6,
  player: 0x72ddf7,
  ward: 0x82aaff,
  resource: 0x75c96b,
  resourceEmpty: 0x415348,
  guardian: 0xf28f3b,
  sleeper: 0x8f78c9,
  raider: 0xe85d75,
  brute: 0xb23a48,
  defense: 0xe8d8a8,
};

function enemyColor(kind: PublicGameState['enemies'][number]['kind']): number {
  switch (kind) {
    case 'guardian':
      return COLORS.guardian;
    case 'sleeper':
      return COLORS.sleeper;
    case 'raider':
      return COLORS.raider;
    case 'brute':
      return COLORS.brute;
  }
}

export class GameScene extends Phaser.Scene {
  private readonly session: LocalSession;
  private graphics!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private keys!: ControlKeys;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private state: PublicGameState | undefined;
  private unsubscribe: (() => void) | undefined;
  private sequence = 0;
  private pendingUpgradeId: string | undefined;
  private pendingInteraction = false;
  private pendingBuild = false;
  private pendingSword = false;
  private pendingBarrier = false;
  private lastRenderedEventId = 0;

  public constructor(session: LocalSession) {
    super({ key: 'GameScene' });
    this.session = session;
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.cameras.main.setRoundPixels(true);
    this.input.mouse?.disableContextMenu();
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('Le clavier est requis pour le M1.');
    }
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.Z,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.Q,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      build: Phaser.Input.Keyboard.KeyCodes.B,
      sword: Phaser.Input.Keyboard.KeyCodes.SPACE,
      barrier: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    }) as unknown as ControlKeys;
    this.cursors = keyboard.createCursorKeys();
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.code === 'KeyE') {
        this.pendingInteraction = true;
      } else if (event.code === 'KeyB') {
        this.pendingBuild = true;
      } else if (event.code === 'Space') {
        this.pendingSword = true;
      } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        this.pendingBarrier = true;
      }
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.pendingSword = true;
      } else if (pointer.button === 2) {
        this.pendingBarrier = true;
      }
    });
    this.unsubscribe = this.session.subscribe((state) => {
      this.consumeEvents(state);
      this.state = state;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  public override update(): void {
    const state = this.state;
    if (state === undefined) {
      return;
    }
    this.sendControls(state);
    this.renderWorld(state);
    this.renderMinimap(state);
  }

  public selectUpgrade(upgradeId: string): void {
    this.pendingUpgradeId = upgradeId;
  }

  private sendControls(state: PublicGameState): void {
    const left = this.keys.left.isDown || this.keys.a.isDown || this.cursors.left.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown || this.cursors.right.isDown;
    const up = this.keys.up.isDown || this.keys.w.isDown || this.cursors.up.isDown;
    const down = this.keys.down.isDown || this.keys.s.isDown || this.cursors.down.isDown;
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const pointerWorld = this.input.activePointer.positionToCamera(this.cameras.main) as Vector2;
    const aim = {
      x: pointerWorld.x - halfWidth - state.player.position.x,
      y: pointerWorld.y - halfHeight - state.player.position.y,
    };
    this.sequence += 1;
    const pendingUpgrade = this.pendingUpgradeId;
    const input: PlayerInput = {
      sequence: this.sequence,
      moveX: Number(right) - Number(left),
      moveY: Number(down) - Number(up),
      aimX: aim.x,
      aimY: aim.y,
      interact: this.pendingInteraction,
      buildDefense: this.pendingBuild,
      activateSword: this.pendingSword,
      activateBarrier: this.pendingBarrier,
      ...(pendingUpgrade === undefined ? {} : { selectUpgradeId: pendingUpgrade }),
    };
    this.pendingUpgradeId = undefined;
    this.pendingInteraction = false;
    this.pendingBuild = false;
    this.pendingSword = false;
    this.pendingBarrier = false;
    this.session.sendInput(input);
  }

  private renderWorld(state: PublicGameState): void {
    const graphics = this.graphics;
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const toWorld = (position: Vector2): Vector2 => ({
      x: position.x + halfWidth,
      y: position.y + halfHeight,
    });
    const backgroundColor =
      state.phase === 'day'
        ? COLORS.groundDay
        : state.phase === 'night'
          ? COLORS.groundNight
          : COLORS.groundFinal;
    graphics.clear();
    graphics.fillStyle(backgroundColor, 1);
    graphics.fillRect(0, 0, state.world.width, state.world.height);
    graphics.lineStyle(
      1,
      state.phase === 'day' ? COLORS.gridDay : COLORS.gridDark,
      state.phase === 'day' ? 0.8 : 0.28,
    );
    for (let x = 0; x <= state.world.width; x += 100) {
      graphics.lineBetween(x, 0, x, state.world.height);
    }
    for (let y = 0; y <= state.world.height; y += 100) {
      graphics.lineBetween(0, y, state.world.width, y);
    }
    const villagePosition = toWorld(state.village.position);
    const playerInsideVillage =
      Math.hypot(
        state.player.position.x - state.village.position.x,
        state.player.position.y - state.village.position.y,
      ) <= state.village.areaRadius;
    graphics.fillStyle(COLORS.village, playerInsideVillage ? 0.1 : 0.055);
    graphics.fillCircle(villagePosition.x, villagePosition.y, state.village.areaRadius);
    graphics.lineStyle(3, COLORS.village, playerInsideVillage ? 0.85 : 0.48);
    graphics.strokeCircle(villagePosition.x, villagePosition.y, state.village.areaRadius);
    graphics.lineStyle(2, COLORS.village, 0.14);
    for (const radius of [300, 600, 900]) {
      graphics.strokeCircle(villagePosition.x, villagePosition.y, radius);
    }

    for (const resource of state.resources) {
      const position = toWorld(resource.position);
      graphics.fillStyle(resource.amountRemaining > 0 ? COLORS.resource : COLORS.resourceEmpty, 1);
      graphics.fillRoundedRect(position.x - 20, position.y - 20, 40, 40, 8);
      graphics.lineStyle(2, state.phase === 'day' ? 0x315b37 : 0xdff0d8, 0.65);
      graphics.strokeRoundedRect(position.x - 20, position.y - 20, 40, 40, 8);
    }

    for (const defense of state.defenses) {
      const defensePosition = toWorld(defense.position);
      if (defense.built) {
        graphics.fillStyle(COLORS.defense, 0.025);
        graphics.fillCircle(defensePosition.x, defensePosition.y, defense.range);
        graphics.lineStyle(2, COLORS.defense, 0.22);
        graphics.strokeCircle(defensePosition.x, defensePosition.y, defense.range);
        graphics.fillStyle(COLORS.defense, 1);
        graphics.fillTriangle(
          defensePosition.x - 22,
          defensePosition.y + 18,
          defensePosition.x + 22,
          defensePosition.y + 18,
          defensePosition.x,
          defensePosition.y - 24,
        );
        this.drawHealthBar(
          graphics,
          defensePosition.x - 24,
          defensePosition.y - 34,
          48,
          defense.hp / defense.maxHp,
          0xe8d8a8,
        );
      } else {
        const progress = 1 - defense.buildRemainingMs / defense.buildDurationMs;
        graphics.fillStyle(COLORS.defense, 0.12 + progress * 0.24);
        graphics.fillCircle(defensePosition.x, defensePosition.y, 27);
        graphics.lineStyle(4, COLORS.defense, 0.8);
        graphics.beginPath();
        graphics.arc(
          defensePosition.x,
          defensePosition.y,
          33,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * progress,
        );
        graphics.strokePath();
        graphics.lineStyle(3, COLORS.defense, 0.65);
        graphics.lineBetween(
          defensePosition.x - 18,
          defensePosition.y,
          defensePosition.x + 18,
          defensePosition.y,
        );
      }
    }

    graphics.fillStyle(COLORS.village, state.village.underAttack ? 0.75 : 1);
    graphics.fillCircle(villagePosition.x, villagePosition.y, 50 + state.village.heartLevel * 5);
    graphics.fillStyle(COLORS.villageCore, 1);
    graphics.fillCircle(villagePosition.x, villagePosition.y, 18 + state.village.heartLevel * 3);
    this.drawHealthBar(
      graphics,
      villagePosition.x - 55,
      villagePosition.y - 72,
      110,
      state.village.hp / state.village.maxHp,
      0xf4c76f,
    );

    for (const enemy of state.enemies) {
      const position = toWorld(enemy.position);
      const radius = enemy.kind === 'brute' ? 27 : enemy.kind === 'guardian' ? 21 : 17;
      graphics.fillStyle(enemyColor(enemy.kind), enemy.awake ? 1 : 0.5);
      if (enemy.kind === 'brute') {
        graphics.fillRoundedRect(
          position.x - radius,
          position.y - radius,
          radius * 2,
          radius * 2,
          8,
        );
      } else {
        graphics.fillCircle(position.x, position.y, radius);
      }
      if (!enemy.awake) {
        graphics.lineStyle(2, state.phase === 'day' ? 0x4d4168 : 0xf4ecff, 0.55);
        graphics.strokeCircle(position.x, position.y, radius + 5);
      }
      this.drawHealthBar(
        graphics,
        position.x - 22,
        position.y - radius - 12,
        44,
        enemy.hp / enemy.maxHp,
        enemyColor(enemy.kind),
      );
    }

    const playerPosition = toWorld(state.player.position);
    if (state.player.barrier.activeRemainingMs > 0) {
      graphics.fillStyle(COLORS.ward, 0.1);
      graphics.fillCircle(playerPosition.x, playerPosition.y, 175);
      graphics.lineStyle(3, COLORS.ward, 0.75);
      graphics.strokeCircle(playerPosition.x, playerPosition.y, 175);
    }
    if (state.player.ward > 0) {
      graphics.lineStyle(3, COLORS.ward, 0.8);
      graphics.strokeCircle(playerPosition.x, playerPosition.y, 23);
    }
    graphics.fillStyle(COLORS.player, 1);
    graphics.fillCircle(playerPosition.x, playerPosition.y, 16);
    graphics.lineStyle(2, state.phase === 'day' ? 0x165a6d : 0xeafcff, 0.9);
    graphics.strokeCircle(playerPosition.x, playerPosition.y, 16);
    graphics.fillStyle(0xeafcff, 1);
    graphics.fillTriangle(
      playerPosition.x + 11,
      playerPosition.y,
      playerPosition.x - 3,
      playerPosition.y - 6,
      playerPosition.x - 3,
      playerPosition.y + 6,
    );

    this.cameras.main.setBounds(0, 0, state.world.width, state.world.height);
    this.cameras.main.centerOn(playerPosition.x, playerPosition.y);
  }

  private renderMinimap(state: PublicGameState): void {
    const graphics = this.minimap;
    const width = 166;
    const height = 166;
    const x = this.scale.width - width - 22;
    const y = 88;
    const scaleX = width / state.world.width;
    const scaleY = height / state.world.height;
    const point = (position: Vector2): Vector2 => ({
      x: x + (position.x + state.world.width / 2) * scaleX,
      y: y + (position.y + state.world.height / 2) * scaleY,
    });
    graphics.clear();
    graphics.fillStyle(0x091013, 0.82);
    graphics.fillRoundedRect(x - 6, y - 6, width + 12, height + 12, 10);
    graphics.lineStyle(1, 0xffffff, 0.18);
    graphics.strokeRect(x, y, width, height);
    for (const resource of state.resources) {
      if (resource.amountRemaining > 0) {
        const resourcePoint = point(resource.position);
        graphics.fillStyle(COLORS.resource, 0.9);
        graphics.fillRect(resourcePoint.x - 2, resourcePoint.y - 2, 4, 4);
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.awake) {
        const enemyPoint = point(enemy.position);
        graphics.fillStyle(enemyColor(enemy.kind), 0.85);
        graphics.fillCircle(enemyPoint.x, enemyPoint.y, enemy.kind === 'brute' ? 3 : 2);
      }
    }
    for (const defense of state.defenses) {
      const defensePoint = point(defense.position);
      graphics.fillStyle(COLORS.defense, defense.built ? 1 : 0.45);
      graphics.fillRect(defensePoint.x - 2, defensePoint.y - 2, 4, 4);
    }
    const villagePoint = point(state.village.position);
    graphics.fillStyle(COLORS.village, 1);
    graphics.fillCircle(villagePoint.x, villagePoint.y, 4);
    const playerPoint = point(state.player.position);
    graphics.fillStyle(COLORS.player, 1);
    graphics.fillCircle(playerPoint.x, playerPoint.y, 3);
  }

  private drawHealthBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
  ): void {
    graphics.fillStyle(0x070b0c, 0.8);
    graphics.fillRoundedRect(x, y, width, 5, 2);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(x, y, Math.max(0, width * ratio), 5, 2);
  }

  private consumeEvents(state: PublicGameState): void {
    for (const event of state.events) {
      if (event.id <= this.lastRenderedEventId || event.position === undefined) {
        continue;
      }
      this.lastRenderedEventId = event.id;
      if (event.type === 'defense-fired' && event.origin !== undefined) {
        this.renderDefenseShot(state, event.origin, event.position);
        continue;
      }
      if (event.type === 'sword-auto-attack' && event.origin !== undefined) {
        this.renderSwordSlash(state, event.origin, event.position);
        continue;
      }
      if (
        event.type !== 'enemy-hit' &&
        event.type !== 'resource-collected' &&
        event.type !== 'defense-built' &&
        event.type !== 'defense-construction-interrupted'
      ) {
        continue;
      }
      const color =
        event.type === 'enemy-hit'
          ? '#ffe7a0'
          : event.type === 'defense-construction-interrupted'
            ? '#ff8fa3'
            : '#b8f4a5';
      const label =
        event.type === 'enemy-hit'
          ? `-${Math.ceil(event.amount ?? 0)}`
          : event.type === 'resource-collected'
            ? `+${event.amount ?? 0}`
            : event.type === 'defense-built'
              ? 'BALISTE PRÊTE'
              : 'FABRICATION INTERROMPUE';
      const text = this.add
        .text(
          event.position.x + state.world.width / 2,
          event.position.y + state.world.height / 2 - 22,
          label,
          {
            color,
            fontFamily: 'system-ui, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            stroke: '#11181b',
            strokeThickness: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(50);
      this.tweens.add({
        targets: text,
        y: text.y - 34,
        alpha: 0,
        duration: 650,
        ease: 'Cubic.easeOut',
        onComplete: () => text.destroy(),
      });
    }
  }

  private renderDefenseShot(state: PublicGameState, origin: Vector2, target: Vector2): void {
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const originX = origin.x + halfWidth;
    const originY = origin.y + halfHeight;
    const targetX = target.x + halfWidth;
    const targetY = target.y + halfHeight;
    const distance = Math.hypot(targetX - originX, targetY - originY);
    const bolt = this.add.graphics().setDepth(45);
    bolt.lineStyle(3, 0x704b2c, 1);
    bolt.lineBetween(-13, 0, 7, 0);
    bolt.fillStyle(COLORS.defense, 1);
    bolt.fillTriangle(13, 0, 5, -4, 5, 4);
    bolt.setPosition(originX, originY);
    bolt.setRotation(Math.atan2(targetY - originY, targetX - originX));
    this.tweens.add({
      targets: bolt,
      x: targetX,
      y: targetY,
      duration: Math.max(130, Math.min(260, distance * 0.7)),
      ease: 'Linear',
      onComplete: () => bolt.destroy(),
    });
  }

  private renderSwordSlash(state: PublicGameState, origin: Vector2, target: Vector2): void {
    const halfWidth = state.world.width / 2;
    const halfHeight = state.world.height / 2;
    const originX = origin.x + halfWidth;
    const originY = origin.y + halfHeight;
    const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
    const slash = this.add.graphics().setDepth(46);
    slash.lineStyle(7, 0xfff2bd, 0.95);
    slash.beginPath();
    slash.arc(0, 0, 42, angle - 0.72, angle + 0.72, false);
    slash.strokePath();
    slash.lineStyle(2, 0xffffff, 0.9);
    slash.beginPath();
    slash.arc(0, 0, 36, angle - 0.62, angle + 0.62, false);
    slash.strokePath();
    slash.setPosition(originX, originY);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 190,
      ease: 'Quad.easeOut',
      onComplete: () => slash.destroy(),
    });
  }
}
