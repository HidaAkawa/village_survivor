import { defaultContent } from '@village-survivor/content';
import type { PlayerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { GameSimulation } from '../src/index.js';

function input(sequence: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequence,
    moveX: 0,
    moveY: 0,
    ...overrides,
  };
}

function finishConstruction(simulation: GameSimulation, sequence: number): number {
  const ticks = defaultContent.defense.buildDurationMs / defaultContent.simulation.tickMs;
  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step(input(sequence++));
  }
  return sequence;
}

function clearGuardians(simulation: GameSimulation): void {
  for (const resource of simulation.createSnapshot().resources) {
    simulation.defeatEnemy(resource.guardianId);
  }
}

describe('GameSimulation', () => {
  it('creates a reproducible world and evolves deterministically', () => {
    const first = new GameSimulation(defaultContent, 'same-seed');
    const second = new GameSimulation(defaultContent, 'same-seed');
    first.start();
    second.start();

    for (let tick = 0; tick < 500; tick += 1) {
      const currentInput = input(tick, {
        moveX: Math.sin(tick / 20),
        moveY: Math.cos(tick / 20),
        aimX: 1,
        aimY: 0,
        activateBarrier: tick % 240 === 0,
        activateSword: tick % 100 === 0,
      });
      first.step(currentInput);
      second.step(currentInput);
      expect(first.createSnapshot()).toEqual(second.createSnapshot());
    }
  });

  it('uses the seed to produce different maps', () => {
    const first = new GameSimulation(defaultContent, 'map-a');
    const second = new GameSimulation(defaultContent, 'map-b');
    expect(first.createSnapshot().resources).not.toEqual(second.createSnapshot().resources);
  });

  it('moves from day to night at a fixed number of ticks', () => {
    const simulation = new GameSimulation(defaultContent, 'clock');
    simulation.start();
    const dayTicks = defaultContent.simulation.dayDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < dayTicks; tick += 1) {
      simulation.step(input(tick));
    }
    expect(simulation.createSnapshot().phase).toBe('night');
    expect(simulation.createSnapshot().cycle).toBe(1);
  });

  it('supports the complete explore, build, defend and win loop', () => {
    const simulation = new GameSimulation(defaultContent, 'full-m1');
    simulation.start();
    let sequence = 0;

    const collectAndDeposit = (resourceIndex: number): void => {
      const state = simulation.createSnapshot();
      const resource = state.resources[resourceIndex]!;
      simulation.defeatEnemy(resource.guardianId);
      simulation.teleportPlayer(resource.position);
      simulation.step(input(sequence++, { interact: true }));
      simulation.step(input(sequence++, { interact: true }));
      simulation.teleportPlayer(state.village.position);
      simulation.step(input(sequence++, { interact: true }));
      const choice = simulation.createSnapshot().upgradeChoices[0];
      if (choice !== undefined) {
        simulation.step(input(sequence++, { selectUpgradeId: choice.id }));
      }
    };

    collectAndDeposit(0);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    expect(simulation.createSnapshot().defenses[0]?.built).toBe(true);

    collectAndDeposit(1);
    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.createSnapshot().village.heartLevel).toBe(2);
    expect(simulation.createSnapshot().player.level).toBeGreaterThanOrEqual(2);

    collectAndDeposit(2);
    collectAndDeposit(3);
    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.createSnapshot().phase).toBe('final');
    expect(simulation.createSnapshot().village.heartLevel).toBe(3);

    simulation.defeatAllAssailants();
    const finalTicks = defaultContent.simulation.finalDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < finalTicks; tick += 1) {
      simulation.step(input(sequence++));
    }
    expect(simulation.createSnapshot().status).toBe('victory');
  });

  it('requires an interaction to deposit carried resources inside the village', () => {
    const simulation = new GameSimulation(defaultContent, 'manual-deposit');
    simulation.start();
    const resource = simulation.createSnapshot().resources[0]!;
    simulation.defeatEnemy(resource.guardianId);
    simulation.teleportPlayer(resource.position);
    simulation.step(input(1, { interact: true }));

    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.step(input(2));
    let state = simulation.createSnapshot();
    expect(state.player.carriedWood).toBe(4);
    expect(state.player.storedWood).toBe(0);
    expect(state.interactionHint).toMatch(/E — Déposer 4 bois/);

    simulation.step(input(3, { interact: true }));
    state = simulation.createSnapshot();
    expect(state.player.carriedWood).toBe(0);
    expect(state.player.storedWood).toBe(4);
    expect(state.events.some((event) => event.type === 'resource-deposited')).toBe(true);
  });

  it('publishes the origin and target of every ballista shot', () => {
    const simulation = new GameSimulation(defaultContent, 'ballista-shot');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(1, { buildDefense: true }));
    finishConstruction(simulation, 2);
    const defense = simulation.createSnapshot().defenses[0]!;
    simulation.spawnEnemy('raider', {
      x: defense.position.x + 100,
      y: defense.position.y,
    });

    simulation.step(input(200));
    const state = simulation.createSnapshot();
    const shot = state.events.find((event) => event.type === 'defense-fired');
    expect(shot?.origin).toEqual(defense.position);
    expect(shot?.position).toBeDefined();
  });

  it('builds several ballistas at player-chosen positions when resources allow it', () => {
    const simulation = new GameSimulation(defaultContent, 'several-ballistas');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost * 2);
    let sequence = 1;

    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    simulation.teleportPlayer({ x: -140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    finishConstruction(simulation, sequence);

    const defenses = simulation.createSnapshot().defenses;
    expect(defenses).toHaveLength(2);
    expect(defenses.every((defense) => defense.built)).toBe(true);
    expect(defenses.map((defense) => defense.position)).toEqual([
      { x: 140, y: 0 },
      { x: -140, y: 0 },
    ]);
  });

  it('interrupts an active ballista build on damage and refunds its resources', () => {
    const simulation = new GameSimulation(defaultContent, 'interrupted-build');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(1, { buildDefense: true }));
    simulation.step(input(2));

    simulation.damagePlayer(1);

    const state = simulation.createSnapshot();
    expect(state.defenses).toHaveLength(0);
    expect(state.player.storedWood).toBe(defaultContent.defense.buildCost);
    expect(state.events.some((event) => event.type === 'defense-construction-interrupted')).toBe(
      true,
    );
  });

  it('starts the first night with a substantially denser assault', () => {
    const simulation = new GameSimulation(defaultContent, 'harder-night');
    simulation.start();
    simulation.skipToNight();

    const assailants = simulation
      .createSnapshot()
      .enemies.filter((enemy) => enemy.kind !== 'guardian');
    expect(assailants).toHaveLength(14);
    expect(assailants.filter((enemy) => enemy.kind === 'raider')).toHaveLength(5);
  });

  it('preserves the identity and attributes of enemies surviving the night', () => {
    const content = {
      ...defaultContent,
      simulation: {
        ...defaultContent.simulation,
        nightDurationMs: defaultContent.simulation.tickMs,
      },
      progression: {
        ...defaultContent.progression,
        experiencePerLevel: [1_000],
      },
    };
    const simulation = new GameSimulation(content, 'persistent-survivors');
    simulation.start();
    simulation.skipToNight();
    const bruteId = simulation.spawnEnemy('brute', { x: 1_000, y: 1_000 });

    simulation.step(input(1));
    let brute = simulation.createSnapshot().enemies.find((enemy) => enemy.id === bruteId);
    expect(brute).toMatchObject({
      kind: 'brute',
      hp: defaultContent.enemies.brute.maxHp,
      maxHp: defaultContent.enemies.brute.maxHp,
      awake: false,
    });

    simulation.skipToNight();
    brute = simulation.createSnapshot().enemies.find((enemy) => enemy.id === bruteId);
    expect(brute).toMatchObject({ kind: 'brute', awake: true });

    simulation.defeatEnemy(bruteId);
    expect(simulation.createSnapshot().player.experience).toBe(
      defaultContent.enemies.brute.experience,
    );
  });

  it('offers varied upgrades reproducibly from an independent seeded stream', () => {
    const choicesFor = (seed: string, consumeWorldRandom = false): readonly string[] => {
      const simulation = new GameSimulation(defaultContent, seed);
      simulation.start();
      if (consumeWorldRandom) {
        for (let index = 0; index < 5; index += 1) {
          simulation.spawnEnemy();
        }
      }
      simulation.giveExperience(defaultContent.progression.experiencePerLevel[0]!);
      return simulation.createSnapshot().upgradeChoices.map((choice) => choice.id);
    };

    expect(choicesFor('upgrade-seed')).toEqual(choicesFor('upgrade-seed'));
    expect(choicesFor('upgrade-seed', true)).toEqual(choicesFor('upgrade-seed'));

    const distinctOffers = new Set(
      Array.from({ length: 8 }, (_, index) => choicesFor(`upgrade-seed-${index}`).join(',')),
    );
    expect(distinctOffers.size).toBeGreaterThan(1);
  });

  it('publishes a directional event for the automatic sword attack', () => {
    const simulation = new GameSimulation(defaultContent, 'sword-animation');
    simulation.start();
    const player = simulation.createSnapshot().player.position;
    simulation.spawnEnemy('guardian', { x: player.x + 70, y: player.y });

    let state = simulation.createSnapshot();
    for (let tick = 1; tick <= 15; tick += 1) {
      simulation.step(input(tick));
      state = simulation.createSnapshot();
    }

    const slash = state.events.find((event) => event.type === 'sword-auto-attack');
    expect(slash?.origin).toBeDefined();
    expect(slash?.position).toBeDefined();
  });

  it('loses immediately when the solo character falls', () => {
    const simulation = new GameSimulation(defaultContent, 'defeat');
    simulation.start();
    simulation.damagePlayer(defaultContent.player.maxHp * 2);
    expect(simulation.createSnapshot().status).toBe('defeat');
    expect(simulation.createSnapshot().resultReason).toMatch(/personnage/i);
  });
});
