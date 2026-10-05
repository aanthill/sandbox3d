/** One sculpting stroke: the cells it changed, before and after. */
export interface Stroke {
  idx: Int32Array;
  before: Float32Array;
  after: Float32Array;
}

export const MAX_UNDO = 20;

export class History {
  private undoStack: Stroke[] = [];
  private redoStack: Stroke[] = [];

  push(s: Stroke): void {
    this.undoStack.push(s);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns the stroke to revert (caller applies `before`), or null. */
  undo(): Stroke | null {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push(s);
    return s;
  }

  /** Returns the stroke to re-apply (caller applies `after`), or null. */
  redo(): Stroke | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push(s);
    return s;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
