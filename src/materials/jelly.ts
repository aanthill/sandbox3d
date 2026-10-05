import { Color, MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, float, mix, mx_noise_float, normalView, normalWorld, positionView, positionViewDirection, positionWorld, sin, smoothstep, uniform, vec2, vec3, vertexColor } from 'three/tsl';
import { BASE_Y, MAX_H } from '../world/heightfield';

export interface JellyMaterial {
  material: MeshStandardNodeMaterial;
  /** 0..1 user setting ("brightness intensity", rule 10). */
  setGlow(v: number): void;
}

/**
 * First jelly material (Phase 1): vertex-colored, soft specular, a Fresnel rim
 * light and a fake translucency glow that is stronger where the block is thin.
 * Screen-space refraction is left for later (docs/backlog.md).
 */
export function createJellyMaterial(rimHex: number, glow = 0.7): JellyMaterial {
  const rimColor = uniform(new Color(rimHex));
  const glowAmount = uniform(glow);

  const material = new MeshStandardNodeMaterial({ roughness: 0.34, metalness: 0 });
  material.vertexColors = true;

  const facing = normalView.dot(positionViewDirection).saturate();
  const fresnel = float(1).sub(facing).pow(2.6);
  // 0 when the block is tall (thick), 1 when thin: light seems to pass through it.
  const thin = float(1).sub(smoothstep(float(BASE_Y), float(MAX_H), positionWorld.y));
  const inner = vertexColor().rgb.mul(thin.mul(0.1));

  // Grass as a texture: procedural lawn mottling (patches + fine blade streaks) multiplies the vertex
  // color only on green, upward-facing ground. Fine detail fades with distance so it never shimmers.
  const vc = vertexColor().rgb;
  const greenness = smoothstep(float(0.02), float(0.12), vc.g.sub(vc.r.max(vc.b)));
  const upFacing = smoothstep(float(0.7), float(0.9), normalWorld.y);
  const xz = positionWorld.xz;
  const patches = mx_noise_float(vec3(xz.mul(14), 0.5)).mul(0.5).add(mx_noise_float(vec3(xz.mul(4), 3.5)).mul(0.5));
  const streakA = mx_noise_float(vec3(vec2(xz.x.mul(46), xz.y.mul(120)), 7.5));
  const streakB = mx_noise_float(vec3(vec2(xz.x.mul(120), xz.y.mul(46)), 11.5));
  const fine = streakA.add(streakB).mul(0.5);
  const near = float(1).sub(smoothstep(float(5), float(11), positionView.z.negate()));
  const tone = patches.mul(0.55).add(fine.mul(0.5).mul(near));
  const lawn = vec3(float(1).add(tone.mul(0.7)), float(1).add(tone), float(1).add(tone.mul(0.3)));
  const lawnMix = greenness.mul(upFacing);

  // Sand: warm colors (red clearly above green). Fine grain plus soft wind ripples; 3D noise, so no stretching.
  const p3 = positionWorld;
  const sandMask = smoothstep(float(1.2), float(1.5), vc.r.div(vc.g.max(0.001)));
  const sandGrain = mx_noise_float(p3.mul(150)).mul(0.2).mul(near);
  const sandRipple = sin(p3.x.mul(0.6).add(p3.z).mul(55).add(mx_noise_float(p3.mul(5)).mul(9))).mul(0.06);
  const sandTone = mx_noise_float(p3.mul(11)).mul(0.14).add(sandGrain).add(sandRipple.mul(near.mul(0.5).add(0.5)));
  const sand = vec3(float(1).add(sandTone), float(1).add(sandTone.mul(0.9)), float(1).add(sandTone.mul(0.7)));

  // Rock (and the strata walls): bluish colors. Coarse blotches, fine grain and dark crack veins.
  const rockMask = smoothstep(float(1.4), float(2.0), vc.b.div(vc.g.max(0.001)));
  const veins = smoothstep(float(0.88), float(0.99), float(1).sub(abs(mx_noise_float(p3.mul(20)))));
  const rockTone = mx_noise_float(p3.mul(9)).mul(0.3)
    .add(mx_noise_float(p3.mul(80)).mul(0.2).mul(near))
    .sub(veins.mul(0.4));
  const rock = vec3(float(1).add(rockTone), float(1).add(rockTone), float(1).add(rockTone.mul(0.8)));

  material.colorNode = mix(mix(mix(vec3(1, 1, 1), lawn, lawnMix), sand, sandMask), rock, rockMask);

  material.emissiveNode = rimColor.mul(fresnel.mul(0.4)).add(inner).mul(glowAmount);

  return {
    material,
    setGlow(v: number) {
      glowAmount.value = Math.min(1, Math.max(0, v)) * 1.4;
    },
  };
}
