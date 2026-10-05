import { BackSide, Color, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import {
  cameraPosition,
  dot,
  exp,
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
/** A comet appears at night every COMET_MIN..COMET_MAX seconds, in front of the camera. */
const COMET_MIN = 35;
const COMET_MAX = 110;
const COMET_DURATION = 1.5;
const COMET_SPEED = 0.65; // radians per second along its great circle
const COMET_TAIL = 0.55;
const WORLD_UP = new Vector3(0, 1, 0);

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
  private readonly cometA = uniform(new Vector3(0, 0, -1));
  private readonly cometM = uniform(new Vector3(1, 0, 0));
  private readonly cometAge = uniform(0);
  private readonly cometOn = uniform(0);
  private nextComet = COMET_MIN + Math.random() * (COMET_MAX - COMET_MIN);
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpR = new Vector3();
  private readonly tmpU = new Vector3();

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
    const g = dir.mul(150);
    const cell = floor(g);
    const rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
    const local = fract(g).sub(0.5);
    const dot_ = smoothstep(float(0.3), float(0.08), length(local));
    const twinkle = sin(time.mul(2.0).add(rnd.mul(40))).mul(0.3).add(0.7);
    const stars = step(float(0.982), rnd).mul(dot_).mul(twinkle).mul(this.night);
    col = col.add(vec3(1, 1, 1).mul(stars).mul(1.4));

    // Comet: spawned from the CPU (see update); head on a great circle, tail behind it.
    const ang = this.cometAge.mul(COMET_SPEED);
    const head = this.cometA.mul(ang.cos()).add(this.cometM.mul(ang.sin()));
    const tail = this.cometA.mul(ang.sin()).sub(this.cometM.mul(ang.cos())); // points backwards along the path
    const rel = dir.sub(head);
    const along = dot(rel, tail);
    const perp = length(rel.sub(tail.mul(along)));
    const k = along.div(COMET_TAIL);
    const inTail = step(float(0), along).mul(step(along, float(COMET_TAIL)));
    const streak = inTail.mul(float(1).sub(k).pow(2)).mul(smoothstep(float(0.0035).mul(float(1).sub(k.mul(0.8))), float(0), perp));
    const headGlow = exp(length(rel).pow(2).mul(-70000));
    const fadeInOut = smoothstep(float(0), float(0.12), this.cometAge).mul(
      smoothstep(float(COMET_DURATION), float(COMET_DURATION - 0.35), this.cometAge),
    );
    const comet = streak.mul(1.6).add(headGlow.mul(2.5)).mul(this.cometOn).mul(fadeInOut);
    col = col.add(vec3(0.8, 0.92, 1.0).mul(comet));

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

  /** Per-frame: runs the comet timer (rare, only at night). `forward` is the camera's view direction. */
  update(dt: number, forward: Vector3): void {
    if (this.cometOn.value > 0) {
      this.cometAge.value += dt;
      if (this.cometAge.value > COMET_DURATION) {
        this.cometOn.value = 0;
        this.nextComet = COMET_MIN + Math.random() * (COMET_MAX - COMET_MIN);
      }
    } else if (this.night.value > 0.6) {
      this.nextComet -= dt;
      if (this.nextComet <= 0) this.spawnComet(forward);
    }
  }

  /** Starts a comet in the upper part of what the camera sees, flying roughly sideways. */
  spawnComet(forward: Vector3): void {
    const right = this.tmpR.crossVectors(forward, WORLD_UP).normalize();
    const up = this.tmpU.crossVectors(right, forward).normalize();
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = this.tmpA
      .copy(forward)
      .addScaledVector(right, (Math.random() - 0.5) * 0.4 - side * 0.12)
      .addScaledVector(up, 0.16 + Math.random() * 0.16)
      .normalize();
    const b = this.tmpB.copy(right).multiplyScalar(side).addScaledVector(up, (Math.random() - 0.5) * 0.7);
    b.addScaledVector(a, -b.dot(a)).normalize();
    (this.cometA.value as Vector3).copy(a);
    (this.cometM.value as Vector3).copy(b);
    this.cometAge.value = 0;
    this.cometOn.value = 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
