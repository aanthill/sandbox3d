import { Vector2 } from 'three/webgpu';
import type { ToolId } from '../tools/brush';
import { TOOL_IDS } from '../tools/brush';
import type { CameraRig } from './camera-rig';

export interface InputHandlers {
  /** Return true if a stroke actually started (the cursor is over the terrain). */
  strokeStart(): boolean;
  strokeEnd(): void;
  selectTool(tool: ToolId): void;
  adjustSize(factor: number): void;
  undo(): void;
  redo(): void;
}

/**
 * Pointer + keyboard. Left button sculpts, right/middle drag orbits, wheel zooms,
 * Shift = precision. The pointer position is kept in normalized device coords.
 */
export class InputController {
  readonly ndc = new Vector2();
  pointerOver = false;
  sculpting = false;
  shift = false;
  private orbiting = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly rig: CameraRig,
    private readonly h: InputHandlers,
  ) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', () => (this.pointerOver = false));
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', (e) => (this.shift = e.shiftKey));
    window.addEventListener('blur', () => this.cancel());
  }

  private updateNdc(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pointerOver = true;
  }

  private onDown = (e: PointerEvent): void => {
    this.updateNdc(e);
    this.shift = e.shiftKey;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.el.setPointerCapture(e.pointerId);
    if (e.button === 0) {
      this.sculpting = this.h.strokeStart();
    } else if (e.button === 1 || e.button === 2) {
      this.orbiting = true;
    }
  };

  private onMove = (e: PointerEvent): void => {
    this.updateNdc(e);
    this.shift = e.shiftKey;
    if (this.orbiting) {
      this.rig.orbit((e.clientX - this.lastX) * 0.006, (e.clientY - this.lastY) * 0.006);
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onUp = (e: PointerEvent): void => {
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    this.cancel();
  };

  private cancel(): void {
    if (this.sculpting) this.h.strokeEnd();
    this.sculpting = false;
    this.orbiting = false;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rig.zoom(e.deltaY);
  };

  private onKey = (e: KeyboardEvent): void => {
    this.shift = e.shiftKey;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.h.redo();
      else this.h.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.h.redo();
    } else if (!mod && e.key >= '1' && e.key <= String(TOOL_IDS.length)) {
      this.h.selectTool(TOOL_IDS[Number(e.key) - 1] as ToolId);
    } else if (e.key === '[') {
      this.h.adjustSize(1 / 1.15);
    } else if (e.key === ']') {
      this.h.adjustSize(1.15);
    }
  };
}
