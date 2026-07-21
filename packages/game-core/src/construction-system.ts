import type { GameContent } from '@village-survivor/content';
import type { Vector2 } from '@village-survivor/protocol';

import { distance } from './geometry.js';
import type { MutableDefense, MutablePlayer, MutableVillage } from './state.js';

export function repairDefense(
  defense: MutableDefense,
  player: MutablePlayer,
  content: GameContent['defense'],
): boolean {
  if (!defense.built || defense.hp >= defense.maxHp || player.storedWood < content.repairCost) {
    return false;
  }
  player.storedWood -= content.repairCost;
  defense.hp = Math.min(defense.maxHp, defense.hp + content.repairAmount);
  return true;
}

export function canPlaceDefenseAt(
  position: Vector2,
  village: MutableVillage,
  defenses: readonly MutableDefense[],
  content: Pick<GameContent, 'defense' | 'village'>,
): boolean {
  const heartDistance = distance(position, village.position);
  if (
    heartDistance < content.defense.minimumHeartDistance ||
    heartDistance > content.village.areaRadius - content.defense.placementOuterMargin
  ) {
    return false;
  }
  return defenses.every(
    (defense) => distance(position, defense.position) >= content.defense.minimumSpacing,
  );
}

export function createDefense(
  id: string,
  position: Vector2,
  content: GameContent['defense'],
): MutableDefense {
  return {
    id,
    position: { ...position },
    built: false,
    hp: content.maxHp,
    maxHp: content.maxHp,
    cooldownRemainingMs: 0,
    buildRemainingMs: content.buildDurationMs,
  };
}
