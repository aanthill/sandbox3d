import { Heightfield, MAX_H, MIN_H, WORLD_SIZE } from '../world/heightfield';
import type { Stroke } from './history';

export type TerrainToolId = 'raise' | 'lower' | 'flatten';

export interface BrushSettings {
  /** Brush radius in world units. */
  radius: number;
  /** 0..1 */
  strength: number;
}

export const BRUSH_LIMITS = { minRadius: 0.1, maxRadius: 1.2 } as const;

/** World units per second at strength 1 (raise/lower) and 1/s blend rate (flatten). */
const RAISE_RATE = 1.4;
const BLEND_RATE = 7;

/** Soft cubic falloff: 1 at the center, 0 at the edge. */
export function falloff(d: number, r: number): number {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return t * t * (3 - 2 * t);
}

/**
 * Applies brush tools to the heightfield *targets* (the springs then make the
 * surface follow, which is where the jelly feel comes from) and records
 * every changed cell so a stroke can be undone.
 */
export class Sculptor {
  private readonly touched: Uint8Array;
  private touchedIdx: number[] = [];
  private touchedBefore: number[] = [];
  private flattenLevel = 0;

  constructor(readonly hf: Heightfield) {
    this.touched = new Uint8Array(hf.n * hf.n);
  }

  beginStroke(x: number, z: number): void {
    this.flattenLevel = this.hf.heightAt(x, z);
  }

  /** Applies one fixed-step worth of the tool at world position (x, z). */
  apply(tool: TerrainToolId, x: number, z: number, b: BrushSettings, dt: number): void {
    const hf = this.hf;
    const n = hf.n;
    const half = WORLD_SIZE / 2;
    const r = b.radius;
    const i0 = Math.max(0, Math.floor((x - r + half) / hf.cell));
    const i1 = Math.min(n - 1, Math.ceil((x + r + half) / hf.cell));
    const j0 = Math.max(0, Math.floor((z - r + half) / hf.cell));
    const j1 = Math.min(n - 1, Math.ceil((z + r + half) / hf.cell));
    if (i1 < i0 || j1 < j0) return;

    const sign = tool === 'lower' ? -1 : 1;
    const amount = b.strength * dt;
    let any = false;

    for (let j = j0; j <= j1; j++) {
      const dz = hf.worldZ(j) - z;
      for (let i = i0; i <= i1; i++) {
        const dx = hf.worldX(i) - x;
        const f = falloff(Math.sqrt(dx * dx + dz * dz), r);
        if (f <= 0) continue;
        const idx = j * n + i;
        const cur = hf.target[idx] as number;
        let next = cur;

        if (tool === 'raise' || tool === 'lower') {
          next = cur + sign * RAISE_RATE * amount * f;
        } else if (tool === 'flatten') {
          next = cur + (this.flattenLevel - cur) * Math.min(1, BLEND_RATE * amount * f);
        }

        next = next < MIN_H ? MIN_H : next > MAX_H ? MAX_H : next;
        if (next === cur) continue;

        if (!this.touched[idx]) {
          this.touched[idx] = 1;
          this.touchedIdx.push(idx);
          this.touchedBefore.push(cur);
        }
        hf.target[idx] = next;
        any = true;
      }
    }
    if (any) hf.activateRect(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
  }

  /** Ends the stroke and returns it for the undo history (null if nothing changed). */
  endStroke(): Stroke | null {
    const count = this.touchedIdx.length;
    if (count === 0) return null;
    const idx = Int32Array.from(this.touchedIdx);
    const before = Float32Array.from(this.touchedBefore);
    const after = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      after[k] = this.hf.target[idx[k] as number] as number;
      this.touched[idx[k] as number] = 0;
    }
    this.touchedIdx = [];
    this.touchedBefore = [];
    return { idx, before, after };
  }

  /** Re-applies one side of a stroke to the targets (undo uses `before`, redo `after`). */
  applyStroke(s: Stroke, which: 'before' | 'after'): void {
    const hf = this.hf;
    const n = hf.n;
    const src = which === 'before' ? s.before : s.after;
    let i0 = n, i1 = 0, j0 = n, j1 = 0;
    for (let k = 0; k < s.idx.length; k++) {
      const idx = s.idx[k] as number;
      hf.target[idx] = src[k] as number;
      const i = idx % n;
      const j = (idx - i) / n;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
    }
    if (s.idx.length > 0) hf.activateRect(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
  }
}
