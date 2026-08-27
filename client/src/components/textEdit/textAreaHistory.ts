export type TextAreaSnapshot = Readonly<{
  value: string;
  selectionStart: number;
  selectionEnd: number;
}>;

export class TextAreaHistory {
  public constructor(limit = 100) {
    this._limit = limit;
  }

  public record(before: TextAreaSnapshot, after: TextAreaSnapshot): void {
    if (areSnapshotsEqual(before, after)) return;
    this._undo.push({ before: { ...before }, after: { ...after } });
    if (this._undo.length > this._limit) this._undo.shift();
    this._redo = [];
  }

  public undo(): TextAreaSnapshot | null {
    const entry = this._undo.pop();
    if (entry === undefined) return null;
    this._redo.push(entry);
    return { ...entry.before };
  }

  public redo(): TextAreaSnapshot | null {
    const entry = this._redo.pop();
    if (entry === undefined) return null;
    this._undo.push(entry);
    return { ...entry.after };
  }

  public reset(): void {
    this._undo = [];
    this._redo = [];
  }

  private readonly _limit: number;
  private _undo: Array<{ before: TextAreaSnapshot; after: TextAreaSnapshot }> = [];
  private _redo: Array<{ before: TextAreaSnapshot; after: TextAreaSnapshot }> = [];
}

function areSnapshotsEqual(left: TextAreaSnapshot, right: TextAreaSnapshot): boolean {
  return left.value === right.value
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd;
}
