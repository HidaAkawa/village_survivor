import type { EnemyKind, Vector2 } from '@village-survivor/protocol';

export interface MutableEnemy {
  id: string;
  kind: EnemyKind;
  position: Vector2;
  home: Vector2;
  hp: number;
  maxHp: number;
  awake: boolean;
  attackCooldownRemainingMs: number;
}

export interface MutableResource {
  id: string;
  position: Vector2;
  amountRemaining: number;
  guardianId: string;
}

export interface MutablePlayer {
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

export interface MutableVillage {
  position: Vector2;
  hp: number;
  maxHp: number;
  heartLevel: 1 | 2 | 3;
  underAttack: boolean;
}

export interface MutableDefense {
  id: string;
  position: Vector2;
  built: boolean;
  hp: number;
  maxHp: number;
  cooldownRemainingMs: number;
  buildRemainingMs: number;
}
