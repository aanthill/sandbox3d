import { Color } from 'three/webgpu';

/**
 * Working colors (decision #5: the final palette is still open). Every color
 * is a parameter here (rule 9); nothing else hardcodes a color.
 */
export const PALETTE = {
  sand: 0xf0dca8,
  grass: 0x93d68f,
  rock: 0xa8aec4,
  snow: 0xf6f9ff,
  turf: 0x84c97e,
  soil: 0xc59169,
  deepRock: 0x7a82a0,
  bottom: 0x535a76,
  rim: 0xbcd0ff,
  waterShallow: 0x8fe4ff,
  waterDeep: 0x2f6fe0,
  foam: 0xffffff,
  sky: 0xd6e6ff,
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
  out[o] = LINEAR.grass[0];
  out[o + 1] = LINEAR.grass[1];
  out[o + 2] = LINEAR.grass[2];
  mixInto(out, o, LINEAR.sand, 1 - smoothstep(0.02, 0.22, h));
  mixInto(out, o, LINEAR.rock, Math.min(1, smoothstep(0.8, 0.55, ny) + smoothstep(1.0, 1.3, h) * 0.6));
  mixInto(out, o, LINEAR.snow, smoothstep(1.3, 1.5, h) * smoothstep(0.6, 0.85, ny));
}
