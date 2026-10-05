import { SPRING_CONFIG } from './config';

export interface SpringParams {
  stiffness: number;
  damping: number;
}

/** Maps the 0..100 wobble setting to terrain spring parameters. */
export function terrainSpring(wobble: number): SpringParams {
  const { stiffness, dampingRatioMin, dampingRatioMax } = SPRING_CONFIG.terrain;
  const w = Math.min(100, Math.max(0, wobble)) / 100;
  const ratio = dampingRatioMax + (dampingRatioMin - dampingRatioMax) * w;
  return { stiffness, damping: 2 * ratio * Math.sqrt(stiffness) };
}

export function cameraSpring(): SpringParams {
  const { stiffness, dampingRatio } = SPRING_CONFIG.camera;
  return { stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness) };
}

export function ringSpring(): SpringParams {
  const { stiffness, dampingRatio } = SPRING_CONFIG.ring;
  return { stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness) };
}

/** Scalar spring with semi-implicit Euler (stable for dt * sqrt(k) < 2). */
export class Spring1D {
  value: number;
  velocity = 0;
  target: number;

  constructor(initial = 0) {
    this.value = initial;
    this.target = initial;
  }

  step(dt: number, p: SpringParams): void {
    const accel = p.stiffness * (this.target - this.value) - p.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
}
