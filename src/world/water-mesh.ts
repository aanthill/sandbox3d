import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three/webgpu';
import { CHUNK, WORLD_SIZE } from './heightfield';
import type { WaterSim } from '../sim/water';

/** Dry vertices hide this far under the ground so they never poke through. */
const HIDE = 0.04;
const SIDES = 4;
/** flow speed (cells/s) -> 0..1 foam amount. */
const FOAM_SCALE = 1 / 40;

/**
 * Renders the water: a surface grid (only dirty chunks are rewritten) plus a
 * thin translucent skirt along the four edges, so the water has a visible
 * cross-section like the terrain block has strata.
 */
export class WaterMesh {
  readonly group = new Group();
  private readonly pos: BufferAttribute;
  private readonly nor: BufferAttribute;
  private readonly dep: BufferAttribute;
  private readonly foam: BufferAttribute;
  private readonly skirtPos: BufferAttribute;
  private readonly skirtDep: BufferAttribute;
  private readonly geos: BufferGeometry[] = [];

  constructor(
    private readonly water: WaterSim,
    material: Material,
  ) {
    const n = water.n;
    const count = n * n;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const depths = new Float32Array(count);
    const foams = new Float32Array(count);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const o = (j * n + i) * 3;
        positions[o] = -WORLD_SIZE / 2 + i * water.cell;
        positions[o + 1] = -10;
        positions[o + 2] = -WORLD_SIZE / 2 + j * water.cell;
        normals[o + 1] = 1;
      }
    }
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices[q++] = a;
        indices[q++] = c;
        indices[q++] = b;
        indices[q++] = b;
        indices[q++] = c;
        indices[q++] = d;
      }
    }
    const geo = new BufferGeometry();
    this.pos = new BufferAttribute(positions, 3);
    this.nor = new BufferAttribute(normals, 3);
    this.dep = new BufferAttribute(depths, 1);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nor);
    geo.setAttribute('wdepth', this.dep);
    this.foam = new BufferAttribute(foams, 1);
    geo.setAttribute('wfoam', this.foam);
    geo.setIndex(new BufferAttribute(indices, 1));
    this.geos.push(geo);
    const surface = new Mesh(geo, material);
    surface.frustumCulled = false;
    surface.renderOrder = 2;

    // ---- Edge skirts: 2 vertices per column (top = surface, bottom = ground) ----
    const sv = SIDES * n * 2;
    const sPos = new Float32Array(sv * 3);
    const sNor = new Float32Array(sv * 3);
    const sDep = new Float32Array(sv);
    const sIdx = new Uint32Array(SIDES * (n - 1) * 6);
    const outward = [
      [0, 0, -1],
      [0, 0, 1],
      [-1, 0, 0],
      [1, 0, 0],
    ] as const;
    let si = 0;
    for (let s = 0; s < SIDES; s++) {
      const nrm = outward[s] as readonly [number, number, number];
      for (let k = 0; k < n; k++) {
        const along = -WORLD_SIZE / 2 + k * water.cell;
        for (let v = 0; v < 2; v++) {
          const o = ((s * n + k) * 2 + v) * 3;
          if (s < 2) {
            sPos[o] = along;
            sPos[o + 2] = nrm[2] * (WORLD_SIZE / 2);
          } else {
            sPos[o] = nrm[0] * (WORLD_SIZE / 2);
            sPos[o + 2] = along;
          }
          sNor[o] = nrm[0];
          sNor[o + 1] = nrm[1];
          sNor[o + 2] = nrm[2];
        }
      }
      // Winding so the quad faces outward (see TerrainMesh walls for the derivation).
      const ax = s < 2 ? 1 : 0;
      const az = s < 2 ? 0 : 1;
      const facesOut = -az * nrm[0] + ax * nrm[2] > 0;
      for (let k = 0; k < n - 1; k++) {
        const A = (s * n + k) * 2;
        const B = A + 1;
        const C = (s * n + k + 1) * 2;
        const D = C + 1;
        if (facesOut) {
          sIdx[si++] = A; sIdx[si++] = B; sIdx[si++] = C;
          sIdx[si++] = B; sIdx[si++] = D; sIdx[si++] = C;
        } else {
          sIdx[si++] = A; sIdx[si++] = C; sIdx[si++] = B;
          sIdx[si++] = B; sIdx[si++] = C; sIdx[si++] = D;
        }
      }
    }
    const skGeo = new BufferGeometry();
    this.skirtPos = new BufferAttribute(sPos, 3);
    this.skirtDep = new BufferAttribute(sDep, 1);
    skGeo.setAttribute('position', this.skirtPos);
    skGeo.setAttribute('normal', new BufferAttribute(sNor, 3));
    skGeo.setAttribute('wdepth', this.skirtDep);
    skGeo.setAttribute('wfoam', new BufferAttribute(new Float32Array(sv), 1));
    skGeo.setIndex(new BufferAttribute(sIdx, 1));
    this.geos.push(skGeo);
    const skirts = new Mesh(skGeo, material);
    skirts.frustumCulled = false;
    skirts.renderOrder = 2;

    this.group.add(surface, skirts);
    water.dirty.fill(1);
  }

  /** Refreshes the chunks the simulation touched; returns true if anything changed. */
  update(): boolean {
    const w = this.water;
    const n = w.n;
    const cps = w.cps;
    let minIdx = Infinity;
    let maxIdx = -1;

    for (let ch = 0; ch < cps * cps; ch++) {
      if (!w.dirty[ch]) continue;
      w.dirty[ch] = 0;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const i0 = Math.max(0, cx - 1);
      const i1 = Math.min(n - 1, cx + CHUNK);
      const j0 = Math.max(0, cy - 1);
      const j1 = Math.min(n - 1, cy + CHUNK);
      this.updateRegion(i0, i1, j0, j1);
      const lo = j0 * n + i0;
      const hi = j1 * n + i1;
      if (lo < minIdx) minIdx = lo;
      if (hi > maxIdx) maxIdx = hi;
    }
    if (maxIdx < 0) return false;

    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(minIdx * 3, (maxIdx - minIdx + 1) * 3);
    this.pos.needsUpdate = true;
    this.nor.clearUpdateRanges();
    this.nor.addUpdateRange(minIdx * 3, (maxIdx - minIdx + 1) * 3);
    this.nor.needsUpdate = true;
    this.dep.clearUpdateRanges();
    this.dep.addUpdateRange(minIdx, maxIdx - minIdx + 1);
    this.dep.needsUpdate = true;
    this.foam.clearUpdateRanges();
    this.foam.addUpdateRange(minIdx, maxIdx - minIdx + 1);
    this.foam.needsUpdate = true;
    this.updateSkirts();
    return true;
  }

  private surface(idx: number): number {
    return (this.water.ground[idx] as number) + (this.water.depth[idx] as number);
  }

  private updateRegion(i0: number, i1: number, j0: number, j1: number): void {
    const w = this.water;
    const n = w.n;
    const pos = this.pos.array as Float32Array;
    const nor = this.nor.array as Float32Array;
    const dep = this.dep.array as Float32Array;
    const foam = this.foam.array as Float32Array;
    const inv2c = 1 / (2 * w.cell);

    for (let j = j0; j <= j1; j++) {
      const jm = j > 0 ? j - 1 : j;
      const jp = j < n - 1 ? j + 1 : j;
      for (let i = i0; i <= i1; i++) {
        const idx = j * n + i;
        const im = i > 0 ? i - 1 : i;
        const ip = i < n - 1 ? i + 1 : i;
        const d = w.depth[idx] as number;
        const g = w.ground[idx] as number;
        pos[idx * 3 + 1] = d > 0 ? g + d : g - HIDE;
        dep[idx] = d;
        foam[idx] = Math.min(1, w.flowSpeed(idx) * FOAM_SCALE);
        const dx = (this.surface(j * n + ip) - this.surface(j * n + im)) * inv2c * (2 / (ip - im || 1));
        const dz = (this.surface(jp * n + i) - this.surface(jm * n + i)) * inv2c * (2 / (jp - jm || 1));
        const len = Math.sqrt(dx * dx + 1 + dz * dz);
        const o = idx * 3;
        nor[o] = -dx / len;
        nor[o + 1] = 1 / len;
        nor[o + 2] = -dz / len;
      }
    }
  }

  private updateSkirts(): void {
    const w = this.water;
    const n = w.n;
    const p = this.skirtPos.array as Float32Array;
    const dep = this.skirtDep.array as Float32Array;
    for (let s = 0; s < SIDES; s++) {
      for (let k = 0; k < n; k++) {
        const idx = s === 0 ? k : s === 1 ? (n - 1) * n + k : s === 2 ? k * n : k * n + (n - 1);
        const d = w.depth[idx] as number;
        const g = w.ground[idx] as number;
        const v = (s * n + k) * 2;
        p[v * 3 + 1] = g + d; // top
        p[(v + 1) * 3 + 1] = g; // bottom
        dep[v] = d;
        dep[v + 1] = d;
      }
    }
    this.skirtPos.needsUpdate = true;
    this.skirtDep.needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
  }
}
