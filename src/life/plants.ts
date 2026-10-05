import { Color, DynamicDrawUsage, Group, InstancedMesh, MeshLambertNodeMaterial, type BufferGeometry } from 'three/webgpu';
import type { WaterSim } from '../sim/water';
import { CHUNK, WORLD_SIZE, type Heightfield } from '../world/heightfield';
import { GROWTH, TREE, growthStep, makeRng, popScale, suitability } from './growth';
import { createTreeGeometry } from './plant-geometry';
import { PLANT_POP } from '../anim/config';

/** Each plant's growth is re-evaluated once every SLICES frames (spreads the work, rule 5/CPU budget). */
const SLICES = 30;
const SINK = 0.008; // roots sit slightly below the surface
const TREE_SIZE = 1.4;
/** Candidate spots sit on a jittered lattice; wander is a fraction of the pitch (close to random, so trees cluster into groves). */
const JITTER = 0.45;
const MIN_SHOWN = GROWTH.minSize;

/**
 * Procedural trees: a fixed jittered lattice of candidate spots drawn as one InstancedMesh. Trees grow
 * where the ground is flat, in the right height band and moist; they wither when the spot stops suiting
 * them and drown under water. They ride the jelly terrain. Grass is not geometry: it is a texture
 * painted by the terrain material (materials/jelly.ts).
 */
export class Plants {
  readonly group = new Group();
  readonly count: number;
  private readonly trees: InstancedMesh;
  private readonly material = new MeshLambertNodeMaterial();
  private readonly geo: BufferGeometry;

  private readonly px: Float32Array;
  private readonly pz: Float32Array;
  private readonly cosR: Float32Array;
  private readonly sinR: Float32Array;
  private readonly size: Float32Array;
  private readonly threshold: Float32Array;
  private readonly g: Float32Array;
  private readonly age: Float32Array;
  private readonly chunk: Uint16Array;
  private rangeLo = Infinity;
  private rangeHi = -1;
  private readonly agingList: Uint32Array;
  private agingCount = 0;
  private readonly seedList: Uint32Array;
  private seedCount = 0;
  private frame = 0;

  constructor(
    private readonly hf: Heightfield,
    private readonly water: WaterSim,
    count: number,
    seed: number,
  ) {
    this.count = count;
    const rng = makeRng(seed * 7919 + 17);
    this.px = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.cosR = new Float32Array(count);
    this.sinR = new Float32Array(count);
    this.size = new Float32Array(count);
    this.threshold = new Float32Array(count);
    this.g = new Float32Array(count);
    this.age = new Float32Array(count).fill(99);
    this.chunk = new Uint16Array(count);
    this.agingList = new Uint32Array(count);
    this.seedList = new Uint32Array(count);

    const side = Math.ceil(Math.sqrt(count));
    const pitch = WORLD_SIZE / side;
    const cps = hf.chunksPerSide;
    for (let i = 0; i < count; i++) {
      const cx = i % side;
      const cz = Math.floor(i / side);
      const x = -WORLD_SIZE / 2 + (cx + 0.5 + (rng() - 0.5) * 2 * JITTER) * pitch;
      const z = -WORLD_SIZE / 2 + (cz + 0.5 + (rng() - 0.5) * 2 * JITTER) * pitch;
      this.px[i] = x;
      this.pz[i] = z;
      const r = rng() * Math.PI * 2;
      this.cosR[i] = Math.cos(r);
      this.sinR[i] = Math.sin(r);
      this.size[i] = 0.75 + rng() * 0.5;
      this.threshold[i] = rng();
      const gi = Math.min(hf.n - 1, Math.max(0, Math.round((x + WORLD_SIZE / 2) / hf.cell)));
      const gj = Math.min(hf.n - 1, Math.max(0, Math.round((z + WORLD_SIZE / 2) / hf.cell)));
      this.chunk[i] = Math.floor(gj / CHUNK) * cps + Math.floor(gi / CHUNK);
    }

    // Matte (Lambert) material: no specular highlight and no glow at all.
    const treeGeo = createTreeGeometry();
    this.geo = treeGeo;
    this.material.vertexColors = true;
    this.trees = new InstancedMesh(treeGeo, this.material, count);
    this.trees.instanceMatrix.setUsage(DynamicDrawUsage);
    this.trees.frustumCulled = false;
    this.group.add(this.trees);

    // Per-instance tint: wide tonal variety, from near-black pine to olive and bluish greens.
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      const v = 0.55 + rng() * 0.75;
      tint.setRGB(v * (0.7 + rng() * 0.7), v * (0.85 + rng() * 0.3), v * (0.65 + rng() * 0.75));
      this.trees.setColorAt(i, tint);
    }

