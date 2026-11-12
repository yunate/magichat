import type { WindowClientRpcApi } from "../../../../common/window/windowRpcApi";
import type { BridgePeer } from "../../../../common/ipc_bridge/peer";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";

export function createWindowClientRpcObject(
  peer: BridgePeer,
): Promise<RemoteObject<WindowClientRpcApi>> {
  return BridgeRouter.createRemoteObj<WindowClientRpcApi>(
    peer,
    "WindowClientRpcApi",
  );
}