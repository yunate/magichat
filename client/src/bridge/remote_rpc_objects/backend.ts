import type { BackendServerRpcApi } from "../../../../common/backend/backendRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createBackendServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<BackendServerRpcApi>> {
  return BridgeRouter.createRemoteObj<BackendServerRpcApi>(peer, "BackendServerRpcApi");
}