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
 * shore, flickering foam in thin water, a sky-colored Fresnel sheen and small
 * animated ripples in the normal. Reads the per-vertex `wdepth` attribute.
 * Screen-space refraction and caustics are left for later (docs/backlog.md).
 */
export function createWaterMaterial(): MeshStandardNodeMaterial {
  const shallow = uniform(new Color(PALETTE.waterShallow));
  const deep = uniform(new Color(PALETTE.waterDeep));
  const foamColor = uniform(new Color(PALETTE.foam));
  const sky = uniform(new Color(PALETTE.sky));

  const depth = attribute('wdepth', 'float');

  const material = new MeshStandardNodeMaterial({ roughness: 0.07, metalness: 0 });
  material.transparent = true;
  material.depthWrite = false;

  // Opacity: fades out at the shoreline, denser with depth.
  const shore = smoothstep(float(0.0), float(0.035), depth);
  const body = mix(float(0.5), float(0.9), smoothstep(float(0.0), float(0.5), depth));
  material.opacityNode = shore.mul(body);

  // Two crossing wave patterns drive both foam flicker and normal ripples.
  const w1 = sin(positionWorld.x.mul(36).add(time.mul(1.5))).mul(cos(positionWorld.z.mul(31).sub(time.mul(1.2))));
  const w2 = sin(positionWorld.z.mul(52).add(time.mul(2.1))).mul(cos(positionWorld.x.mul(47).add(time.mul(1.7))));

  const tint = mix(shallow, deep, smoothstep(float(0.0), float(0.6), depth));
  const foam = smoothstep(float(0.06), float(0.012), depth).mul(shore).mul(w1.mul(0.35).add(0.65));
  material.colorNode = mix(tint, foamColor, foam.mul(0.6));

  const facing = normalView.dot(positionViewDirection).saturate();
  const fresnel = float(1).sub(facing).pow(3);
  material.emissiveNode = sky.mul(fresnel.mul(0.55));

  material.normalNode = normalize(normalView.add(vec3(w1.mul(0.035), w2.mul(0.035), 0)));

  return material;
}
