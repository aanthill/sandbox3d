const EPSILON_MS = 1e-6;

/**
 * Fixed time step accumulator (rule 1: simulation is independent of FPS).
 * Feed it the real frame delta; it returns how many simulation steps to run
 * and the interpolation factor (alpha) to blend previous/current state.
 */
export class FixedStep {
  readonly stepMs: number;
  readonly maxStepsPerFrame: number;
  private accumulator = 0;

  constructor(hz = 60, maxStepsPerFrame = 5) {
    this.stepMs = 1000 / hz;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  /** Returns the number of fixed steps to simulate for this frame. */
  advance(frameMs: number): number {
    // Clamp huge deltas (tab was hidden, debugger pause) to avoid a spiral of death.
    this.accumulator += Math.min(frameMs, this.stepMs * this.maxStepsPerFrame);
    let steps = 0;
    // Small tolerance so floating-point error (e.g. 4.9999999 steps) never drops a step.
    while (this.accumulator >= this.stepMs - EPSILON_MS && steps < this.maxStepsPerFrame) {
      this.accumulator -= this.stepMs;
      steps++;
    }
    return steps;
  }

  /** 0..1: how far we are between the last and the next simulation step. */
  get alpha(): number {
    return Math.max(0, this.accumulator / this.stepMs);
  }
}
