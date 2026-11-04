import fs from "node:fs";
import path from "node:path";
import type { IDisposable } from "node-pty";
import type { TerminalType } from "../../../../common/terminal";
import { TaskQueue } from "../../infra/taskQueue";
import { PathUtil } from "../../utils/pathUtil";
import type { Pty } from "./pty";

type PoolEntry = { readonly pty: Pty; exitSubscription: IDisposable | null };

export class PtyPool {
  public constructor(terminalType: TerminalType, createPty: (initialPath: string) => Promise<Pty>, maxCount = 1) {
    this._terminalType = terminalType;
    this._createPty = createPty;
    this._maxCount = maxCount;
  }

  public setInitialPath(initialPath: string): void {
    if (this._isDisposed) throw new Error("PTY pool is disposed");

    const resolvedPath = path.resolve(initialPath);
    if (this._initialPath === resolvedPath) return;

    fs.mkdirSync(resolvedPath, { recursive: true });
    PathUtil.ensureFolderExist(resolvedPath);
    console.log(`[pty-pool] initial path changed. Type: ${this._terminalType}. From: ${JSON.stringify(this._initialPath)}. To: ${JSON.stringify(resolvedPath)}.`);
    this._initialPath = resolvedPath;
    void this._refillQueue.cancel();
    this._clear();
    this._scheduleRefill();
  }

  public take(initialPath: string): Pty | 0 {
    if (this._isDisposed) throw new Error("PTY pool is disposed");
    const entry = this._entries.shift();
    entry?.exitSubscription?.dispose();
    this._scheduleRefill();
    if (entry === undefined) {
      console.log(`[pty-pool] take miss. Type: ${this._terminalType}. Path: ${JSON.stringify(initialPath)}. Reason: pool is empty.`);
      return 0;
    }
    console.log(`[pty-pool] take hit. Type: ${this._terminalType}. Terminal ID: ${entry.pty.terminalId}. Initial path: ${JSON.stringify(entry.pty.initialPath)}. Remaining: ${this._entries.length}/${this._maxCount}.`);
    return entry.pty;
  }

  public async dispose(): Promise<void> {
    this._isDisposed = true;
    const cancellation = this._refillQueue.cancel();
    this._clear();
    await cancellation;
  }

  private _scheduleRefill(): void {
    if (this._isDisposed
        || this._refillQueue.getPendingCount() !== 0
        || this._initialPath === ""
        || this._entries.length >= this._maxCount) {
      return;
    }

    this._refillQueue.pushTask(() => this._refillOne());
  }

  private async _refillOne(): Promise<void> {
    const initialPath = this._initialPath;
    try {
      if (this._isDisposed || this._entries.length >= this._maxCount) {
        return;
      }

      const startedAt = Date.now();
      const pty = await this._createPty(initialPath);
      const entry: PoolEntry = { pty, exitSubscription: null };
      if (this._isDisposed || initialPath !== this._initialPath) {
        entry.pty.kill();
        console.log(`[pty-pool] initial path changed. Type: ${this._terminalType}. Terminal ID: ${entry.pty.terminalId}. Initial path: ${JSON.stringify(initialPath)}. Remaining: ${this._entries.length}/${this._maxCount}.`);
        return;
      }

      entry.exitSubscription = entry.pty.onExit((event) => {
        const previousExitAt = this._lastExitAt;
        this._lastExitAt = Date.now();
        const index = this._entries.indexOf(entry);
        if (index >= 0) this._entries.splice(index, 1);
        entry.exitSubscription?.dispose();
        console.error(`[pty-pool] prewarmed PTY exited. Type: ${this._terminalType}. Terminal ID: ${entry.pty.terminalId}. Exit code: ${event.exitCode}. Remaining: ${this._entries.length}/${this._maxCount}.`);
        if (this._lastExitAt - previousExitAt >= 3000) this._scheduleRefill();
      });
      this._entries.push(entry);
      console.log(`[pty-pool] refill completed. Type: ${this._terminalType}. Count: ${this._entries.length}/${this._maxCount}. Elapsed: ${Date.now() - startedAt} ms.`);
      this._scheduleRefill();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pty-pool] refill failed. Type: ${this._terminalType}. Path: ${JSON.stringify(initialPath)}. Reason: ${message}`);
    }
  }

  private _clear(): void {
    for (const entry of this._entries.splice(0)) {
      entry.exitSubscription?.dispose();
      entry.pty.kill();
    }
  }

  private readonly _terminalType: TerminalType;
  private readonly _maxCount: number;
  private readonly _createPty: (initialPath: string) => Promise<Pty>;
  private readonly _entries: PoolEntry[] = [];
  private readonly _refillQueue = new TaskQueue();
  private _initialPath = "";
  private _lastExitAt = Number.NEGATIVE_INFINITY;
  private _isDisposed = false;
}