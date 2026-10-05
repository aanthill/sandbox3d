import {
  AmbientLight,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
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
import { createWaterMaterial } from './materials/water';
import { WaterSim } from './sim/water';
import { WaterMesh } from './world/water-mesh';
import { AdaptiveQuality } from './perf/adaptive';
import { PerfPanel } from './perf/panel';
import { PerfStats } from './perf/stats';
import { TIERS, loadTier, saveTier, type TierId } from './perf/quality';
import { BrushRing } from './tools/brush-ring';
import { BRUSH_LIMITS, Sculptor, type BrushSettings } from './tools/brush';
import { WATER_TOOL_TUNING, isWaterTool, type ToolId, type WaterToolId } from './tools/tools';
import { Splash } from './fx/splash';
import { Sky } from './fx/sky';
import { Rain } from './fx/rain';
import { computeDayState, createDayState } from './fx/daycycle';
import { SKY_LIGHT } from './fx/sky-config';
import { FountainMarkers } from './world/fountain-markers';
import { History } from './tools/history';
import { Dock } from './ui/dock';
import { generateTerrain, resampleTerrain } from './world/generate';
import { createGroundShadow } from './world/ground-shadow';
import { Heightfield, MAX_H, MIN_H } from './world/heightfield';
import { PALETTE } from './world/palette';
import { raycastHeightfield, type Hit } from './world/pick';
import { TerrainMesh } from './world/terrain-mesh';

const WARMUP_FRAMES = 60;
const BOB_AMPLITUDE = 0.035;

export class App {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 100);
  private readonly rig = new CameraRig(this.camera);
  private readonly sun = new DirectionalLight(0xfff1dc, 2.8);
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
  private water!: WaterSim;
  private waterMesh!: WaterMesh;
  private readonly waterMat = createWaterMaterial();
  private readonly sky = new Sky();
  private readonly day = createDayState();
  private readonly fog = new FogExp2(0x000000, 0);
  private readonly ambient = new AmbientLight(0xffffff, 0.16);
  private readonly hemi = new HemisphereLight(0xbfd6ff, 0x1d1a38, 0.7);
  private hour = 10;
  private readonly camForward = new Vector3();
  private autoDay = false;
  private fogAmount = 0;
  private rainAmount = 0;
  private rain: Rain | null = null;
  private dayDirty = true;
  private readonly markers = new FountainMarkers();
  private splash: Splash | null = null;
  private seaSlider = 0;
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
    if (readDebugParams().debug) (window as unknown as { __sandbox: App }).__sandbox = this;
    const scene = this.scene;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    scene.add(this.ambient, this.hemi, this.sky.mesh);
    scene.fog = this.fog;
    scene.add(this.sun);
    scene.add(createGroundShadow());
    scene.add(this.ring.object);
    scene.add(this.markers.group);

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
      onSea: (v) => this.setSea(v),
      hour: this.hour,
      auto: this.autoDay,
      fog: this.fogAmount,
      rain: this.rainAmount,
      onRain: (v) => {
        this.rainAmount = v;
        this.water.rainIntensity = v;
        this.rain?.setAmount(v);
        this.dayDirty = true;
      },
      onHour: (h) => {
        this.hour = h;
        this.dayDirty = true;
      },
      onAuto: (on) => (this.autoDay = on),
      onFog: (v) => {
        this.fogAmount = v;
        this.dayDirty = true;
      },
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
  private async buildWorld(n: number, fill: (hf: Heightfield) => Generator<void, void, void>, keepWater?: WaterSim): Promise<void> {
    this.busy = true;
    this.dock?.setBusy(true);
    const hf = new Heightfield(n);
    await runBudgeted(fill(hf));
    const mesh = new TerrainMesh(hf, this.jelly.material, this.jelly.material);
    const water = new WaterSim(hf);
    if (keepWater) water.copyFrom(keepWater);
    const waterMesh = new WaterMesh(water, this.waterMat.material);
    mesh.setWater(water);
    mesh.group.add(waterMesh.group);
    waterMesh.update();
    mesh.update(1); // first fill happens here, while the "building" notice is up

    if (this.mesh) {
      this.scene.remove(this.mesh.group);
      this.mesh.dispose();
      this.waterMesh.dispose();
    }
    this.hf = hf;
    this.water = water;
    this.waterMesh = waterMesh;
    this.mesh = mesh;
    this.sculptor = new Sculptor(hf);
    this.history.clear();
    this.dock?.updateHistory(this.history);
    this.scene.add(mesh.group);
    this.applySea();
    water.rainIntensity = this.rainAmount;
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
    const oldWater = this.water;
    this.applyTierRendering();
    this.adaptive.reset();
    this.adaptive.scale = 1;
    this.resolutionScale = 1;
    await this.buildWorld(TIERS[id].grid, (hf) => resampleTerrain(old.target, old.n, hf), oldWater);
    this.applyResolution(true);
  }

  private applyTierRendering(): void {
    const t = TIERS[this.tier];
    document.documentElement.classList.toggle('ui-blur', t.uiBlur);
    if (this.splash) {
      this.scene.remove(this.splash.mesh);
      this.splash.dispose();
    }
    this.splash = new Splash(t.splash);
    if (this.rain) {
      this.scene.remove(this.rain.mesh);
      this.rain.dispose();
    }
    this.rain = new Rain(t.rain);
    this.rain.setAmount(this.rainAmount);
    this.scene.add(this.rain.mesh);
    this.scene.add(this.splash.mesh);
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

  /** Slider 0 = no sea; otherwise maps linearly onto a level inside the terrain's height range. */
  private setSea(v: number): void {
    this.seaSlider = v;
    this.applySea();
  }

  private applySea(): void {
    const v = this.seaSlider;
    this.water.setSeaLevel(v <= 0.005 ? null : MIN_H + 0.1 + v * (MAX_H * 0.5 - MIN_H));
  }

  private useWaterTool(tool: WaterToolId, dt: number): void {
    const w = this.water;
    const b = this.brush;
    const strength = this.input.shift ? b.strength * 0.35 : b.strength;
    const T = WATER_TOOL_TUNING;
    const y = w.surfaceAt(this.hit.x, this.hit.z);
    if (tool === 'pour') {
      w.addVolume(this.hit.x, this.hit.z, b.radius, T.pourRate * strength * dt);
      this.splash?.emit(this.hit.x, y + 0.05, this.hit.z, 2, 1.2, 0.25);
    } else if (tool === 'rain') {
      const n = Math.max(1, Math.round(T.rainDrops * strength));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * b.radius;
        const x = this.hit.x + Math.cos(a) * r;
        const z = this.hit.z + Math.sin(a) * r;
        w.addVolume(x, z, w.cell * 1.5, T.rainDropVolume);
        this.splash?.emit(x, w.surfaceAt(x, z) + 0.02, z, 1, 0.7, 0.12);
      }
    } else if (tool === 'drain') {
      w.drain(this.hit.x, this.hit.z, b.radius, T.drainRate * strength, dt);
    }
  }

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
    if (isWaterTool(this.tool)) {
      if (this.tool === 'fountain') {
        const T = WATER_TOOL_TUNING;
        if (!this.water.removeSourceNear(this.hit.x, this.hit.z, T.fountainPickRadius)) {
          this.water.addSource(this.hit.x, this.hit.z, T.fountainRate);
        }
        return false; // a click, not a stroke
      }
      return true;
    }
    this.sculptor.beginStroke(this.hit.x, this.hit.z);
    return true;
  }

  private endStroke(): void {
    if (isWaterTool(this.tool)) return;
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

  /** Pushes the current hour/fog into lights, sky and materials (only when something changed). */
  private applyDay(): void {
    const d = computeDayState(this.hour, this.day, this.rainAmount);
    const L = d.lightDir;
    this.sun.position.set((L[0] as number) * 7, (L[1] as number) * 7, (L[2] as number) * 7);
    this.sun.color.setRGB(d.lightColor[0] as number, d.lightColor[1] as number, d.lightColor[2] as number);
    this.sun.intensity = d.lightIntensity;
    this.hemi.color.setRGB(d.hemiSky[0] as number, d.hemiSky[1] as number, d.hemiSky[2] as number);
    this.hemi.groundColor.setRGB(d.hemiGround[0] as number, d.hemiGround[1] as number, d.hemiGround[2] as number);
    this.hemi.intensity = d.hemiIntensity;
    this.ambient.intensity = d.ambientIntensity;
    this.sky.apply(d);
    this.fog.color.setRGB(d.horizon[0] as number, d.horizon[1] as number, d.horizon[2] as number);
    this.fog.density = this.fogAmount * this.fogAmount * SKY_LIGHT.maxFogDensity;
    this.waterMat.setSky(d.horizon[0] as number, d.horizon[1] as number, d.horizon[2] as number);
  }

  private emitFountainSplash(): void {
    const src = this.water.sources;
    if (src.length === 0 || this.simTick++ % 3 !== 0) return;
    for (let k = 0; k < src.length; k++) {
      const s = src[k];
      if (s) this.splash?.emit(s.x, this.water.surfaceAt(s.x, s.z) + 0.05, s.z, 1, 1.6, 0.18);
    }
  }

  private simTick = 0;

  private frame(now: number): void {
    const frameMs = now - this.lastFrame;
    this.lastFrame = now;
    if (this.framesSeen++ >= WARMUP_FRAMES) this.stats.push(frameMs);

    if (this.adaptive.push(frameMs)) {
      this.resolutionScale = this.adaptive.scale;
      this.applyResolution();
    }

    if (this.autoDay) {
      this.hour = (this.hour + (frameMs / 1000) * SKY_LIGHT.autoDaysPerSecond * 24) % 24;
      this.dock.setHour(this.hour);
      this.dayDirty = true;
    }
    if (this.dayDirty) {
      this.dayDirty = false;
      this.applyDay();
    }

    const dt = this.fixed.stepMs / 1000;
    const steps = this.fixed.advance(frameMs);
    const spring = terrainSpring(this.wobble);
    for (let i = 0; i < steps; i++) {
      if (this.input.sculpting && this.hasHit && !this.busy) {
        const tool = this.tool;
        if (isWaterTool(tool)) this.useWaterTool(tool, dt);
        else {
          const b = this.input.shift ? { ...this.brush, strength: this.brush.strength * 0.35 } : this.brush;
          this.sculptor.apply(tool, this.hit.x, this.hit.z, b, dt);
        }
      }
      this.hf.step(dt, spring);
      this.water.step(dt);
      this.markers.step(dt, this.water);
      this.emitFountainSplash();
      this.splash?.step(dt, this.water);
      this.rig.step(dt);
      this.ring.step(dt);
      this.simTime += dt;
    }

    const alpha = this.fixed.alpha;
    this.mesh.group.position.y = Math.sin(this.simTime * 0.9) * BOB_AMPLITUDE;
    this.rig.apply(alpha);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.camForward);
    this.sky.update(frameMs / 1000, this.camForward);
    this.pick();
    this.mesh.update(alpha);
    this.waterMesh.update();
    this.splash?.update();
    this.markers.group.position.y = this.mesh.group.position.y;
    if (this.splash) this.splash.mesh.position.y = this.mesh.group.position.y;
    this.ring.update(this.hf, this.hit.x, this.hit.z, this.hasHit);
    this.ring.object.position.y = this.mesh.group.position.y;

    this.renderer.render(this.scene, this.camera);
    this.panel.update(now);
  }
}
