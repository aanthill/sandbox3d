import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { Spring1D, cameraSpring } from '../anim/spring';

export const CAMERA_LIMITS = {
  minRadius: 3,
  maxRadius: 12,
  minPolar: 0.22, // radians from straight up
  maxPolar: 1.48,
} as const;

/**
 * Orbit camera whose angles and distance chase their targets through springs,
 * so it has inertia and settles softly. Stepped at the fixed rate and
 * interpolated at draw time like everything else.
 */
export class CameraRig {
  private readonly azimuth = new Spring1D(0.75);
  private readonly polar = new Spring1D(1.05);
  private readonly radius = new Spring1D(8.6);
  private readonly prev = { a: 0.75, p: 1.05, r: 8.6 };
  private readonly params = cameraSpring();
  readonly focus = new Vector3(0, 0.25, 0);

  constructor(private readonly camera: PerspectiveCamera) {
    this.apply(1);
  }

  /** Drag rotation in radians. */
  orbit(dAzimuth: number, dPolar: number): void {
    this.azimuth.target -= dAzimuth;
    this.polar.target = Math.min(
      CAMERA_LIMITS.maxPolar,
      Math.max(CAMERA_LIMITS.minPolar, this.polar.target - dPolar),
    );
  }

  /** Wheel delta (positive = zoom out). */
  zoom(delta: number): void {
    const r = this.radius.target * Math.exp(delta * 0.0012);
    this.radius.target = Math.min(CAMERA_LIMITS.maxRadius, Math.max(CAMERA_LIMITS.minRadius, r));
  }

  step(dt: number): void {
    this.prev.a = this.azimuth.value;
    this.prev.p = this.polar.value;
    this.prev.r = this.radius.value;
    this.azimuth.step(dt, this.params);
    this.polar.step(dt, this.params);
    this.radius.step(dt, this.params);
  }

  /** Places the camera, blending the last two steps by alpha. */
  apply(alpha: number): void {
    const a = this.prev.a + (this.azimuth.value - this.prev.a) * alpha;
    const p = this.prev.p + (this.polar.value - this.prev.p) * alpha;
    const r = this.prev.r + (this.radius.value - this.prev.r) * alpha;
    const sp = Math.sin(p);
    this.camera.position.set(
      this.focus.x + r * sp * Math.sin(a),
      this.focus.y + r * Math.cos(p),
      this.focus.z + r * sp * Math.cos(a),
    );
    this.camera.lookAt(this.focus);
  }
}
