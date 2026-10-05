import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial } from 'three/webgpu';
import { Spring1D, ringSpring } from '../anim/spring';
import type { Heightfield } from '../world/heightfield';

const SEGMENTS = 72;
const LIFT = 0.03;

/** Ring that hugs the terrain under the cursor; its radius springs to the brush size. */
export class BrushRing {
  readonly object: Line;
  // SEGMENTS + 1 points: the last repeats the first, because WebGPU has no LineLoop.
  private readonly positions = new Float32Array((SEGMENTS + 1) * 3);
  private readonly attr: BufferAttribute;
  private readonly radius = new Spring1D(0.3);
  private readonly params = ringSpring();

  constructor(color: number) {
    const geo = new BufferGeometry();
    this.attr = new BufferAttribute(this.positions, 3);
    geo.setAttribute('position', this.attr);
    this.object = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  setRadius(r: number): void {
    this.radius.target = r;
  }

  step(dt: number): void {
    this.radius.step(dt, this.params);
  }

  /** Moves the ring to (x, z) on the terrain; hides it when there is no hit. */
  update(hf: Heightfield, x: number, z: number, visible: boolean): void {
    this.object.visible = visible;
    if (!visible) return;
    const r = Math.max(0.02, this.radius.value);
    for (let k = 0; k <= SEGMENTS; k++) {
      const a = (k / SEGMENTS) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const o = k * 3;
      this.positions[o] = px;
      this.positions[o + 1] = hf.heightAt(px, pz) + LIFT;
      this.positions[o + 2] = pz;
    }
    this.attr.needsUpdate = true;
  }
}
