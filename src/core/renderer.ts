import { WebGPURenderer } from 'three/webgpu';
import { MAX_PIXEL_RATIO, WORKING_COLORS, readDebugParams } from './config';

export type BackendKind = 'WebGPU' | 'WebGL2';

export interface RendererHandle {
  renderer: WebGPURenderer;
  backend: BackendKind;
}

/**
 * Creates the renderer. WebGPURenderer picks WebGPU when available and falls
 * back to a WebGL2 backend automatically (decision #7).
 */
export async function createRenderer(
  canvasParent: HTMLElement,
  forceWebGL = false,
): Promise<RendererHandle> {
  const debug = readDebugParams();
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL: forceWebGL || debug.forceWebGL });
  renderer.setPixelRatio(debug.pixelRatio ?? Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(WORKING_COLORS.background, 1);
  canvasParent.appendChild(renderer.domElement);

  try {
    await renderer.init();
  } catch (err) {
    disposeRenderer(renderer);
    throw err;
  }

  const backendInfo = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  const backend: BackendKind = backendInfo.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  return { renderer, backend };
}

/** Fully tears down a renderer and removes its canvas (used before a fallback retry). */
export function disposeRenderer(renderer: WebGPURenderer): void {
  renderer.setAnimationLoop(null);
  renderer.dispose();
  renderer.domElement.remove();
}
