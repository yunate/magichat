import type { IDisposable } from "node-pty";
import type { PtyCallbackApi, PtyApi, TerminalPtyState } from "../../../../../common/terminal";
import { ValidateUtils } from "../../../../../common/validator";
import type { Pty } from "./pty";

const MAX_INPUT_LENGTH = 1024 * 1024;

export class RpcPty implements PtyApi {
  public constructor(pty: Pty, callback: PtyCallbackApi) {
    this._pty = pty;
    this._dataSubscription = pty.onData((data) => callback.onData(data));
    this._exitSubscription = pty.onExit((event) => {
      this._disposeSubscriptions();
      return callback.onExit(event);
    });
  }

  public async getInfo(): Promise<TerminalPtyState> {
    return {
      ...this._pty.basicInfo,
      terminalId: this._pty.terminalId,
      initialPath: this._pty.initialPath,
      pid: this._pty.pid,
      cols: this._pty.cols,
      rows: this._pty.rows,
      process: this._pty.process,
    };
  }

  public async resize(columns: number, rows: number): Promise<void> {
    return this._pty.resize(columns, rows);
  }

  public async clear(): Promise<void> {
    return this._pty.clear();
  }

  public async write(data: string): Promise<void> {
    ValidateUtils.ensureString(data);
    if (data.length > MAX_INPUT_LENGTH) throw new Error("Terminal input is too large");
    return this._pty.write(data);
  }

  public async kill(signal?: string): Promise<void> {
    if (this._isDisposed) return;
    if (signal !== undefined) ValidateUtils.ensureString(signal);
    this._isDisposed = true;
    this._disposeSubscriptions();
    await this._pty.kill(signal);
  }

  public async pause(): Promise<void> {
    return this._pty.pause();
  }

  public async resume(): Promise<void> {
    return this._pty.resume();
  }

  private _disposeSubscriptions(): void {
    this._dataSubscription.dispose();
    this._exitSubscription.dispose();
  }

  private readonly _pty: Pty;
  private readonly _dataSubscription: IDisposable;
  private readonly _exitSubscription: IDisposable;
  private _isDisposed = false;
}