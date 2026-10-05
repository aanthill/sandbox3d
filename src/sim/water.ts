import { CHUNK, Heightfield, WORLD_SIZE } from '../world/heightfield';

/** Water grid never exceeds this (CPU cost); finer terrains are sampled down. */
export const WATER_MAX_N = 128;
export const MAX_SOURCES = 8;

/** Tuning (world units, seconds). Exported so tests can explore it. */
export const WATER_TUNING = {
  /** How fast level differences equalize (world units/s). */
  waveSpeed: 0.45,
  /** 1/s, damps flux (momentum): higher = syrupy (slow to level), lower = sloshy. Measured: ~0.2-0.35 settles fastest. */
  friction: 0.3,
  /** Below this depth, flow is throttled (thin films creep). */
  dRef: 0.04,
};
/** Global rain: depth per second over the whole surface at intensity 1, spread over random cells. */
const RAIN_DEPTH_RATE = 0.0015;
const RAIN_HITS = 48;
const EPS_DEPTH = 1e-5; // below this a cell counts as dry
const MAX_DEPTH = 2.0;
/** Sources pause when the average depth over the whole block reaches this. */
const MAX_AVG_DEPTH = 0.3;
const SOURCE_RADIUS_CELLS = 2.5;
const SEA_RATE = 0.25; // sea level change, world units per second
const WET_UP = 0.25;
const WET_DOWN = 0.004;
const WET_DEPTH = 0.004;
/** A chunk whose largest flux stays below this for CALM_STEPS steps goes to sleep. */
const CALM_FLUX = 2e-5;
const CALM_STEPS = 20;

export interface Source {
  x: number;
  z: number;
  /** Volume per second in world units cubed. */
  rate: number;
}

/**
 * Shallow water on a grid, using the "virtual pipes" model: every cell stores
 * its water depth and the flux it pushes to its 4 neighbours; flux accelerates
 * with the surface-height difference, is damped by friction and is clamped so
 * a cell never gives away more water than it holds. That makes it
 * volume-conserving and unconditionally non-negative.
 *
 * Only chunks near water are simulated. Boundaries are closed (walls).
 * This runs on the CPU for now (docs/backlog.md has the GPU port); the data
 * layout (flat typed arrays per cell) is already what a compute shader wants.
 */
export class WaterSim {
  readonly n: number;
  readonly cell: number;
  readonly cps: number;

  readonly depth: Float32Array;
  readonly ground: Float32Array;
  readonly wet: Float32Array;
  /** Blurred copy of `wet` used to tint the terrain (soft edges, no square cells). */
  readonly wetSoft: Float32Array;
  private softTmp = new Float32Array(0);
  private readonly fL: Float32Array;
  private readonly fR: Float32Array;
  private readonly fU: Float32Array;
  private readonly fD: Float32Array;

  /** Per chunk: contains water. */
  readonly hasWater: Uint8Array;
  /** Per chunk: the water mesh must refresh it. */
  readonly dirty: Uint8Array;
  /** Per chunk: the terrain colors must refresh (wetness changed). */
  readonly wetDirty: Uint8Array;
  private readonly damp: Uint8Array;
  private readonly proc: Uint8Array;
  private readonly procList: Int32Array;
  private readonly asleep: Uint8Array;
  private readonly calm: Uint8Array;
  private readonly chunkFlux: Float32Array;
  private readonly chunkSum: Float32Array;

  readonly sources: Source[] = [];
  /** 0..1 weather rain; set by the app, applied in step(). */
  rainIntensity = 0;
  private rngState = 0x9e3779b9;
  /** Sum of all depths (volume = totalDepth * cell^2). */
  totalDepth = 0;

  private seaTarget: number | null = null;
  private seaLevel = -10;
  private stepCount = 0;
  private readonly G: number;
  private readonly hfRatio: number;

