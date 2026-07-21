import { describe, expect, it } from 'vitest';

import { defaultContent, parseGameContent } from './index.js';

describe('game content', () => {
  it('validates the shipped M1 catalogue', () => {
    expect(parseGameContent(defaultContent)).toEqual(defaultContent);
    expect(defaultContent.simulation.nightDurationMs).toBe(defaultContent.simulation.dayDurationMs);
  });

  it('reports the field of invalid content', () => {
    expect(() =>
      parseGameContent(
        {
          ...defaultContent,
          simulation: { ...defaultContent.simulation, tickMs: 2 },
        },
        'invalid-test-content.ts',
      ),
    ).toThrow(/invalid-test-content\.ts[\s\S]*simulation\.tickMs/);
  });

  it('rejects duplicate stable identifiers', () => {
    const duplicate = defaultContent.upgrades[0]!;
    expect(() =>
      parseGameContent({
        ...defaultContent,
        upgrades: [...defaultContent.upgrades, duplicate],
      }),
    ).toThrow(/dupliqué/);
  });

  it('validates upgrade weights and choice count', () => {
    expect(() =>
      parseGameContent({
        ...defaultContent,
        upgrades: defaultContent.upgrades.map((upgrade, index) =>
          index === 0 ? { ...upgrade, weight: 0 } : upgrade,
        ),
      }),
    ).toThrow(/upgrades\.0\.weight/);

    expect(() =>
      parseGameContent({
        ...defaultContent,
        progression: {
          ...defaultContent.progression,
          upgradeChoiceCount: defaultContent.upgrades.length + 1,
        },
      }),
    ).toThrow(/progression\.upgradeChoiceCount/);
  });

  it('rejects an inverted spawn ring', () => {
    expect(() =>
      parseGameContent({
        ...defaultContent,
        waves: {
          ...defaultContent.waves,
          night: {
            ...defaultContent.waves.night,
            spawnRing: { minimumRadius: 1_000, maximumRadius: 900 },
          },
        },
      }),
    ).toThrow(/waves\.night\.spawnRing\.minimumRadius/);
  });
});
