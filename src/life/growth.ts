import { PLANT_POP } from '../anim/config';

/** Pure plant logic (no rendering): where plants like to grow, how they grow, and how they pop in. */
export type PlantKind = 0 | 1; // 0 = grass tuft, 1 = tree
export const GRASS: PlantKind = 0;
export const TREE: PlantKind = 1;

export const GROWTH = {
  /** Underwater deeper than this and plants die. */
  drownDepth: 0.04,
  /** Growth speed toward the target (1/s): slow when dry, faster with moisture. */
  baseRate: 0.03,
  wetRate: 0.14,
  /** Withering speed when the place stopped suiting the plant (1/s). */
  witherRate: 0.05,
  /** Below this size a plant counts as not there. */
  minSize: 0.02,
  /** Fraction of trees among all plant candidates. */
  treeShare: 0.16,
} as const;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 0..1 liking of a spot. `h` height, `ny` cosine of the slope (1 = flat), `wet` 0..1 soil
 * moisture, `depth` standing water. Plants fill in more thickly and grow bigger where it is wet.
 */
export function suitability(kind: PlantKind, h: number, ny: number, wet: number, depth: number): number {
  if (depth > GROWTH.drownDepth) return 0;
  if (kind === GRASS) {
    const base = smooth(0.62, 0.86, ny) * smooth(0.12, 0.28, h) * (1 - smooth(1.15, 1.5, h));
    return base * (0.7 + 0.3 * wet);
  }
  const base = smooth(0.75, 0.92, ny) * smooth(0.22, 0.4, h) * (1 - smooth(0.85, 1.15, h));
  return base * (0.5 + 0.5 * wet);
}

/**
 * One growth step toward the spot's suitability. A plant only exists where suitability beats its
 * personal `threshold`, so wetter ground gets denser as well as lusher. Returns the new size 0..1.
 */
export function growthStep(g: number, suit: number, threshold: number, wet: number, drowned: boolean, dt: number): number {
  if (drowned) return Math.max(0, g - 0.6 * dt);
  const target = suit > threshold ? suit : 0;
  if (target > g) return Math.min(target, g + (GROWTH.baseRate + GROWTH.wetRate * wet) * dt * (g < GROWTH.minSize ? 4 : 1));
  return Math.max(target, g - GROWTH.witherRate * dt);
}

/** Elastic overshoot factor for a plant that sprouted `age` seconds ago (1 once finished). */
export function popScale(age: number): number {
  if (age >= PLANT_POP.duration) return 1;
  if (age <= 0) return 0;
  const fade = age / PLANT_POP.duration;
  // Blend to exactly 1 at the end so there is no visible snap.
  const raw = 1 - Math.exp(-PLANT_POP.decay * age) * Math.cos(PLANT_POP.freq * age);
  return raw + (1 - raw) * fade * fade;
}

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
