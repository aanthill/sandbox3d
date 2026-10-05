import { InstancedMesh, MeshStandardNodeMaterial, SphereGeometry, Color } from 'three/webgpu';
import type { WaterSim } from '../sim/water';
import { PALETTE } from '../world/palette';

const GRAVITY = 5.5;
const LIFE = 1.6;
const HIDDEN = 0;

/**
 * Splash droplets: a fixed pool drawn as one InstancedMesh (rule 2), simulated
 * as a ring buffer with no allocations per frame (rule 5). Capacity comes from the quality tier.
 */
export class Splash {
  readonly mesh: InstancedMesh;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly size: Float32Array;
  private head = 0;
  private live = 0;

  constructor(readonly capacity: number) {
    const mat = new MeshStandardNodeMaterial({
      color: new Color(PALETTE.waterShallow),
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    this.mesh = new InstancedMesh(new SphereGeometry(1, 8, 6), mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity).fill(LIFE);
    this.size = new Float32Array(capacity);
    this.writeAll();
  }

  /** Spawns `count` droplets bursting upward from (x, y, z). Oldest droplets are recycled. */
  emit(x: number, y: number, z: number, count: number, speed: number, spread: number): void {
    for (let k = 0; k < count; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.capacity;
      const a = Math.random() * Math.PI * 2;
      const h = Math.random() * spread;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      this.vx[i] = Math.cos(a) * h;
      this.vz[i] = Math.sin(a) * h;
      this.vy[i] = speed * (0.6 + Math.random() * 0.6);
      this.size[i] = 0.014 + Math.random() * 0.016;
      this.age[i] = 0;
    }
  }

  step(dt: number, water: WaterSim): void {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if ((this.age[i] as number) >= LIFE) continue;
      this.age[i] = (this.age[i] as number) + dt;
      this.vy[i] = (this.vy[i] as number) - GRAVITY * dt;
      this.px[i] = (this.px[i] as number) + (this.vx[i] as number) * dt;
      this.py[i] = (this.py[i] as number) + (this.vy[i] as number) * dt;
      this.pz[i] = (this.pz[i] as number) + (this.vz[i] as number) * dt;
      if ((this.vy[i] as number) < 0 && (this.py[i] as number) < water.surfaceAt(this.px[i] as number, this.pz[i] as number)) {
        this.age[i] = LIFE;
        continue;
      }
      live++;
    }
    this.live = live;
  }

  /** Writes instance matrices; skipped entirely when nothing is alive (and once more to clear). */
  update(): void {
    if (this.live === 0 && !this.dirtyEmpty) return;
    this.dirtyEmpty = this.live > 0;
    this.writeAll();
  }

  private dirtyEmpty = false;

  private writeAll(): void {
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) {
      const alive = (this.age[i] as number) < LIFE;
      const t = (this.age[i] as number) / LIFE;
      const s = alive ? (this.size[i] as number) * (1 - t * t) : HIDDEN;
      const o = i * 16;
      arr[o] = s;
      arr[o + 5] = s;
      arr[o + 10] = s;
      arr[o + 15] = 1;
      arr[o + 12] = this.px[i] as number;
      arr[o + 13] = this.py[i] as number;
      arr[o + 14] = this.pz[i] as number;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardNodeMaterial).dispose();
    this.mesh.dispose();
  }
}
