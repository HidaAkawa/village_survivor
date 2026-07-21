import { z } from 'zod';

const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().nonnegative();

const enemySchema = z.object({
  maxHp: positiveNumber,
  damage: positiveNumber,
  speed: nonNegativeNumber,
  attackRange: positiveNumber,
  attackCooldownMs: positiveNumber,
  experience: nonNegativeNumber,
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
      initialSleeperCount: z.number().int().min(1).max(50),
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
      levelTwoCost: z.number().int().min(1),
      ultimateCost: z.number().int().min(1),
    }),
    defense: z.object({
      buildCost: z.number().int().min(1),
      maxHp: positiveNumber,
      damage: positiveNumber,
      range: positiveNumber,
      cooldownMs: positiveNumber,
    }),
    progression: z.object({
      experiencePerLevel: z.array(z.number().int().positive()).min(1),
    }),
    enemies: z.object({
      guardian: enemySchema,
      sleeper: enemySchema,
      raider: enemySchema,
      brute: enemySchema,
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
  });

export type GameContent = z.infer<typeof gameContentSchema>;
export type UpgradeDefinition = GameContent['upgrades'][number];

const rawDefaultContent = {
  version: 1,
  simulation: {
    tickMs: 50,
    dayDurationMs: 75_000,
    nightDurationMs: 75_000,
    finalDurationMs: 90_000,
  },
  world: {
    width: 2_200,
    height: 2_200,
    resourceNodeCount: 3,
    woodPerNode: 8,
    initialSleeperCount: 6,
  },
  player: {
    maxHp: 100,
    moveSpeed: 250,
    carryCapacity: 8,
    interactionRange: 86,
  },
  sword: {
    autoDamage: 10,
    autoRange: 105,
    autoCooldownMs: 650,
    lungeDamage: 26,
    lungeDistance: 150,
    lungeRadius: 72,
    lungeCooldownMs: 5_000,
  },
  barrier: {
    maxWard: 20,
    wardRefreshMs: 8_000,
    activeRadius: 175,
    activeDurationMs: 4_000,
    activeCooldownMs: 12_000,
    damageReduction: 0.75,
  },
  village: {
    maxHp: 420,
    areaRadius: 230,
    dayRegenPerSecond: 4,
    levelTwoCost: 5,
    ultimateCost: 8,
  },
  defense: {
    buildCost: 4,
    maxHp: 180,
    damage: 12,
    range: 350,
    cooldownMs: 700,
  },
  progression: {
    experiencePerLevel: [15, 30, 50],
  },
  enemies: {
    guardian: {
      maxHp: 38,
      damage: 7,
      speed: 72,
      attackRange: 38,
      attackCooldownMs: 1_050,
      experience: 12,
    },
    sleeper: {
      maxHp: 28,
      damage: 5,
      speed: 66,
      attackRange: 36,
      attackCooldownMs: 1_100,
      experience: 8,
    },
    raider: {
      maxHp: 34,
      damage: 6,
      speed: 78,
      attackRange: 38,
      attackCooldownMs: 1_000,
      experience: 9,
    },
    brute: {
      maxHp: 100,
      damage: 12,
      speed: 47,
      attackRange: 48,
      attackCooldownMs: 1_350,
      experience: 22,
    },
  },
  upgrades: [
    {
      id: 'sword-sharp-edge',
      name: 'Tranchant affûté',
      description: '+35 % de dégâts pour Taillade.',
      discipline: 'sword',
      effect: 'sword-damage',
      value: 1.35,
    },
    {
      id: 'barrier-reinforced-ward',
      name: 'Égide renforcée',
      description: '+15 points de garde maximale.',
      discipline: 'barrier',
      effect: 'ward-capacity',
      value: 15,
    },
    {
      id: 'sword-quick-hands',
      name: 'Gestes vifs',
      description: 'Taillade se déclenche 20 % plus vite.',
      discipline: 'sword',
      effect: 'sword-speed',
      value: 0.8,
    },
    {
      id: 'barrier-lasting-dome',
      name: 'Dôme persistant',
      description: '+1,5 seconde de durée pour Barrière.',
      discipline: 'barrier',
      effect: 'barrier-duration',
      value: 1_500,
    },
    {
      id: 'sword-long-reach',
      name: 'Allonge',
      description: '+30 unités de portée pour Taillade.',
      discipline: 'sword',
      effect: 'sword-range',
      value: 30,
    },
    {
      id: 'sword-relentless-lunge',
      name: 'Fente implacable',
      description: 'Fente récupère 25 % plus vite.',
      discipline: 'sword',
      effect: 'lunge-cooldown',
      value: 0.75,
    },
  ],
} as const;

export function parseGameContent(input: unknown): GameContent {
  const result = gameContentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'racine'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Contenu de jeu invalide:\n${details}`);
  }
  return result.data;
}

export const defaultContent: GameContent = parseGameContent(rawDefaultContent);
