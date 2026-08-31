import type { IDisposable, Terminal as XtermTerminal } from "@xterm/xterm";

const OSC_STRING_TERMINATOR = "\x1b\\";
const MAX_INDEXED_COLOR = 255;
const FIRST_SPECIAL_COLOR_ID = 10;
const LAST_SPECIAL_COLOR_ID = 12;

export class TerminalOscColorOverrides {
  public attach(terminal: XtermTerminal): void {
    if (this._subscriptions.length > 0) throw new Error("Terminal OSC color tracker is already attached");
    this._subscriptions = [
      terminal.parser.registerOscHandler(4, (data) => {
        this._recordIndexedColors(data);
        return false;
      }),
      terminal.parser.registerOscHandler(10, (data) => {
        this._recordSpecialColors(10, data);
        return false;
      }),
      terminal.parser.registerOscHandler(11, (data) => {
        this._recordSpecialColors(11, data);
        return false;
      }),
      terminal.parser.registerOscHandler(12, (data) => {
        this._recordSpecialColors(12, data);
        return false;
      }),
      terminal.parser.registerOscHandler(104, (data) => {
        this._resetIndexedColors(data);
        return false;
      }),
      terminal.parser.registerOscHandler(110, () => {
        this._specialColors.delete(10);
        return false;
      }),
      terminal.parser.registerOscHandler(111, () => {
        this._specialColors.delete(11);
        return false;
      }),
      terminal.parser.registerOscHandler(112, () => {
        this._specialColors.delete(12);
        return false;
      }),
    ];
  }

  public reapply(terminal: XtermTerminal): void {
    const sequences: string[] = [];
    for (const [index, color] of [...this._indexedColors].sort(([left], [right]) => left - right)) {
      sequences.push(`\x1b]4;${index};${color}${OSC_STRING_TERMINATOR}`);
    }
    for (let identifier = FIRST_SPECIAL_COLOR_ID; identifier <= LAST_SPECIAL_COLOR_ID; identifier += 1) {
      const color = this._specialColors.get(identifier);
      if (color !== undefined) {
        sequences.push(`\x1b]${identifier};${color}${OSC_STRING_TERMINATOR}`);
      }
    }
    if (sequences.length > 0) terminal.write(sequences.join(""));
  }

  public clear(): void {
    this._indexedColors.clear();
    this._specialColors.clear();
  }

  public dispose(): void {
    for (const subscription of this._subscriptions) subscription.dispose();
    this._subscriptions = [];
    this.clear();
  }

  private _recordIndexedColors(data: string): void {
    const values = data.split(";");
    for (let offset = 0; offset + 1 < values.length; offset += 2) {
      const indexText = values[offset];
      const color = values[offset + 1];
      if (indexText === undefined
        || !/^\d+$/.test(indexText)
        || color === undefined
        || color.length === 0
        || color === "?") continue;
      const index = Number.parseInt(indexText, 10);
      if (index > MAX_INDEXED_COLOR) continue;
      this._indexedColors.set(index, color);
    }
  }

  private _recordSpecialColors(identifier: number, data: string): void {
    const colors = data.split(";");
    for (let offset = 0; offset < colors.length; offset += 1) {
      const targetIdentifier = identifier + offset;
      if (targetIdentifier > LAST_SPECIAL_COLOR_ID) return;
      const color = colors[offset];
      if (color !== undefined && color.length > 0 && color !== "?") {
        this._specialColors.set(targetIdentifier, color);
      }
    }
  }

  private _resetIndexedColors(data: string): void {
    if (data.length === 0) {
      this._indexedColors.clear();
      return;
    }
    for (const value of data.split(";")) {
      if (!/^\d+$/.test(value)) continue;
      const index = Number.parseInt(value, 10);
      if (index <= MAX_INDEXED_COLOR) this._indexedColors.delete(index);
    }
  }

  private _subscriptions: IDisposable[] = [];
  private readonly _indexedColors = new Map<number, string>();
  private readonly _specialColors = new Map<number, string>();
}