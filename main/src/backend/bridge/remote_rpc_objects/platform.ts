import type { PlatformServerRpcApi } from "../../../../../common/platform/platformRpcApi";
import type { BridgePeer } from "../../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../../common/ipc_bridge/rpc";

export function createPlatformServerRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<PlatformServerRpcApi>> {
  return BridgeRouter.createRemoteObj<PlatformServerRpcApi>(peer, "PlatformServerRpcApi");
}