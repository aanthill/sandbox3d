import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, DEFAULT_ADAPTIVE } from '../src/perf/adaptive';
import { DEFAULT_TIER, TIERS, TIER_ORDER, isTierId } from '../src/perf/quality';

const feed = (a: AdaptiveQuality, ms: number, frames: number) => {
  for (let i = 0; i < frames; i++) a.push(ms);
};

describe('AdaptiveQuality', () => {
  it('starts at full scale', () => {
    expect(new AdaptiveQuality().scale).toBe(1);
  });

  it('drops the scale when frames are slow, down to the floor', () => {
    const a = new AdaptiveQuality();
    feed(a, 40, DEFAULT_ADAPTIVE.windowFrames);
    expect(a.scale).toBeCloseTo(1 - DEFAULT_ADAPTIVE.step);
    feed(a, 40, DEFAULT_ADAPTIVE.windowFrames * 20);
    expect(a.scale).toBe(DEFAULT_ADAPTIVE.minScale);
  });

  it('only climbs back after several consecutive fast windows', () => {
    const a = new AdaptiveQuality();
    feed(a, 40, DEFAULT_ADAPTIVE.windowFrames); // drop once
    const dropped = a.scale;
    feed(a, 8, DEFAULT_ADAPTIVE.windowFrames); // 1 fast window: no change
    expect(a.scale).toBe(dropped);
    feed(a, 8, DEFAULT_ADAPTIVE.windowFrames * 2); // reaches upWindows
    expect(a.scale).toBeGreaterThan(dropped);
  });

  it('does not change in the comfortable middle band', () => {
    const a = new AdaptiveQuality();
    feed(a, 17, DEFAULT_ADAPTIVE.windowFrames * 10);
    expect(a.scale).toBe(1);
  });

  it('ignores huge frames from hidden tabs', () => {
    const a = new AdaptiveQuality();
    feed(a, 3000, DEFAULT_ADAPTIVE.windowFrames * 3);
    expect(a.scale).toBe(1);
  });
});

describe('quality tiers', () => {
  it('defaults to Low and grows monotonically', () => {
    expect(DEFAULT_TIER).toBe('low');
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const prev = TIERS[TIER_ORDER[i - 1] as keyof typeof TIERS];
      const cur = TIERS[TIER_ORDER[i] as keyof typeof TIERS];
      expect(cur.grid).toBeGreaterThan(prev.grid);
    }
  });

  it('validates tier ids', () => {
    expect(isTierId('ultra')).toBe(true);
    expect(isTierId('banana')).toBe(false);
    expect(isTierId(undefined)).toBe(false);
  });
});
