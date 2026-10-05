import { describe, expect, it } from 'vitest';
import { PerfStats } from '../src/perf/stats';

describe('PerfStats', () => {
  it('reports zeros when empty', () => {
    expect(new PerfStats().snapshot().frames).toBe(0);
  });

  it('computes fps and average frame time', () => {
    const s = new PerfStats(100);
    for (let i = 0; i < 100; i++) s.push(10);
    const snap = s.snapshot();
    expect(snap.avgMs).toBeCloseTo(10);
    expect(snap.fps).toBeCloseTo(100);
    expect(snap.fps1Low).toBeCloseTo(100);
  });

  it('1% low reflects the slowest frames', () => {
    const s = new PerfStats(100);
    for (let i = 0; i < 99; i++) s.push(10);
    s.push(100); // one stutter in 100 frames
    const snap = s.snapshot();
    expect(snap.worstMs).toBeCloseTo(100);
    expect(snap.fps1Low).toBeCloseTo(10);
    expect(snap.fps).toBeGreaterThan(snap.fps1Low);
  });

  it('is a ring buffer: old samples are overwritten', () => {
    const s = new PerfStats(10);
    for (let i = 0; i < 10; i++) s.push(100);
    for (let i = 0; i < 10; i++) s.push(5);
    expect(s.snapshot().avgMs).toBeCloseTo(5);
    expect(s.snapshot().frames).toBe(10);
  });
});
