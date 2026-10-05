/** Fixed simulation rate (Hz). Rendering runs at the display's refresh rate. */
export const SIM_HZ = 60;

/** Cap on device pixel ratio; the quality system will own this from Phase 1. */
export const MAX_PIXEL_RATIO = 2;

/** Neutral working colors (decision #5: final palette is still open). */
export const WORKING_COLORS = {
  background: 0x0b0d12,
  cubeBase: 0x9db4ff,
} as const;

/**
 * Debug switches read from the URL (diagnostics only, e.g. `?pr=1&webgl`):
 *  - `pr=<number>`  override the pixel ratio
 *  - `webgl`        force the WebGL2 backend
 *  - `debug`        expose `window.__sandbox` for scripted tests
 */
export function readDebugParams(search: string = window.location.search): {
  pixelRatio: number | null;
  forceWebGL: boolean;
  debug: boolean;
} {
  const q = new URLSearchParams(search);
  const pr = Number(q.get('pr'));
  return {
    pixelRatio: Number.isFinite(pr) && pr > 0 ? Math.min(pr, 4) : null,
    forceWebGL: q.has('webgl'),
    debug: q.has('debug'),
  };
}
