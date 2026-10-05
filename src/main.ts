import { App } from './app';
import { createRenderer } from './core/renderer';
import { showUnsupported } from './ui/unsupported';
import './ui/style.css';

/**
 * Boots the renderer and the app. If WebGPU initializes but then fails while
 * compiling shaders, retry once on WebGL2 instead of showing an error.
 */
async function boot(): Promise<void> {
  let handle = await createRenderer(document.body);
  try {
    await new App(handle.renderer, handle.backend).start();
  } catch (err) {
    if (handle.backend !== 'WebGPU') throw err;
    console.warn('WebGPU failed; falling back to WebGL2.', err);
    document.querySelectorAll('.dock, .perf-panel').forEach((e) => e.remove());
    handle.renderer.setAnimationLoop(null);
    handle.renderer.dispose();
    handle.renderer.domElement.remove();
    handle = await createRenderer(document.body, true);
    await new App(handle.renderer, handle.backend).start();
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  showUnsupported(err instanceof Error ? err.message : String(err));
});
