import type {
  FileOccupancyClientRpcApi,
  FileOccupancyServerRpcApi,
  ProcessIdentity,
  TerminateProcessResult,
} from "../../../../common/fileOccupancy";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import { gUacBrokerService } from "../uacBroker/uacBrokerService";
import type { FileOccupancyOperation } from "./fileOccupancyService";

export class FileOccupancyRpcObject implements FileOccupancyServerRpcApi {
  public constructor(peer: BridgePeer) {
    this._peer = peer;
    peer.onDisconnect(() => {
      void this._activeOperation?.cancel().catch((): void => undefined);
      this._activeOperation = null;
    });
  }

  public async init(notifierRegisterName: string): Promise<void> {
    if (this._notifier !== null) throw new Error("File occupancy API is already initialized");
    if (typeof notifierRegisterName !== "string" || notifierRegisterName.trim().length === 0) {
      throw new Error("File occupancy notifier name is invalid");
    }
    this._notifier = await BridgeRouter.createRemoteObj<FileOccupancyClientRpcApi>(
      this._peer,
      notifierRegisterName,
    );
  }

  public async startQuery(target: string): Promise<void> {
    const notifier = this._requireNotifier();
    if (this._isStartingQuery || this._activeOperation !== null) {
      throw new Error("File occupancy query is already running");
    }
    this._isStartingQuery = true;
    try {
      const service = await gUacBrokerService.getFileOccupancyService();
      const operation = service.query(target);
      this._activeOperation = operation;
      void this._reportQueryResult(operation, notifier).catch((error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`File occupancy notification failed: ${message}`);
      });
    } finally {
      this._isStartingQuery = false;
    }
  }

  public async cancelQuery(): Promise<void> {
    const operation = this._activeOperation;
    if (operation === null) return;
    await operation.cancel();
  }

  public terminateProcess(process: ProcessIdentity): Promise<TerminateProcessResult> {
    return gUacBrokerService.getExistingFileOccupancyService().terminateProcess(process);
  }

  private async _reportQueryResult(
    operation: FileOccupancyOperation,
    notifier: RemoteObject<FileOccupancyClientRpcApi>,
  ): Promise<void> {
    await operation.result.then(
      async (result): Promise<void> => {
        if (this._activeOperation !== operation) return;
        this._activeOperation = null;
        await notifier.queryCompleted(result);
      },
      async (error: unknown): Promise<void> => {
        if (this._activeOperation !== operation) return;
        this._activeOperation = null;
        const message = error instanceof Error ? error.message : "File occupancy query failed";
        await notifier.queryFailed(message);
      },
    );
  }

  private _requireNotifier(): RemoteObject<FileOccupancyClientRpcApi> {
    if (this._notifier === null) throw new Error("File occupancy API is not initialized");
    return this._notifier;
  }

  private readonly _peer: BridgePeer;
  private _notifier: RemoteObject<FileOccupancyClientRpcApi> | null = null;
  private _activeOperation: FileOccupancyOperation | null = null;
  private _isStartingQuery = false;
}