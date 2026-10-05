import { Color } from 'three/webgpu';

/**
 * Working colors (decision #5: the final palette is still open). Every color
 * is a parameter here (rule 9); nothing else hardcodes a color.
 */
export const PALETTE = {
  sand: 0xf2c46d,
  grass: 0x45c24f,
  rock: 0x8f7fbd,
  snow: 0xf2f8ff,
  turf: 0x1f8f4a,
  soil: 0xb5532e,
  deepRock: 0x5b3f8f,
  bottom: 0x2a2457,
  lime: 0xb4dc4a,
  rim: 0x7fa6ff,
  waterShallow: 0x2fe3d6,
  waterDeep: 0x0b3cc4,
  foam: 0xffffff,
  sky: 0xbcd8ff,
  ground: 0x000000,
} as const;

/** Linear-space copies (vertex colors are not color-managed by three). */
const lin = (hex: number): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};
export const LINEAR = {
  sand: lin(PALETTE.sand),
  grass: lin(PALETTE.grass),
  rock: lin(PALETTE.rock),
  snow: lin(PALETTE.snow),
  turf: lin(PALETTE.turf),
  lime: lin(PALETTE.lime),
  soil: lin(PALETTE.soil),
  deepRock: lin(PALETTE.deepRock),
  bottom: lin(PALETTE.bottom),
};

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Blends `c` into the first three slots of `out` with weight `t`. */
function mixInto(out: Float32Array, o: number, c: [number, number, number], t: number): void {
  out[o] = (out[o] as number) + (c[0] - (out[o] as number)) * t;
  out[o + 1] = (out[o + 1] as number) + (c[1] - (out[o + 1] as number)) * t;
  out[o + 2] = (out[o + 2] as number) + (c[2] - (out[o + 2] as number)) * t;
}

/** Terrain color from height and surface steepness (ny = normal.y). Writes into out[o..o+2]. */
export function terrainColor(out: Float32Array, o: number, h: number, ny: number): void {
  out[o] = LINEAR.turf[0];
  out[o + 1] = LINEAR.turf[1];
  out[o + 2] = LINEAR.turf[2];
  // Lowlands are a deep green, rising through bright grass to sunny lime on the hills.
  mixInto(out, o, LINEAR.grass, smoothstep(0.0, 0.45, h));
  mixInto(out, o, LINEAR.lime, smoothstep(0.55, 1.05, h) * 0.7);
  mixInto(out, o, LINEAR.sand, 1 - smoothstep(0.02, 0.2, h));
  mixInto(out, o, LINEAR.rock, Math.min(1, smoothstep(0.8, 0.55, ny) + smoothstep(1.0, 1.3, h) * 0.6));
  mixInto(out, o, LINEAR.snow, smoothstep(1.3, 1.5, h) * smoothstep(0.6, 0.85, ny));
  // Depth: valleys and the seabed are darker, peaks catch more light.
  const shade = 0.62 + 0.5 * smoothstep(-0.3, 1.3, h);
  out[o] = (out[o] as number) * shade;
  out[o + 1] = (out[o + 1] as number) * shade;
  out[o + 2] = (out[o + 2] as number) * shade;
}
