import { describe, expect, it } from 'vitest';
import { terrainSpring } from '../src/anim/spring';
import { MAX_SOURCES, WaterSim } from '../src/sim/water';
import { generateTerrain } from '../src/world/generate';
import { Heightfield } from '../src/world/heightfield';

const DT = 1 / 60;

function drain(g: Generator<void, void, void>) {
  while (!g.next().done);
}
function settleTerrain(hf: Heightfield) {
  const p = terrainSpring(70);
  let k = 0;
  while (hf.activeCount > 0 && k++ < 5000) hf.step(DT, p);
}
function realTerrain(n = 128, seed = 3): Heightfield {
  const hf = new Heightfield(n);
  drain(generateTerrain(hf, seed));
  settleTerrain(hf);
  return hf;
}
function ramp(n = 128): Heightfield {
  const hf = new Heightfield(n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hf.setInstant(j * n + i, 1.0 - (i / (n - 1)) * 1.2);
  return hf;
}
function bowl(n = 128): Heightfield {
  const hf = new Heightfield(n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * 2;
      const z = (j / (n - 1) - 0.5) * 2;
      hf.setInstant(j * n + i, 0.2 + 0.8 * (x * x + z * z));
    }
  }
  return hf;
}
function run(w: WaterSim, seconds: number) {
  for (let s = 0; s < seconds * 60; s++) w.step(DT);
}
function allFinite(a: Float32Array): boolean {
  for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k] as number)) return false;
  return true;
}

describe('WaterSim: conservation and sanity', () => {
  it('conserves volume on real terrain (closed walls)', () => {
    const w = new WaterSim(realTerrain());
    let injected = 0;
    for (let s = 0; s < 3000; s++) {
      if (s < 600) {
        w.addVolume(0, 0, 0.3, 0.002);
        injected += 0.002;
      }
      w.step(DT);
    }
    expect(Math.abs(w.measureVolume() - injected) / injected).toBeLessThan(0.001);
    expect(allFinite(w.depth)).toBe(true);
    expect(Math.min(...w.depth)).toBeGreaterThanOrEqual(0);
  });

  it('a bowl levels out to a flat surface and goes calm', () => {
    const w = new WaterSim(bowl());
    w.addVolume(-1, -1, 0.3, 0.3);
    run(w, 40);
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < w.depth.length; k++) {
      if ((w.depth[k] as number) > 0.002) {
        const s = (w.ground[k] as number) + (w.depth[k] as number);
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    }
    expect(hi - lo).toBeLessThan(0.003);
    expect(w.maxFlux()).toBeLessThan(1e-3);
  });

  it('calm water sleeps: nothing changes and no flux remains', () => {
    const w = new WaterSim(bowl());
    w.addVolume(0, 0, 0.3, 0.1);
    run(w, 150); // a sloshy lake needs a while to settle
    const before = w.depth.slice();
    run(w, 5);
    expect(Array.from(w.depth)).toEqual(Array.from(before));
    expect(w.maxFlux()).toBeLessThan(1e-5);
  });
});

describe('WaterSim: rivers', () => {
  it('a spring on a mountain slope reaches the far end in a believable time', () => {
    const w = new WaterSim(ramp());
    w.addSource(-1.8, 0, 0.05);
    let reached = -1;
    for (let s = 0; s < 60 * 40 && reached < 0; s++) {
      w.step(DT);
      if (w.depthAt(1.7, 0) > 0.003) reached = s / 60;
    }
    expect(reached).toBeGreaterThan(2);
    expect(reached).toBeLessThan(15);
  });

  it('stays stable for 5 minutes with a fountain, then comes to rest', () => {
    const hf = realTerrain(128, 5);
    const w = new WaterSim(hf);
    w.addSource(-1.2, -1.0, 0.04);
    let injected = 0;
    let maxDepth = 0;
    for (let s = 0; s < 60 * 300; s++) {
      const paused = w.averageDepth >= 0.3;
      w.step(DT);
      if (!paused) injected += 0.04 * DT;
      if (s % 600 === 0) {
        expect(allFinite(w.depth)).toBe(true);
        for (const d of w.depth) maxDepth = Math.max(maxDepth, d);
      }
    }
    // No volume appeared or vanished (tolerance covers sub-micro-depth cleanup).
    expect(Math.abs(w.measureVolume() - injected) / injected).toBeLessThan(0.002);
    expect(maxDepth).toBeLessThan(2);

    // Turn the spring off: the water must settle.
    w.sources.length = 0;
    run(w, 150);
    expect(w.maxFlux()).toBeLessThan(2e-3);
  }, 120000);

  it('stops adding water once the block is "full"', () => {
    const w = new WaterSim(bowl());
    w.addSource(0, 0, 3);
    run(w, 20);
    expect(w.averageDepth).toBeLessThan(0.35);
  });
});

