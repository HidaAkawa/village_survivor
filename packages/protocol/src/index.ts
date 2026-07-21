export type Vector2 = Readonly<{
  x: number;
  y: number;
}>;

export type GameStatus = 'ready' | 'running' | 'victory' | 'defeat';
export type GamePhase = 'day' | 'night' | 'final';
export type EnemyKind = 'guardian' | 'sleeper' | 'raider' | 'brute';

export type PlayerInput = Readonly<{
  sequence: number;
  moveX: number;
  moveY: number;
  aimX?: number;
  aimY?: number;
  interact?: boolean;
  buildDefense?: boolean;
  activateSword?: boolean;
  activateBarrier?: boolean;
  selectUpgradeId?: string;
}>;

export type AbilityState = Readonly<{
  cooldownRemainingMs: number;
  cooldownMs: number;
}>;

export type PlayerState = Readonly<{
  id: 'player-1';
  position: Vector2;
  hp: number;
  maxHp: number;
  ward: number;
  maxWard: number;
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
  sword: AbilityState;
  barrier: AbilityState & Readonly<{ activeRemainingMs: number }>;
  selectedUpgrades: readonly string[];
}>;

export type VillageState = Readonly<{
  position: Vector2;
  areaRadius: number;
  hp: number;
  maxHp: number;
  heartLevel: 1 | 2 | 3;
  underAttack: boolean;
}>;

export type DefenseState = Readonly<{
  id: string;
  position: Vector2;
  built: boolean;
  hp: number;
  maxHp: number;
  range: number;
  cooldownRemainingMs: number;
  buildRemainingMs: number;
  buildDurationMs: number;
}>;

export type ResourceNodeState = Readonly<{
  id: string;
  position: Vector2;
  amountRemaining: number;
  guardianId: string;
}>;

export type EnemyState = Readonly<{
  id: string;
  kind: EnemyKind;
  position: Vector2;
  home: Vector2;
  hp: number;
  maxHp: number;
  awake: boolean;
  attackCooldownRemainingMs: number;
}>;

export type UpgradeChoice = Readonly<{
  id: string;
  name: string;
  description: string;
  discipline: 'sword' | 'barrier';
}>;

export type GameEventType =
  | 'enemy-hit'
  | 'enemy-killed'
  | 'player-hurt'
  | 'village-hurt'
  | 'resource-collected'
  | 'resource-deposited'
  | 'defense-construction-started'
  | 'defense-construction-interrupted'
  | 'defense-built'
  | 'defense-destroyed'
  | 'defense-fired'
  | 'sword-auto-attack'
  | 'heart-upgraded'
  | 'level-up'
  | 'upgrade-selected'
  | 'phase-changed'
  | 'victory'
  | 'defeat';

export type GameEvent = Readonly<{
  id: number;
  tick: number;
  type: GameEventType;
  message: string;
  position?: Vector2;
  origin?: Vector2;
  amount?: number;
}>;

export type PublicGameState = Readonly<{
  tick: number;
  elapsedMs: number;
  status: GameStatus;
  resultReason?: string;
  seed: string;
  world: Readonly<{
    width: number;
    height: number;
  }>;
  phase: GamePhase;
  cycle: number;
  phaseRemainingMs: number;
  player: PlayerState;
  village: VillageState;
  defenses: readonly DefenseState[];
  resources: readonly ResourceNodeState[];
  enemies: readonly EnemyState[];
  upgradeChoices: readonly UpgradeChoice[];
  interactionHint?: string;
  objective: string;
  events: readonly GameEvent[];
}>;

export interface GameSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendInput(input: PlayerInput): void;
  subscribe(listener: (state: PublicGameState) => void): () => void;
}
