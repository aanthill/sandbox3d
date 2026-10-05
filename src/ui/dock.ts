import { SPRING_CONFIG } from '../anim/config';
import { BRUSH_LIMITS, TOOL_IDS, type BrushSettings, type ToolId } from '../tools/brush';
import type { History } from '../tools/history';
import { TIER_ORDER, TIERS, type TierId } from '../perf/quality';

export interface DockOptions {
  tool: ToolId;
  brush: BrushSettings;
  wobble: number;
  tier: TierId;
  glow: number;
  onTool(t: ToolId): void;
  onRadius(r: number): void;
  onStrength(s: number): void;
  onWobble(w: number): void;
  onGlow(g: number): void;
  onUndo(): void;
  onRedo(): void;
  onNewWorld(): void;
  onTier(t: TierId): void;
}

const ICONS: Record<string, string> = {
  raise: '<path d="M4 18c3-1 4-6 8-6s5 5 8 6"/><path d="M12 9V3m-3 3 3-3 3 3"/>',
  lower: '<path d="M4 8c3 1 4 6 8 6s5-5 8-6"/><path d="M12 15v6m-3-3 3 3 3-3"/>',
  smooth: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0"/><path d="M3 15c3-3 6 3 9 0s6 3 9 0"/>',
  flatten: '<path d="M4 12h16"/><path d="M7 8l-3 4 3 4M17 8l3 4-3 4"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 0 12"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0 0 12"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
};

const TOOL_LABEL: Record<ToolId, string> = {
  raise: 'Raise',
  lower: 'Lower',
  smooth: 'Smooth',
  flatten: 'Flatten',
};

function svg(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function button(name: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn';
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svg(name);
  return b;
}

function slider(label: string, min: number, max: number, step: number, value: number, on: (v: number) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => on(Number(input.value)));
  wrap.append(text, input);
  return { wrap, input };
}

/** Bottom dock + settings popover + status toast. Plain DOM, animated with transform/opacity (rule 7). */
export class Dock {
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly sizeInput: HTMLInputElement;
  private readonly toast: HTMLDivElement;
  private readonly root: HTMLDivElement;
  private readonly settings: HTMLDivElement;

  constructor(o: DockOptions) {
    const style = document.documentElement.style;
    style.setProperty('--bounce-easing', SPRING_CONFIG.ui.bounceEasing);
    style.setProperty('--bounce-ms', `${SPRING_CONFIG.ui.bounceMs}ms`);

    this.root = document.createElement('div');
    this.root.className = 'dock';
    this.root.setAttribute('role', 'toolbar');

    TOOL_IDS.forEach((id, i) => {
      const b = button(id, `${TOOL_LABEL[id]} (${i + 1})`);
      b.addEventListener('click', () => o.onTool(id));
      this.toolButtons.set(id, b);
      this.root.append(b);
    });
    this.setTool(o.tool);

    const sep = () => Object.assign(document.createElement('div'), { className: 'sep' });
    this.root.append(sep());

    const size = slider('Size  [ ]', BRUSH_LIMITS.minRadius, BRUSH_LIMITS.maxRadius, 0.01, o.brush.radius, o.onRadius);
    this.sizeInput = size.input;
    const strength = slider('Strength  (Shift = precise)', 0.1, 1, 0.01, o.brush.strength, o.onStrength);
    this.root.append(size.wrap, strength.wrap, sep());

    this.undoBtn = button('undo', 'Undo (Ctrl+Z)');
    this.redoBtn = button('redo', 'Redo (Ctrl+Shift+Z)');
    this.undoBtn.addEventListener('click', o.onUndo);
    this.redoBtn.addEventListener('click', o.onRedo);
    const dice = button('dice', 'New world');
    dice.addEventListener('click', o.onNewWorld);
    const gear = button('gear', 'Settings');
    gear.setAttribute('aria-pressed', 'false');
    this.root.append(this.undoBtn, this.redoBtn, dice, gear);

    // ---- Settings popover ----
    this.settings = document.createElement('div');
    this.settings.className = 'settings hidden';
    const title = document.createElement('h2');
    title.textContent = 'Settings';
    const wob = slider('Wobble', 0, 100, 1, o.wobble, o.onWobble);
    const glow = slider('Glow', 0, 1, 0.01, o.glow, o.onGlow);
    const tierWrap = document.createElement('label');
    tierWrap.className = 'field';
    const tierText = document.createElement('span');
    tierText.textContent = 'Quality';
    const select = document.createElement('select');
    for (const id of TIER_ORDER) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${TIERS[id].label} (${TIERS[id].grid}²)${id === 'ultra' ? ' · experimental' : ''}`;
      select.append(opt);
    }
    select.value = o.tier;
    select.addEventListener('change', () => o.onTier(select.value as TierId));
    tierWrap.append(tierText, select);
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Lower the quality if it stutters. Higher levels use a finer terrain.';
    this.settings.append(title, wob.wrap, glow.wrap, tierWrap, note);
    gear.addEventListener('click', () => {
      const open = this.settings.classList.toggle('hidden') === false;
      gear.setAttribute('aria-pressed', String(open));
    });

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.textContent = 'Building world…';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = 'Left drag: sculpt<br>Right drag: orbit · Wheel: zoom<br>1–4 tools · [ ] size';

    document.body.append(this.root, this.settings, this.toast, hint);
    this.updateHistory(null);
  }

  setTool(t: ToolId): void {
    for (const [id, b] of this.toolButtons) b.setAttribute('aria-pressed', String(id === t));
  }

  setRadius(r: number): void {
    this.sizeInput.value = String(r);
  }

  setBusy(busy: boolean): void {
    this.toast.classList.toggle('hidden', !busy);
  }

  updateHistory(h: History | null): void {
    this.undoBtn.disabled = !h?.canUndo;
    this.redoBtn.disabled = !h?.canRedo;
  }
}
