import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/core/fixed-step';

describe('FixedStep', () => {
  it('runs exactly one step per 60 Hz frame', () => {
    const f = new FixedStep(60);
    let total = 0;
    for (let i = 0; i < 60; i++) total += f.advance(1000 / 60);
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(60);
  });

  it('keeps simulation speed independent of frame rate', () => {
    const at = (hz: number) => {
      const f = new FixedStep(60);
      let steps = 0;
      for (let i = 0; i < hz * 2; i++) steps += f.advance(1000 / hz); // 2 seconds
      return steps;
    };
    for (const hz of [30, 60, 144, 240]) {
      expect(Math.abs(at(hz) - 120)).toBeLessThanOrEqual(1);
    }
  });

  it('clamps huge deltas instead of spiralling', () => {
    const f = new FixedStep(60, 5);
    expect(f.advance(10_000)).toBe(5);
  });

  it('exposes alpha in [0, 1)', () => {
    const f = new FixedStep(60);
    f.advance(1000 / 60 / 2);
    expect(f.alpha).toBeGreaterThan(0.4);
    expect(f.alpha).toBeLessThan(0.6);
  });
});
