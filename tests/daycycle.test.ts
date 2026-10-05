import { describe, expect, it } from 'vitest';
import { computeDayState, createDayState } from '../src/fx/daycycle';

describe('day cycle', () => {
  const s = createDayState();

  it('noon is bright with the sun overhead, midnight is dark with the moon lighting', () => {
    computeDayState(12, s);
    expect(s.elevation).toBeGreaterThan(0.9);
    expect(s.lightIntensity).toBeGreaterThan(2.5);
    expect(s.night).toBe(0);
    computeDayState(0, s);
    expect(s.elevation).toBeLessThan(-0.9);
    expect(s.night).toBe(1);
    expect(s.lightIntensity).toBeGreaterThan(0.5);
    expect(s.lightIntensity).toBeLessThan(1);
    expect(s.lightDir[1]).toBeGreaterThan(0.9); // moon is up when the sun is down
  });

  it('light is zero at the horizon and light direction never points below it', () => {
    computeDayState(6, s);
    expect(s.lightIntensity).toBeLessThan(0.05);
    for (let h = 0; h < 24; h += 0.25) {
      computeDayState(h, s);
      expect(s.lightDir[1] as number).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('has no sudden jumps across the whole day (and wraps cleanly)', () => {
    const prev = createDayState();
    computeDayState(0, prev);
    let last = [prev.lightIntensity, prev.horizon[0], prev.zenith[2], prev.hemiIntensity];
    for (let m = 1; m <= 24 * 60; m++) {
      computeDayState(m / 60, s);
      const cur = [s.lightIntensity, s.horizon[0], s.zenith[2], s.hemiIntensity] as number[];
      for (let i = 0; i < cur.length; i++) expect(Math.abs((cur[i] as number) - (last[i] as number))).toBeLessThan(0.08);
      last = cur;
    }
    const a = computeDayState(0, createDayState());
    const b = computeDayState(24, createDayState());
    expect(Math.abs(a.horizon[0] - b.horizon[0])).toBeLessThan(1e-6);
  });
});
