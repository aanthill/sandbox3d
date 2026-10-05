import type { SpringParams } from '../anim/spring';

/** World footprint (x and z span [-WORLD_SIZE/2, WORLD_SIZE/2]). */
export const WORLD_SIZE = 4;
export const MIN_H = -0.45;
export const MAX_H = 1.8;
/** Bottom face of the floating block. */
export const BASE_Y = -1.1;
export const CHUNK = 16;

const REST_EPS = 2e-4;
const REST_VEL = 2e-3;

/**
 * Terrain as a grid of height values. Each cell has a *target* height (what
 * tools edit) and a *displayed* height that chases it through a spring, which
 * gives the jelly wobble. Only "active" chunks are simulated and uploaded.
 */
export class Heightfield {
  readonly n: number;
  readonly cell: number;
  readonly chunksPerSide: number;

  readonly target: Float32Array;
  readonly height: Float32Array;
  readonly prev: Float32Array;
  readonly vel: Float32Array;

  /** 1 while the chunk still moves. */
  readonly active: Uint8Array;
  /** 1 when the mesh must refresh the chunk (set every step it moves, and on the final snap). */
  readonly dirty: Uint8Array;
  activeCount = 0;

  constructor(n: number) {
    this.n = n;
    this.cell = WORLD_SIZE / (n - 1);
    this.chunksPerSide = Math.ceil(n / CHUNK);
    const len = n * n;
    this.target = new Float32Array(len);
    this.height = new Float32Array(len);
    this.prev = new Float32Array(len);
    this.vel = new Float32Array(len);
    const chunks = this.chunksPerSide * this.chunksPerSide;
    this.active = new Uint8Array(chunks);
    this.dirty = new Uint8Array(chunks);
  }

  index(i: number, j: number): number {
    return j * this.n + i;
  }

  /** Marks chunks overlapping the (inclusive) cell rectangle as moving. */
  activateRect(i0: number, j0: number, i1: number, j1: number): void {
    const cps = this.chunksPerSide;
    const c0 = Math.max(0, Math.floor(i0 / CHUNK));
    const c1 = Math.min(cps - 1, Math.floor(i1 / CHUNK));
    const r0 = Math.max(0, Math.floor(j0 / CHUNK));
    const r1 = Math.min(cps - 1, Math.floor(j1 / CHUNK));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cps + c;
        if (!this.active[k]) {
          this.active[k] = 1;
          this.activeCount++;
        }
        this.dirty[k] = 1;
      }
    }
  }

  activateAll(): void {
    this.activateRect(0, 0, this.n - 1, this.n - 1);
  }

  /** Writes heights instantly (no spring), e.g. after generating a world. */
  setInstant(index: number, h: number): void {
    this.target[index] = h;
    this.height[index] = h;
    this.prev[index] = h;
    this.vel[index] = 0;
  }

  /** Advances the springs of every active chunk by one fixed step. */
  step(dt: number, p: SpringParams): void {
    if (this.activeCount === 0) return;
    const { n, chunksPerSide: cps, target, height, prev, vel } = this;
    const k = p.stiffness;
    const c = p.damping;

    for (let ch = 0; ch < this.active.length; ch++) {
      if (!this.active[ch]) continue;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const x1 = Math.min(n, cx + CHUNK);
      const y1 = Math.min(n, cy + CHUNK);
      let resting = true;

      for (let j = cy; j < y1; j++) {
        let idx = j * n + cx;
        for (let i = cx; i < x1; i++, idx++) {
          const h = height[idx] as number;
          const t = target[idx] as number;
          prev[idx] = h;
          let v = vel[idx] as number;
          v += (k * (t - h) - c * v) * dt;
          const nh = h + v * dt;
          vel[idx] = v;
          height[idx] = nh;
          if (Math.abs(t - nh) > REST_EPS || Math.abs(v) > REST_VEL) resting = false;
        }
      }

      this.dirty[ch] = 1;
      if (resting) {
        // Snap and sleep: nothing in this chunk moves anymore.
        for (let j = cy; j < y1; j++) {
          let idx = j * n + cx;
          for (let i = cx; i < x1; i++, idx++) {
            const t = target[idx] as number;
            height[idx] = t;
            prev[idx] = t;
            vel[idx] = 0;
          }
        }
        this.active[ch] = 0;
        this.activeCount--;
      }
    }
  }

  /** Bilinear displayed height at a world position (clamped to the grid). */
  heightAt(x: number, z: number): number {
    const half = WORLD_SIZE / 2;
    const n = this.n;
    let gx = (x + half) / this.cell;
    let gz = (z + half) / this.cell;
    gx = gx < 0 ? 0 : gx > n - 1 ? n - 1 : gx;
    gz = gz < 0 ? 0 : gz > n - 1 ? n - 1 : gz;
    const i0 = Math.min(n - 2, Math.floor(gx));
    const j0 = Math.min(n - 2, Math.floor(gz));
    const fx = gx - i0;
    const fz = gz - j0;
    const h = this.height;
    const a = h[j0 * n + i0] as number;
    const b = h[j0 * n + i0 + 1] as number;
    const cc = h[(j0 + 1) * n + i0] as number;
    const d = h[(j0 + 1) * n + i0 + 1] as number;
    return a + (b - a) * fx + (cc - a) * fz + (a - b - cc + d) * fx * fz;
  }

  /** World coordinate of grid column/row. */
  worldX(i: number): number {
    return -WORLD_SIZE / 2 + i * this.cell;
  }
  worldZ(j: number): number {
    return -WORLD_SIZE / 2 + j * this.cell;
  }
}
