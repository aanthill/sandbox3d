export interface PerfSnapshot {
  fps: number;
  avgMs: number;
  worstMs: number;
  /** FPS computed from the slowest 1% of frames. */
  fps1Low: number;
  frames: number;
}

/**
 * Rolling frame-time statistics. Fixed-size typed arrays: no allocation per
 * frame (rule 5). Sorting happens only in snapshot(), which the panel calls a
 * few times per second, never per frame.
 */
export class PerfStats {
  private readonly samples: Float32Array;
  private readonly scratch: Float32Array;
  private index = 0;
  private count = 0;

  constructor(readonly capacity = 600) {
    this.samples = new Float32Array(capacity);
    this.scratch = new Float32Array(capacity);
  }

  push(frameMs: number): void {
    this.samples[this.index] = frameMs;
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  reset(): void {
    this.index = 0;
    this.count = 0;
  }

  snapshot(): PerfSnapshot {
    const n = this.count;
    if (n === 0) return { fps: 0, avgMs: 0, worstMs: 0, fps1Low: 0, frames: 0 };

    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = this.samples[i] as number;
      this.scratch[i] = v;
      sum += v;
    }
    const sorted = this.scratch.subarray(0, n).sort(); // ascending
    const avgMs = sum / n;
    const worstMs = sorted[n - 1] as number;

    // Average of the slowest 1% of frames (at least one frame).
    const k = Math.max(1, Math.ceil(n * 0.01));
    let slowSum = 0;
    for (let i = n - k; i < n; i++) slowSum += sorted[i] as number;
    const slowAvgMs = slowSum / k;

    return {
      fps: 1000 / avgMs,
      avgMs,
      worstMs,
      fps1Low: 1000 / slowAvgMs,
      frames: n,
    };
  }
}
