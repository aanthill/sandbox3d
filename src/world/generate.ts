import { fbm } from './noise';
import { Heightfield, MAX_H, MIN_H } from './heightfield';

const ROWS_PER_SLICE = 4;

/** Procedural starting terrain. Yields between row batches (see runBudgeted). */
export function* generateTerrain(
  hf: Heightfield,
  seed: number,
  rise = false,
): Generator<void, void, void> {
  const n = hf.n;
  // Frequency is in world units, so the look is the same at every resolution.
  const freq = 0.55;
  for (let j = 0; j < n; j++) {
    const z = hf.worldZ(j);
    for (let i = 0; i < n; i++) {
      const x = hf.worldX(i);
      // Few octaves and a low gain keep it soft: rolling hills, not jagged peaks.
      const base = fbm(x * freq + 50, z * freq + 50, seed, 4, 0.4);
      // Bias and stretch fBm (which clusters near 0.5) into hills and valleys.
      let h = (base - 0.5) * 2.3 + 0.38;
      h = Math.min(MAX_H, Math.max(MIN_H, h));
      hf.setInstant(j * n + i, h);
      // "Rise": start flat on the floor and let the springs lift the world up (the world "sprouts").
      if (rise) {
        hf.height[j * n + i] = MIN_H;
        hf.prev[j * n + i] = MIN_H;
      }
    }
    if ((j + 1) % ROWS_PER_SLICE === 0) yield;
  }
  hf.activateAll();
}

/** Bilinear resample of `src` (srcN x srcN) into `dst`, so changing quality keeps the sculpt. */
export function* resampleTerrain(
  src: Float32Array,
  srcN: number,
  dst: Heightfield,
): Generator<void, void, void> {
  const n = dst.n;
  const ratio = (srcN - 1) / (n - 1);
  for (let j = 0; j < n; j++) {
    const sy = j * ratio;
    const j0 = Math.min(srcN - 2, Math.floor(sy));
    const fy = sy - j0;
    for (let i = 0; i < n; i++) {
      const sx = i * ratio;
      const i0 = Math.min(srcN - 2, Math.floor(sx));
      const fx = sx - i0;
      const a = src[j0 * srcN + i0] as number;
      const b = src[j0 * srcN + i0 + 1] as number;
      const c = src[(j0 + 1) * srcN + i0] as number;
      const d = src[(j0 + 1) * srcN + i0 + 1] as number;
      dst.setInstant(j * n + i, a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
    }
    if ((j + 1) % ROWS_PER_SLICE === 0) yield;
  }
  dst.activateAll();
}
