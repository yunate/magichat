import { randomUUID } from "node:crypto";
import type { IDisposable, IPty } from "node-pty";
import { spawn } from "node-pty";

export type PtyOptions = Readonly<{
  columns: number;
  rows: number;
  initialPath: string;
  createEnvironment: (terminalId: string) => NodeJS.ProcessEnv;
  useConpty: boolean;
}>;

export abstract class Pty implements IPty {
  protected constructor(executable: string, args: readonly string[], options: PtyOptions) {
    this.initialPath = options.initialPath;
    this._pty = spawn(executable, [...args], {
      cols: options.columns,
      rows: options.rows,
      cwd: options.initialPath,
      env: options.createEnvironment(this.terminalId),
      useConpty: options.useConpty,
      useConptyDll: false,
    });
    this._pty.onData((data) => this._handleData(data));
  }

  public get pid(): number {
    return this._pty.pid;
  }

  public get cols(): number {
    return this._pty.cols;
  }

  public get rows(): number {
    return this._pty.rows;
  }

  public get process(): string {
    return this._pty.process;
  }

  public get handleFlowControl(): boolean {
    return this._pty.handleFlowControl;
  }

  public set handleFlowControl(value: boolean) {
    this._pty.handleFlowControl = value;
  }

  public onData(callback: (data: string) => void): IDisposable {
    this._dataHandler = callback;
    this._handleData("");
    return {
      dispose: () => {
        if (this._dataHandler === callback) this._dataHandler = null;
      },
    };
  }

  public get onExit(): IPty["onExit"] {
    return this._pty.onExit;
  }

  public resize(columns: number, rows: number): void {
    this._pty.resize(columns, rows);
  }

  public clear(): void {
    this._pty.clear();
  }

  public write(data: string | Buffer): void {
    this._pty.write(data);
  }

  public kill(signal?: string): void {
    this._pty.kill(signal);
  }

  public pause(): void {
    this._pty.pause();
  }

  public resume(): void {
    this._pty.resume();
  }

  private _handleData(data: string): void {
    this._bufferedData += data;

    if (this._dataHandler === null) return;
    if (this._bufferedData.length <= 0) return;
    const bufferedData = this._bufferedData;
    this._bufferedData = "";
    this._dataHandler(bufferedData);
  }

  public readonly terminalId = randomUUID();
  public readonly initialPath: string;

  private readonly _pty: IPty;
  private _bufferedData = "";
  private _dataHandler: ((data: string) => void) | null = null;
}