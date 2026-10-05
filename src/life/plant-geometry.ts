import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, SphereGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../world/palette';

type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function paint(geo: BufferGeometry, color: (x: number, y: number, z: number) => Rgb): BufferGeometry {
  const p = geo.getAttribute('position');
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = color(p.getX(i), p.getY(i), p.getZ(i));
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new BufferAttribute(out, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** A small round tree: brown trunk and a soft two-tone canopy (~100 triangles). Unit height ≈ 0.22. */
export function createTreeGeometry(): BufferGeometry {
  const trunkColor = rgb(PALETTE.trunk);
  const dark = rgb(PALETTE.leafDark);
  const light = rgb(PALETTE.leafLight);
  const trunk = new CylinderGeometry(0.009, 0.015, 0.09, 6, 1, true);
  trunk.translate(0, 0.045, 0);
  paint(trunk, () => trunkColor);
  const canopy = new SphereGeometry(0.07, 9, 6);
  canopy.scale(1, 1.15, 1);
  canopy.translate(0, 0.15, 0);
  paint(canopy, (_x, y) => mix(dark, light, Math.min(1, Math.max(0, (y - 0.07) / 0.16))));
  return mergeGeometries([trunk, canopy], false);
}
