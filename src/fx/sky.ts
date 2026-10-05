import { BackSide, Color, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import {
  cameraPosition,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  positionWorld,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import type { DayState } from './daycycle';

const RADIUS = 45;

/**
 * Sky dome: vertical gradient (zenith → horizon), a sun glow and disc, a moon and
 * twinkling stars that fade in at night. One cheap fragment shader on an inside-out sphere.
 */
export class Sky {
  readonly mesh: Mesh;
  private readonly zenith = uniform(new Color());
  private readonly horizon = uniform(new Color());
  private readonly glow = uniform(new Color());
  private readonly sunDir = uniform(new Vector3(0, 1, 0));
  private readonly night = uniform(0);

  constructor() {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const y = dir.y;

    const up = smoothstep(float(-0.05), float(0.85), y).pow(0.65);
    const below = smoothstep(float(0.0), float(-0.9), y);
    let col = mix(this.horizon, this.zenith, up);
    col = mix(col, this.zenith.mul(0.35), below);

    // Sun: soft halo + bright disc, tinted by the current light color, hidden at night.
    const s = max(dot(dir, this.sunDir), 0);
    const dayAmt = float(1).sub(this.night);
    const halo = s.pow(10).mul(0.28).add(s.pow(90).mul(0.9));
    const disc = smoothstep(float(0.9994), float(0.9998), s).mul(5);
    col = col.add(this.glow.mul(halo.add(disc)).mul(dayAmt));

    // Moon: opposite the sun.
    const m = dot(dir, this.sunDir.negate());
    const moon = smoothstep(float(0.9992), float(0.9996), m).mul(this.night);
    col = col.add(vec3(0.85, 0.9, 1.0).mul(moon).mul(1.2));

    // Stars: random points on a 3D cell grid, twinkling, only above the horizon at night.
    const g = dir.mul(80);
    const cell = floor(g);
    const rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const local = fract(g).sub(0.5);
    const dot_ = smoothstep(float(0.3), float(0.08), length(local));
    const twinkle = sin(time.mul(2.0).add(rnd.mul(40))).mul(0.3).add(0.7);
    const stars = step(float(0.9955), rnd).mul(dot_).mul(twinkle).mul(this.night).mul(smoothstep(float(-0.05), float(0.25), y));
    col = col.add(vec3(1, 1, 1).mul(stars).mul(1.4));

    const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    material.colorNode = col;
    this.mesh = new Mesh(new SphereGeometry(RADIUS, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  apply(d: DayState): void {
    (this.zenith.value as Color).setRGB(d.zenith[0] as number, d.zenith[1] as number, d.zenith[2] as number);
    (this.horizon.value as Color).setRGB(d.horizon[0] as number, d.horizon[1] as number, d.horizon[2] as number);
    (this.glow.value as Color).setRGB(d.lightColor[0] as number, d.lightColor[1] as number, d.lightColor[2] as number);
    (this.sunDir.value as Vector3).set(d.sun[0] as number, d.sun[1] as number, d.sun[2] as number);
    this.night.value = d.night;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
