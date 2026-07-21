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
  for (const resource of simulation.getState().resources) {
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
      expect(first.step(currentInput)).toEqual(second.step(currentInput));
    }
  });

  it('uses the seed to produce different maps', () => {
    const first = new GameSimulation(defaultContent, 'map-a');
    const second = new GameSimulation(defaultContent, 'map-b');
    expect(first.getState().resources).not.toEqual(second.getState().resources);
  });

  it('moves from day to night at a fixed number of ticks', () => {
    const simulation = new GameSimulation(defaultContent, 'clock');
    simulation.start();
    const dayTicks = defaultContent.simulation.dayDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < dayTicks; tick += 1) {
      simulation.step(input(tick));
    }
    expect(simulation.getState().phase).toBe('night');
    expect(simulation.getState().cycle).toBe(1);
  });

  it('supports the complete explore, build, defend and win loop', () => {
    const simulation = new GameSimulation(defaultContent, 'full-m1');
    simulation.start();
    let sequence = 0;

    const collectAndDeposit = (resourceIndex: number): void => {
      const state = simulation.getState();
      const resource = state.resources[resourceIndex]!;
      simulation.defeatEnemy(resource.guardianId);
      simulation.teleportPlayer(resource.position);
      simulation.step(input(sequence++, { interact: true }));
      simulation.step(input(sequence++, { interact: true }));
      simulation.teleportPlayer(state.village.position);
      simulation.step(input(sequence++, { interact: true }));
      const choice = simulation.getState().upgradeChoices[0];
      if (choice !== undefined) {
        simulation.step(input(sequence++, { selectUpgradeId: choice.id }));
      }
    };

    collectAndDeposit(0);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    expect(simulation.getState().defenses[0]?.built).toBe(true);

    collectAndDeposit(1);
    simulation.teleportPlayer(simulation.getState().village.position);
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.getState().village.heartLevel).toBe(2);
    expect(simulation.getState().player.level).toBeGreaterThanOrEqual(2);

    collectAndDeposit(2);
    collectAndDeposit(3);
    simulation.teleportPlayer(simulation.getState().village.position);
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.getState().phase).toBe('final');
    expect(simulation.getState().village.heartLevel).toBe(3);

    simulation.defeatAllAssailants();
    const finalTicks = defaultContent.simulation.finalDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < finalTicks; tick += 1) {
      simulation.step(input(sequence++));
    }
    expect(simulation.getState().status).toBe('victory');
  });

  it('requires an interaction to deposit carried resources inside the village', () => {
    const simulation = new GameSimulation(defaultContent, 'manual-deposit');
    simulation.start();
    const resource = simulation.getState().resources[0]!;
    simulation.defeatEnemy(resource.guardianId);
    simulation.teleportPlayer(resource.position);
    simulation.step(input(1, { interact: true }));

    simulation.teleportPlayer(simulation.getState().village.position);
    let state = simulation.step(input(2));
    expect(state.player.carriedWood).toBe(4);
    expect(state.player.storedWood).toBe(0);
    expect(state.interactionHint).toMatch(/E — Déposer 4 bois/);

    state = simulation.step(input(3, { interact: true }));
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
    const defense = simulation.getState().defenses[0]!;
    simulation.spawnEnemy('raider', {
      x: defense.position.x + 100,
      y: defense.position.y,
    });

    const state = simulation.step(input(200));
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

    const defenses = simulation.getState().defenses;
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

    const state = simulation.getState();
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

    const assailants = simulation.getState().enemies.filter((enemy) => enemy.kind !== 'guardian');
    expect(assailants).toHaveLength(14);
    expect(assailants.filter((enemy) => enemy.kind === 'raider')).toHaveLength(5);
  });

  it('publishes a directional event for the automatic sword attack', () => {
    const simulation = new GameSimulation(defaultContent, 'sword-animation');
    simulation.start();
    const player = simulation.getState().player.position;
    simulation.spawnEnemy('guardian', { x: player.x + 70, y: player.y });

    let state = simulation.getState();
    for (let tick = 1; tick <= 15; tick += 1) {
      state = simulation.step(input(tick));
    }

    const slash = state.events.find((event) => event.type === 'sword-auto-attack');
    expect(slash?.origin).toBeDefined();
    expect(slash?.position).toBeDefined();
  });

  it('loses immediately when the solo character falls', () => {
    const simulation = new GameSimulation(defaultContent, 'defeat');
    simulation.start();
    simulation.damagePlayer(defaultContent.player.maxHp * 2);
    expect(simulation.getState().status).toBe('defeat');
    expect(simulation.getState().resultReason).toMatch(/personnage/i);
  });
});
