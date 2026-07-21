import { z } from 'zod';

import { rawDefaultContent } from './default-content.js';

const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().nonnegative();

const ringSchema = z
  .object({
    minimumRadius: positiveNumber,
    maximumRadius: positiveNumber,
  })
  .refine((ring) => ring.minimumRadius < ring.maximumRadius, {
    message: 'minimumRadius doit être inférieur à maximumRadius',
    path: ['minimumRadius'],
  });

const enemySchema = z.object({
  maxHp: positiveNumber,
  damage: positiveNumber,
  speed: nonNegativeNumber,
  attackRange: positiveNumber,
  attackCooldownMs: positiveNumber,
  experience: nonNegativeNumber,
  /** Bois laissé à la mort. Rend la ressource récupérable en défendant. */
  woodReward: z.number().int().nonnegative(),
});

const upgradeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  discipline: z.enum(['sword', 'barrier']),
  effect: z.enum([
    'sword-damage',
    'sword-speed',
    'sword-range',
    'lunge-cooldown',
    'ward-capacity',
    'barrier-duration',
  ]),
  value: positiveNumber,
  weight: positiveNumber,
});

export const gameContentSchema = z
  .object({
    version: z.literal(1),
    simulation: z.object({
      tickMs: z.number().int().min(16).max(100),
      dayDurationMs: positiveNumber,
      nightDurationMs: positiveNumber,
      finalDurationMs: positiveNumber,
    }),
    world: z.object({
      width: z.number().int().min(1000),
      height: z.number().int().min(1000),
      resourceNodeCount: z.number().int().min(1).max(12),
      woodPerNode: z.number().int().min(1),
      woodCollectedPerInteraction: z.number().int().min(1),
      initialSleeperCount: z.number().int().min(1).max(50),
      playerStartOffsetY: nonNegativeNumber,
      resourceRingStartRadius: positiveNumber,
      resourceRingStepRadius: positiveNumber,
      resourceAngleJitterRadians: nonNegativeNumber,
      guardianOffset: positiveNumber,
      initialSleeperRing: ringSchema,
      debugEnemySpawnRing: ringSchema,
    }),
    player: z.object({
      maxHp: positiveNumber,
      moveSpeed: positiveNumber,
      carryCapacity: z.number().int().min(1),
      interactionRange: positiveNumber,
    }),
    sword: z.object({
      autoDamage: positiveNumber,
      autoRange: positiveNumber,
      autoCooldownMs: positiveNumber,
      lungeDamage: positiveNumber,
      lungeDistance: positiveNumber,
      lungeRadius: positiveNumber,
      lungeCooldownMs: positiveNumber,
      lungeWakeRadius: positiveNumber,
      automaticAttackWakeRadius: positiveNumber,
    }),
    barrier: z.object({
      maxWard: positiveNumber,
      wardRefreshMs: positiveNumber,
      activeRadius: positiveNumber,
      activeDurationMs: positiveNumber,
      activeCooldownMs: positiveNumber,
      damageReduction: z.number().min(0).max(0.95),
    }),
    village: z.object({
      maxHp: positiveNumber,
      areaRadius: positiveNumber,
      dayRegenPerSecond: nonNegativeNumber,
      underAttackRegenMultiplier: z.number().finite().min(0).max(1),
      levelTwoCost: z.number().int().min(1),
      ultimateCost: z.number().int().min(1),
      ultimateMinimumPlayerLevel: z.number().int().min(1),
    }),
    defense: z.object({
      buildCost: z.number().int().min(1),
      buildDurationMs: positiveNumber,
      minimumHeartDistance: positiveNumber,
      minimumSpacing: positiveNumber,
      maxHp: positiveNumber,
      damage: positiveNumber,
      range: positiveNumber,
      cooldownMs: positiveNumber,
      repairCost: z.number().int().min(1),
      repairAmount: positiveNumber,
      placementOuterMargin: nonNegativeNumber,
    }),
    progression: z.object({
      experiencePerLevel: z.array(z.number().int().positive()).min(1),
      fallbackExperienceToNext: z.number().int().positive(),
      upgradeChoiceCount: z.number().int().min(1),
    }),
    enemies: z.object({
      guardian: enemySchema,
      sleeper: enemySchema,
      raider: enemySchema,
      brute: enemySchema,
    }),
    enemyBehavior: z.object({
      collisionRadius: positiveNumber,
      guardianAggroRange: positiveNumber,
      guardianChaseRange: positiveNumber,
      guardianReturnTolerance: nonNegativeNumber,
      dayAggroRange: positiveNumber,
      dayChaseRange: positiveNumber,
      dayReturnTolerance: nonNegativeNumber,
      assaultPlayerPriorityRange: positiveNumber,
      assaultDefenseDetectionRange: positiveNumber,
      defenseContactPadding: nonNegativeNumber,
      villageContactPadding: nonNegativeNumber,
    }),
    waves: z.object({
      night: z.object({
        baseRaiderCount: z.number().int().nonnegative(),
        raidersPerCycle: z.number().int().nonnegative(),
        bruteStartCycle: z.number().int().min(1),
        bruteBaseCount: z.number().int().nonnegative(),
        brutesPerCycle: z.number().int().nonnegative(),
        spawnRing: ringSchema,
      }),
      // Mise à l'échelle par cycle des assaillants générés. Le cycle 1 vaut ×1.
      escalation: z.object({
        hpPerCycle: nonNegativeNumber,
        damagePerCycle: nonNegativeNumber,
      }),
      dayReinforcements: z.object({
        baseCount: z.number().int().nonnegative(),
        countPerCycle: z.number().int().nonnegative(),
        maximumCount: z.number().int().nonnegative(),
        spawnRing: ringSchema,
      }),
      final: z.object({
        raiderCount: z.number().int().nonnegative(),
        raiderSpawnRing: ringSchema,
        bruteCount: z.number().int().nonnegative(),
        bruteSpawnRing: ringSchema,
      }),
    }),
    upgrades: z.array(upgradeSchema).min(3),
  })
  .superRefine((content, context) => {
    const ids = new Set<string>();
    for (const upgrade of content.upgrades) {
      if (ids.has(upgrade.id)) {
        context.addIssue({
          code: 'custom',
          path: ['upgrades', upgrade.id],
          message: `identifiant d'amélioration dupliqué: ${upgrade.id}`,
        });
      }
      ids.add(upgrade.id);
    }
    if (content.progression.upgradeChoiceCount > content.upgrades.length) {
      context.addIssue({
        code: 'custom',
        path: ['progression', 'upgradeChoiceCount'],
        message: "ne peut pas dépasser le nombre d'améliorations disponibles",
      });
    }
    // Le bois statique doit à lui seul couvrir le chemin obligatoire de victoire :
    // une baliste, l'éveil du Foyer et l'activation finale. Sans cette garantie, un
    // joueur pourrait épuiser la ressource finie avant de pouvoir gagner.
    const staticWood = content.world.resourceNodeCount * content.world.woodPerNode;
    const mandatoryWood =
      content.defense.buildCost + content.village.levelTwoCost + content.village.ultimateCost;
    if (staticWood < mandatoryWood) {
      context.addIssue({
        code: 'custom',
        path: ['world', 'woodPerNode'],
        message: `le bois statique (${staticWood}) doit couvrir le coût obligatoire de victoire (${mandatoryWood})`,
      });
    }
  });

export type GameContent = z.infer<typeof gameContentSchema>;
export type UpgradeDefinition = GameContent['upgrades'][number];

export function parseGameContent(input: unknown, source = 'contenu en mémoire'): GameContent {
  const result = gameContentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'racine'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Contenu de jeu invalide (${source}):\n${details}`);
  }
  return result.data;
}

export const defaultContent: GameContent = parseGameContent(
  rawDefaultContent,
  'packages/content/src/default-content.ts',
);
