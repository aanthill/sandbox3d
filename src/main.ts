import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector2,
} from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SIM_HZ, WORKING_COLORS } from './core/config';
import { FixedStep } from './core/fixed-step';
import { createRenderer, disposeRenderer, type RendererHandle } from './core/renderer';
import { PerfPanel } from './perf/panel';
import { PerfStats } from './perf/stats';
import { showUnsupported } from './ui/unsupported';

/**
 * Creates the renderer and compiles the scene's shaders (rule 4).
 * If WebGPU initializes but then fails (odd driver, old browser build),
 * retry once on the WebGL2 backend instead of showing an error.
 */
async function prepareRenderer(scene: Scene, camera: PerspectiveCamera): Promise<RendererHandle> {
  let handle = await createRenderer(document.body);
  try {
    await handle.renderer.compileAsync(scene, camera);
    return handle;
  } catch (err) {
    if (handle.backend !== 'WebGPU') throw err;
    console.warn('WebGPU failed while compiling; falling back to WebGL2.', err);
    disposeRenderer(handle.renderer);
    handle = await createRenderer(document.body, true);
    await handle.renderer.compileAsync(scene, camera);
    return handle;
  }
}

async function start(): Promise<void> {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(2.6, 2.0, 3.4);
  camera.lookAt(0, 0, 0);

  // Rounded block: first hint of the floating diorama look (decision #2).
  const cube = new Mesh(
    new RoundedBoxGeometry(1.4, 1.4, 1.4, 6, 0.18),
    new MeshStandardMaterial({ color: WORKING_COLORS.cubeBase, roughness: 0.35, metalness: 0 }),
  );
  scene.add(cube);

  scene.add(new AmbientLight(0xffffff, 0.35));
  scene.add(new HemisphereLight(0xcfe0ff, 0x1a1f2e, 0.8));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const { renderer, backend } = await prepareRenderer(scene, camera);

  // Simulation state: previous/current rotation, blended at draw time.
  const spinPerSecond = 0.6;
  let prevAngle = 0;
  let currAngle = 0;
  const fixed = new FixedStep(SIM_HZ);
  const stepSeconds = fixed.stepMs / 1000;

  const drawSize = new Vector2();
  const stats = new PerfStats();
  const panel = new PerfPanel(stats, backend, () => {
    const size = renderer.getDrawingBufferSize(drawSize);
    return `${size.x}x${size.y} (pr ${renderer.getPixelRatio().toFixed(2)})`;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Measurement hygiene: skip warm-up frames and never count time spent in a hidden tab.
  const WARMUP_FRAMES = 60;
  let framesSeen = 0;
  document.addEventListener('visibilitychange', () => {
    stats.reset();
    framesSeen = 0;
  });

  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const frameMs = now - last;
    last = now;
    if (framesSeen++ >= WARMUP_FRAMES) stats.push(frameMs);

    const steps = fixed.advance(frameMs);
    for (let i = 0; i < steps; i++) {
      prevAngle = currAngle;
      currAngle += spinPerSecond * stepSeconds;
    }

    const angle = prevAngle + (currAngle - prevAngle) * fixed.alpha;
    cube.rotation.y = angle;
    cube.rotation.x = angle * 0.5;

    renderer.render(scene, camera);
    panel.update(now);
  });
}

start().catch((err: unknown) => {
  console.error(err);
  showUnsupported(err instanceof Error ? err.message : String(err));
});
