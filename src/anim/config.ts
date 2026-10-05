/**
 * All spring tuning lives here (rule 8), never inline in the code.
 * Stiffness k in 1/s^2; damping is derived from a damping ratio so that
 * "wobble" can be a single 0..100 user setting.
 */
export const SPRING_CONFIG = {
  terrain: {
    stiffness: 90,
    /** Damping ratio at wobble 0 (critically damped: no overshoot) and wobble 100 (jelly). */
    dampingRatioMin: 0.28,
    dampingRatioMax: 1.0,
  },
  camera: {
    stiffness: 60,
    dampingRatio: 0.9,
  },
  /** Brush ring radius pop/settle. */
  ring: {
    stiffness: 260,
    dampingRatio: 0.5,
  },
  ui: {
    /** CSS easing with a small overshoot, used for button/dock bounces. */
    bounceEasing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bounceMs: 320,
  },
} as const;

/** Elastic pop when a plant sprouts: scale = 1 - exp(-decay*t) * cos(freq*t), done after `duration` seconds. */
export const PLANT_POP = { duration: 1.5, decay: 5, freq: 13 } as const;

/** Default wobble (0..100); 0 when the user prefers reduced motion. */
export const DEFAULT_WOBBLE = 70;
