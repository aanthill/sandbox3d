export interface AdaptiveOptions {
  /** Frame time above which we consider the frame budget missed (ms). */
  slowMs: number;
  /** Frame time below which there is clear headroom (ms). */
  fastMs: number;
  /** Frames averaged before a decision. */
  windowFrames: number;
  /** Consecutive fast windows required before raising quality again. */
  upWindows: number;
  minScale: number;
  maxScale: number;
  step: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveOptions = {
  slowMs: 22, // a bit over the 16.6 ms budget for 60 FPS
  fastMs: 14,
  windowFrames: 90,
  upWindows: 3,
  minScale: 0.5,
  maxScale: 1,
  step: 0.125,
};

/**
 * Dynamic render-scale controller (plan section 7: lower the internal
 * resolution first). Feed it frame times; it returns the scale to use.
 * Drops quickly when slow, climbs back slowly when there is headroom, so it
 * does not oscillate.
 */
export class AdaptiveQuality {
  scale: number;
  private sum = 0;
  private count = 0;
  private fastStreak = 0;

  constructor(private readonly opts: AdaptiveOptions = DEFAULT_ADAPTIVE) {
    this.scale = opts.maxScale;
  }

  /** Returns true when `scale` changed this call. */
  push(frameMs: number): boolean {
    // Ignore absurd frames (tab switches, debugger pauses): they say nothing about GPU load.
    if (frameMs > 250) return false;
    this.sum += frameMs;
    if (++this.count < this.opts.windowFrames) return false;

    const avg = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    const { slowMs, fastMs, upWindows, minScale, maxScale, step } = this.opts;

    if (avg > slowMs && this.scale > minScale) {
      this.scale = Math.max(minScale, this.scale - step);
      this.fastStreak = 0;
      return true;
    }
    if (avg < fastMs) {
      if (++this.fastStreak >= upWindows && this.scale < maxScale) {
        this.scale = Math.min(maxScale, this.scale + step);
        this.fastStreak = 0;
        return true;
      }
    } else {
      this.fastStreak = 0;
    }
    return false;
  }

  /** Call after the scale changes for outside reasons (tier switch). */
  reset(): void {
    this.sum = 0;
    this.count = 0;
    this.fastStreak = 0;
  }
}
