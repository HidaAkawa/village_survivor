import { describe, expect, it } from 'vitest';

import { defaultContent, parseGameContent } from './index.js';

describe('game content', () => {
  it('validates the shipped M1 catalogue', () => {
    expect(parseGameContent(defaultContent)).toEqual(defaultContent);
    expect(defaultContent.simulation.nightDurationMs).toBe(defaultContent.simulation.dayDurationMs);
  });

  it('reports the field of invalid content', () => {
    expect(() =>
      parseGameContent({
        ...defaultContent,
        simulation: { ...defaultContent.simulation, tickMs: 2 },
      }),
    ).toThrow(/simulation\.tickMs/);
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
});
