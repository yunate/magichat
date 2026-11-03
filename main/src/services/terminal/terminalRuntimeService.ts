import fs from "node:fs/promises";
import path from "node:path";
import type { IDisposable, IPty } from "node-pty";
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
import { TreeViewPath } from "../../../../common/treeView";
import { ValidateUtils } from "../../../../common/validator";
import { PathUtil } from "../../utils/pathUtil";
import { createScriptExecution } from "../scriptExecution";
import type { Pty } from "./pty";
import { gPtyFactory } from "./ptyFactory";
import { resolveTerminalInitialPath } from "./terminalInitialPath";
import { gTerminalRuntimeManager } from "./terminalRuntimeManager";

const MAX_COLUMNS = 1000;
const MAX_ROWS = 500;
const MAX_INPUT_LENGTH = 1024 * 1024;
const SCRIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PreparedRun = Readonly<{
  scriptType: ScriptType;
  scriptPath: string;
  commandPath: string;
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

  public init(notifier: RemoteObject<TerminalClientRpcApi>): Promise<void> {
    return this._enqueue(() => {
      if (this._isInitialized) return;
      this._notifier = notifier;
      this._isInitialized = true;
    });
  }

  public isOwnedBy(peer: BridgePeer): boolean {
    return this._peer === peer;
  }

  public getTerminalId(): string | null {
    return this._pty?.terminalId ?? null;
  }

  public createPty(
    terminalType: TerminalType,
    columns: number,
    rows: number,
    initialPath: string,
  ): Promise<TerminalPtyInfo> {
    return this._enqueue(async () => {
      this._ensureInitialized();
      this._ensureTerminalType(terminalType);
      this._ensureDimensions(columns, rows);
      const resolvedInitialPath = resolveTerminalInitialPath(initialPath);
      try {
        await fs.mkdir(resolvedInitialPath, { recursive: true });
        PathUtil.ensureFolderExist(resolvedInitialPath);
      } catch (reason: unknown) {
        const message = reason instanceof Error ? reason.message : String(reason);
        throw new Error(
          `Terminal initial folder could not be created. Path: ${JSON.stringify(resolvedInitialPath)}. Reason: ${message}`,
        );
      }
      if (this._isActive()) throw new Error("Terminal is already active");
      this._terminalType = terminalType;
      return this._createPty(columns, rows, resolvedInitialPath);
    });
  }

  public run(request: TerminalRunRequest): Promise<void> {
    return this._enqueue(async () => {
      this._ensureInitialized();
      this._validateRunRequest(request);
      if (!this._isActive()) throw new Error("Terminal is not active");
      const preparedRun = await this._prepareRun(request);
      const invocation = `${this._createRunInvocation(preparedRun)}\r`;
      const pty = this._requirePty();
      pty.write(invocation);
    });
  }

  public prepareRun(request: TerminalRunRequest): Promise<string> {
    return this._enqueue(async () => {
      this._ensureInitialized();
      this._validateRunRequest(request);
      if (!this._isActive()) throw new Error("Terminal is not active");
      const preparedRun = await this._prepareRun(request);
      return `${preparedRun.scriptType}|${preparedRun.scriptPath}|${preparedRun.commandPath}`;
    });
  }

  public stop(): Promise<void> {
    return this._enqueue(() => {
      if (!this._isActive()) return;
      this._requirePty().write("\x03");
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

  public clear(): Promise<void> {
    return this._enqueue(() => {
      if (!this._isActive()) return;
      this._requirePty().clear();
    });
  }

  public write(data: string): Promise<void> {
    return this._enqueue(() => {
      this._ensureInitialized();
      ValidateUtils.ensureString(data);
      if (data.length > MAX_INPUT_LENGTH) throw new Error("Terminal input is too large");
      this._requirePty().write(data);
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

  private async _createPty(
    columns: number,
    rows: number,
    initialPath: string,
  ): Promise<TerminalPtyInfo> {
    const terminalType = this._terminalType;
    if (terminalType === null) throw new Error("Terminal type is not configured");
    const { pty, info } = await gPtyFactory.create(terminalType, {
      columns,
      rows,
      initialPath,
    });
    this._pty = pty;
    this._dataSubscription = pty.onData((data) => this._onPtyData(data));
    this._exitSubscription = pty.onExit(() => this._onPtyExit(pty));
    return info;
  }

  private _disposePty(): void {
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
    this._notifyRuntimeError("Terminal process exited unexpectedly");
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
    ValidateUtils.ensureNonBlankString(value.scriptId);
    if (!SCRIPT_ID_PATTERN.test(value.scriptId)) throw new Error("Terminal script ID must be a UUID v4");
    ValidateUtils.ensureNonBlankString(value.commandPath);
    TreeViewPath.normalize(value.commandPath, "Terminal Command path");
    if (!isScriptType(value.scriptType)) throw new Error("Script type is invalid");
    ValidateUtils.ensureString(value.scriptContent);
    if (value.scriptContent.length > MAX_INPUT_LENGTH) throw new Error("Script content is too large");
  }

  private async _prepareRun(request: TerminalRunRequest): Promise<PreparedRun> {
    await fs.mkdir(gTerminalRuntimeManager.temporaryDirectory, { recursive: true });
    const basePath = path.join(gTerminalRuntimeManager.temporaryDirectory, request.scriptId);
    const execution = createScriptExecution(request.scriptType, request.scriptContent, basePath);
    const scriptPath = `${basePath}${execution.extension}`;
    await this._writeTemporaryFile(scriptPath, execution.content);
    return {
      scriptType: request.scriptType,
      scriptPath,
      commandPath: request.commandPath,
    };
  }

  private _createRunInvocation(preparedRun: PreparedRun): string {
    if (this._terminalType === "cmd") {
      return `call mhrun ${preparedRun.scriptType} ${this._quoteCmdArgument(preparedRun.scriptPath)} ${this._quoteCmdArgument(preparedRun.commandPath)}`;
    }
    return `mhrun ${preparedRun.scriptType} ${this._quotePowerShellArgument(preparedRun.scriptPath)} ${this._quotePowerShellArgument(preparedRun.commandPath)}`;
  }

  private _quoteCmdArgument(value: string): string {
    return `"${value.replace(/%/g, "%%").replace(/"/g, "\"\"")}"`;
  }

  private _quotePowerShellArgument(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async _writeTemporaryFile(filePath: string, content: string): Promise<void> {
    let existingContent: string | null = null;
    try {
      existingContent = await fs.readFile(filePath, "utf8");
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (existingContent !== content) await fs.writeFile(filePath, content, "utf8");
    this._temporaryFiles.add(filePath);
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
  private _pty: Pty | null = null;
  private _dataSubscription: IDisposable | null = null;
  private _exitSubscription: IDisposable | null = null;
  private _terminalType: TerminalType | null = null;
  private _isNotifierEnabled = true;
  private _isInitialized = false;
  private _isDisposed = false;
}
