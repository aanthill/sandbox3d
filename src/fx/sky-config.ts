/**
 * Day/night look parameters (rule 9: colors are data, not code).
 * Keyframes are by hour (0..24, last = first for a seamless loop); colors are sRGB hex.
 */
export interface SkyKey {
  hour: number;
  zenith: number;
  horizon: number;
}

export const SKY_KEYS: readonly SkyKey[] = [
  { hour: 0, zenith: 0x050a24, horizon: 0x16225a },
  { hour: 5, zenith: 0x0a1240, horizon: 0x2c2b78 },
  { hour: 6.5, zenith: 0x3550b8, horizon: 0xff8a5c },
  { hour: 8, zenith: 0x2a78e6, horizon: 0x9fd0ff },
  { hour: 12, zenith: 0x1e6cf0, horizon: 0xa6d6ff },
  { hour: 17, zenith: 0x2a78e6, horizon: 0xb4d2ff },
  { hour: 18.5, zenith: 0x4a3a9e, horizon: 0xff6a45 },
  { hour: 20, zenith: 0x0c1238, horizon: 0x2a2a6a },
  { hour: 24, zenith: 0x050a24, horizon: 0x16225a },
];

export const SKY_LIGHT = {
  sunLow: 0xff8a4a,
  sunHigh: 0xfff1dc,
  moon: 0x8fa8ff,
  hemiGround: 0x1d1a38,
  sunIntensity: 2.8,
  moonIntensity: 0.75,
  hemiDay: 0.7,
  hemiNight: 0.28,
  ambientDay: 0.16,
  ambientNight: 0.1,
  /** Fraction of a day per real second when auto cycle is on (1 day = 4 minutes). */
  autoDaysPerSecond: 1 / 240,
  /** Sun path tilt (z component before normalizing). */
  tiltZ: 0.35,
  /** Fog density slider (0..1) -> FogExp2 density. */
  maxFogDensity: 0.11,
} as const;
