import { describe, expect, it } from 'vitest';
import { terrainSpring } from '../src/anim/spring';
import { runBudgeted } from '../src/core/budget';
import { Sculptor, falloff } from '../src/tools/brush';
import { History } from '../src/tools/history';
import { generateTerrain, resampleTerrain } from '../src/world/generate';
import { Heightfield, MAX_H, MIN_H } from '../src/world/heightfield';
import { raycastHeightfield, type Hit } from '../src/world/pick';

const DT = 1 / 60;

function flat(n: number, h = 0.5): Heightfield {
  const hf = new Heightfield(n);
  for (let k = 0; k < n * n; k++) hf.setInstant(k, h);
  return hf;
}
function drain(g: Generator<void, void, void>) {
  while (!g.next().done);
}
function settle(hf: Heightfield, wobble = 70, maxSteps = 2000) {
  const p = terrainSpring(wobble);
  let s = 0;
  while (hf.activeCount > 0 && s++ < maxSteps) hf.step(DT, p);
  return s;
}

describe('springs', () => {
  it('wobble 0 is critically damped: no overshoot', () => {
    const hf = flat(32, 0);
    hf.target[hf.index(16, 16)] = 1;
    hf.activateRect(16, 16, 16, 16);
    const p = terrainSpring(0);
    let max = 0;
    for (let s = 0; s < 600; s++) {
      hf.step(DT, p);
      max = Math.max(max, hf.height[hf.index(16, 16)] as number);
    }
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('wobble 100 overshoots, then settles exactly on target and sleeps', () => {
    const hf = flat(32, 0);
    const k = hf.index(16, 16);
    hf.target[k] = 1;
    hf.activateRect(16, 16, 16, 16);
    const p = terrainSpring(100);
    let max = 0;
    let steps = 0;
    while (hf.activeCount > 0 && steps++ < 3000) {
      hf.step(DT, p);
      max = Math.max(max, hf.height[k] as number);
    }
    expect(max).toBeGreaterThan(1.05);
    expect(hf.height[k]).toBe(1);
    expect(hf.activeCount).toBe(0);
    expect(steps).toBeLessThan(3000);
  });

  it('does not simulate sleeping chunks', () => {
    const hf = flat(64);
    const before = hf.height.slice();
    hf.step(DT, terrainSpring(70));
    expect(Array.from(hf.height)).toEqual(Array.from(before));
  });

  it('stays stable for the stiffest settings over many steps', () => {
    const hf = flat(32, 0);
    for (let k = 0; k < hf.target.length; k++) hf.target[k] = (k % 7) * 0.2;
    hf.activateAll();
    settle(hf, 100, 5000);
    for (const v of hf.height) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('Sculptor', () => {
  const brush = { radius: 0.5, strength: 1 };

  it('raise increases target in the brush and leaves far cells alone', () => {
    const hf = flat(128, 0.2);
    const s = new Sculptor(hf);
    s.beginStroke(0, 0);
    for (let i = 0; i < 30; i++) s.apply('raise', 0, 0, brush, DT);
    const c = hf.index(64, 64);
    expect(hf.target[c]).toBeGreaterThan(0.4);
    expect(hf.target[hf.index(0, 0)]).toBeCloseTo(0.2);
    expect(hf.activeCount).toBeGreaterThan(0);
  });

  it('lower and clamping respect world limits', () => {
    const hf = flat(64, 0);
    const s = new Sculptor(hf);
    for (let i = 0; i < 600; i++) s.apply('lower', 0, 0, brush, DT);
    expect(Math.min(...hf.target)).toBeGreaterThanOrEqual(MIN_H - 1e-6);
    for (let i = 0; i < 2000; i++) s.apply('raise', 0, 0, brush, DT);
    expect(Math.max(...hf.target)).toBeLessThanOrEqual(MAX_H + 1e-6);
  });

  it('flatten pulls cells toward the level under the cursor', () => {
    const hf = flat(64, 0.5);
    hf.setInstant(hf.index(32, 32), 0.5);
    const s = new Sculptor(hf);
    hf.setInstant(hf.index(34, 32), 1.2);
    s.beginStroke(hf.worldX(32), hf.worldZ(32));
    for (let i = 0; i < 120; i++) s.apply('flatten', hf.worldX(32), hf.worldZ(32), brush, DT);
    expect(Math.abs((hf.target[hf.index(34, 32)] as number) - 0.5)).toBeLessThan(0.05);
  });

  it('undo and redo restore targets exactly', () => {
    const hf = flat(64, 0.3);
    const s = new Sculptor(hf);
    const history = new History();
    const original = hf.target.slice();
    s.beginStroke(0, 0);
    for (let i = 0; i < 20; i++) s.apply('raise', 0, 0, brush, DT);
    const stroke = s.endStroke();
    expect(stroke).not.toBeNull();
    history.push(stroke!);
    const edited = hf.target.slice();
    expect(Array.from(edited)).not.toEqual(Array.from(original));

    s.applyStroke(history.undo()!, 'before');
    expect(Array.from(hf.target)).toEqual(Array.from(original));
    s.applyStroke(history.redo()!, 'after');
    expect(Array.from(hf.target)).toEqual(Array.from(edited));
    expect(history.canRedo).toBe(false);
  });

  it('keeps at most 20 undo steps', () => {
    const h = new History();
    for (let i = 0; i < 30; i++) {
      h.push({ idx: new Int32Array(1), before: new Float32Array(1), after: new Float32Array(1) });
    }
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(20);
  });

  it('falloff is 1 at the center and 0 at the edge', () => {
    expect(falloff(0, 1)).toBe(1);
    expect(falloff(1, 1)).toBe(0);
    expect(falloff(0.5, 1)).toBeCloseTo(0.5);
  });
});

describe('generation', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = new Heightfield(48);
    const b = new Heightfield(48);
    const c = new Heightfield(48);
    drain(generateTerrain(a, 7));
    drain(generateTerrain(b, 7));
    drain(generateTerrain(c, 8));
    expect(Array.from(a.target)).toEqual(Array.from(b.target));
    expect(Array.from(a.target)).not.toEqual(Array.from(c.target));
  });

  it('stays within world limits and has real relief', () => {
    const hf = new Heightfield(96);
    drain(generateTerrain(hf, 3));
    const min = Math.min(...hf.target);
    const max = Math.max(...hf.target);
    expect(min).toBeGreaterThanOrEqual(MIN_H);
    expect(max).toBeLessThanOrEqual(MAX_H);
    expect(max - min).toBeGreaterThan(0.4);
  });

  it('resampling to another resolution keeps the shape', () => {
    const lo = new Heightfield(64);
    drain(generateTerrain(lo, 5));
    const hi = new Heightfield(128);
    drain(resampleTerrain(lo.target, lo.n, hi));
    for (const [x, z] of [[0, 0], [1, -1], [-1.5, 1.2]] as const) {
      expect(hi.heightAt(x, z)).toBeCloseTo(lo.heightAt(x, z), 1);
    }
  });

  it('runBudgeted yields to the next frame when over budget', async () => {
    let t = 0;
    let frames = 0;
    function* job() {
      for (let i = 0; i < 10; i++) {
        t += 4; // each slice "costs" 4 ms
        yield;
      }
    }
    await runBudgeted(job(), 6, async () => void frames++, () => t);
    expect(frames).toBeGreaterThanOrEqual(4);
  });
});

describe('raycastHeightfield', () => {
  it('hits a flat plane at the expected point', () => {
    const hf = flat(64, 0.5);
    const hit: Hit = { x: 0, y: 0, z: 0 };
    // From (0, 3, 3) looking down-and-forward at 45 degrees.
    const ok = raycastHeightfield(hf, 0, 3, 3, 0, -Math.SQRT1_2, -Math.SQRT1_2, hit);
    expect(ok).toBe(true);
    expect(hit.y).toBeCloseTo(0.5, 2);
    expect(hit.z).toBeCloseTo(3 - 2.5, 1);
  });

  it('misses when pointing away', () => {
    const hf = flat(64, 0.5);
    const hit: Hit = { x: 0, y: 0, z: 0 };
    expect(raycastHeightfield(hf, 0, 3, 3, 0, 1, 0, hit)).toBe(false);
  });
});
