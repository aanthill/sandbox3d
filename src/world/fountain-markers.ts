import { Color, Group, Mesh, MeshStandardNodeMaterial, SphereGeometry } from 'three/webgpu';
import { Spring1D, ringSpring, type SpringParams } from '../anim/spring';
import { MAX_SOURCES, type WaterSim } from '../sim/water';
import { PALETTE } from './palette';

const BASE = 0.07;

/** Small glowing beads over each fountain; they pop in with a spring and shrink out. */
export class FountainMarkers {
  readonly group = new Group();
  private readonly meshes: Mesh[] = [];
  private readonly springs: Spring1D[] = [];
  private readonly spring: SpringParams = ringSpring();

  constructor() {
    const geo = new SphereGeometry(BASE, 12, 8);
    const mat = new MeshStandardNodeMaterial({
      color: new Color(PALETTE.waterShallow),
      emissive: new Color(PALETTE.waterShallow),
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    for (let i = 0; i < MAX_SOURCES; i++) {
      const m = new Mesh(geo, mat);
      m.visible = false;
      this.meshes.push(m);
      this.springs.push(new Spring1D(0));
      this.group.add(m);
    }
  }

  step(dt: number, water: WaterSim): void {
    for (let i = 0; i < MAX_SOURCES; i++) {
      const sp = this.springs[i] as Spring1D;
      const m = this.meshes[i] as Mesh;
      const s = water.sources[i];
      if (s) {
        sp.target = 1;
        m.position.set(s.x, water.surfaceAt(s.x, s.z) + 0.08, s.z);
      } else sp.target = 0;
      sp.step(dt, this.spring);
      const k = Math.max(0, sp.value);
      m.visible = k > 0.01;
      m.scale.setScalar(k);
    }
  }
}
