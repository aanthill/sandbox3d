import type { PerfStats } from './stats';

/** Small DOM readout of FPS and frame time. Updates a few times per second. */
export class PerfPanel {
  private readonly el: HTMLDivElement;
  private lastUpdate = 0;

  constructor(
    private readonly stats: PerfStats,
    private readonly backendLabel: string,
    private readonly getResolution: () => string,
    private readonly updateEveryMs = 250,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'perf-panel';
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '12px',
      left: '12px',
      padding: '10px 12px',
      font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      color: '#e8ecf4',
      background: 'rgba(20, 24, 34, 0.85)',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius: '12px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  update(nowMs: number): void {
    if (nowMs - this.lastUpdate < this.updateEveryMs) return;
    this.lastUpdate = nowMs;
    const s = this.stats.snapshot();
    this.el.textContent =
      `${this.backendLabel}  ${this.getResolution()}\n` +
      `FPS      ${s.fps.toFixed(0)}\n` +
      `Frame    ${s.avgMs.toFixed(2)} ms\n` +
      `1% low   ${s.fps1Low.toFixed(0)} FPS\n` +
      `Worst    ${s.worstMs.toFixed(1)} ms`;
  }
}
