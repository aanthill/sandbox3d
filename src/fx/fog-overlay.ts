/**
 * Fog as a 2D screen overlay (not 3D): two layers of soft cloud texture drifting slowly across the
 * screen. The texture is generated once on a canvas (tileable fBm noise) and used as a CSS mask, so
 * the layers take the horizon color of the current time of day. Motion is transform-only (rule 7).
 */
const TILE = 256; // texture resolution; displayed at DISPLAY px, so it is smooth rather than pixelated
const DISPLAY = 768;

function tileableCloudMask(seed: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(TILE, TILE);
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const octaves = [4, 8, 16, 32];
  const lattices = octaves.map((n) => Float32Array.from({ length: n * n }, rnd));
  const fade = (t: number): number => t * t * (3 - 2 * t);
  const value = (o: number, x: number, y: number): number => {
    const n = octaves[o] as number;
    const lat = lattices[o] as Float32Array;
    const fx = x * n;
    const fy = y * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const at = (i: number, j: number): number => lat[(((j % n) + n) % n) * n + (((i % n) + n) % n)] as number;
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      const v = y / TILE;
      const n = value(0, u, v) * 0.5 + value(1, u, v) * 0.28 + value(2, u, v) * 0.15 + value(3, u, v) * 0.07;
      // Keep only the denser parts so the result reads as separate wisps, with soft edges.
      const t = Math.min(1, Math.max(0, (n - 0.42) / 0.3));
      const a = t * t * (3 - 2 * t);
      const k = (y * TILE + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export class FogOverlay {
  readonly root = document.createElement('div');
  private readonly layers: HTMLDivElement[] = [];

  constructor() {
    this.root.className = 'fog-overlay';
    const sizes = [DISPLAY, DISPLAY * 1.6];
    [11, 29].forEach((seed, i) => {
      const url = `url(${tileableCloudMask(seed)})`;
      const layer = document.createElement('div');
      layer.className = `fog-layer fog-layer-${i}`;
      const size = sizes[i] as number;
      layer.style.setProperty('--tile', `${size}px`);
      layer.style.maskImage = url;
      layer.style.setProperty('-webkit-mask-image', url);
      layer.style.maskSize = `${size}px ${size}px`;
      layer.style.setProperty('-webkit-mask-size', `${size}px ${size}px`);
      this.layers.push(layer);
      this.root.append(layer);
    });
    this.set(0);
  }

  /** amount 0..1 (the Fog slider). Fully hidden at 0. */
  set(amount: number): void {
    this.root.style.opacity = String(Math.min(1, Math.max(0, amount)) * 0.5);
    this.root.style.display = amount <= 0.001 ? 'none' : 'block';
  }

  /** Tints the clouds with the horizon color so they follow the time of day (linear 0..1 rgb). */
  setColor(r: number, g: number, b: number): void {
    // Linear -> sRGB-ish, and lifted toward white so the wisps stay luminous at night.
    const c = (v: number): number => Math.round(Math.min(1, Math.pow(v, 1 / 2.2) * 0.75 + 0.25) * 255);
    const css = `rgb(${c(r)},${c(g)},${c(b)})`;
    for (const l of this.layers) l.style.backgroundColor = css;
  }

  dispose(): void {
    this.root.remove();
  }
}
