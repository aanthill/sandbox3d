import { describe, expect, it } from 'vitest';
import { GRASS, GROWTH, TREE, growthStep, makeRng, popScale, suitability } from '../src/life/growth';

describe('plant suitability', () => {
  it('is zero underwater and on steep ground, high on wet flat ground', () => {
    expect(suitability(GRASS, 0.5, 1, 1, 0.1)).toBe(0);
    expect(suitability(GRASS, 0.5, 0.4, 1, 0)).toBe(0);
    expect(suitability(TREE, 0.5, 1, 1, 0)).toBeGreaterThan(0.9);
  });
  it('wet is better than dry; sand and snowline are bad', () => {
    for (const k of [GRASS, TREE] as const) {
      expect(suitability(k, 0.6, 1, 1, 0)).toBeGreaterThan(suitability(k, 0.6, 1, 0, 0));
    }
    expect(suitability(GRASS, 0.05, 1, 1, 0)).toBe(0);
    expect(suitability(GRASS, 1.7, 1, 1, 0)).toBe(0);
    expect(suitability(TREE, 1.3, 1, 1, 0)).toBe(0);
  });
});

describe('growth', () => {
  it('converges to the suitability and not beyond', () => {
    let g = 0;
    for (let i = 0; i < 60 * 300; i++) g = growthStep(g, 0.7, 0.2, 0.5, false, 1 / 60);
    expect(g).toBeCloseTo(0.7, 3);
  });
  it('wetter grows faster', () => {
    let a = 0.1;
    let b = 0.1;
    for (let i = 0; i < 600; i++) {
      a = growthStep(a, 1, 0.1, 0, false, 1 / 60);
      b = growthStep(b, 1, 0.1, 1, false, 1 / 60);
    }
    expect(b).toBeGreaterThan(a);
  });
  it('withers when the spot stops suiting it and dies when drowned', () => {
    let g = 0.8;
    for (let i = 0; i < 60 * 30; i++) g = growthStep(g, 0, 0.5, 0, false, 1 / 60);
    expect(g).toBeLessThan(GROWTH.minSize);
    let d = 0.8;
    for (let i = 0; i < 60 * 3; i++) d = growthStep(d, 0.8, 0.1, 1, true, 1 / 60);
    expect(d).toBe(0);
  });
  it('a plant above its threshold only exists where suitability beats it', () => {
    expect(growthStep(0.5, 0.3, 0.4, 0.5, false, 10)).toBeLessThan(0.5);
  });
});

describe('pop-in', () => {
  it('starts at 0, overshoots a little, and lands exactly on 1', () => {
    expect(popScale(0)).toBe(0);
    let max = 0;
    for (let t = 0; t < 1.5; t += 0.01) max = Math.max(max, popScale(t));
    expect(max).toBeGreaterThan(1.05);
    expect(max).toBeLessThan(1.5);
    expect(popScale(1.5)).toBe(1);
    expect(Math.abs(popScale(1.49) - 1)).toBeLessThan(0.05);
  });
});

describe('rng', () => {
  it('is deterministic and in [0,1)', () => {
    const a = makeRng(5);
    const b = makeRng(5);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
