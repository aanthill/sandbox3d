import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three/webgpu';
import { BASE_Y } from './heightfield';

/** Cheap fake contact shadow under the floating block: a soft radial gradient on a plane. */
export function createGroundShadow(): Mesh {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  const mesh = new Mesh(
    new PlaneGeometry(6.4, 6.4),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = BASE_Y - 1.1;
  mesh.renderOrder = -1;
  return mesh;
}
