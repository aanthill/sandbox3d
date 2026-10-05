import { Heightfield, MAX_H, MIN_H, WORLD_SIZE } from './heightfield';

export interface Hit {
  x: number;
  y: number;
  z: number;
}

/**
 * Ray vs heightfield. Marches the ray through the world's bounding box and
 * refines the crossing by bisection. Writes into `out` (no allocation).
 */
export function raycastHeightfield(
  hf: Heightfield,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  out: Hit,
): boolean {
  const half = WORLD_SIZE / 2;
  let t0 = 0;
  let t1 = 1e9;

  // Slab test against [-half,half] x [MIN_H,MAX_H] x [-half,half].
  const slab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    return t0 <= t1;
  };
  if (!slab(ox, dx, -half, half) || !slab(oy, dy, MIN_H, MAX_H) || !slab(oz, dz, -half, half)) {
    return false;
  }

  const step = hf.cell * 0.6;
  let prevT = t0;
  let prevAbove = oy + dy * t0 - hf.heightAt(ox + dx * t0, oz + dz * t0) >= 0;
  if (!prevAbove) {
    // Ray starts below the surface (camera inside the terrain): treat as a hit at entry.
    out.x = ox + dx * t0;
    out.y = oy + dy * t0;
    out.z = oz + dz * t0;
    return true;
  }

  for (let t = t0 + step; t <= t1 + step; t += step) {
    const tt = Math.min(t, t1);
    const above = oy + dy * tt - hf.heightAt(ox + dx * tt, oz + dz * tt) >= 0;
    if (!above) {
      let lo = prevT;
      let hi = tt;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * 0.5;
        if (oy + dy * mid - hf.heightAt(ox + dx * mid, oz + dz * mid) >= 0) lo = mid;
        else hi = mid;
      }
      const tf = (lo + hi) * 0.5;
      out.x = ox + dx * tf;
      out.z = oz + dz * tf;
      out.y = hf.heightAt(out.x, out.z);
      return true;
    }
    prevT = tt;
    prevAbove = above;
    if (tt >= t1) break;
  }
  return false;
}
