import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type {
  FileOccupancyQueryResult,
  FileOccupancyUacClientRpcApi,
  FileOccupancyUacServerRpcApi,
  FileOccupyingProcess,
  ProcessIdentity,
  TerminateProcessTreeResult,
} from "../../../../common/fileOccupancy";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";

type QueryOperation = {
  child: ChildProcess | null;
  isCanceled: boolean;
};

type ProcessRecord = Partial<Record<
  "File" | "Process" | "PID" | "User" | "Session" | "Started" | "Executable" | "Command Line",
  string
>>;

export class FileOccupancyUacRpcObject implements FileOccupancyUacServerRpcApi {
  public constructor(peer: BridgePeer, nativeToolsPath: string) {
    this._executablePath = path.join(nativeToolsPath, "ddwhouses", "bin", "ddwhouses.exe");
    peer.onDisconnect(() => this._cancelAll());
  }

  public async init(notifier: RemoteObject<FileOccupancyUacClientRpcApi>): Promise<void> {
    if (this._notifier !== null) throw new Error("File occupancy UAC API is already initialized");
    this._notifier = notifier;
  }

  public startQuery(operationId: string, target: string): void {
    this._ensureInitialized();
    FileOccupancyUacRpcObject._validateOperationId(operationId);
    const normalizedTarget = FileOccupancyUacRpcObject._normalizeTarget(target);
    if (this._operations.has(operationId)) throw new Error("File occupancy operation already exists");
    const operation: QueryOperation = {
      child: null,
      isCanceled: false,
    };
    this._operations.set(operationId, operation);
    void this._runQuery(operationId, normalizedTarget, operation).catch((error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`File occupancy background operation failed: ${message}`);
    });
  }

  public cancelQuery(operationId: string): void {
    FileOccupancyUacRpcObject._validateOperationId(operationId);
    const operation = this._operations.get(operationId);
    if (operation === undefined) return;
    operation.isCanceled = true;
    operation.child?.kill();
  }

  public getExistingProcessIds(processIds: readonly number[]): readonly number[] {
    FileOccupancyUacRpcObject._validateProcessIds(processIds);
    return processIds.filter(FileOccupancyUacRpcObject._isProcessRunning);
  }

  public async terminateProcessTree(process: ProcessIdentity): Promise<TerminateProcessTreeResult> {
    FileOccupancyUacRpcObject._validateProcessIdentity(process);
    const details = await this._queryProcesses(process.targetPath);
    const current = details.find((item) => item.pid === process.pid);
    if (current === undefined) return { status: "alreadyExited" };
    if (current.startedAt !== process.startedAt
      || current.executablePath?.toLowerCase() !== process.executablePath.toLowerCase()) {
      return { status: "stale" };
    }
    await FileOccupancyUacRpcObject._terminateProcessTree(process.pid);
    return { status: "terminated" };
  }

  private static async _terminateProcessTree(processId: number): Promise<void> {
    const systemRoot = process.env.SystemRoot;
    if (systemRoot === undefined || !path.isAbsolute(systemRoot)) {
      throw new Error("Windows system root is unavailable");
    }
    const child = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(processId), "/T", "/F"],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    const stderr: Buffer[] = [];
    let stderrLength = 0;
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrLength += chunk.length;
      if (stderrLength <= FileOccupancyUacRpcObject._MAX_ERROR_LENGTH) stderr.push(chunk);
    });
    const exitCode = await FileOccupancyUacRpcObject._waitForExit(child);
    if (exitCode === 0) return;
    const detail = Buffer.concat(stderr).toString("utf8").trim();
    throw new Error(detail.length > 0
      ? `taskkill failed: ${detail}`
      : `taskkill exited with code ${exitCode ?? "unknown"}`);
  }

  private static _ensureNonBlankString(value: unknown, message: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  }

  private static _isProcessRunning(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch {
      return false;
    }
  }

  private static _validateProcessIds(value: unknown): asserts value is readonly number[] {
    if (!Array.isArray(value)
      || value.length > FileOccupancyUacRpcObject._MAX_PROCESS_CHECK_COUNT
      || value.some((processId) => (
        typeof processId !== "number"
        || !Number.isSafeInteger(processId)
        || processId <= 0
        || processId > 0xffff_ffff
      ))) {
      throw new Error("Process IDs are invalid");
    }
  }

  private static _validateOperationId(value: unknown): asserts value is string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("File occupancy operation ID is invalid");
    }
  }

  private static _normalizeTarget(value: unknown): string {
    FileOccupancyUacRpcObject._ensureNonBlankString(value, "File occupancy target is invalid");
    const normalized = value.trim();
    if (normalized.length > 4096 || normalized.includes("\0") || normalized.includes('"')) {
      throw new Error("File occupancy target is invalid");
    }
    return normalized;
  }

  private static _validateProcessIdentity(value: unknown): asserts value is ProcessIdentity {
    if (value === null
      || typeof value !== "object"
      || !("pid" in value)
      || typeof value.pid !== "number"
      || !Number.isSafeInteger(value.pid)
      || value.pid <= 0
      || value.pid > 0xffff_ffff
      || !("targetPath" in value)
      || typeof value.targetPath !== "string"
      || value.targetPath.length === 0
      || value.targetPath.length > 4096
      || value.targetPath.includes("\0")
      || value.targetPath.includes('"')
      || !("startedAt" in value)
      || typeof value.startedAt !== "string"
      || Number.isNaN(Date.parse(value.startedAt))
      || !("executablePath" in value)
      || typeof value.executablePath !== "string"
      || value.executablePath.length === 0
      || value.executablePath.length > 32_767
      || value.executablePath.includes("\0")
      || value.executablePath.includes('"')) {
      throw new Error("Process identity is invalid");
    }
  }

  private async _runQuery(
    operationId: string,
    target: string,
    operation: QueryOperation,
  ): Promise<void> {
    try {
      const processes = await this._queryProcesses(target, operation);
      if (operation.isCanceled) {
        await this._notifyCompleted(operationId, { status: "canceled" });
        return;
      }
      processes.sort((left, right) => left.name.localeCompare(right.name) || left.pid - right.pid);
      await this._notifyCompleted(operationId, { status: "completed", processes });
    } catch (error) {
      if (operation.isCanceled) {
        await this._notifyCompleted(operationId, { status: "canceled" });
      } else {
        const message = error instanceof Error ? error.message : "File occupancy query failed";
        await this._notifyFailed(operationId, message);
      }
    } finally {
      this._operations.delete(operationId);
    }
  }

  private async _queryProcesses(
    target: string,
    operation?: QueryOperation,
  ): Promise<FileOccupyingProcess[]> {
    const child = spawn(
      this._executablePath,
      [target],
      { windowsHide: true },
    );
    if (operation !== undefined) operation.child = child;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let isOutputTooLarge = false;
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutLength += chunk.length;
      if (stdoutLength > FileOccupancyUacRpcObject._MAX_OUTPUT_LENGTH) {
        isOutputTooLarge = true;
        child.kill();
      }
      else stdout.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrLength += chunk.length;
      if (stderrLength <= FileOccupancyUacRpcObject._MAX_ERROR_LENGTH) {
        stderr.push(chunk);
      }
    });
    const exitCode = await FileOccupancyUacRpcObject._waitForExit(child);
    if (operation !== undefined) operation.child = null;
    if (operation?.isCanceled) return [];
    if (exitCode !== 0 || isOutputTooLarge) {
      const detail = Buffer.concat(stderr).toString("utf8").trim();
      if (detail.length > 0) console.error(`ddwhouses query failed: ${detail}`);
      if (isOutputTooLarge) throw new Error("Too many results. Enter a more specific path.");
      throw new Error(`ddwhouses exited with code ${exitCode ?? "unknown"}`);
    }
    const output = Buffer.concat(stdout);
    const text = output.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(output)) throw new Error("ddwhouses output is invalid");
    return FileOccupancyUacRpcObject._parseProcesses(text);
  }

  private static _parseProcesses(output: string): FileOccupyingProcess[] {
    const records: ProcessRecord[] = [];
    let record: ProcessRecord | null = null;
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (line.startsWith("File:")) {
        if (record !== null) records.push(record);
        record = { File: line.slice("File:".length).trim() };
        continue;
      }
      if (record === null) continue;
      const match = /^(Process|PID|User|Session|Started|Executable|Command Line):\s*(.*)$/.exec(line);
      if (match === null) continue;
      const key = match[1];
      if (!FileOccupancyUacRpcObject._isProcessRecordKey(key) || key in record) {
        throw new Error("ddwhouses output is invalid");
      }
      record[key] = match[2].trimEnd();
    }
    if (record !== null) records.push(record);
    const processesByTargetAndId = new Map<string, FileOccupyingProcess>();
    for (const item of records) {
      const process = FileOccupancyUacRpcObject._toProcess(item);
      const key = JSON.stringify([process.targetPath, process.pid]);
      if (!processesByTargetAndId.has(key)) processesByTargetAndId.set(key, process);
    }
    return [...processesByTargetAndId.values()];
  }

  private static _toProcess(record: ProcessRecord): FileOccupyingProcess {
    const pid = Number(record.PID);
    const sessionId = Number(record.Session);
    const startedAt = record.Started === undefined ? Number.NaN : Date.parse(record.Started);
    if (record.File === undefined || record.File.length === 0
      || record.Process === undefined || record.Process.length === 0
      || !Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffff_ffff
      || record.User === undefined
      || !Number.isSafeInteger(sessionId) || sessionId < 0
      || !Number.isFinite(startedAt)
      || record.Executable === undefined
      || record["Command Line"] === undefined) {
      throw new Error("ddwhouses output is invalid");
    }
    return {
      pid,
      name: record.Process,
      targetPath: record.File,
      executablePath: record.Executable === "" ? null : record.Executable,
      commandLine: record["Command Line"] === "" ? null : record["Command Line"],
      owner: record.User === "" ? null : record.User,
      sessionId,
      startedAt: new Date(startedAt).toISOString(),
    };
  }

  private static _isProcessRecordKey(value: string): value is keyof ProcessRecord {
    return value === "Process"
      || value === "PID"
      || value === "User"
      || value === "Session"
      || value === "Started"
      || value === "Executable"
      || value === "Command Line";
  }

  private static _waitForExit(child: ChildProcess): Promise<number | null> {
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode) => resolve(exitCode));
    });
  }

  private async _notifyCompleted(
    operationId: string,
    result: FileOccupancyQueryResult,
  ): Promise<void> {
    await this._requireNotifier().queryCompleted(operationId, result);
  }

  private async _notifyFailed(operationId: string, message: string): Promise<void> {
    await this._requireNotifier().queryFailed(operationId, message);
  }

  private _ensureInitialized(): void {
    this._requireNotifier();
  }

  private _requireNotifier(): RemoteObject<FileOccupancyUacClientRpcApi> {
    if (this._notifier === null) throw new Error("File occupancy UAC API is not initialized");
    return this._notifier;
  }

  private _cancelAll(): void {
    for (const operation of this._operations.values()) {
      operation.isCanceled = true;
      operation.child?.kill();
    }
  }

  private static readonly _MAX_OUTPUT_LENGTH = 4 * 1024 * 1024;
  private static readonly _MAX_ERROR_LENGTH = 64 * 1024;
  private static readonly _MAX_PROCESS_CHECK_COUNT = 4096;
  private readonly _executablePath: string;
  private readonly _operations = new Map<string, QueryOperation>();
  private _notifier: RemoteObject<FileOccupancyUacClientRpcApi> | null = null;
}