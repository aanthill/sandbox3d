import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three/webgpu';
import { BASE_Y, CHUNK, Heightfield, WORLD_SIZE } from './heightfield';
import { LINEAR, terrainColor } from './palette';
import type { WaterSim } from '../sim/water';

/** Strata thickness below the surface, and the fixed rock line (world y). */
const TURF_DEPTH = 0.1;
const SOIL_FLOOR = -0.35;
const SIDES = 4;
/** How much wet ground darkens (0..1). */
const WET_DARKEN = 0.34;
const VERTS_PER_COLUMN = 6; // 3 bands x (top, bottom)

/**
 * The floating block: the terrain surface, four side walls that show colored
 * strata, and a bottom face. Only active/dirty chunks are rewritten and
 * uploaded each frame.
 */
export class TerrainMesh {
  readonly group = new Group();
  private readonly top: Mesh;
  private readonly walls: Mesh;
  private readonly pos: BufferAttribute;
  private readonly nor: BufferAttribute;
  private readonly col: BufferAttribute;
  private readonly wallPos: BufferAttribute;
  private water: WaterSim | null = null;

  constructor(
    private readonly hf: Heightfield,
    topMaterial: Material,
    sideMaterial: Material,
  ) {
    const n = hf.n;

    // ---- Top surface ----
    const count = n * n;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const o = (j * n + i) * 3;
        positions[o] = hf.worldX(i);
        positions[o + 1] = 0;
        positions[o + 2] = hf.worldZ(j);
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
        // Counter-clockwise seen from above (+y).
        indices[q++] = a;
        indices[q++] = c;
        indices[q++] = b;
        indices[q++] = b;
        indices[q++] = c;
        indices[q++] = d;
      }
    }
    const topGeo = new BufferGeometry();
    this.pos = new BufferAttribute(positions, 3);
    this.nor = new BufferAttribute(normals, 3);
    this.col = new BufferAttribute(colors, 3);
    topGeo.setAttribute('position', this.pos);
    topGeo.setAttribute('normal', this.nor);
    topGeo.setAttribute('color', this.col);
    topGeo.setIndex(new BufferAttribute(indices, 1));
    this.top = new Mesh(topGeo, topMaterial);
    this.top.frustumCulled = false;
    this.top.castShadow = true;
    this.top.receiveShadow = true;

    // ---- Side walls ----
    const wv = SIDES * n * VERTS_PER_COLUMN;
    const wPositions = new Float32Array(wv * 3);
    const wNormals = new Float32Array(wv * 3);
    const wColors = new Float32Array(wv * 3);
    const wIndices = new Uint32Array(SIDES * (n - 1) * 3 * 6);
    const bandColors = [LINEAR.turf, LINEAR.soil, LINEAR.deepRock];
    const outward = [
      [0, 0, -1],
      [0, 0, 1],
      [-1, 0, 0],
      [1, 0, 0],
    ] as const;
    let wi = 0;
    for (let s = 0; s < SIDES; s++) {
      const nrm = outward[s] as readonly [number, number, number];
      for (let k = 0; k < n; k++) {
        const base = (s * n + k) * VERTS_PER_COLUMN;
        const along = hf.worldX(k); // same spacing in x and z
        for (let v = 0; v < VERTS_PER_COLUMN; v++) {
          const o = (base + v) * 3;
          if (s < 2) {
            wPositions[o] = along;
            wPositions[o + 2] = nrm[2] * (WORLD_SIZE / 2);
          } else {
            wPositions[o] = nrm[0] * (WORLD_SIZE / 2);
            wPositions[o + 2] = along;
          }
          wNormals[o] = nrm[0];
          wNormals[o + 1] = nrm[1];
          wNormals[o + 2] = nrm[2];
          const bc = bandColors[Math.floor(v / 2)] as [number, number, number];
          wColors[o] = bc[0];
          wColors[o + 1] = bc[1];
          wColors[o + 2] = bc[2];
        }
      }
      // Choose the winding so triangles face outward on this side.
      // Along-axis direction in world space: +x for sides 0/1, +z for sides 2/3.
      const axis = s < 2 ? [1, 0, 0] : [0, 0, 1];
      // normal of (A=top_i, B=bottom_i, C=top_i+1) = (B-A) x (C-A) with B-A = (0,-1,0), C-A = axis.
      const cross = [
        -1 * (axis[2] as number) - 0 * (axis[1] as number),
        0 * (axis[0] as number) - 0 * (axis[2] as number),
        0 * (axis[1] as number) + 1 * (axis[0] as number),
      ];
      const facesOut = cross[0]! * nrm[0] + cross[1]! * nrm[1] + cross[2]! * nrm[2] > 0;
      for (let k = 0; k < n - 1; k++) {
        for (let band = 0; band < 3; band++) {
          const t0 = (s * n + k) * VERTS_PER_COLUMN + band * 2;
          const t1 = (s * n + k + 1) * VERTS_PER_COLUMN + band * 2;
          const A = t0, B = t0 + 1, C = t1, D = t1 + 1;
          if (facesOut) {
            wIndices[wi++] = A; wIndices[wi++] = B; wIndices[wi++] = C;
            wIndices[wi++] = B; wIndices[wi++] = D; wIndices[wi++] = C;
          } else {
            wIndices[wi++] = A; wIndices[wi++] = C; wIndices[wi++] = B;
            wIndices[wi++] = B; wIndices[wi++] = C; wIndices[wi++] = D;
          }
        }
      }
    }
    const wallGeo = new BufferGeometry();
    this.wallPos = new BufferAttribute(wPositions, 3);
    wallGeo.setAttribute('position', this.wallPos);
    wallGeo.setAttribute('normal', new BufferAttribute(wNormals, 3));
    wallGeo.setAttribute('color', new BufferAttribute(wColors, 3));
    wallGeo.setIndex(new BufferAttribute(wIndices, 1));
    this.walls = new Mesh(wallGeo, sideMaterial);
    this.walls.frustumCulled = false;
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;

    // ---- Bottom face (faces down) ----
    const h2 = WORLD_SIZE / 2;
    const bottomGeo = new BufferGeometry();
    bottomGeo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([-h2, BASE_Y, -h2, h2, BASE_Y, -h2, -h2, BASE_Y, h2, h2, BASE_Y, h2]),
        3,
      ),
    );
    bottomGeo.setAttribute('normal', new BufferAttribute(new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]), 3));
    const bc = LINEAR.bottom;
    bottomGeo.setAttribute(
      'color',
      new BufferAttribute(new Float32Array([...bc, ...bc, ...bc, ...bc]), 3),
    );
    bottomGeo.setIndex([0, 1, 2, 1, 3, 2]);
    const bottom = new Mesh(bottomGeo, sideMaterial);
    bottom.frustumCulled = false;

    this.group.add(this.top, this.walls, bottom);
  }

  /** Lets the terrain darken where water has soaked in. */
  setWater(water: WaterSim | null): void {
    this.water = water;
  }

  /** Displayed height of a cell, blending the last two simulation steps. */
  private rh(idx: number, alpha: number): number {
    const p = this.hf.prev[idx] as number;
    return p + ((this.hf.height[idx] as number) - p) * alpha;
  }

  /**
   * Refreshes vertices of every chunk that moved (or was edited) and uploads
   * only the touched memory range. Returns true if anything changed.
   */
  update(alpha: number): boolean {
    const hf = this.hf;
    const n = hf.n;
    const cps = hf.chunksPerSide;
    let minIdx = Infinity;
    let maxIdx = -1;

    for (let ch = 0; ch < cps * cps; ch++) {
      if (!hf.active[ch] && !hf.dirty[ch]) continue;
      hf.dirty[ch] = 0;
      const cx = (ch % cps) * CHUNK;
      const cy = Math.floor(ch / cps) * CHUNK;
      const i0 = Math.max(0, cx - 1);
      const i1 = Math.min(n - 1, cx + CHUNK);
      const j0 = Math.max(0, cy - 1);
      const j1 = Math.min(n - 1, cy + CHUNK);
      this.updateRegion(i0, i1, j0, j1, alpha);
      const lo = j0 * n + i0;
      const hi = j1 * n + i1;
      if (lo < minIdx) minIdx = lo;
      if (hi > maxIdx) maxIdx = hi;
    }
    // Wetness changed in the water grid: recolor the matching terrain cells.
    const water = this.water;
    if (water) {
      const wcps = water.cps;
      const k = (hf.n - 1) / (water.n - 1);
      for (let wch = 0; wch < wcps * wcps; wch++) {
        if (!water.wetDirty[wch]) continue;
        water.wetDirty[wch] = 0;
        const wi0 = (wch % wcps) * CHUNK;
        const wj0 = Math.floor(wch / wcps) * CHUNK;
        const i0 = Math.max(0, Math.floor(wi0 * k) - 1);
        const i1 = Math.min(n - 1, Math.ceil(Math.min(water.n - 1, wi0 + CHUNK) * k) + 1);
        const j0 = Math.max(0, Math.floor(wj0 * k) - 1);
        const j1 = Math.min(n - 1, Math.ceil(Math.min(water.n - 1, wj0 + CHUNK) * k) + 1);
        this.updateRegion(i0, i1, j0, j1, alpha);
        const lo = j0 * n + i0;
        const hi = j1 * n + i1;
        if (lo < minIdx) minIdx = lo;
        if (hi > maxIdx) maxIdx = hi;
      }
    }
    if (maxIdx < 0) return false;

    for (const attr of [this.pos, this.nor, this.col]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(minIdx * 3, (maxIdx - minIdx + 1) * 3);
      attr.needsUpdate = true;
    }
    this.updateWalls(alpha);
    return true;
  }

  private updateRegion(i0: number, i1: number, j0: number, j1: number, alpha: number): void {
    const hf = this.hf;
    const n = hf.n;
    const pos = this.pos.array as Float32Array;
    const nor = this.nor.array as Float32Array;
    const col = this.col.array as Float32Array;
    const inv2c = 1 / (2 * hf.cell);

    for (let j = j0; j <= j1; j++) {
      const jm = j > 0 ? j - 1 : j;
      const jp = j < n - 1 ? j + 1 : j;
      for (let i = i0; i <= i1; i++) {
        const idx = j * n + i;
        const im = i > 0 ? i - 1 : i;
        const ip = i < n - 1 ? i + 1 : i;
        const h = this.rh(idx, alpha);
        const dx = (this.rh(j * n + ip, alpha) - this.rh(j * n + im, alpha)) * inv2c * (2 / (ip - im || 1));
        const dz = (this.rh(jp * n + i, alpha) - this.rh(jm * n + i, alpha)) * inv2c * (2 / (jp - jm || 1));
        const len = Math.sqrt(dx * dx + 1 + dz * dz);
        const o = idx * 3;
        pos[o + 1] = h;
        nor[o] = -dx / len;
        nor[o + 1] = 1 / len;
        nor[o + 2] = -dz / len;
        terrainColor(col, o, h, 1 / len);
        if (this.water) {
          const wet = this.water.wetForTerrainCell(i, j);
          if (wet > 0) {
            const k = 1 - WET_DARKEN * wet;
            col[o] = (col[o] as number) * k;
            col[o + 1] = (col[o + 1] as number) * k;
            col[o + 2] = (col[o + 2] as number) * (k + 0.05 * wet);
          }
        }
      }
    }
  }

  private updateWalls(alpha: number): void {
    const hf = this.hf;
    const n = hf.n;
    const w = this.wallPos.array as Float32Array;
    for (let s = 0; s < SIDES; s++) {
      for (let k = 0; k < n; k++) {
        const idx = s === 0 ? k : s === 1 ? (n - 1) * n + k : s === 2 ? k * n : k * n + (n - 1);
        const h = this.rh(idx, alpha);
        const b1 = h - TURF_DEPTH;
        const b2 = Math.min(b1, SOIL_FLOOR);
        const o = (s * n + k) * VERTS_PER_COLUMN * 3;
        w[o + 1] = h; //            band 0 top
        w[o + 4] = b1; //           band 0 bottom
        w[o + 7] = b1; //           band 1 top
        w[o + 10] = b2; //          band 1 bottom
        w[o + 13] = b2; //          band 2 top
        w[o + 16] = BASE_Y; //      band 2 bottom
      }
    }
    this.wallPos.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  }
}
