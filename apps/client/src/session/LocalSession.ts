import { defaultContent, type GameContent } from '@village-survivor/content';
import { GameSimulation } from '@village-survivor/game-core';
import type {
  EnemyKind,
  GameSession,
  PlayerInput,
  PublicGameState,
  Vector2,
} from '@village-survivor/protocol';

export interface FrameScheduler {
  now(): number;
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export interface LocalSessionOptions {
  seed?: string;
  content?: GameContent;
  scheduler?: FrameScheduler;
}

export interface VillageSurvivorDebug {
  getState(): PublicGameState;
  getMetrics(): Readonly<{
    lastTickDurationMs: number;
    gameSpeed: number;
    paused: boolean;
  }>;
  setGameSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  spawnEnemy(kind?: EnemyKind): string;
  damagePlayer(amount: number): void;
  giveExperience(amount: number): void;
  giveResources(amount: number): void;
  teleportPlayer(position: Vector2): void;
  defeatEnemy(enemyId: string): void;
  defeatAllAssailants(): void;
  skipToNight(): void;
  forceFinalWave(): void;
  advance(milliseconds: number): PublicGameState;
}

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

function idleInput(sequence = 0): PlayerInput {
  return { sequence, moveX: 0, moveY: 0 };
}

function persistentInput(input: PlayerInput): PlayerInput {
  return {
    sequence: input.sequence,
    moveX: input.moveX,
    moveY: input.moveY,
    ...(input.aimX === undefined ? {} : { aimX: input.aimX }),
    ...(input.aimY === undefined ? {} : { aimY: input.aimY }),
  };
}

export class LocalSession implements GameSession {
  private readonly content: GameContent;
  private readonly simulation: GameSimulation;
  private readonly scheduler: FrameScheduler;
  private readonly listeners = new Set<(state: PublicGameState) => void>();
  private currentInput: PlayerInput = idleInput();
  private running = false;
  private paused = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private gameSpeed = 1;
  private lastTickDurationMs = 0;

  public readonly debug: VillageSurvivorDebug;

  public constructor(options: LocalSessionOptions = {}) {
    this.content = options.content ?? defaultContent;
    this.scheduler = options.scheduler ?? browserScheduler;
    this.simulation = new GameSimulation(this.content, options.seed ?? 'm1-default');
    this.debug = {
      getState: () => this.simulation.createSnapshot(),
      getMetrics: () => ({
        lastTickDurationMs: this.lastTickDurationMs,
        gameSpeed: this.gameSpeed,
        paused: this.paused,
      }),
      setGameSpeed: (multiplier) => {
        this.gameSpeed = Math.max(0.1, Math.min(30, multiplier));
      },
      pause: () => {
        this.paused = true;
      },
      resume: () => {
        this.paused = false;
        this.lastTimestamp = this.scheduler.now();
      },
      spawnEnemy: (kind = 'raider') => {
        const id = this.simulation.spawnEnemy(kind);
        this.publish();
        return id;
      },
      damagePlayer: (amount) => {
        this.simulation.damagePlayer(amount);
        this.publish();
      },
      giveExperience: (amount) => {
        this.simulation.giveExperience(amount);
        this.publish();
      },
      giveResources: (amount) => {
        this.simulation.giveResources(amount);
        this.publish();
      },
      teleportPlayer: (position) => {
        this.simulation.teleportPlayer(position);
        this.publish();
      },
      defeatEnemy: (enemyId) => {
        this.simulation.defeatEnemy(enemyId);
        this.publish();
      },
      defeatAllAssailants: () => {
        this.simulation.defeatAllAssailants();
        this.publish();
      },
      skipToNight: () => {
        this.simulation.skipToNight();
        this.publish();
      },
      forceFinalWave: () => {
        this.simulation.forceFinalWave();
        this.publish();
      },
      advance: (milliseconds) => this.advance(milliseconds),
    };
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.paused = false;
    this.simulation.start();
    this.lastTimestamp = this.scheduler.now();
    this.publish();
    this.frameHandle = this.scheduler.request(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      this.scheduler.cancel(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
  }

  public sendInput(input: PlayerInput): void {
    const queuedUpgrade = input.selectUpgradeId ?? this.currentInput.selectUpgradeId;
    this.currentInput = {
      sequence: input.sequence,
      moveX: input.moveX,
      moveY: input.moveY,
      ...(input.aimX === undefined ? {} : { aimX: input.aimX }),
      ...(input.aimY === undefined ? {} : { aimY: input.aimY }),
      ...(input.interact === true || this.currentInput.interact === true ? { interact: true } : {}),
      ...(input.buildDefense === true || this.currentInput.buildDefense === true
        ? { buildDefense: true }
        : {}),
      ...(input.activateSword === true || this.currentInput.activateSword === true
        ? { activateSword: true }
        : {}),
      ...(input.activateBarrier === true || this.currentInput.activateBarrier === true
        ? { activateBarrier: true }
        : {}),
      ...(queuedUpgrade === undefined ? {} : { selectUpgradeId: queuedUpgrade }),
    };
  }

  public subscribe(listener: (state: PublicGameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.simulation.createSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const rawDeltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    if (!this.paused) {
      this.accumulatorMs += rawDeltaMs * this.gameSpeed;
      let processedTicks = 0;
      while (this.accumulatorMs >= this.content.simulation.tickMs && processedTicks < 240) {
        const tickStartedAt = performance.now();
        this.simulation.step(this.currentInput);
        this.lastTickDurationMs = performance.now() - tickStartedAt;
        this.currentInput = persistentInput(this.currentInput);
        this.accumulatorMs -= this.content.simulation.tickMs;
        processedTicks += 1;
      }
      if (processedTicks > 0) {
        this.publish();
      }
    }
    this.frameHandle = this.scheduler.request(this.onFrame);
  };

  private advance(milliseconds: number): PublicGameState {
    const ticks = Math.max(0, Math.floor(milliseconds / this.content.simulation.tickMs));
    for (let index = 0; index < ticks; index += 1) {
      const tickStartedAt = performance.now();
      this.simulation.step(this.currentInput);
      this.lastTickDurationMs = performance.now() - tickStartedAt;
      this.currentInput = persistentInput(this.currentInput);
    }
    return this.publish();
  }

  private publish(): PublicGameState {
    const state = this.simulation.createSnapshot();
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }
}
