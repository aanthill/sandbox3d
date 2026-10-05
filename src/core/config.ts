/** Fixed simulation rate (Hz). Rendering runs at the display's refresh rate. */
export const SIM_HZ = 60;

/** Cap on device pixel ratio; the quality system will own this from Phase 1. */
export const MAX_PIXEL_RATIO = 2;

/** Neutral working colors (decision #5: final palette is still open). */
export const WORKING_COLORS = {
  background: 0x0b0d12,
  cubeBase: 0x9db4ff,
} as const;
