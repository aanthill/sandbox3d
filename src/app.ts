import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  type WebGPURenderer,
} from 'three/webgpu';
import { terrainSpring } from './anim/spring';
import { DEFAULT_WOBBLE } from './anim/config';
import { CameraRig } from './core/camera-rig';
import { runBudgeted } from './core/budget';
import { MAX_PIXEL_RATIO, SIM_HZ, readDebugParams } from './core/config';
import { FixedStep } from './core/fixed-step';
import { InputController } from './core/input';
import { createJellyMaterial, type JellyMaterial } from './materials/jelly';
import { AdaptiveQuality } from './perf/adaptive';
import { PerfPanel } from './perf/panel';
import { PerfStats } from './perf/stats';
import { TIERS, loadTier, saveTier, type TierId } from './perf/quality';
import { BrushRing } from './tools/brush-ring';
import { BRUSH_LIMITS, Sculptor, type BrushSettings, type ToolId } from './tools/brush';
import { History } from './tools/history';
import { Dock } from './ui/dock';
import { generateTerrain, resampleTerrain } from './world/generate';
import { createGroundShadow } from './world/ground-shadow';
import { Heightfield } from './world/heightfield';
import { PALETTE } from './world/palette';
import { raycastHeightfield, type Hit } from './world/pick';
import { TerrainMesh } from './world/terrain-mesh';

const WARMUP_FRAMES = 60;
const BOB_AMPLITUDE = 0.035;

