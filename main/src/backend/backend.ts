import type { BackendLifecycleServerRpcApi } from "../../../common/backend/backendRpcApi";
import { applicationPathsOptionsSerializer, type ApplicationPathsOptions } from "../../../common/applicationPaths";
import { createMessagePortPeer, type BridgeMessagePort } from "../../../common/ipc_bridge/messagePortPeer";
import type { BackendBridgeConnectAccept } from "../../../common/ipc_bridge/messagePortProtocol";
import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import { BridgeRouter } from "../../../common/ipc_bridge/rpc";
import { BackendRpcObjectRegistry } from "./bridge/rpc_object_registry/registerRpcObjects";
import { gApplicationPaths } from "../infra/applicationPaths";
import { gLogger } from "../infra/logger";
import { gBackendPlatform } from "./platform";
import type { BackendApplication } from "./application";
import { gRendererSessions } from "./rendererSessions";

export class Backend implements BackendLifecycleServerRpcApi {
  public connect(port: BridgeMessagePort, connection: BackendBridgeConnectAccept): void {
    if (connection.source === "main" && this._mainPeer !== null) {
      throw new Error("Backend Main connection is already initialized");
    }
    if (connection.source === "renderer" && this._mainPeer === null) {
      throw new Error("Backend Main connection is not initialized");
    }
    const router = BridgeRouter.getRouter();
    const peer = createMessagePortPeer(port, connection.connectId);
    if (connection.source === "main") {
      this._mainPeer = peer;
      BackendRpcObjectRegistry.register(router, this, peer);
    } else {
      this._rendererPeers.add(peer);
      peer.onDisconnect(() => this._rendererPeers.delete(peer));
    }
    router.startDispatchMessage(peer);
    if (connection.source === "renderer") gRendererSessions.add(peer);
  }

  public getProcessId(): number {
    return process.pid;
  }

  public async init(options: ApplicationPathsOptions): Promise<void> {
    applicationPathsOptionsSerializer.validate(options);
    gApplicationPaths.init(options);
    await gLogger.start();
    if (this._mainPeer === null) throw new Error("Backend Main connection is not initialized");
    await gBackendPlatform.initialize(this._mainPeer);
    const { gBackendApplication } = await import("./application.js");
    this._application = gBackendApplication;
    await gBackendApplication.start();
  }

  public async shutdown(): Promise<void> {
    await this._application?.dispose();
    await Promise.all([...this._rendererPeers].map((peer) => peer.close()));
    this._rendererPeers.clear();
    await gLogger.dispose();
    setImmediate(() => process.exit(0));
  }

  public getRestartExecutablePath(): Promise<string> {
    if (this._application === null) throw new Error("Backend application is not initialized");
    return this._application.getRestartExecutablePath();
  }

  private _mainPeer: BridgePeer | null = null;
  private readonly _rendererPeers = new Set<BridgePeer>();
  private _application: BackendApplication | null = null;
}