  constructor(private readonly hf: Heightfield) {
    this.n = Math.min(hf.n, WATER_MAX_N);
    this.cell = WORLD_SIZE / (this.n - 1);
    this.cps = Math.ceil(this.n / CHUNK);
    this.hfRatio = (hf.n - 1) / (this.n - 1);
    const len = this.n * this.n;
    this.depth = new Float32Array(len);
    this.ground = new Float32Array(len);
    this.wet = new Float32Array(len);
    this.wetSoft = new Float32Array(len);
    this.fL = new Float32Array(len);
    this.fR = new Float32Array(len);
    this.fU = new Float32Array(len);
    this.fD = new Float32Array(len);
    const chunks = this.cps * this.cps;
    this.hasWater = new Uint8Array(chunks);
    this.dirty = new Uint8Array(chunks);
    this.wetDirty = new Uint8Array(chunks);
    this.damp = new Uint8Array(chunks);
    this.proc = new Uint8Array(chunks);
    this.procList = new Int32Array(chunks);
    this.asleep = new Uint8Array(chunks);
    this.calm = new Uint8Array(chunks);
    this.chunkFlux = new Float32Array(chunks);
    this.chunkSum = new Float32Array(chunks);
    // Level differences travel at WAVE_SPEED world units/s. In cell units: G = (c / cell)^2.
    // Clamped so the explicit integrator (60 Hz) stays well inside its stability limit.
    const g = (WATER_TUNING.waveSpeed / this.cell) ** 2;
    this.G = Math.min(g, 0.35 / (1 / 60) ** 2 / 4);
    this.syncGroundRect(0, 0, this.n - 1, this.n - 1);
  }

  index(i: number, j: number): number {
    return j * this.n + i;
  }

  // ------------------------------------------------------------- ground

