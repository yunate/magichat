import { randomUUID } from "node:crypto";
import { type Stats, unwatchFile, watchFile } from "node:fs";
import fs from "node:fs/promises";
import * as inspector from "node:inspector";
import os from "node:os";
import path from "node:path";
import type { IDisposable, IPty } from "node-pty";
import { spawn } from "node-pty";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import { isScriptType, type ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import {
  isTerminalType,
  type TerminalClientRpcApi,
  type TerminalPtyInfo,
  type TerminalRunRequest,
  type TerminalServerRpcApi,
  type TerminalType,
} from "../../../../common/terminal";
import { ValidateUtils } from "../../../../common/validator";
import { createScriptExecution } from "../scriptExecution";
import { gTerminalRuntimeManager } from "./terminalRuntimeManager";

const MAX_COLUMNS = 1000;
const MAX_ROWS = 500;
const MAX_INPUT_LENGTH = 1024 * 1024;
const COMPLETION_FILE_CHECK_INTERVAL_MS = 100;
const RUN_START_TIMEOUT_MS = 3000;

type ActiveRun = Readonly<{
  id: string;
  scriptPath: string;
  wrapperPath: string;
  startPath: string;
  completionPath: string;
  startListener: (current: Stats, previous: Stats) => void;
  completionListener: (current: Stats, previous: Stats) => void;
  startTimer: ReturnType<typeof setTimeout>;
}>;

export class TerminalRuntimeService implements TerminalServerRpcApi {
  public constructor(peer: BridgePeer) {
    this._peer = peer;
    gTerminalRuntimeManager.add(this);
    peer.onDisconnect(() => {
      void this.dispose().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[terminal] disconnect cleanup failed: ${message}`);
      });
    });
  }

  public init(notifierRegisterName: string): Promise<void> {
    return this._enqueue(async () => {
      if (this._isInitialized) return;
      ValidateUtils.ensureNonBlankString(notifierRegisterName);
      this._notifier = await BridgeRouter.createRemoteObj<TerminalClientRpcApi>(
        this._peer,
        notifierRegisterName,
      );
      this._isInitialized = true;
    });
  }

  public createPty(
    terminalType: TerminalType,
    columns: number,
    rows: number,
  ): Promise<TerminalPtyInfo> {
    return this._enqueue(async () => {
      this._ensureInitialized();
      this._ensureTerminalType(terminalType);
      this._ensureDimensions(columns, rows);
      if (this._isActive()) throw new Error("Terminal is already active");
      this._terminalType = terminalType;
      return this._createPty(columns, rows);
    });
  }

  public run(request: TerminalRunRequest): Promise<void> {
    return this._enqueue(async () => {
      this._ensureInitialized();
      this._validateRunRequest(request);
      if (!this._isActive()) throw new Error("Terminal is not active");
      if (this._activeRun !== null) throw new Error("A Terminal command is already running");
      const expectedTerminalType = request.scriptType === "cmd" ? "cmd" : "powershell";
      if (this._terminalType !== expectedTerminalType) {
        throw new Error("Terminal type does not match the script type");
      }
      await fs.mkdir(gTerminalRuntimeManager.temporaryDirectory, { recursive: true });
      const basePath = path.join(gTerminalRuntimeManager.temporaryDirectory, randomUUID());
      const execution = createScriptExecution(request.scriptType, request.scriptContent, basePath);
      const scriptPath = `${basePath}${execution.extension}`;
      const wrapperPath = `${basePath}.run${this._terminalType === "cmd" ? ".bat" : ".ps1"}`;
      const startPath = `${basePath}.started`;
      const completionPath = `${basePath}.complete`;
      await fs.writeFile(scriptPath, execution.content, "utf8");
      this._temporaryFiles.add(scriptPath);
      await fs.writeFile(
        wrapperPath,
        this._createWrapper(
          request.scriptType,
          execution.command,
          path.basename(scriptPath),
          path.basename(startPath),
          path.basename(completionPath),
        ),
        "utf8",
      );
      this._temporaryFiles.add(wrapperPath);
      this._temporaryFiles.add(startPath);
      this._temporaryFiles.add(completionPath);
      const run = this._createActiveRun(
        request.runId,
        scriptPath,
        wrapperPath,
        startPath,
        completionPath,
      );
      this._activeRun = run;
      watchFile(startPath, {
        interval: COMPLETION_FILE_CHECK_INTERVAL_MS,
        persistent: false,
      }, run.startListener);
      watchFile(completionPath, {
        interval: COMPLETION_FILE_CHECK_INTERVAL_MS,
        persistent: false,
      }, run.completionListener);
      const invocation = `${this._createInvocation(wrapperPath)}\r`;
      const pty = this._requirePty();
      pty.write(invocation);
    });
  }

  public stop(): Promise<void> {
    return this._enqueue(() => {
      if (!this._isActive()) return;
      this._requirePty().write("\x03");
      this._cancelActiveRun();
    });
  }

  public destroyPty(): Promise<void> {
    return this._enqueue(() => {
      this._disposePty();
    });
  }

  public isActive(): Promise<boolean> {
    return this._enqueue(() => this._isActive());
  }

  public write(data: string): Promise<void> {
    return this._enqueue(() => {
      this._ensureInitialized();
      ValidateUtils.ensureString(data);
      if (data.length > MAX_INPUT_LENGTH) throw new Error("Terminal input is too large");
      this._requirePty().write(data);
      if (data.includes("\x03")) this._cancelActiveRun();
    });
  }

  public resize(columns: number, rows: number): Promise<void> {
    return this._enqueue(() => {
      this._ensureDimensions(columns, rows);
      if (!this._isActive()) return;
      this._requirePty().resize(columns, rows);
    });
  }

  public dispose(): Promise<void> {
    return this._enqueue(async () => {
      if (this._isDisposed) return;
      this._isDisposed = true;
      this._disposePty();
      const notifier = this._notifier;
      this._notifier = null;
      if (notifier !== null && this._peer.isConnected()) {
        await BridgeRouter.destroyRemoteObj(notifier);
      }
      await this._deleteTemporaryFiles();
      gTerminalRuntimeManager.remove(this);
    });
  }

  private _enqueue<TResult>(operation: () => Promise<TResult> | TResult): Promise<TResult> {
    const result = this._queue.then(operation, operation);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async _createPty(columns: number, rows: number): Promise<TerminalPtyInfo> {
    if (process.platform !== "win32") throw new Error("Terminal is only supported on Windows");
    const terminalType = this._terminalType;
    if (terminalType === null) throw new Error("Terminal type is not configured");
    const executable = terminalType === "cmd" ? "cmd.exe" : "powershell.exe";
    const args = terminalType === "cmd"
      ? ["/Q", "/K"]
      : [
          "-NoLogo",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-NoExit",
          "-Command",
          "Set-PSReadLineOption -HistorySaveStyle SaveAtExit",
        ];
    await fs.mkdir(gTerminalRuntimeManager.temporaryDirectory, { recursive: true });
    const environment = {
      ...process.env,
      TERM: "xterm-256color",
      ...(terminalType === "cmd" ? { PROMPT: "CMD $P$G" } : {}),
    };

    // ConPTY can deadlock during its native spawn handshake while the inspector is attached.
    const backend = inspector.url() === undefined ? "conpty" : "winpty";
    const buildNumber = this._getWindowsBuildNumber();
    const ptyOptions = {
      cols: columns,
      rows,
      cwd: gTerminalRuntimeManager.temporaryDirectory,
      env: environment,
      useConpty: backend === "conpty",
    };
    const pty = spawn(executable, args, ptyOptions);
    this._pty = pty;
    this._dataSubscription = pty.onData((data) => this._onPtyData(data));
    this._exitSubscription = pty.onExit(() => this._onPtyExit(pty));
    return {
      backend,
      buildNumber,
    };
  }

  private _getWindowsBuildNumber(): number {
    const buildNumber = Number.parseInt(os.release().split(".")[2] ?? "", 10);
    if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
      throw new Error("Windows build number is unavailable");
    }
    return buildNumber;
  }

  private _disposePty(): void {
    this._rejectActiveRun(new Error("Terminal command ended before its completion file was created"));
    const pty = this._pty;
    this._pty = null;
    this._dataSubscription?.dispose();
    this._exitSubscription?.dispose();
    this._dataSubscription = null;
    this._exitSubscription = null;
    if (pty !== null) pty.kill();
  }

  private _onPtyData(data: string): void {
    this._notifyOutput(data);
  }

  private _onPtyExit(pty: IPty): void {
    if (this._pty !== pty) return;
    this._pty = null;
    this._dataSubscription?.dispose();
    this._exitSubscription?.dispose();
    this._dataSubscription = null;
    this._exitSubscription = null;
    this._rejectActiveRun(new Error("Terminal process exited before the command completed"));
    this._notifyRuntimeError("Terminal process exited unexpectedly");
  }

  private _createActiveRun(
    runId: string,
    scriptPath: string,
    wrapperPath: string,
    startPath: string,
    completionPath: string,
  ): ActiveRun {
    return {
      id: runId,
      scriptPath,
      wrapperPath,
      startPath,
      completionPath,
      startListener: (current) => {
        if (current.isFile()) this._markActiveRunStarted(runId);
      },
      completionListener: (current) => {
        if (current.isFile()) this._resolveActiveRun(runId);
      },
      startTimer: setTimeout(() => {
        this._rejectActiveRunById(runId, new Error("Terminal command helper did not start"));
      }, RUN_START_TIMEOUT_MS),
    };
  }

  private _markActiveRunStarted(runId: string): void {
    const activeRun = this._activeRun;
    if (activeRun === null || activeRun.id !== runId) return;
    this._stopStartWatch(activeRun);
  }

  private _rejectActiveRunById(runId: string, error: Error): void {
    if (this._activeRun?.id !== runId) return;
    this._rejectActiveRun(error);
  }

  private _resolveActiveRun(runId: string): void {
    const activeRun = this._activeRun;
    if (activeRun === null || activeRun.id !== runId) return;
    this._activeRun = null;
    this._stopCompletionWatch(activeRun);
    this._notifyRunCompleted(activeRun.id);
    void this._deleteRunFiles(activeRun);
  }

  private _cancelActiveRun(): void {
    const activeRun = this._activeRun;
    if (activeRun === null) return;
    this._activeRun = null;
    this._stopCompletionWatch(activeRun);
    this._notifyRunCompleted(activeRun.id);
    void this._deleteRunFiles(activeRun);
  }

  private _rejectActiveRun(error: Error): void {
    const activeRun = this._activeRun;
    if (activeRun === null) return;
    this._activeRun = null;
    this._stopCompletionWatch(activeRun);
    this._notifyRunCompleted(activeRun.id);
    this._notifyRuntimeError(error.message);
    void this._deleteRunFiles(activeRun);
  }

  private _stopCompletionWatch(run: ActiveRun): void {
    this._stopStartWatch(run);
    unwatchFile(run.completionPath, run.completionListener);
  }

  private _stopStartWatch(run: ActiveRun): void {
    clearTimeout(run.startTimer);
    unwatchFile(run.startPath, run.startListener);
  }

  private async _deleteRunFiles(run: ActiveRun): Promise<void> {
    await Promise.all([
      this._deleteTemporaryFile(run.scriptPath),
      this._deleteTemporaryFile(run.wrapperPath),
      this._deleteTemporaryFile(run.startPath),
      this._deleteTemporaryFile(run.completionPath),
    ]);
  }

  private _notifyOutput(data: string): void {
    const notifier = this._notifier;
    if (notifier === null || !this._isNotifierEnabled) return;
    void notifier.output(data).catch((error: unknown) => this._disableNotifier(error));
  }

  private _notifyRuntimeError(message: string): void {
    const notifier = this._notifier;
    if (notifier === null || !this._isNotifierEnabled) return;
    void notifier.runtimeError(message).catch((error: unknown) => this._disableNotifier(error));
  }

  private _notifyRunCompleted(runId: string): void {
    const notifier = this._notifier;
    if (notifier === null || !this._isNotifierEnabled) return;
    void notifier.runCompleted(runId).catch((error: unknown) => this._disableNotifier(error));
  }

  private _disableNotifier(error: unknown): void {
    if (!this._isNotifierEnabled) return;
    this._isNotifierEnabled = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[terminal] renderer notification failed: ${message}`);
  }

  private _isActive(): boolean {
    return this._pty !== null;
  }

  private _requirePty(): IPty {
    const pty = this._pty;
    if (pty === null) throw new Error("Terminal is not active");
    return pty;
  }

  private _ensureInitialized(): void {
    if (!this._isInitialized || this._isDisposed) {
      throw new Error("Terminal is not initialized");
    }
  }

  private _ensureTerminalType(value: unknown): asserts value is TerminalType {
    if (!isTerminalType(value)) throw new Error("Terminal type is invalid");
  }

  private _ensureDimensions(columns: unknown, rows: unknown): void {
    if (!Number.isSafeInteger(columns) || typeof columns !== "number" || columns < 1 || columns > MAX_COLUMNS) {
      throw new Error("Terminal columns are invalid");
    }
    if (!Number.isSafeInteger(rows) || typeof rows !== "number" || rows < 1 || rows > MAX_ROWS) {
      throw new Error("Terminal rows are invalid");
    }
  }

  private _validateRunRequest(value: unknown): asserts value is TerminalRunRequest {
    ValidateUtils.ensureRecord(value);
    ValidateUtils.ensureNonBlankString(value.runId);
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureString(value.scriptContent);
    if (value.scriptContent.length > MAX_INPUT_LENGTH) throw new Error("Script content is too large");
  }

  private _createWrapper(
    scriptType: ScriptType,
    command: string,
    scriptFileName: string,
    startFileName: string,
    completionFileName: string,
  ): string {
    if (this._terminalType === "cmd") {
      const escapedScriptFileName = scriptFileName.replace(/"/g, "\"\"");
      const escapedStartFileName = startFileName.replace(/"/g, "\"\"");
      const escapedCompletionFileName = completionFileName.replace(/"/g, "\"\"");
      return `@type nul > "${escapedStartFileName}"\r\n@call "${escapedScriptFileName}"\r\n@type nul > "${escapedCompletionFileName}"\r\n`;
    }
    const escapedScriptFileName = scriptFileName.replace(/'/g, "''");
    const escapedStartFileName = startFileName.replace(/'/g, "''");
    const escapedCompletionFileName = completionFileName.replace(/'/g, "''");
    if (scriptType === "powershell") {
      return `[System.IO.File]::WriteAllText('.\\${escapedStartFileName}', '')\ntry {\n  & '.\\${escapedScriptFileName}'\n} finally {\n  [System.IO.File]::WriteAllText('.\\${escapedCompletionFileName}', '')\n}\n`;
    }
    const escapedCommand = command.replace(/'/g, "''");
    return `[System.IO.File]::WriteAllText('.\\${escapedStartFileName}', '')\ntry {\n  & '${escapedCommand}' '.\\${escapedScriptFileName}'\n} finally {\n  [System.IO.File]::WriteAllText('.\\${escapedCompletionFileName}', '')\n}\n`;
  }

  private _createInvocation(wrapperPath: string): string {
    const wrapperFileName = path.basename(wrapperPath);
    if (this._terminalType === "cmd") {
      return `call "${wrapperFileName.replace(/"/g, "\"\"")}"`;
    }
    return `& '.\\${wrapperFileName.replace(/'/g, "''")}'`;
  }

  private async _deleteTemporaryFile(filePath: string): Promise<void> {
    try {
      await fs.rm(filePath, { force: true });
      this._temporaryFiles.delete(filePath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[terminal] failed to remove temporary file: ${message}`);
    }
  }

  private async _deleteTemporaryFiles(): Promise<void> {
    await Promise.all([...this._temporaryFiles].map((filePath) => this._deleteTemporaryFile(filePath)));
  }

  private readonly _peer: BridgePeer;
  private readonly _temporaryFiles = new Set<string>();
  private _queue: Promise<void> = Promise.resolve();
  private _notifier: RemoteObject<TerminalClientRpcApi> | null = null;
  private _pty: IPty | null = null;
  private _dataSubscription: IDisposable | null = null;
  private _exitSubscription: IDisposable | null = null;
  private _terminalType: TerminalType | null = null;
  private _activeRun: ActiveRun | null = null;
  private _isNotifierEnabled = true;
  private _isInitialized = false;
  private _isDisposed = false;
}
