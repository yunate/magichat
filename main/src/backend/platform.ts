import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { RemoteObject } from "../../../common/ipc_bridge/rpc";
import type { PlatformServerRpcApi } from "../../../common/platform/platformRpcApi";
import { createPlatformServerRpcObject } from "./bridge/remote_rpc_objects/platform";

class BackendPlatform {
  public async initialize(mainPeer: BridgePeer): Promise<void> {
    this._rpcObject = createPlatformServerRpcObject(mainPeer);
    await this._rpcObject;
  }

  public getRpcObject(): Promise<RemoteObject<PlatformServerRpcApi>> {
    if (this._rpcObject === null) throw new Error("Backend platform is not initialized");
    return this._rpcObject;
  }

  private _rpcObject: Promise<RemoteObject<PlatformServerRpcApi>> | null = null;
}

export const gBackendPlatform = new BackendPlatform();