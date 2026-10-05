import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, float, fract, normalize, smoothstep, step, time, uniform, vec3 } from 'three/tsl';
import { PALETTE } from '../world/palette';

const TOP = 3.4;
const BOTTOM = -1.0;
const HEIGHT = TOP - BOTTOM;
const AREA = 2.6; // half-size of the rain volume (a bit wider than the block)
const LENGTH = 0.14;
const WIDTH = 0.006;

/**
 * Rain streaks. One static mesh of `count` camera-facing quads; the whole animation
 * (falling, wrapping, density) happens in the vertex shader, so the CPU does nothing per frame (rule 3, 5).
 * Terrain and water occlude the streaks through the depth buffer.
 */
export class Rain {
  readonly mesh: Mesh;
  private readonly amount = uniform(0);

  constructor(count: number) {
    const pos = new Float32Array(count * 4 * 3); // unused by the shader, but gives the vertex count
    const data = new Float32Array(count * 4 * 4); // x, z, phase, speed
    const corner = new Float32Array(count * 4 * 2);
    const index = new Uint32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * AREA;
      const z = (Math.random() * 2 - 1) * AREA;
      const phase = Math.random();
      const speed = 6.5 + Math.random() * 3;
      for (let v = 0; v < 4; v++) {
        const o = (i * 4 + v) * 4;
        data[o] = x;
        data[o + 1] = z;
        data[o + 2] = phase;
        data[o + 3] = speed;
        corner[(i * 4 + v) * 2] = v & 1 ? 1 : -1;
        corner[(i * 4 + v) * 2 + 1] = v & 2 ? 1 : 0;
      }
      const b = i * 4;
      index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('rain', new BufferAttribute(data, 4));
    geo.setAttribute('corner', new BufferAttribute(corner, 2));
    geo.setIndex(new BufferAttribute(index, 1));

    const r = attribute('rain', 'vec4');
    const c = attribute('corner', 'vec2');
    const t = fract(r.z.add(time.mul(r.w).div(HEIGHT)));
    const y = float(TOP).sub(t.mul(HEIGHT));
    const base = vec3(r.x, y, r.y);
    const toCam = normalize(vec3(cameraPosition.x.sub(base.x), 0, cameraPosition.z.sub(base.z)));
    const right = vec3(toCam.z.negate(), 0, toCam.x);
    // Each streak is shown only if its random threshold is under the rain amount (density slider).
    const show = step(fract(r.z.mul(7.13).add(r.x.mul(3.7))), this.amount);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    material.positionNode = base
      .add(right.mul(c.x.mul(WIDTH).mul(show)))
      .add(vec3(c.y.mul(0.02).mul(show), c.y.mul(LENGTH).mul(show), 0));
    material.colorNode = vec3(...new Color(PALETTE.rain).toArray());
    material.opacityNode = float(0.5).mul(smoothstep(float(0), float(0.06), t)).mul(smoothstep(float(1), float(0.9), t));

    this.mesh = new Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  setAmount(v: number): void {
    this.amount.value = v;
    this.mesh.visible = v > 0.001;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