  /** Copies (and resamples) the terrain's displayed heights into the water grid for a cell rect. */
  private syncGroundRect(i0: number, j0: number, i1: number, j1: number): void {
    const hf = this.hf;
    const n = this.n;
    const ground = this.ground;
    if (hf.n === n) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) ground[j * n + i] = hf.height[j * n + i] as number;
      }
      return;
    }
    const r = this.hfRatio;
    const hn = hf.n;
    const h = hf.height;
    for (let j = j0; j <= j1; j++) {
      const gy = Math.min(hn - 1.0001, j * r);
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      for (let i = i0; i <= i1; i++) {
        const gx = Math.min(hn - 1.0001, i * r);
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const a = h[y0 * hn + x0] as number;
        const b = h[y0 * hn + x0 + 1] as number;
        const c = h[(y0 + 1) * hn + x0] as number;
        const d = h[(y0 + 1) * hn + x0 + 1] as number;
        ground[j * n + i] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
      }
    }
  }

  /** Follows the jelly terrain: re-reads heights wherever the terrain is still moving. */
  private syncGround(): void {
    const hf = this.hf;
    if (hf.activeCount === 0) return;
    const n = this.n;
    const cps = hf.chunksPerSide;
    for (let ch = 0; ch < hf.active.length; ch++) {
      if (!hf.active[ch]) continue;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      // Terrain cell rect -> water cell rect (inclusive, padded by 1).
      const k = 1 / this.hfRatio;
      const i0 = Math.max(0, Math.floor(cx * k) - 1);
      const i1 = Math.min(n - 1, Math.ceil((cx + CHUNK) * k) + 1);
      const j0 = Math.max(0, Math.floor(cy * k) - 1);
      const j1 = Math.min(n - 1, Math.ceil((cy + CHUNK) * k) + 1);
      this.syncGroundRect(i0, j0, i1, j1);
      // Water sitting on moving ground must keep simulating.
      for (let j = j0; j <= j1; j += CHUNK) {
        for (let i = i0; i <= i1; i += CHUNK) this.rouse(i, j);
      }
      this.rouse(i1, j1);
      this.rouse(i0, j1);
      this.rouse(i1, j0);
    }
  }

  // ------------------------------------------------------------ helpers

  private chunkOf(i: number, j: number): number {
    return Math.floor(j / CHUNK) * this.cps + Math.floor(i / CHUNK);
  }

  private wake(i: number, j: number): void {
    const ch = this.chunkOf(i, j);
    this.hasWater[ch] = 1;
    this.dirty[ch] = 1;
    this.asleep[ch] = 0;
    this.calm[ch] = 0;
  }

  private rouse(i: number, j: number): void {
    const ch = this.chunkOf(i, j);
    this.asleep[ch] = 0;
    this.calm[ch] = 0;
  }

  /** Cell rect (clamped) covering a world-space disc. */
  private discRect(x: number, z: number, r: number, out: { i0: number; i1: number; j0: number; j1: number }): void {
    const half = WORLD_SIZE / 2;
    out.i0 = Math.max(0, Math.floor((x - r + half) / this.cell));
    out.i1 = Math.min(this.n - 1, Math.ceil((x + r + half) / this.cell));
    out.j0 = Math.max(0, Math.floor((z - r + half) / this.cell));
    out.j1 = Math.min(this.n - 1, Math.ceil((z + r + half) / this.cell));
  }
  private readonly rect = { i0: 0, i1: 0, j0: 0, j1: 0 };

  /** Water surface height (ground + depth) at a world position, nearest cell. */
  surfaceAt(x: number, z: number): number {
    const half = WORLD_SIZE / 2;
    const i = Math.min(this.n - 1, Math.max(0, Math.round((x + half) / this.cell)));
    const j = Math.min(this.n - 1, Math.max(0, Math.round((z + half) / this.cell)));
    const idx = j * this.n + i;
    return (this.ground[idx] as number) + (this.depth[idx] as number);
  }

  depthAt(x: number, z: number): number {
    const half = WORLD_SIZE / 2;
    const i = Math.min(this.n - 1, Math.max(0, Math.round((x + half) / this.cell)));
    const j = Math.min(this.n - 1, Math.max(0, Math.round((z + half) / this.cell)));
    return this.depth[j * this.n + i] as number;
  }

  /** Wetness (0..1) for a *terrain* cell, sampled from the nearest water cell. */
  wetForTerrainCell(ti: number, tj: number): number {
    const n = this.n;
    if (this.hf.n === n) return this.wetSoft[tj * n + ti] as number;
    // Terrain finer than the water grid: bilinear sample of the softened field.
    const gx = Math.min(n - 1.0001, ti / this.hfRatio);
    const gy = Math.min(n - 1.0001, tj / this.hfRatio);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const w = this.wetSoft;
    const a = w[y0 * n + x0] as number;
    const b = w[y0 * n + x0 + 1] as number;
    const c = w[(y0 + 1) * n + x0] as number;
    const d = w[(y0 + 1) * n + x0 + 1] as number;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /**
   * Re-blurs `wetSoft` inside the inclusive water-cell rect (a 5-tap tent filter in both
   * directions, ~2 cells of falloff). Call it before recoloring terrain there.
   */
  softenWet(i0: number, j0: number, i1: number, j1: number): void {
    const n = this.n;
    i0 = Math.max(0, i0);
    j0 = Math.max(0, j0);
    i1 = Math.min(n - 1, i1);
    j1 = Math.min(n - 1, j1);
    const w = i1 - i0 + 1;
    if (w <= 0 || j1 < j0) return;
    // Horizontal pass also covers 2 rows above/below the rect, so every output row sees its true neighbors.
    const r0 = Math.max(0, j0 - 2);
    const r1 = Math.min(n - 1, j1 + 2);
    const rows = r1 - r0 + 1;
    if (this.softTmp.length < w * rows) this.softTmp = new Float32Array(w * rows);
    const tmp = this.softTmp;
    const wet = this.wet;
    for (let j = 0; j < rows; j++) {
      const base = (r0 + j) * n;
      for (let i = 0; i < w; i++) {
        const ii = i0 + i;
        const l2 = wet[base + (ii - 2 < 0 ? 0 : ii - 2)] as number;
        const l1 = wet[base + (ii - 1 < 0 ? 0 : ii - 1)] as number;
        const c0 = wet[base + ii] as number;
        const r1v = wet[base + (ii + 1 > n - 1 ? n - 1 : ii + 1)] as number;
        const r2v = wet[base + (ii + 2 > n - 1 ? n - 1 : ii + 2)] as number;
        tmp[j * w + i] = (l2 + 2 * l1 + 3 * c0 + 2 * r1v + r2v) / 9;
      }
    }
    const soft = this.wetSoft;
    for (let jj = j0; jj <= j1; jj++) {
      const row = (k: number): number => {
        const y = jj + k;
        return (y < r0 ? r0 : y > r1 ? r1 : y) - r0;
      };
      const o0 = row(-2) * w;
      const o1 = row(-1) * w;
      const o2 = row(0) * w;
      const o3 = row(1) * w;
      const o4 = row(2) * w;
      for (let i = 0; i < w; i++) {
        const v = ((tmp[o0 + i] as number) + 2 * (tmp[o1 + i] as number) + 3 * (tmp[o2 + i] as number) + 2 * (tmp[o3 + i] as number) + (tmp[o4 + i] as number)) / 9;
        soft[jj * n + i0 + i] = v < 0.002 ? 0 : v;
      }
    }
  }

  /** Volume in world units cubed (from the last step). */
  get volume(): number {
    return this.totalDepth * this.cell * this.cell;
  }

  /** Exact volume, summed over the whole grid (diagnostics and tests). */
  measureVolume(): number {
    let t = 0;
    for (let k = 0; k < this.depth.length; k++) t += this.depth[k] as number;
    return t * this.cell * this.cell;
  }

  get averageDepth(): number {
    return this.totalDepth / (this.n * this.n);
  }

  // ------------------------------------------------------------ tools

  /** Adds `volume` (world units cubed) spread over a soft disc. */
  addVolume(x: number, z: number, radius: number, volume: number): void {
    const r = this.rect;
    this.discRect(x, z, radius, r);
    const half = WORLD_SIZE / 2;
    let wsum = 0;
    for (let j = r.j0; j <= r.j1; j++) {
      const dz = j * this.cell - half - z;
      for (let i = r.i0; i <= r.i1; i++) {
        const dx = i * this.cell - half - x;
        wsum += softFalloff(Math.sqrt(dx * dx + dz * dz), radius);
      }
    }
    if (wsum <= 0) return;
    const depthTotal = volume / (this.cell * this.cell);
    for (let j = r.j0; j <= r.j1; j++) {
      const dz = j * this.cell - half - z;
      for (let i = r.i0; i <= r.i1; i++) {
        const dx = i * this.cell - half - x;
        const w = softFalloff(Math.sqrt(dx * dx + dz * dz), radius);
        if (w <= 0) continue;
        const idx = j * this.n + i;
        const nd = Math.min(MAX_DEPTH, (this.depth[idx] as number) + (depthTotal * w) / wsum);
        this.depth[idx] = nd;
        this.wake(i, j);
      }
    }
  }

  /** Approximate flow speed at a cell (cells per second): total outflow over depth. Drives foam. */
  flowSpeed(idx: number): number {
    const d = this.depth[idx] as number;
    if (d <= 0) return 0;
    return ((this.fL[idx] as number) + (this.fR[idx] as number) + (this.fU[idx] as number) + (this.fD[idx] as number)) / Math.max(d, 0.02);
  }

  /** Removes water in a disc: proportional drain plus a small constant so thin films vanish. */
  drain(x: number, z: number, radius: number, rate: number, dt: number): void {
    const r = this.rect;
    this.discRect(x, z, radius, r);
    const half = WORLD_SIZE / 2;
    for (let j = r.j0; j <= r.j1; j++) {
      const dz = j * this.cell - half - z;
      for (let i = r.i0; i <= r.i1; i++) {
        const dx = i * this.cell - half - x;
        const w = softFalloff(Math.sqrt(dx * dx + dz * dz), radius);
        if (w <= 0) continue;
        const idx = j * this.n + i;
        const d = this.depth[idx] as number;
        if (d <= 0) continue;
        this.depth[idx] = Math.max(0, d - d * Math.min(1, 4 * rate * w * dt) - 0.05 * rate * w * dt);
        this.dirty[this.chunkOf(i, j)] = 1;
        this.rouse(i, j);
      }
    }
  }

  /** Persistent spring. Returns false when the maximum number of sources is reached. */
  addSource(x: number, z: number, rate: number): boolean {
    if (this.sources.length >= MAX_SOURCES) return false;
    this.sources.push({ x, z, rate });
    return true;
  }

  /** Removes the source closest to (x, z) within `radius`; returns whether one was removed. */
  removeSourceNear(x: number, z: number, radius: number): boolean {
    let best = -1;
    let bestD = radius * radius;
    for (let k = 0; k < this.sources.length; k++) {
      const s = this.sources[k] as Source;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return false;
    this.sources.splice(best, 1);
    return true;
  }

  /** Global sea level: raising floods every cell below it; lowering drains the sea. null = off. */
  setSeaLevel(level: number | null): void {
    this.seaTarget = level;
    if (level !== null && this.seaLevel < -5) this.seaLevel = Math.min(level, this.lowestGround());
  }

  private lowestGround(): number {
    let m = Infinity;
    for (let k = 0; k < this.ground.length; k++) if ((this.ground[k] as number) < m) m = this.ground[k] as number;
    return m;
  }

  private stepSea(dt: number): void {
    if (this.seaTarget === null) return;
    const old = this.seaLevel;
    const diff = this.seaTarget - old;
    if (Math.abs(diff) < 1e-5) return;
    const level = old + Math.sign(diff) * Math.min(Math.abs(diff), SEA_RATE * dt);
    this.seaLevel = level;
    const raising = level > old;
    const n = this.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const g = this.ground[idx] as number;
        const d = this.depth[idx] as number;
        if (raising) {
          if (g < level && g + d < level) {
            this.depth[idx] = Math.min(MAX_DEPTH, level - g);
            this.wake(i, j);
          }
        } else if (d > 0 && g + d <= old + 0.02) {
          // This cell belongs to the sea: lower it with the level.
          this.depth[idx] = Math.max(0, Math.min(d, level - g));
          this.dirty[this.chunkOf(i, j)] = 1;
          this.rouse(i, j);
        }
      }
    }
  }

  /** Drops RAIN_HITS random heavy-ish drops per step (a tiny uniform film would just evaporate). */
  private applyRain(dt: number): void {
    const n = this.n;
    const per = (RAIN_DEPTH_RATE * this.rainIntensity * dt * n * n) / RAIN_HITS;
    for (let k = 0; k < RAIN_HITS; k++) {
      let x = this.rngState;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.rngState = x >>> 0;
      const idx = this.rngState % (n * n);
      this.depth[idx] = Math.min(MAX_DEPTH, (this.depth[idx] as number) + per);
      this.wake(idx % n, (idx / n) | 0);
    }
  }

  // --------------------------------------------------------------- step

  step(dt: number): void {
    this.stepCount++;
    this.syncGround();
    this.stepSea(dt);

    // Persistent sources.
    if (this.averageDepth < MAX_AVG_DEPTH) {
      for (const s of this.sources) this.addVolume(s.x, s.z, SOURCE_RADIUS_CELLS * this.cell, s.rate * dt);
    }

    if (this.rainIntensity > 0 && this.averageDepth < MAX_AVG_DEPTH) this.applyRain(dt);

    // Which chunks to simulate: every chunk with water, plus its 8 neighbours.
    const cps = this.cps;
    this.proc.fill(0);
    let count = 0;
    for (let ch = 0; ch < this.hasWater.length; ch++) {
      if (!this.hasWater[ch] || this.asleep[ch]) continue;
      const cx = ch % cps;
      const cy = (ch - cx) / cps;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= cps) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= cps) continue;
          const k = y * cps + x;
          if (!this.proc[k]) {
            this.proc[k] = 1;
            this.procList[count++] = k;
          }
        }
      }
    }
    if (count > 0) {
      this.fluxPass(dt, count);
      this.depthPass(dt, count);
      this.updateSleep(count);
    }
    let total = 0;
    for (let ch = 0; ch < this.chunkSum.length; ch++) total += this.chunkSum[ch] as number;
    this.totalDepth = total;
    this.dryPass();
  }

  private fluxPass(dt: number, count: number): void {
    const n = this.n;
    const { depth, ground, fL, fR, fU, fD } = this;
    const gain = dt * this.G;
    const fr = Math.exp(-WATER_TUNING.friction * dt);
    const invRef = 1 / WATER_TUNING.dRef;
    const cps = this.cps;

    for (let p = 0; p < count; p++) {
      const ch = this.procList[p] as number;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const x1 = Math.min(n, cx + CHUNK);
      const y1 = Math.min(n, cy + CHUNK);
      let fluxMax = 0;
      for (let j = cy; j < y1; j++) {
        for (let i = cx; i < x1; i++) {
          const idx = j * n + i;
          const d = depth[idx] as number;
          if (d <= 0) {
            fL[idx] = 0;
            fR[idx] = 0;
            fU[idx] = 0;
            fD[idx] = 0;
            continue;
          }
          const s = (ground[idx] as number) + d;
          let l = 0, r = 0, u = 0, dn = 0;

          if (i > 0) {
            const o = idx - 1;
            const dh = s - ((ground[o] as number) + (depth[o] as number));
            const donor = dh > 0 ? d : (depth[o] as number);
            l = Math.max(0, (fL[idx] as number) * fr + gain * dh * Math.min(1, donor * invRef));
          }
          if (i < n - 1) {
            const o = idx + 1;
            const dh = s - ((ground[o] as number) + (depth[o] as number));
            const donor = dh > 0 ? d : (depth[o] as number);
            r = Math.max(0, (fR[idx] as number) * fr + gain * dh * Math.min(1, donor * invRef));
          }
          if (j > 0) {
            const o = idx - n;
            const dh = s - ((ground[o] as number) + (depth[o] as number));
            const donor = dh > 0 ? d : (depth[o] as number);
            u = Math.max(0, (fU[idx] as number) * fr + gain * dh * Math.min(1, donor * invRef));
          }
          if (j < n - 1) {
            const o = idx + n;
            const dh = s - ((ground[o] as number) + (depth[o] as number));
            const donor = dh > 0 ? d : (depth[o] as number);
            dn = Math.max(0, (fD[idx] as number) * fr + gain * dh * Math.min(1, donor * invRef));
          }

          // Never give away more than the cell holds.
          const total = (l + r + u + dn) * dt;
          if (total > d) {
            const k = d / total;
            l *= k;
            r *= k;
            u *= k;
            dn *= k;
          }
          fL[idx] = l;
          fR[idx] = r;
          fU[idx] = u;
          fD[idx] = dn;
          if (l > fluxMax) fluxMax = l;
          if (r > fluxMax) fluxMax = r;
          if (u > fluxMax) fluxMax = u;
          if (dn > fluxMax) fluxMax = dn;
        }
      }
      this.chunkFlux[ch] = fluxMax;
    }
  }

  private depthPass(dt: number, count: number): void {
    const n = this.n;
    const { depth, fL, fR, fU, fD, wet } = this;
    const cps = this.cps;
    const tick = (this.stepCount & 7) === 0;

    for (let p = 0; p < count; p++) {
      const ch = this.procList[p] as number;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const x1 = Math.min(n, cx + CHUNK);
      const y1 = Math.min(n, cy + CHUNK);
      let any = false;
      let wetMax = 0;
      let sum = 0;

      for (let j = cy; j < y1; j++) {
        for (let i = cx; i < x1; i++) {
          const idx = j * n + i;
          const out = (fL[idx] as number) + (fR[idx] as number) + (fU[idx] as number) + (fD[idx] as number);
          let inflow = 0;
          if (i > 0) inflow += fR[idx - 1] as number;
          if (i < n - 1) inflow += fL[idx + 1] as number;
          if (j > 0) inflow += fD[idx - n] as number;
          if (j < n - 1) inflow += fU[idx + n] as number;

          let d = (depth[idx] as number) + dt * (inflow - out);
          if (d < EPS_DEPTH) d = 0;
          else if (d > MAX_DEPTH) d = MAX_DEPTH;
          depth[idx] = d;
          sum += d;
          if (d > 0) any = true;

          // Wetness: soaks in fast, dries slowly.
          const w = wet[idx] as number;
          const nw = d > WET_DEPTH ? w + (1 - w) * WET_UP : w * (1 - WET_DOWN);
          wet[idx] = nw < 0.002 ? 0 : nw;
          if (nw > wetMax) wetMax = nw;
        }
      }

      const had = this.hasWater[ch] === 1;
      this.hasWater[ch] = any ? 1 : 0;
      this.chunkSum[ch] = sum;
      if (any || had) this.dirty[ch] = 1;
      this.damp[ch] = wetMax > 0.004 ? 1 : 0;
      if (tick && wetMax > 0.004) this.wetDirty[ch] = 1;
    }
  }

  /** Puts calm chunks to sleep (their flux is zeroed so volume stays exactly conserved). */
  private updateSleep(count: number): void {
    const n = this.n;
    const cps = this.cps;
    for (let p = 0; p < count; p++) {
      const ch = this.procList[p] as number;
      if (!this.hasWater[ch]) {
        this.asleep[ch] = 0;
        this.calm[ch] = 0;
        continue;
      }
      if ((this.chunkFlux[ch] as number) >= CALM_FLUX) {
        this.asleep[ch] = 0;
        this.calm[ch] = 0;
        continue;
      }
      if (this.asleep[ch]) continue;
      const c = (this.calm[ch] as number) + 1;
      this.calm[ch] = c;
      if (c < CALM_STEPS) continue;
      this.asleep[ch] = 1;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const x1 = Math.min(n, cx + CHUNK);
      const y1 = Math.min(n, cy + CHUNK);
      for (let j = cy; j < y1; j++) {
        for (let i = cx; i < x1; i++) {
          const idx = j * n + i;
          this.fL[idx] = 0;
          this.fR[idx] = 0;
          this.fU[idx] = 0;
          this.fD[idx] = 0;
        }
      }
    }
  }

  /** Slow drying for damp chunks that no longer have water around them. */
  private dryPass(): void {
    if ((this.stepCount & 7) !== 0) return;
    const n = this.n;
    const cps = this.cps;
    const f = (1 - WET_DOWN) ** 8;
    for (let ch = 0; ch < this.damp.length; ch++) {
      if (!this.damp[ch] || this.proc[ch] || this.hasWater[ch]) continue;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const x1 = Math.min(n, cx + CHUNK);
      const y1 = Math.min(n, cy + CHUNK);
      let wetMax = 0;
      for (let j = cy; j < y1; j++) {
        for (let i = cx; i < x1; i++) {
          const idx = j * n + i;
          const w = (this.wet[idx] as number) * f;
          this.wet[idx] = w < 0.002 ? 0 : w;
          if (w > wetMax) wetMax = w;
        }
      }
      this.wetDirty[ch] = 1;
      if (wetMax <= 0.004) this.damp[ch] = 0;
    }
  }

  // ------------------------------------------------------------ misc

  /** Largest flux magnitude (a calm lake has ~0). Used by tests and diagnostics. */
  maxFlux(): number {
    let m = 0;
    for (let k = 0; k < this.fL.length; k++) {
      m = Math.max(m, this.fL[k] as number, this.fR[k] as number, this.fU[k] as number, this.fD[k] as number);
    }
    return m;
  }

  /** Copies water and sources from another sim (e.g. after a quality change), resampling by world position. */
  copyFrom(old: WaterSim): void {
    const half = WORLD_SIZE / 2;
    const on = old.n;
    for (let j = 0; j < this.n; j++) {
      const gy = Math.min(on - 1.0001, ((j * this.cell) / WORLD_SIZE) * (on - 1));
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      for (let i = 0; i < this.n; i++) {
        const gx = Math.min(on - 1.0001, ((i * this.cell) / WORLD_SIZE) * (on - 1));
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const at = (a: Float32Array) => {
          const p = a[y0 * on + x0] as number;
          const q = a[y0 * on + x0 + 1] as number;
          const r = a[(y0 + 1) * on + x0] as number;
          const s = a[(y0 + 1) * on + x0 + 1] as number;
          return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
        };
        const idx = j * this.n + i;
        const d = at(old.depth);
        this.depth[idx] = d < EPS_DEPTH ? 0 : d;
        this.wet[idx] = at(old.wet);
        if (d > 0) this.wake(i, j);
      }
    }
    void half;
    this.sources.push(...old.sources.map((s) => ({ ...s })));
    this.seaTarget = old.seaTarget;
    this.seaLevel = old.seaLevel;
    this.wetDirty.fill(1);
    this.dirty.fill(1);
  }
}

/** Soft disc weight: 1 at the center, 0 at the edge. */
function softFalloff(d: number, r: number): number {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return t * t * (3 - 2 * t);
}