describe('WaterSim: tools', () => {
  it('drain removes water, pouring adds it back', () => {
    const w = new WaterSim(bowl());
    w.addVolume(0, 0, 0.4, 0.2);
    run(w, 5);
    const full = w.measureVolume();
    for (let s = 0; s < 120; s++) {
      w.drain(0, 0, 0.8, 1, DT);
      w.step(DT);
    }
    expect(w.measureVolume()).toBeLessThan(full * 0.6);
  });

  it('fountains can be placed and removed, up to a limit', () => {
    const w = new WaterSim(bowl());
    for (let k = 0; k < MAX_SOURCES; k++) expect(w.addSource(k * 0.1, 0, 0.05)).toBe(true);
    expect(w.addSource(1.5, 1.5, 0.05)).toBe(false);
    expect(w.removeSourceNear(0.31, 0.02, 0.1)).toBe(true);
    expect(w.sources.length).toBe(MAX_SOURCES - 1);
    expect(w.removeSourceNear(-1.9, 1.9, 0.1)).toBe(false);
  });

  it('sea level floods everything below it, and lowering drains the sea but keeps higher lakes', () => {
    const hf = realTerrain();
    const w = new WaterSim(hf);
    w.setSeaLevel(0.6);
    run(w, 6);
    const wetBelow = (level: number) => {
      let below = 0;
      let wetCount = 0;
      for (let k = 0; k < w.depth.length; k++) {
        if ((w.ground[k] as number) < level - 0.01) {
          below++;
          if ((w.depth[k] as number) > 0.003) wetCount++;
        }
      }
      return wetCount / Math.max(1, below);
    };
    expect(wetBelow(0.6)).toBeGreaterThan(0.98);
    w.setSeaLevel(0.2);
    run(w, 8);
    expect(wetBelow(0.2)).toBeGreaterThan(0.98);
    // Cells between the old and new level are dry again.
    let stillWet = 0;
    for (let k = 0; k < w.depth.length; k++) {
      if ((w.ground[k] as number) > 0.3 && (w.ground[k] as number) < 0.55 && (w.depth[k] as number) > 0.01) stillWet++;
    }
    expect(stillWet).toBe(0);
  });
});

describe('WaterSim: terrain interaction', () => {
  it('follows the jelly terrain: raising the ground under a lake displaces the water', () => {
    const hf = bowl();
    const w = new WaterSim(hf);
    w.addVolume(0, 0, 0.3, 0.1);
    run(w, 20);
    const v = w.measureVolume();
    const centerBefore = w.depthAt(0, 0);
    // Push a bump up in the middle of the lake and let the springs move it.
    const n = hf.n;
    for (let j = n / 2 - 8; j <= n / 2 + 8; j++) for (let i = n / 2 - 8; i <= n / 2 + 8; i++) hf.target[j * n + i] = (hf.target[j * n + i] as number) + 0.25;
    hf.activateRect(n / 2 - 9, n / 2 - 9, n / 2 + 9, n / 2 + 9);
    const p = terrainSpring(70);
    for (let s = 0; s < 60 * 20; s++) {
      hf.step(DT, p);
      w.step(DT);
    }
    expect(w.depthAt(0, 0)).toBeLessThan(centerBefore);
    expect(Math.abs(w.measureVolume() - v) / v).toBeLessThan(0.002);
    expect(allFinite(w.depth)).toBe(true);
  });

  it('keeps water and fountains when resampled to another resolution', () => {
    const lo = new WaterSim(bowl(128));
    lo.addSource(0.5, 0.5, 0.05);
    lo.addVolume(0, 0, 0.3, 0.2);
    run(lo, 10);
    const hi = new WaterSim(bowl(256));
    hi.copyFrom(lo);
    // Both cap at 128, so the grids match and the volume carries over exactly.
    expect(hi.n).toBe(lo.n);
    expect(Math.abs(hi.measureVolume() - lo.measureVolume()) / lo.measureVolume()).toBeLessThan(0.01);
    expect(hi.sources.length).toBe(1);
  });
});
