import { SKY_KEYS, SKY_LIGHT } from './sky-config';

/** Allocation-free day state: plain numbers; linear-RGB triples live in Float32Array(3). */
export interface DayState {
  hour: number;
  /** Unit vector toward the sun (may be below the horizon). */
  sun: Float32Array;
  /** Sun elevation, -1..1 (sine of the angle over the horizon). */
  elevation: number;
  /** Direction toward whichever of sun/moon lights the scene. */
  lightDir: Float32Array;
  lightColor: Float32Array;
  lightIntensity: number;
  hemiSky: Float32Array;
  hemiGround: Float32Array;
  hemiIntensity: number;
  ambientIntensity: number;
  zenith: Float32Array;
  horizon: Float32Array;
  /** 0 by day, 1 at night: stars and moon fade with it. */
  night: number;
}

export function createDayState(): DayState {
  return {
    hour: 12,
    sun: new Float32Array(3),
    elevation: 1,
    lightDir: new Float32Array(3),
    lightColor: new Float32Array(3),
    lightIntensity: 0,
    hemiSky: new Float32Array(3),
    hemiGround: new Float32Array(3),
    hemiIntensity: 0,
    ambientIntensity: 0,
    zenith: new Float32Array(3),
    horizon: new Float32Array(3),
    night: 0,
  };
}

const srgb = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToLinear(hex: number, out: Float32Array): void {
  out[0] = srgb(((hex >> 16) & 255) / 255);
  out[1] = srgb(((hex >> 8) & 255) / 255);
  out[2] = srgb((hex & 255) / 255);
}
function lerp3(a: Float32Array, b: Float32Array, t: number, out: Float32Array): void {
  out[0] = (a[0] as number) + ((b[0] as number) - (a[0] as number)) * t;
  out[1] = (a[1] as number) + ((b[1] as number) - (a[1] as number)) * t;
  out[2] = (a[2] as number) + ((b[2] as number) - (a[2] as number)) * t;
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Pre-converted keyframes and scratch (no per-frame allocation, rule 5).
const KEYS = SKY_KEYS.map((k) => {
  const z = new Float32Array(3);
  const h = new Float32Array(3);
  hexToLinear(k.zenith, z);
  hexToLinear(k.horizon, h);
  return { hour: k.hour, z, h };
});
const SUN_LOW = new Float32Array(3);
const SUN_HIGH = new Float32Array(3);
const MOON = new Float32Array(3);
const GROUND = new Float32Array(3);
hexToLinear(SKY_LIGHT.sunLow, SUN_LOW);
hexToLinear(SKY_LIGHT.sunHigh, SUN_HIGH);
hexToLinear(SKY_LIGHT.moon, MOON);
hexToLinear(SKY_LIGHT.hemiGround, GROUND);
const TMP = new Float32Array(3);

/** Fills `out` for an hour in [0, 24). Pure and deterministic. */
export function computeDayState(hourIn: number, out: DayState, overcast = 0): DayState {
  const hour = ((hourIn % 24) + 24) % 24;
  out.hour = hour;

  // Sun path: a tilted circle; elevation is its sine (0 at 6h and 18h, 1 at noon).
  const theta = ((hour - 6) / 24) * Math.PI * 2;
  const sx = Math.cos(theta);
  const sy = Math.sin(theta);
  const sz = SKY_LIGHT.tiltZ;
  const len = Math.hypot(sx, sy, sz);
  out.sun[0] = sx / len;
  out.sun[1] = sy / len;
  out.sun[2] = sz / len;
  out.elevation = out.sun[1] as number;

  // Sky colors from keyframes.
  let k = 0;
  while (k < KEYS.length - 2 && hour >= (KEYS[k + 1] as (typeof KEYS)[number]).hour) k++;
  const a = KEYS[k] as (typeof KEYS)[number];
  const b = KEYS[k + 1] as (typeof KEYS)[number];
  const t = smooth(0, 1, (hour - a.hour) / (b.hour - a.hour));
  lerp3(a.z, b.z, t, out.zenith);
  lerp3(a.h, b.h, t, out.horizon);

  const dayAmt = smooth(-0.12, 0.3, out.elevation);
  out.night = 1 - smooth(-0.25, 0.08, out.elevation);

  // Light: sun above the horizon, moon (opposite side) below it; both fade to 0 at the horizon.
  const sunPow = smooth(0, 0.35, out.elevation);
  const moonPow = smooth(0, 0.35, -out.elevation);
  if (out.elevation >= 0) {
    out.lightDir[0] = out.sun[0] as number;
    out.lightDir[1] = out.sun[1] as number;
    out.lightDir[2] = out.sun[2] as number;
    lerp3(SUN_LOW, SUN_HIGH, smooth(0, 0.6, out.elevation), out.lightColor);
    out.lightIntensity = SKY_LIGHT.sunIntensity * sunPow;
  } else {
    out.lightDir[0] = -(out.sun[0] as number);
    out.lightDir[1] = -(out.sun[1] as number);
    out.lightDir[2] = -(out.sun[2] as number);
    out.lightColor.set(MOON);
    out.lightIntensity = SKY_LIGHT.moonIntensity * moonPow;
  }

  lerp3(out.horizon, out.zenith, 0.45, TMP);
  out.hemiSky.set(TMP);
  out.hemiGround.set(GROUND);
  out.hemiIntensity = SKY_LIGHT.hemiNight + (SKY_LIGHT.hemiDay - SKY_LIGHT.hemiNight) * dayAmt;
  out.ambientIntensity = SKY_LIGHT.ambientNight + (SKY_LIGHT.ambientDay - SKY_LIGHT.ambientNight) * dayAmt;

  // Overcast (rain): desaturate the sky toward a gray and dim the direct light.
  if (overcast > 0) {
    const gray = (c: Float32Array): void => {
      const l = 0.3 * (c[0] as number) + 0.55 * (c[1] as number) + 0.15 * (c[2] as number);
      const g = l * 0.75;
      for (let i = 0; i < 3; i++) c[i] = (c[i] as number) + (g - (c[i] as number)) * overcast * 0.7;
    };
    gray(out.zenith);
    gray(out.horizon);
    gray(out.hemiSky);
    out.lightIntensity *= 1 - 0.55 * overcast;
  }
  return out;
}
