import { randomUUID } from "node:crypto";
import type {
  FileOccupancyQueryResult,
  FileOccupancyUacClientRpcApi,
  FileOccupancyUacServerRpcApi,
  FileOccupyingProcess,
  ProcessIdentity,
  TerminateProcessTreeResult,
} from "../../../../common/fileOccupancy";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export type FileOccupancyOperation = Readonly<{
  result: Promise<FileOccupancyQueryResult>;
  cancel(): Promise<void>;
}>;

type PendingFileOccupancyQuery = Readonly<{
  resolve(result: FileOccupancyQueryResult): void;
  reject(error: Error): void;
}>;

export class FileOccupancyService implements FileOccupancyUacClientRpcApi {
  public static async create(peer: BridgePeer): Promise<FileOccupancyService> {
    const service = new FileOccupancyService(peer);
    await service.init();
    return service;
  }

  private constructor(peer: BridgePeer) {
    this._peer = peer;
    peer.onDisconnect(() => this._resetConnection());
  }

  public query(target: string): FileOccupancyOperation {
    const normalizedTarget = FileOccupancyService._normalizeTarget(target);
    const operationId = randomUUID();
    let resolveResult: (result: FileOccupancyQueryResult) => void;
    let rejectResult: (error: Error) => void;
    const result = new Promise<FileOccupancyQueryResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this._pendingQueries.set(operationId, {
      resolve: (value: FileOccupancyQueryResult) => resolveResult(value),
      reject: (error: Error) => rejectResult(error),
    });
    void this._startQuery(operationId, normalizedTarget);
    return {
      result,
      cancel: () => this._cancelQuery(operationId),
    };
  }

  private async init(): Promise<void> {
    if (this._remoteObject !== null) throw new Error("File occupancy service is already initialized");
    const remoteObject = await BridgeRouter.createRemoteObj<FileOccupancyUacServerRpcApi>(
      this._peer,
      "FileOccupancyUacServerRpcApi",
    );
    const notifierRegisterName = randomUUID();
    const router = BridgeRouter.getRouter();
    router.registerRemoteObj(
      notifierRegisterName,
      (): FileOccupancyUacClientRpcApi => this,
    );
    try {
      await remoteObject.init(notifierRegisterName);
    } finally {
      router.unregisterRemoteObj(notifierRegisterName);
    }
    this._remoteObject = remoteObject;
  }

  public async terminateProcessTree(process: ProcessIdentity): Promise<TerminateProcessTreeResult> {
    FileOccupancyService._validateProcessIdentity(process);
    return this._requireRemoteObject().terminateProcessTree(process);
  }

  public async getExistingProcessIds(processIds: readonly number[]): Promise<readonly number[]> {
    FileOccupancyService._validateProcessIds(processIds);
    return this._requireRemoteObject().getExistingProcessIds(processIds);
  }

  public queryCompleted(operationId: string, result: FileOccupancyQueryResult): void {
    FileOccupancyService._validateOperationId(operationId);
    FileOccupancyService._validateQueryResult(result);
    const pending = this._pendingQueries.get(operationId);
    if (pending === undefined) return;
    this._pendingQueries.delete(operationId);
    pending.resolve(result);
  }

  public queryFailed(operationId: string, message: string): void {
    FileOccupancyService._validateOperationId(operationId);
    if (typeof message !== "string" || message.length === 0 || message.length > 4096) {
      throw new Error("File occupancy error is invalid");
    }
    const pending = this._pendingQueries.get(operationId);
    if (pending === undefined) return;
    this._pendingQueries.delete(operationId);
    pending.reject(new Error(message));
  }

  private static _normalizeTarget(value: unknown): string {
    if (typeof value !== "string") throw new Error("File occupancy target is invalid");
    const normalized = value.trim();
    if (normalized.length === 0
      || normalized.length > 4096
      || normalized.includes("\0")
      || normalized.includes('"')) {
      throw new Error("File occupancy target is invalid");
    }
    return normalized;
  }

  private static _validateOperationId(value: unknown): asserts value is string {
    if (typeof value !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("File occupancy operation ID is invalid");
    }
  }

  private static _validateProcessIds(value: unknown): asserts value is readonly number[] {
    if (!Array.isArray(value)
      || value.length > FileOccupancyService._MAX_PROCESS_CHECK_COUNT
      || value.some((processId) => (
        typeof processId !== "number"
        || !Number.isSafeInteger(processId)
        || processId <= 0
        || processId > 0xffff_ffff
      ))) {
      throw new Error("Process IDs are invalid");
    }
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

  private static _validateQueryResult(value: unknown): asserts value is FileOccupancyQueryResult {
    if (value === null || typeof value !== "object" || !("status" in value)) {
      throw new Error("File occupancy result is invalid");
    }
    if (value.status === "canceled") return;
    if (value.status !== "completed" || !("processes" in value) || !Array.isArray(value.processes)) {
      throw new Error("File occupancy result is invalid");
    }
    for (const process of value.processes) FileOccupancyService._validateOccupyingProcess(process);
  }

  private static _validateOccupyingProcess(value: unknown): asserts value is FileOccupyingProcess {
    if (value === null || typeof value !== "object") {
      throw new Error("File occupying process is invalid");
    }
    const pid = "pid" in value ? value.pid : undefined;
    const name = "name" in value ? value.name : undefined;
    const targetPath = "targetPath" in value ? value.targetPath : undefined;
    const executablePath = "executablePath" in value ? value.executablePath : undefined;
    const commandLine = "commandLine" in value ? value.commandLine : undefined;
    const owner = "owner" in value ? value.owner : undefined;
    const sessionId = "sessionId" in value ? value.sessionId : undefined;
    const startedAt = "startedAt" in value ? value.startedAt : undefined;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0
      || typeof name !== "string"
      || typeof targetPath !== "string"
      || targetPath.length === 0
      || targetPath.length > 32_767
      || targetPath.includes("\0")
      || !FileOccupancyService._isNullableString(executablePath)
      || !FileOccupancyService._isNullableString(commandLine)
      || !FileOccupancyService._isNullableString(owner)
      || !(sessionId === null || (typeof sessionId === "number" && Number.isSafeInteger(sessionId)))
      || !FileOccupancyService._isNullableString(startedAt)) {
      throw new Error("File occupying process is invalid");
    }
  }

  private static _isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
  }

  private _requireRemoteObject(): RemoteObject<FileOccupancyUacServerRpcApi> {
    if (this._remoteObject === null) throw new Error("File occupancy service is not initialized");
    return this._remoteObject;
  }

  private async _startQuery(operationId: string, target: string): Promise<void> {
    try {
      await this._requireRemoteObject().startQuery(operationId, target);
    } catch (error) {
      const pending = this._pendingQueries.get(operationId);
      if (pending === undefined) return;
      this._pendingQueries.delete(operationId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async _cancelQuery(operationId: string): Promise<void> {
    const pending = this._pendingQueries.get(operationId);
    if (pending === undefined) return;
    await this._requireRemoteObject().cancelQuery(operationId);
  }

  private _resetConnection(): void {
    this._remoteObject = null;
    const pendingQueries = [...this._pendingQueries.values()];
    this._pendingQueries.clear();
    for (const pending of pendingQueries) {
      pending.reject(new Error("UAC Broker connection closed"));
    }
  }

  private readonly _peer: BridgePeer;
  private static readonly _MAX_PROCESS_CHECK_COUNT = 4096;
  private _remoteObject: RemoteObject<FileOccupancyUacServerRpcApi> | null = null;
  private readonly _pendingQueries = new Map<string, PendingFileOccupancyQuery>();
}