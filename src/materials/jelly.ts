import { Color, MeshStandardNodeMaterial } from 'three/webgpu';
import { float, normalView, positionViewDirection, positionWorld, smoothstep, uniform, vertexColor } from 'three/tsl';
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

  material.emissiveNode = rimColor.mul(fresnel.mul(0.4)).add(inner).mul(glowAmount);

  return {
    material,
    setGlow(v: number) {
      glowAmount.value = Math.min(1, Math.max(0, v)) * 1.4;
    },
  };
}