export class App {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 60);
  private readonly rig = new CameraRig(this.camera);
  private readonly sun = new DirectionalLight(0xffffff, 2.3);
  private readonly jelly: JellyMaterial = createJellyMaterial(PALETTE.rim);
  private readonly ring = new BrushRing(0xffffff);
  private readonly fixed = new FixedStep(SIM_HZ);
  private readonly stats = new PerfStats();
  private readonly adaptive = new AdaptiveQuality();
  private readonly raycaster = new Raycaster();
  private readonly history = new History();
  private readonly hit: Hit = { x: 0, y: 0, z: 0 };
  private readonly drawSize = new Vector2();

  private hf!: Heightfield;
  private sculptor!: Sculptor;
  private mesh!: TerrainMesh;
  private input!: InputController;
  private dock!: Dock;
  private panel!: PerfPanel;

  private tier: TierId = loadTier();
  private tool: ToolId = 'raise';
  private brush: BrushSettings = { radius: 0.45, strength: 0.6 };
  private wobble = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DEFAULT_WOBBLE;
  private hasHit = false;
  private busy = false;
  private simTime = 0;
  private seed = 1;
  private framesSeen = 0;
  private lastFrame = 0;
  private resolutionScale = 1;
  private lastAppliedPr = -1;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly backend: string,
  ) {}

  /** Builds the world and starts the loop. */
  async start(): Promise<void> {
    const scene = this.scene;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    scene.add(new AmbientLight(0xffffff, 0.3));
    scene.add(new HemisphereLight(0xd6e4ff, 0x2a2f45, 0.9));
    this.sun.position.set(3.2, 5.5, 2.4);
    this.sun.shadow.camera.left = -3.4;
    this.sun.shadow.camera.right = 3.4;
    this.sun.shadow.camera.top = 3.4;
    this.sun.shadow.camera.bottom = -3.4;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 14;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(createGroundShadow());
    scene.add(this.ring.object);

    this.panel = new PerfPanel(this.stats, this.backend, () => {
      const s = this.renderer.getDrawingBufferSize(this.drawSize);
      return `${s.x}x${s.y} (pr ${this.renderer.getPixelRatio().toFixed(2)})`;
    });

    this.dock = new Dock({
      tool: this.tool,
      brush: this.brush,
      wobble: this.wobble,
      tier: this.tier,
      glow: 0.7,
      onTool: (t) => this.selectTool(t),
      onRadius: (r) => this.setRadius(r),
      onStrength: (s) => (this.brush.strength = s),
      onWobble: (w) => (this.wobble = w),
      onGlow: (g) => this.jelly.setGlow(g),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onNewWorld: () => void this.newWorld(),
      onTier: (t) => void this.setTier(t),
    });
    this.ring.setRadius(this.brush.radius);

    this.input = new InputController(this.renderer.domElement, this.rig, {
      strokeStart: () => this.beginStroke(),
      strokeEnd: () => this.endStroke(),
      selectTool: (t) => this.selectTool(t),
      adjustSize: (f) => this.setRadius(this.brush.radius * f, true),
      undo: () => this.undo(),
      redo: () => this.redo(),
    });

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      this.stats.reset();
      this.framesSeen = 0;
    });

    this.applyTierRendering();
    await this.buildWorld(TIERS[this.tier].grid, (hf) => generateTerrain(hf, this.seed, true));

    await this.renderer.compileAsync(this.scene, this.camera);
    this.dock.setBusy(false);
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop((now: number) => this.frame(now));
  }

  // ---------------------------------------------------------------- world

  /** Creates a new heightfield with `fill`, builds its mesh, then swaps it in (never half-built on screen). */
  private async buildWorld(n: number, fill: (hf: Heightfield) => Generator<void, void, void>): Promise<void> {
    this.busy = true;
    this.dock?.setBusy(true);
    const hf = new Heightfield(n);
    await runBudgeted(fill(hf));
    const mesh = new TerrainMesh(hf, this.jelly.material, this.jelly.material);
    mesh.update(1); // first fill happens here, while the "building" notice is up

    if (this.mesh) {
      this.scene.remove(this.mesh.group);
      this.mesh.dispose();
    }
    this.hf = hf;
    this.mesh = mesh;
    this.sculptor = new Sculptor(hf);
    this.history.clear();
    this.dock?.updateHistory(this.history);
    this.scene.add(mesh.group);
    this.busy = false;
    this.dock?.setBusy(false);
  }

  private async newWorld(): Promise<void> {
    if (this.busy) return;
    this.seed = (this.seed * 7919 + 13) % 100000;
    await this.buildWorld(this.hf.n, (hf) => generateTerrain(hf, this.seed, true));
  }

  private async setTier(id: TierId): Promise<void> {
    if (this.busy || id === this.tier) return;
    this.tier = id;
    saveTier(id);
    const old = this.hf;
    this.applyTierRendering();
    this.adaptive.reset();
    this.adaptive.scale = 1;
    this.resolutionScale = 1;
    await this.buildWorld(TIERS[id].grid, (hf) => resampleTerrain(old.target, old.n, hf));
    this.applyResolution(true);
  }

  private applyTierRendering(): void {
    const t = TIERS[this.tier];
    this.renderer.shadowMap.enabled = t.shadows;
    this.sun.castShadow = t.shadows;
    if (t.shadows) this.sun.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
    // Shadow state changes the compiled shaders and the shadow map's size.
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.jelly.material.needsUpdate = true;
    document.documentElement.classList.toggle('ui-blur', t.uiBlur);
    this.applyResolution(true);
  }

  private applyResolution(force = false): void {
    const debug = readDebugParams();
    const base = debug.pixelRatio ?? Math.min(window.devicePixelRatio, Math.min(MAX_PIXEL_RATIO, TIERS[this.tier].maxPixelRatio));
    const pr = Math.max(0.35, base * this.resolutionScale);
    if (!force && Math.abs(pr - this.lastAppliedPr) < 0.01) return;
    this.lastAppliedPr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyResolution(true);
  }

  // ---------------------------------------------------------------- tools

  private selectTool(t: ToolId): void {
    this.tool = t;
    this.dock.setTool(t);
  }

  private setRadius(r: number, fromKeys = false): void {
    this.brush.radius = Math.min(BRUSH_LIMITS.maxRadius, Math.max(BRUSH_LIMITS.minRadius, r));
    this.ring.setRadius(this.brush.radius);
    if (fromKeys) this.dock.setRadius(this.brush.radius);
  }

  private beginStroke(): boolean {
    if (this.busy || !this.hasHit) return false;
    this.sculptor.beginStroke(this.hit.x, this.hit.z);
    return true;
  }

  private endStroke(): void {
    const stroke = this.sculptor.endStroke();
    if (stroke) {
      this.history.push(stroke);
      this.dock.updateHistory(this.history);
    }
  }

  private undo(): void {
    if (this.busy) return;
    const s = this.history.undo();
    if (s) this.sculptor.applyStroke(s, 'before');
    this.dock.updateHistory(this.history);
  }

  private redo(): void {
    if (this.busy) return;
    const s = this.history.redo();
    if (s) this.sculptor.applyStroke(s, 'after');
    this.dock.updateHistory(this.history);
  }

  // ----------------------------------------------------------------- loop

  private pick(): void {
    if (this.busy || !this.input.pointerOver) {
      this.hasHit = false;
      return;
    }
    this.raycaster.setFromCamera(this.input.ndc, this.camera);
    const r = this.raycaster.ray;
    // The block bobs, so move the ray into the block's local space.
    const bob = this.mesh.group.position.y;
    this.hasHit = raycastHeightfield(
      this.hf,
      r.origin.x,
      r.origin.y - bob,
      r.origin.z,
      r.direction.x,
      r.direction.y,
      r.direction.z,
      this.hit,
    );
  }

  private frame(now: number): void {
    const frameMs = now - this.lastFrame;
    this.lastFrame = now;
    if (this.framesSeen++ >= WARMUP_FRAMES) this.stats.push(frameMs);

    if (this.adaptive.push(frameMs)) {
      this.resolutionScale = this.adaptive.scale;
      this.applyResolution();
    }

    const dt = this.fixed.stepMs / 1000;
    const steps = this.fixed.advance(frameMs);
    const spring = terrainSpring(this.wobble);
    for (let i = 0; i < steps; i++) {
      if (this.input.sculpting && this.hasHit && !this.busy) {
        const b = this.input.shift ? { ...this.brush, strength: this.brush.strength * 0.35 } : this.brush;
        this.sculptor.apply(this.tool, this.hit.x, this.hit.z, b, dt);
      }
      this.hf.step(dt, spring);
      this.rig.step(dt);
      this.ring.step(dt);
      this.simTime += dt;
    }

    const alpha = this.fixed.alpha;
    this.mesh.group.position.y = Math.sin(this.simTime * 0.9) * BOB_AMPLITUDE;
    this.rig.apply(alpha);
    this.camera.updateMatrixWorld();
    this.pick();
    this.mesh.update(alpha);
    this.ring.update(this.hf, this.hit.x, this.hit.z, this.hasHit);
    this.ring.object.position.y = this.mesh.group.position.y;

    this.renderer.render(this.scene, this.camera);
    this.panel.update(now);
  }
}
