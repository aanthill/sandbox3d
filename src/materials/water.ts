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
  const flow = attribute('wfoam', 'float');

  const material = new MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0 });
  material.transparent = true;
  material.depthWrite = false;

  // Two crossing wave patterns drive normal ripples; a finer pattern makes lacy foam.
  const px = positionWorld.x;
  const pz = positionWorld.z;
  const w1 = sin(px.mul(36).add(time.mul(1.5))).mul(cos(pz.mul(31).sub(time.mul(1.2))));
  const w2 = sin(pz.mul(52).add(time.mul(2.1))).mul(cos(px.mul(47).add(time.mul(1.7))));
  const lace = sin(px.mul(44).add(pz.mul(33)).add(time.mul(1.1)))
    .mul(sin(pz.mul(51).sub(px.mul(29)).sub(time.mul(0.9))))
    .mul(0.5)
    .add(0.5)
    .mul(w1.mul(0.25).add(0.75));

  // Shore foam: a band hugging the waterline that breathes in and out, with a lacy edge.
  const breathe = sin(time.mul(0.9).add(px.mul(7)).add(pz.mul(5))).mul(0.008).add(0.032);
  const band = smoothstep(breathe, float(0.004), depth); // 1 right at the edge
  const shoreFoam = band.mul(smoothstep(float(0.18), float(0.5), lace.add(band.mul(0.45))));
  // Flow foam: fast-moving water (rivers, waves after a pour) turns white-capped.
  const flowFoam = smoothstep(float(0.4), float(0.95), flow).mul(smoothstep(float(0.4), float(0.75), lace)).mul(smoothstep(float(0.02), float(0.08), depth));
  const foam = shoreFoam.max(flowFoam).saturate();

  // Opacity: fades out at the shoreline (but foam stays solid), denser with depth.
  const shore = smoothstep(float(0.0), float(0.03), depth);
  const body = mix(float(0.55), float(0.94), smoothstep(float(0.0), float(0.45), depth));
  material.opacityNode = shore.mul(body).max(foam.mul(0.95));

  // Absorption color: bright turquoise shallows into a saturated, dark deep blue.
  const k = smoothstep(float(0.0), float(0.55), depth);
  const tint = mix(shallow, deep, k.pow(0.7));
  material.colorNode = mix(tint, foamColor, foam);

  const facing = normalView.dot(positionViewDirection).saturate();
  const fresnel = float(1).sub(facing).pow(3);
  // Sky sheen at grazing angles + a faint inner glow in deeper water (subsurface look).
  material.emissiveNode = sky
    .mul(fresnel.mul(0.5))
    .add(shallow.mul(float(1).sub(k).mul(0.06)))
    .mul(float(1).sub(foam.mul(0.3)));

  material.normalNode = normalize(normalView.add(vec3(w1.mul(0.04), w2.mul(0.04), 0)));

  return material;
}
