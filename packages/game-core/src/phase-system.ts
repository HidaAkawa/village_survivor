import type { GameContent } from '@village-survivor/content';
import type { EnemyKind } from '@village-survivor/protocol';

import type { MutableEnemy } from './state.js';

export type SpawnInstruction = Readonly<{
  kind: EnemyKind;
  count: number;
  ring: GameContent['waves']['night']['spawnRing'];
}>;

export function awakenAssailants(enemies: readonly MutableEnemy[]): void {
  for (const enemy of enemies) {
    if (enemy.kind !== 'guardian') {
      enemy.awake = true;
    }
  }
}

export function restSurvivingAssailants(enemies: readonly MutableEnemy[]): void {
  for (const enemy of enemies) {
    if (enemy.kind !== 'guardian') {
      enemy.awake = false;
      enemy.home = { ...enemy.position };
    }
  }
}

export function nightSpawnInstructions(content: GameContent, cycle: number): SpawnInstruction[] {
  return [
    {
      kind: 'raider',
      count: content.waves.night.baseRaiderCount + cycle * content.waves.night.raidersPerCycle,
      ring: content.waves.night.spawnRing,
    },
  ];
}

export function dayReinforcementInstructions(
  content: GameContent,
  cycle: number,
): SpawnInstruction[] {
  const wave = content.waves.dayReinforcements;
  return [
    {
      kind: 'sleeper',
      count: Math.min(wave.maximumCount, wave.baseCount + cycle * wave.countPerCycle),
      ring: wave.spawnRing,
    },
  ];
}

export function finalSpawnInstructions(content: GameContent): SpawnInstruction[] {
  return [
    {
      kind: 'raider',
      count: content.waves.final.raiderCount,
      ring: content.waves.final.raiderSpawnRing,
    },
    {
      kind: 'brute',
      count: content.waves.final.bruteCount,
      ring: content.waves.final.bruteSpawnRing,
    },
  ];
}
