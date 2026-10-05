import { Color, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cos,
  float,
  mix,
  normalView,
  normalize,
  positionViewDirection,
  positionWorld,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl';
import { PALETTE } from '../world/palette';

/**
 * Water look (Phase 2): color from depth (absorption), see-through at the
 * shore, a sky-colored Fresnel sheen and small
 * animated ripples in the normal. Reads the per-vertex `wdepth` attribute.
 * Screen-space refraction and caustics are left for later (docs/backlog.md).
 */
export interface WaterMaterial {
  material: MeshStandardNodeMaterial;
  /** Linear RGB of the sky color reflected at grazing angles. */
  setSky(r: number, g: number, b: number): void;
}

export function createWaterMaterial(): WaterMaterial {
  const shallow = uniform(new Color(PALETTE.waterShallow));
  const deep = uniform(new Color(PALETTE.waterDeep));
  const sky = uniform(new Color(PALETTE.sky));

  const depth = attribute('wdepth', 'float');

  const material = new MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0 });
  material.transparent = true;
  material.depthWrite = false;

  // Two crossing wave patterns drive the normal ripples.
  const px = positionWorld.x;
  const pz = positionWorld.z;
  const w1 = sin(px.mul(36).add(time.mul(1.5))).mul(cos(pz.mul(31).sub(time.mul(1.2))));
  const w2 = sin(pz.mul(52).add(time.mul(2.1))).mul(cos(px.mul(47).add(time.mul(1.7))));

  // Opacity: fades out at the shoreline denser with depth.
  const shore = smoothstep(float(0.0), float(0.03), depth);
  const dense = mix(float(0.55), float(0.94), smoothstep(float(0.0), float(0.45), depth));
  material.opacityNode = shore.mul(dense);

  // Absorption color: bright turquoise shallows into a saturated, dark deep blue.
  const k = smoothstep(float(0.0), float(0.55), depth);
  const tint = mix(shallow, deep, k.pow(0.7));
  material.colorNode = tint;

  const facing = normalView.dot(positionViewDirection).saturate();
  const fresnel = float(1).sub(facing).pow(3);
  // Sky sheen at grazing angles + a faint inner glow in deeper water (subsurface look).
  material.emissiveNode = sky
    .mul(fresnel.mul(0.5))
    .add(shallow.mul(float(1).sub(k).mul(0.06)));

  material.normalNode = normalize(normalView.add(vec3(w1.mul(0.04), w2.mul(0.04), 0)));

  return {
    material,
    setSky(r, g, b) {
      (sky.value as Color).setRGB(r, g, b);
    },
  };
}
