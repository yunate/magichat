import type { Socket } from "node:net";
import { applicationPathsOptionsSerializer, type ApplicationPathsOptions } from "../../../common/applicationPaths";
import type { TerminalRuntimeServiceApi } from "../../../common/terminal";
import { BridgePeer } from "../../../common/ipc_bridge/peer";
import { PipeBridgeSocket } from "../../../common/ipc_bridge/pipeBridgeSocket";
import { BridgeRouter } from "../../../common/ipc_bridge/rpc";
import type {
  UacBrokerReadyInfo,
  UacBrokerServerRpcApi,
} from "../../../common/uac/uacBrokerRpcApi";
import { UacBrokerRpcObjectRegistry } from "./bridge/rpc_object_registry/registerRpcObjects";
import { FileOccupancyUacRpcObject } from "./fileOccupancy/fileOccupancyUacRpcObject";
import { gApplicationPaths } from "../infra/applicationPaths";
import { gPtyFactory } from "../backend/services/terminal/ptyFactory";
import { gTerminalRuntimeService } from "../backend/services/terminal/terminalRuntimeService";

export class UacBroker implements UacBrokerServerRpcApi {
  public constructor(
    socket: Socket,
    mainProcessId: number,
    token: string,
    nativeToolsPath: string,
  ) {
    this._mainProcessId = mainProcessId;
    this._token = token;
    this._bridgeSocket = new PipeBridgeSocket(socket);
    this._peer.setSocket(this._bridgeSocket, "main");
    this._peer.onConnect(() => this._startMainProcessMonitor());
    this._peer.onDisconnect(() => this._dispose());
    this._fileOccupancyRpcObject = new FileOccupancyUacRpcObject(
      this._peer,
      nativeToolsPath,
    );
    UacBrokerRpcObjectRegistry.register(this, this._fileOccupancyRpcObject);
    BridgeRouter.getRouter().startDispatchMessage(this._peer);
    this._bridgeSocket.start();
  }

  public getReadyInfo(): UacBrokerReadyInfo {
    return { processId: process.pid, token: this._token };
  }

  public init(options: ApplicationPathsOptions): void {
    applicationPathsOptionsSerializer.validate(options);
    gApplicationPaths.init(options);
  }

  public setTerminalInitialPath(initialPath: string): void {
    gPtyFactory.setInitialPath(initialPath);
  }

  public getUacTerminalRuntimeService(): TerminalRuntimeServiceApi {
    return BridgeRouter.returnRemoteObj(gTerminalRuntimeService);
  }

  public async shutdown(): Promise<void> {
    await gPtyFactory.dispose();
    setImmediate(() => {
      void this._peer.close().catch((error: unknown): void => {
        this._handleConnectionError(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private static _isProcessRunning(processId: number): boolean {
    try {
      process.kill(processId, 0);
      return true;
    } catch {
      return false;
    }
  }

  private _startMainProcessMonitor(): void {
    this._mainProcessMonitor = setInterval(() => {
      if (!UacBroker._isProcessRunning(this._mainProcessId)) void this._peer.close();
    }, 1000);
    this._mainProcessMonitor.unref();
  }

  private _dispose(): void {
    if (this._mainProcessMonitor !== null) clearInterval(this._mainProcessMonitor);
    this._mainProcessMonitor = null;
  }

  private _handleConnectionError(error: Error): void {
    console.error(`UAC Broker connection failed: ${error.message}`);
    process.exitCode = 1;
  }

  private readonly _peer = new BridgePeer();
  private readonly _bridgeSocket: PipeBridgeSocket;
  private readonly _fileOccupancyRpcObject: FileOccupancyUacRpcObject;
  private readonly _mainProcessId: number;
  private readonly _token: string;
  private _mainProcessMonitor: NodeJS.Timeout | null = null;
}