    // Start already grown, so the world is green from the first frame (no pop-in at load).
    for (let i = 0; i < count; i++) {
      const s = this.suit(i);
      this.g[i] = s > (this.threshold[i] as number) ? s : 0;
    }
    for (let i = 0; i < count; i++) this.writeMatrix(i);
    this.trees.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
  }

  // ---- environment sampling ----

  private wetAt(x: number, z: number): number {
    const w = this.water;
    const half = WORLD_SIZE / 2;
    const i = Math.min(w.n - 1, Math.max(0, Math.round((x + half) / w.cell)));
    const j = Math.min(w.n - 1, Math.max(0, Math.round((z + half) / w.cell)));
    return w.wet[j * w.n + i] as number;
  }

  private suit(i: number): number {
    const x = this.px[i] as number;
    const z = this.pz[i] as number;
    const hf = this.hf;
    const h = hf.heightAt(x, z);
    const e = hf.cell;
    const dx = (hf.heightAt(x + e, z) - h) / e;
    const dz = (hf.heightAt(x, z + e) - h) / e;
    const ny = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    return suitability(TREE, h, ny, this.wetAt(x, z), this.water.depthAt(x, z));
  }

  // ---- rendering ----

  private writeMatrix(i: number): void {
    const k = i * 16;
    const a = this.trees.instanceMatrix.array as Float32Array;
    const g = this.g[i] as number;
    const shown = g < MIN_SHOWN ? 0 : g * popScale(this.age[i] as number) * (this.size[i] as number) * TREE_SIZE;
    const c = (this.cosR[i] as number) * shown;
    const s = (this.sinR[i] as number) * shown;
    const x = this.px[i] as number;
    const z = this.pz[i] as number;
    a[k] = c;
    a[k + 1] = 0;
    a[k + 2] = -s;
    a[k + 3] = 0;
    a[k + 4] = 0;
    a[k + 5] = shown;
    a[k + 6] = 0;
    a[k + 7] = 0;
    a[k + 8] = s;
    a[k + 9] = 0;
    a[k + 10] = c;
    a[k + 11] = 0;
    a[k + 12] = x;
    a[k + 13] = this.hf.heightAt(x, z) - SINK;
    a[k + 14] = z;
    a[k + 15] = 1;
  }

  /** Scatters seeds: plants within `radius` start growing even if nothing has been there yet. */
  seed(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const dx = (this.px[i] as number) - x;
      const dz = (this.pz[i] as number) - z;
      if (dx * dx + dz * dz > r2) continue;
      if (Math.random() > 0.08) continue;
      if ((this.g[i] as number) < 0.2) {
        if ((this.g[i] as number) < MIN_SHOWN) this.startPop(i);
        this.g[i] = 0.2;
        this.threshold[i] = Math.min(this.threshold[i] as number, 0.3); // seeded plants are happy with modest ground
        this.seedList[this.seedCount++] = i;
      }
    }
  }

  /** Per-frame: slow growth in strided slices, pop-in animation, and riding the terrain while it moves. */
  update(dt: number): void {
    this.frame++;
    const hf = this.hf;
    const grow = dt * SLICES;
    this.rangeLo = Infinity;
    this.rangeHi = -1;

    // 1) Growth: every SLICES-th plant this frame.
    for (let i = this.frame % SLICES; i < this.count; i += SLICES) {
      const x = this.px[i] as number;
      const z = this.pz[i] as number;
      const old = this.g[i] as number;
      const depth = this.water.depthAt(x, z);
      const wet = this.wetAt(x, z);
      const next = growthStep(old, this.suit(i), this.threshold[i] as number, wet, depth > GROWTH.drownDepth, grow);
      if (next === old) continue;
      if (old < MIN_SHOWN && next >= MIN_SHOWN) this.startPop(i);
      this.g[i] = next < MIN_SHOWN && old >= MIN_SHOWN ? 0 : next;
      this.write(i);
    }

    // 2) Seeds placed by the tool.
    for (let k = 0; k < this.seedCount; k++) this.write(this.seedList[k] as number);
    this.seedCount = 0;

    // 3) Pop-in animation of recently sprouted plants.
    for (let k = 0; k < this.agingCount; k++) {
      const i = this.agingList[k] as number;
      const age = (this.age[i] as number) + dt;
      this.age[i] = age;
      this.write(i);
      if (age >= PLANT_POP.duration) {
        this.agingList[k] = this.agingList[--this.agingCount] as number;
        k--;
      }
    }

    // 4) Ride the jelly terrain while chunks are moving.
    if (hf.activeCount > 0) {
      for (let i = 0; i < this.count; i++) {
        if ((this.g[i] as number) < MIN_SHOWN) continue; // not there: its matrix is already scale 0
        if (hf.active[this.chunk[i] as number] === 1) this.write(i);
      }
    }

    if (this.rangeHi >= 0) this.flag(this.rangeLo, this.rangeHi);
  }

  private startPop(i: number): void {
    this.age[i] = 0;
    if (this.agingCount < this.agingList.length) this.agingList[this.agingCount++] = i;
  }

  /** Writes plant i's matrix and widens the dirty range of its mesh. */
  private write(i: number): void {
    this.writeMatrix(i);
    if (i < this.rangeLo) this.rangeLo = i;
    if (i > this.rangeHi) this.rangeHi = i;
  }

  private flag(lo: number, hi: number): void {
    const attr = this.trees.instanceMatrix;
    attr.clearUpdateRanges();
    attr.addUpdateRange(lo * 16, (hi - lo + 1) * 16);
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.material.dispose();
    this.geo.dispose();
    this.trees.dispose();
  }
}
